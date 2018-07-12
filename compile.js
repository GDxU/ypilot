const $ = require('jquery'); // for remote use statements
const errors = require('./errors.js');
const tryToParseString = require('./parser-utils.js').tryToParseString;
const stdlib = require('./stdlib.js');
// yes, globals are usually bad, but these are global because otherwise we'd
// have to pass them to literally every function in this file, so I think it's
// OK.
var adjectiveDependencies = {};
var nounDefaultAdjectives = {};
var nounSupertypes = {};
var usedUrls = {};
var variableInitialized = {}; // contains "foo: true" if we've already compiled something that initializes foo in a rule
// list of things to delete from window in order to unload the game
if ('undefined' == typeof window) { // node.js
  global.deleteToUnload = [];
} else { // browser
  window.deleteToUnload = [];
}

function expandNounDefaultAdjectives(noun, supertypes, defaultAdjectives) {
  nounSupertypes[noun] = supertypes;
  var included = {};
  supertypes.forEach(pa => {
    nounDefaultAdjectives[pa].forEach(grampa => {
      included[grampa] = true;
    });
  });
  var queue = Array.from(defaultAdjectives); // copy array so we can mod it
  while (queue.length > 0) {
    var adj = queue.shift();
    if (!(adj in included)) {
      included[adj] = true;
      if (!(adj in adjectiveDependencies)) {
	throw new Error("undefined adjective " + adj);
      }
      adjectiveDependencies[adj].forEach(d => queue.push(d));
    }
  }
  return (nounDefaultAdjectives[noun] = Object.keys(included));
}

// remember that the given 'var' ast has been initialized
function setInitialized(ast) {
  var name = (('string' == typeof ast) ? ast : ast.name);
  variableInitialized[name] = true;
}

// forget all variable initializations
function clearInitialized(ast) {
  variableInitialized = {};
}

// is the given 'var' ast initialized/declared?
function isInitialized(ast) {
  return variableInitialized[ast.name];
}

// is the argument a 'var' ast?
function isVariable(ast) {
  return (('object' == typeof ast) && ast !== null && ast.op == 'var');
}

// return an object whose keys are all the variable names used in ast at any
// depth
function getVars(ast) {
  switch (typeof ast) {
    case 'object':
      if (ast === null) return {};
      var vars = {};
      if (('op' in ast) && ast.op == 'var') {
	vars[ast.name] = true;
      } else {
	for (var k in ast) {
	  Object.assign(vars, getVars(ast[k]));
	}
      }
      return vars;
    default:
      return {};
  }
}

function compileTrigger(trigger, origConditions) {
  var eventName = trigger.op;
  var eventParams = [];
  var eventNamedParams = [];
  var conditions = [].concat(origConditions);
  if (eventName == 'event') {
    // TODO check against previous definition (and that the def exists!)
    eventName = trigger.verb;
    eventParams = [].concat(trigger.positionalArgs);
    eventNamedParams = trigger.namedArgs;
  } else {
    eventParams =
      ['thing', 'player',
       'penetrator', 'point', 'penetrated', 'edgeFrom', 'edgeTo', 'ticksAgo', 'relativeVelocity',
       'map', 'position'].
      filter(k => (k in trigger)).
      map(k => trigger[k]);
    if ('key' in trigger) {
      var localVar;
      if (isVariable(trigger.key)) {
	// key is a variable, just use it directly
	localVar = trigger.key;
      } else {
	// key is a value, make a key$ parameter and prepend a condition
	// checking its value
	localVar = { op: 'var', name: 'key$' };
	conditions.unshift({
	  op: '==',
	  l: trigger.key,
	  r: localVar
	});
      }
      eventParams.push(localVar);
    }
  }
  // compile all param vars as lvalues
  eventParams = eventParams.map(lValue);
  if (eventName == 'become') {
    var adjective = trigger.adjectives[0]
    if (adjective.op == 'unadjective') {
      eventName = 'unbecome' + adjective.name;
      // TODO? allow unbecome (and become?) to capture old property values
    } else {
      eventName = 'become' + adjective.name;
      eventNamedParams = adjective.properties;
    }
  } else if (eventName == 'read') {
    eventName += trigger.character;
  }
  if ('args' in trigger) {
    trigger.args.forEach(a => eventParams.push(lValue(a)));
  }
  if (eventNamedParams.length > 0) {
    eventParams.push('{ ' + eventNamedParams.map(p => {
      var localVar;
      if (isVariable(p[1])) {
	// property value is a variable, destructure it into that var
	localVar = p[1];
      } else {
	// property value is not a variable, just use a mangled version
	// of the property name as the variable name, and prepend a
	// condition to check its value (we mangle it to prevent
	// conflicts)
	localVar = { op: 'var', name: p[0] + '$' };
	conditions.unshift({
	  op: '==',
	  l: localVar,
	  r: p[1]
	});
      }
      return p[0] + ': ' + lValue(localVar); // even though on right (SMH, JS)
    }).join(', ') + ' }');
  }
  // get all the uninitialized vars used in conditions, so that they can be
  // declared up front and then initialized by the conditions (if they are in
  // fact used in a position where they can be so initialized)
  var vars = getVars(conditions);
  for (var v in variableInitialized) { delete vars[v]; }
  vars = Object.keys(vars);
  vars = ((vars.length > 0) ?
	    '  var ' + vars.map(x => ('yp$' + x)).join(', ') + ";\n" :
	    '');
  // count the 'there is' conditions so we can balance them at the end
  var numExists = conditions.filter(c => (c.op == 'exists')).length;
  return {
    eventName: eventName,
    eventParams: eventParams,
    conditions: conditions,
    vars: vars,
    numExists: numExists
  };
}

// compile a 'var' ast as an L-value
function lValue(ast) {
  setInitialized(ast);
  return compileOp(ast);
}

// promise to compile a top-level statement to a string of JS code
function compileStatement(ast) {
  if (ast.op == 'use') {
    return compileUseStatement(ast);
  } else {
    return new Promise((resolve, reject) => {
      resolve(compileNonUseStatement(ast));
    });
  }
}

// promise to compile a 'use' statement to a string of JS code
function compileUseStatement(ast) {
	 // first, get the text
  return new Promise((resolve, reject) => {
    if (/^standard:/.test(ast.url)) { // from stdlib
      var name = ast.url.substring(9);
      if (name in usedUrls) {
	resolve('');
      } else if ((name in stdlib) && stdlib[name] !== undefined) {
	usedUrls[name] = true;
	resolve(stdlib[name]);
      } else {
	throw new Error("not found in standard library: " + name);
      }
    } else { // from the web
      $.get(ast.url).
      done((data, textStatus, jqXHR) => {
	resolve(jqXHR.responseText);
      }).
      fail((jqXHR, textStatus, errorThrown) => {
	errors.reportError(textStatus, "while fetching config file:\n");
	errors.convertFailToReject(textStatus, errorThrown, reject);
      });
    }
  // then, parse and compile it
  }).then(ypText => {
    if (ypText == '') return ypText; // shortcut
    return compileStatements(tryToParseString(ypText, ast.url));
  });
}

// compile a top-level statement that isn't 'use' to a string of JS code
function compileNonUseStatement(ast) {
  switch (ast.op) {
    case 'metadata':
      return '';
    case 'defineAdjective':
      adjectiveDependencies[ast.name] = ast.dependencies;
      return 'function yp$' + ast.name + '({ ' + ast.properties.map(p => {
	  return p[0] + ((p.length == 3) ? ' = ' + compile(p[2]) : '');
        }).join(', ') + " }) {\n" +
	ast.properties.map(p => {
	  // TODO? check that p[0] is of type p[1]
	  return '  this.' + p[0] + ' = ' + p[0] + ";\n";
	}).join('') + "}\n" +
	'yp$' + ast.name + '.dependencies = [' +
	  ast.dependencies.map(x => ('"' + x + '"')).join(', ') +
	"];\n" +
	"router.declareAdjective('" + ast.name + "');\n" +
	"deleteToUnload.push('yp$" + ast.name + "');\n";
    case 'defineEvent':
      // TODO save definition so we can check uses against it later
      break;
    case 'defineNoun':
      var supertypes =
        ast.supertypes.filter(t => (t[0] == 'noun')).map(t => t[1]);
      var defaultAdjectives =
	expandNounDefaultAdjectives(ast.name, supertypes,
	  ast.supertypes.filter(t => (t[0] == 'adjective')).map(t => t[1]));
      return '' +
        // define the type as a thing
        'var yp$' + ast.name + " = router.newThing();\n" +
        'router.add(yp$' + ast.name + ', { ' +
	  'Named: new yp$Named({ name: "' + ast.name + '" }), ' +
	  'Typing: new yp$Typing({ supertypes: [' +
	    supertypes.map(x => ('yp$' + x)).join(', ') + "] }) });\n" +
	// define a function that makes a new instance of the type and adds it
        'function yp$add' + ast.name + "(adjectivesProps) {\n" +
        "  var thing = router.newThing();\n" +
	   // add Typed and all the defaultAdjectives, using the properties
	   // from the argument when we have them
	"  var adjectives = {\n" +
	'    Typed: new yp$Typed({ type: yp$' + ast.name  + " }),\n    " +
	defaultAdjectives.map(adj => {
	  return adj + ': new yp$' + adj + '(' +
	    '("' + adj + '" in adjectivesProps) ? adjectivesProps.' + adj +
	    " : {})";
	}).join(",\n    ") + "\n  };\n" +
	   // add any extra adjectives from the argument, and put their
	   // dependencies in the queue to be added
	"  var queue = [];\n" +
	"  for (var adjective in adjectivesProps) {\n" +
	"    if (!(adjective in adjectives)) {\n" +
	"      var madj = 'yp$' + adjective;\n" +
	"      adjectives[adjective] = " +
		"new this[madj](adjectivesProps[adjective]);\n" +
	"      this[madj].dependencies.forEach(d => queue.push(d));\n" +
	"    }\n" +
	"  }\n" +
	   // keep adding dependencies until we have them all
	"  while (queue.length > 0) {\n" +
	"    var d = queue.shift();\n" +
	"    var md = 'yp$' + d;\n" +
	"    if (!(d in adjectives)) {\n" +
	"      if ('function' != typeof this[md]) throw new Error('no constructor for adjective ' + d);\n" +
	"      adjectives[d] = new this[md]({});\n" +
	"      this[md].dependencies.forEach(d2 => queue.push(d2));\n" +
	"    }\n" +
	"  }\n" +
	   // finally, add the thing to the router with its adjectives
	"  router.add(thing, adjectives);\n" +
	"  return thing;\n" +
        "}\n" +
	"deleteToUnload.push('yp$" + ast.name + "', 'yp$add" + ast.name + "');\n";
    case 'rule':
      clearInitialized();
      var {
	eventName,
	eventParams,
	conditions,
	vars,
	numExists
      } = compileTrigger(ast.trigger, ast.conditions);
      return "router.on('" + eventName + "', function(" +
	  eventParams.join(', ') +
	") {try {\n" +
	  vars +
	"  if (" +
	  conditions.map(compile).join(" &&\n      ") +
	") {\n" +
	  ast.effects.map(compile).join('') +
	// balance 'there is' conditions
	new Array(numExists).fill("}}\n").join('') +
	"  }\n" +
	"} catch (e) { console.error(e.message + \" while executing this rule:\\n\" + " + JSON.stringify(ast.text) + "); }\n" +
	"});\n";
    // permission conditions:
    case 'allow':
    case 'onlyAllow':
    case 'disallow':
      clearInitialized();
      var {
	eventName,
	eventParams,
	conditions,
	vars,
	numExists
      } = compileTrigger(ast.trigger, ast.conditions);
      return "router.addPermissionCondition(" +
	"'" + eventName + "', '" + ast.op + "', " +
	"function(" +
	  eventParams.join(', ') +
	") {try {\n" +
//	"  console.log(" + JSON.stringify(ast.text) + ");\n" +
	  vars +
	"  if (" +
	  conditions.map(compile).join(" &&\n      ") +
	") {\n" +
//	"    console.log(" + JSON.stringify(vars) + ");\n" +
//	"    console.log([" + vars.replace(/^  var /,'').replace(/;\n/,'') + "]);\n" +
//	"    console.log('return true');\n" +
	"    return true;\n" +
	// balance 'there is' conditions
	new Array(numExists).fill("}}\n").join('') +
	"  }\n" +
//	"  console.log(" + JSON.stringify(vars) + ");\n" +
//	"  console.log([" + vars.replace(/^  var /,'').replace(/;\n/,'') + "]);\n" +
//	"  console.log('return false');\n" +
	"  return false;\n" +
	"} catch (e) { console.error(e.message + \" while executing this permission condition:\\n\" + " + JSON.stringify(ast.text) + "); }\n" +
	// FIXME return value when an error happens?
	"});\n";
    default:
      throw new Error("WTF");
  }
}

// compile an AST node like { op: '...', ... } to a string of JS code
function compileOp(ast) {
  switch (ast.op) {
    /* events (handled as part of 'rule' statement case)
    case 'start':
    case 'clockTick':
    case 'hit':
    case 'press':
    case 'release':
    case 'event':*/
    // effects (these can also be events, but if they are they're handled in
    // the 'rule' case)
    case 'add':
      // separate adjectives into those that do and don't refer to the thing
      // we're creating (and lump in unadjectives with self-referential)
      var selfRefAndUnAdjs = [];
      var nonSelfRefAdjs = [];
      ast.adjectives.forEach(adj => {
	if (adj.op == 'unadjective' || (ast.thing.name in getVars(adj))) {
	  selfRefAndUnAdjs.push(adj);
	} else {
	  nonSelfRefAdjs.push(adj);
	}
      });
	     // do nonSelfRefAdjs as part of the creation
      return '    var ' + lValue(ast.thing) + ' = yp$add' + ast.type + '({ ' +
	nonSelfRefAdjs.map(adj =>
	  adj.name + ': { ' +
	  adj.properties.map(p => (p[0] + ': ' + compile(p[1]))).join(', ') +
	  ' }'
	).join(', ') +
	" });\n" +
	// do selfRefAndUnAdjs (if any) as a separate 'become' effect
	(selfRefAndUnAdjs.length > 0 ?
	  compile({
	    op: 'become',
	    thing: ast.thing,
	    adjectives: selfRefAndUnAdjs
	  })
	  : '');
    case 'copy':
      // separate adjectives into those that do and don't refer to the thing
      // we're creating (and lump in unadjectives with self-referential)
      var selfRefAndUnAdjs = [];
      var nonSelfRefAdjs = [];
      ast.adjectives.forEach(adj => {
	if (adj.op == 'unadjective' || (ast.copy.name in getVars(adj))) {
	  selfRefAndUnAdjs.push(adj);
	} else {
	  nonSelfRefAdjs.push(adj);
	}
      });
      var original = compile(ast.original); // do this before lValue
	     // do nonSelfRefAdjs as part of the creation
      return '    var ' + lValue(ast.copy) + ' = addCopy(' + original + ', { ' +
	nonSelfRefAdjs.map(adj =>
	  adj.name + ': { ' +
	  adj.properties.map(p => (p[0] + ': ' + compile(p[1]))).join(', ') +
	  ' }'
	).join(', ') +
	" });\n" +
	// do selfRefAndUnAdjs (if any) as a separate 'become' effect
	(selfRefAndUnAdjs.length > 0 ?
	  compile({
	    op: 'become',
	    thing: ast.copy,
	    adjectives: selfRefAndUnAdjs
	  })
	  : '');
    case 'remove':
      return '    router.remove(' + compile(ast.thing) + ");\n";
    case 'become':
      return ast.adjectives.map(adj => {
	switch (adj.op) {
	  case 'adjective':
	    return '    router.become(' +
	      compile(ast.thing) + ", '" + adj.name + "', { " +
	      adj.properties.map(p => (p[0] + ': ' + compile(p[1]))).
		join(', ') +
	      " });\n";
	  case 'unadjective':
	    return '    router.unbecome(' +
	      compile(ast.thing) + ", '" + adj.name + "');\n";
	  default:
	    throw new Error('WTF');
	}
      }).join('');
    case 'read':
      return '    router.readMap(' + compile(ast.thing) + ");\n";
    case 'let':
      var val = compile(ast.value);
      var jsVar = lValue(ast.variable);
      if (ast.isCondition) {
	return '((' + jsVar + ' = ' + val + ') || true)';
      } else {
	return '    let ' + jsVar + ' = ' + val + ";\n";
      }
    case 'debug':
      return '    console.log(' + compile(ast.value) + ");\n";
    case 'chat':
      return '    Chat.appendSysMsgToHistory(' + compile(ast.value) + ");\n";
    case 'emitEvent':
      // TODO check against previous definition (and that the def exists!)
      return '    router.emit("' + ast.verb + '"' +
	       ast.positionalArgs.map(x => (', ' + compile(x))).join('') +
	       (ast.namedArgs.length == 0 ? '' :
	         ', { ' + ast.namedArgs.map(x => (x[0] + ': ' + compile(x[1]))).
			  join(', ') + ' }') +
	     ").catch(err => console.log(err));\n";
    // conditions
    case 'isa':
      var l = compile(ast.l);
      return '((' + l + ' in router.adjectives.Typed) &&' +
             ' subsumes(yp$' + ast.r + ', ' +
	         'router.adjectives.Typed[' + l + '].type))';
    case 'isin':
      return '(' + compile(ast.r) + ').includes(' + compile(ast.l) + ')';
    case 'is':
      var l = compile(ast.l);
      if (ast.r.op == 'adjective') {
        return '(' +
	  '(' + l + ' in router.adjectives.' + ast.r.name + ')' +
	  ast.r.properties.map(p => {
	    var op;
	    var rhs =
	      'router.adjectives.' + ast.r.name + '[' + l + '].' +
	      p[0];
	    if (isVariable(p[1]) && !isInitialized(p[1])) {
	      // p[1] is an uninitialized variable, assign to it, but make sure
	      // the condition is true regardless of the value we assign
	      return ' && ((' + lValue(p[1]) + ' = ' + rhs + ') || true)';
	    } else {
	      // p[1] is an initialized variable or some other kind of value,
	      // test equality
	      // FIXME == or === ? or deepEqual?
	      return ' && ' + compile(p[1]) + ' == ' + rhs;
	    }
	  }).join('') +
	')';
      } else { // unadjective
	return '(!(' + l + ' in router.adjectives.' + ast.r.name +'))';
      }
    case 'firstIn':
      return '((' + lValue(ast.variable) + ' = ' + compile(ast.collection) +
		'.find(' + compile(ast.variable) + " =>\n" +
		"\t( " +
		  ast.suchThat.map(compile).join(" &&\n\t  ") +
		"\n\t))) !== undefined)";
    case 'exists':
      // iterate over all matches for ast.suchThat
      // NOTE: this causes the output to be an unbalanced JS fragment; balance
      // is restored with a hack in the 'rule' case above.
      // first, identify an adjective that's not negated so we can use it to
      // enumerate a list of things to check for matches
      var positiveAdjective = ast.suchThat.find(a => (a.r.op == 'adjective'));
      if (positiveAdjective === undefined) { // all unadjective
	// TODO? use all the other adjectives as the positiveAdjective
	throw new Error("'there is' condition must include at least one positive adjective");
      }
	      // terminate the outer 'if' condition with true
      return "true) {\n" +
	   // iterate the variable over the keys of the positiveAdjective
        "  for (var " + lValue(ast.variable) +
		' in router.adjectives.' + positiveAdjective.r.name + ") {\n" +
	     // make sure the thing is an integer, not a string
	'    ' + compile(ast.variable) + " |= 0;\n" +
	     // start a new 'if'
	'    if (' +
	  // compile all the suchThat adjectives
	  ast.suchThat.map(compile).join(" &&\n\t");
	  // end unbalanced, missing }} (see above)
    case 'keyState':
      if ('keys' in ast) {
	var keys = '(' + compile(ast.keys) + ')';
	var predicate =
	  '(x => router.playerKeyState(' + compile(ast.player) + ', x))';
	if ('key' in ast) {
	  if (!ast.state) { throw new Error('WTF'); }
	  if (ast.key.op != 'var') { throw new Error('WTF'); }
	  return '(' + lValue(ast.key) + ' = ' + keys + '.find' + predicate + ')';
	} else { // no key variable
	  return '(' + (ast.state ? '' : '!') + keys +
	           '.' + (ast.quantifier == 'any' ? 'some' : 'every') +
		     predicate + ')';
	}
      } else {
	return '(' + (ast.state ? '' : '!') +
		 'router.playerKeyState(' +
		   compile(ast.player) + ', ' + compile(ast.key) + '))';
      }
    /* adjective_inst handled in other cases
    case 'adjective':
    case 'unadjective':*/
    // expressions
    case 'var':
      if (!isInitialized(ast)) {
	var src = (('src' in ast) ?
	  " at line " + ast.src.start.line + " column " + ast.src.start.column
	  : "");
	throw new Error("undeclared variable ?" + ast.name + " used" + src);
      }
      return 'yp$' + ast.name;
    case 'const':
      return ast.name;
    case 'new':
      // TODO? allow more constructors
      // TODO? disallow Interface (JS code makes that now)
      if (!/^(Vec2|Array|SpatialIndex|Interface)$/.test(ast.constructor)) {
	throw new Error("constructing a new " + ast.constructor + " not allowed");
      }
      return 'new ' + ast.constructor + '(' + ast.args.map(compile).join(', ') + ')';
    case 'math':
      return 'Math.' + ast.fn + '(' + compile(ast.arg) + ')';
    case '[]':
      return '[' + ast.args.map(compile).join(', ') + ']';
    case '_':
      return '(' + compile(ast.l) + ')[' + compile(ast.r) + ']';
    case 'graphics':
      var usedVars = ast.string.match(/\?[a-z]\w+/g);
      if (usedVars == null) {
	// simple case, no vars to interpolate
	return 'stringToSVGGraphicsElement(' + JSON.stringify(ast.string) + ')';
      } else {
	// get string versions of all used vars, and check they won't mess up
	// svg
	var preamble = usedVars.map(x => {
	  var xVar = { op: 'var', name: x.substr(1) }; // remove '?' from start
	  var xStrVar = { op: 'var', name: xVar.name + 'Str$' };
	  return '      var ' + lValue(xStrVar) + ' = [' + compile(xVar) + "].toSVGString();\n" +
	     "      if (/[<>=\"']/.test(" + compile(xVar) + "))\n" +
	     '        throw new Error("' + x + " cannot be included in an SVG string because it contains one of the characters < > \\\"\");\n";
	}).join('');
	var strsAndVars = ast.string.split(/\?([a-z]\w+)/);
	var concatExpr = '';
	var i;
	for (i = 0; i < strsAndVars.length - 1; i += 2) {
	  var str = strsAndVars[i];
	  var v = { op: 'var', name: strsAndVars[i + 1] + 'Str$' };
	  if (/<[\w-]*$/.test(str))
	    throw new Error("variable interpolation not allowed in SVG tag names");
	  if (i > 0 && /^[\w-]*=/.test(str))
	    throw new Error("variable interpolation not allowed in SVG attribute names");
	  concatExpr += JSON.stringify(str) + ' + ' + compile(v) + ' + ';
	}
	// odd-length strsAndVars have a str at the end
	concatExpr +=
	  ((i < strsAndVars.length) ? JSON.stringify(strsAndVars[i]) : '""');
	return "(function() {\n" + preamble + '      return stringToSVGGraphicsElement(' + concatExpr + ");\n    })()";
      }
    case '.': // dot product
    case '·': // (unicode)
      return compile(ast.l) + '.dot(' + compile(ast.r) + ')';
    case 'x': // cross product
    case '×': // (unicode)
      return compile(ast.l) + '.cross(' + compile(ast.r) + ')';
    default: // arithmetic and comparison operators
      if ('l' in ast) { // infix
	if (!/^([<=>!]=|[<>*/%+-]|&&|\|\|)$/.test(ast.op)) {
	  throw new Error("invalid infix operator: " + ast.op);
	}
	if (/^[*/%+-]$/.test(ast.op) && 'number' != typeof ast.l) {
	  // TODO? use static types to decide whether to use builtin operators
	  // or methods
	  // TODO? define + and * for strings and Arrays, meaning concatenation and repetition (actually string+string should already work, and string*number will convert to number and multiply instead of doing repetition)
	  var compiledL = compile(ast.l);
	  var compiledR = compile(ast.r);
	  return '(("object" == typeof ' + compiledL + ')? ' +
		 compiledL +
		 '.' + ({ '*': 'scale', '/': 'divide', '%': 'remainder',
			  '+': 'add', '-': 'subtract' })[ast.op] +
		 '(' + compiledR + ') : (' +
		 compiledL + ' ' + ast.op + ' ' + compiledR + '))';
	} else {
	  return '(' + compile(ast.l) + ' ' + ast.op + ' ' +
		 compile(ast.r) + ')';
	}
      } else { // prefix
        if (!/^[!+-]$/.test(ast.op)) {
	  throw new Error("invalid prefix operator: " + ast.op);
	}
	return '(' + ast.op + ' ' + compile(ast.r) + ')';
      }
  }
}

// promise to compile a list of statements to a string of JS code
function compileStatements(statements) {
  var compiledStatements = [];
  var p = Promise.resolve('');
  statements.forEach(s => {
    p =
      p.
      then(() => compileStatement(s)).
      then(cs => { compiledStatements.push(cs); });
    if (!compile.strictly) {
      p = p.catch(e => {
	console.warn("failed to compile statement; skipping");
	console.warn(s /*.text*/);
	console.warn(e);
	compiledStatements.push("/* failed to compile statement */\n");
	errors.reportError(e);
      });
    }
  });
  return p.then(() => compiledStatements.join("\n"));
}

// compile some part of a parsed AST to a string of JS code; if it's the
// top-level array of statements, only promise to compile it
function compile(ast) {
  switch (typeof ast) {
    case 'object':
      if (ast === null) {
	return 'null';
      } else if (Array.isArray(ast)) { // top level statement list
        // reset globals
	adjectiveDependencies = {};
	nounDefaultAdjectives = {};
	nounSupertypes = {};
	usedUrls = {};
	return compileStatements(
	         // add 'use "standard:base.yp"' to the start
	         [{ op: 'use', url: 'standard:base.yp' }, ...ast]
	       );
      } else if ('op' in ast) {
	return compileOp(ast);
      } else {
	throw new Error("expected AST object to be an Array or have op: " + JSON.stringify(ast));
      }
    case 'boolean': // fall through
    case 'number': // fall through
    case 'string':
      return JSON.stringify(ast);
    default:
      throw new Error("unhandled JS type " + (typeof ast) + " for value: " + JSON.stringify(ast));
  }
}

module.exports = compile;
