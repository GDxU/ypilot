const $ = require('jquery'); // for remote use statements
const errors = require('./errors.js');
const tryToParseString = require('./parser-utils.js').tryToParseString;
const stdlib = require('./stdlib.js');
const types = require('./types.js');
require('./arrays.js');
// yes, globals are usually bad, but these are global because otherwise we'd
// have to pass them to literally every function in this file, so I think it's
// OK.
// maps adjective names to property names to property types
var adjectiveSignatures = {};
// maps event names to event signatures, which have positionalParams and
// namedParams, indicating the type of each parameter
var eventSignatures = {};
var usedUrls = {};
// maps variable names to the type of that variable in the context currently
// being compiled (and has no mapping for uninitialized variables)
var variableTypes = {};
var main;
if ('undefined' == typeof window) { // node.js
  main = global;
} else { // browser
  main = window;
}
// list of things to delete from window in order to unload the game
main.deleteToUnload = [];

// remember that the given 'var' ast has been initialized, and its type
function setInitialized(ast) {
  variableTypes[ast.name] = ast.type;
}

// forget all variable initializations
function clearInitialized(ast) {
  variableTypes = {};
}

// is the given 'var' ast initialized/declared?
function isInitialized(ast) {
  return (ast.name in variableTypes);
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
  var eventSig = undefined;
  var eventParams = [];
  var eventNamedParams = [];
  var conditions = [].concat(origConditions);
  if (eventName == 'event') {
    eventName = trigger.verb;
    if (!(eventName in eventSignatures)) {
      throw new Error('undefined custom event ' + eventName);
    }
    eventSig = eventSignatures[eventName];
    eventParams = [].concat(trigger.positionalArgs);
    if (eventSig.positionalParams.length != eventParams.length) {
      throw new Error('expected exactly ' + eventSig.positionalParams.length + ' positional parameters for custom event ' + eventName + ' but got ' + eventParams.length);
    }
    eventParams.forEach((p, i) => {
      p.type = eventSig.positionalParams[i];
    });
    eventNamedParams = trigger.namedArgs;
    eventNamedParams.forEach(([name, arg]) => {
      if (!(name in eventSig.namedParams)) {
	throw new Error('unknown preposition/property ' + name + ' for custom event ' + eventName);
      }
    });
  } else {
    var builtinParams = [
      // [name, type]
      ['thing', ['thing', 'Typed']], // NOTE: Typed happens to be top noun type
      ['player', ['thing', 'Interfaced']],
      ['penetrator', ['thing', 'Tangible']],
      ['point', ['object', 'Vec2']],
      ['penetrated', ['thing', 'Tangible']],
      ['edgeFrom', ['object', 'Vec2']],
      ['edgeTo', ['object', 'Vec2']],
      ['ticksAgo', 'number'],
      ['relativeVelocity', ['object', 'Vec2']],
      ['map', ['thing', 'Mapped']],
      ['position', ['object', 'Vec2']]
    ];
    // if this is a become event (not unbecome), we can be more specific about
    // the type of the "thing" parameter
    if (eventName == 'become' && trigger.adjectives[0].op == 'adjective') {
      builtinParams[0][1][1] = trigger.adjectives[0].name;
    }
    eventParams =
      builtinParams.
      filter(([k,t]) => (k in trigger)).
      map(([k,t]) => {
	trigger[k].type = t;
	return trigger[k];
      });
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
      localVar.type = 'string';
      eventParams.push(localVar);
    }
  }
  // compile all param vars as lvalues (FIXME what if object isn't a var?)
  eventParams = eventParams.map(lValue);
  if (eventName == 'become') {
    var adjective = trigger.adjectives[0];
    if (!(adjective.name in adjectiveSignatures)) {
      throw new Error('undefined adjective ' + adjective.name);
    }
    if (adjective.op == 'unadjective') {
      eventName = 'unbecome' + adjective.name;
      // TODO? allow unbecome (and become?) to capture old property values
    } else {
      eventName = 'become' + adjective.name;
      eventNamedParams = adjective.properties;
      eventSig = { namedParams: adjectiveSignatures[adjective.name] };
    }
  } else if (eventName == 'read') {
    eventName += trigger.character;
  }
  if ('args' in trigger) { // op: 'hit'
    trigger.args.forEach(a => {
      a.type = ['thing', 'Tangible'];
      eventParams.push(lValue(a))
    });
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
      // NOTE: we know here that eventSig is defined because all the paths
      // above that make eventNamedParams nonempty also set eventSig
      localVar.type = eventSig.namedParams[p[0]];
      return p[0] + ': ' + lValue(localVar); // even though on right (SMH, JS)
    }).join(', ') + ' }');
  }
  // get all the uninitialized vars used in conditions, so that they can be
  // declared up front and then initialized by the conditions (if they are in
  // fact used in a position where they can be so initialized)
  var vars = getVars(conditions);
  for (var v in variableTypes) { delete vars[v]; }
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
// TODO add url of the file the statement comes from to ast.src
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
      types.adjectiveDependencies[ast.name] = ast.dependencies;
      var adjSig = {};
      ast.properties.forEach(prop => {
	// prop is [name, type[, default]]
	adjSig[prop[0]] = prop[1];
      });
      adjectiveSignatures[ast.name] = adjSig;
      return 'function yp$' + ast.name + '({ ' + ast.properties.map(p => {
	  if (p.length == 3) {
	    var [name, type, dfalt] = p;
	    var dfaltStr = compile(dfalt);
	    var dfaltType = getType(dfalt);
	    if (!types.compileTimeSubsumes(type, dfaltType)) {
	      throw new Error('expected default for property ' + name + ' of adjective ' + ast.name + ' to be a ' + JSON.stringify(type) + ', but got a ' + JSON.stringify(dfaltType));
	    }
	    return name + ' = ' + dfaltStr;
	  } else {
	    return p[0];
	  }
        }).join(', ') + " }) {\n" +
	ast.properties.map(p => {
	  return '  this.' + p[0] + ' = ' + p[0] + ";\n";
	}).join('') + "}\n" +
	'yp$' + ast.name + '.dependencies = [' +
	  ast.dependencies.map(x => ('"' + x + '"')).join(', ') +
	"];\n" +
	"router.declareAdjective('" + ast.name + "');\n" +
	"deleteToUnload.push('yp$" + ast.name + "');\n";
    case 'defineEvent':
      // save definition so we can check uses against it later
      var arg2type = {};
      if ('parameters' in ast) {
        ast.parameters.forEach(([arg, type]) => {
	  arg2type[arg.name] = type;
	});
      }
      if (!ast.positionalArgs.every(isVariable)) {
	// NOTE: subject is always a variable syntactically
	throw new Error('expected a variable object in event definition but got ' + JSON.stringify(ast.positionalArgs[1]));
      }
      var positionalParams =
        ast.positionalArgs.map(arg =>
	  ((arg.name in arg2type) ? arg2type[arg.name] : 'top')
	);
      var namedParams = {};
      ast.namedArgs.forEach(([name, arg]) => {
	if (!isVariable(arg)) {
	  throw new Error('expected a variable in value of ' + name + ' preposition/property in event definition but got ' + JSON.stringify(arg));
	}
	namedParams[name] =
	  ((arg.name in arg2type) ? arg2type[arg.name] : 'top');
      });
      eventSignatures[ast.verb] = {
	positionalParams: positionalParams,
	namedParams: namedParams
      };
      break;
    case 'defineNoun':
      var supertypes =
        ast.supertypes.filter(t => (t[0] == 'noun')).map(t => t[1]);
      var defaultAdjectives =
	types.expandNounDefaultAdjectives(ast.name, supertypes,
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

function getType(ast) {
  switch (typeof ast) {
    case 'object':
      if (ast == null) {
	return 'nothing';
      } else if ('type' in ast) {
	return ast.type;
      } else {
	throw new Error('ast has no type: ' + JSON.stringify(ast));
      }
    case 'boolean': // fall through
    case 'number':
    case 'string':
      return typeof ast;
    case 'undefined':
      return 'nothing';
    default:
      throw new Error('unhandled JS value type in getType(ast): ' + typeof ast);
  }
}

// compile an AST node like { op: '...', ... } to a string of JS code
// also add a type property to the AST node when compiling a value_expr
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
      if (!(ast.type in types.nounDefaultAdjectives)) {
	throw new Error('undefined noun in "is added" effect: ' + ast.type);
      }
      // get the adjective names that aren't implied by the noun type
      var extraAdjs =
        ast.adjectives.
	filter(adj => (
	  adj.op == 'adjective' &&
	  !types.nounDefaultAdjectives[ast.type].includes(adj.name)
	)).
	map(adj => adj.name);
      // set the type of the new thing variable
      ast.thing.type = ['thing', ['Typed', ast.type], ...extraAdjs];
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
      ast.copy.type = ast.original.type;
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
      ast.variable.type = ast.value.type;
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
      if (!(ast.verb in eventSignatures)) {
	throw new Error('undefined custom event ' + ast.verb);
      }
      var sig = eventSignatures[ast.verb];
      if (sig.positionalParams.length != ast.positionalArgs.length) {
	throw new Error('expected ' + sig.positionalParams.length + ' positional arguments for custom event ' + ast.verb + ', but got ' + ast.positionalArgs.length);
      }
      var positionalArgsStr =
        ast.positionalArgs.map((arg, i) => {
	  var argStr = compile(arg);
	  var argType = getType(arg);
	  var paramType = sig.positionalParams[i];
	  if (!types.compileTimeSubsumes(paramType, argType)) {
	    throw new Error('expected a ' + JSON.stringify(paramType) + ' for ' + (i == 0 ? 'subject' : 'object') + ' of custom event ' + ast.verb + ', but got a ' + JSON.stringify(argType));
	  }
	  return ', ' + argStr;
	}).join('');
      var namedArgSupplied = {};
      var namedArgsStr = '';
      if (ast.namedArgs.length > 0) {
	namedArgsStr =
	  ', { ' +
	  ast.namedArgs.map(([name, val]) => {
	    if (!(name in sig.namedParams)) {
	      throw new Error('unexpected named argument ' + name + ' given for custom event ' + ast.verb);
	    }
	    namedArgSupplied[name] = true;
	    var valStr = compile(val);
	    var valType = getType(val);
	    var paramType = sig.namedParams[name];
	    if (!types.compileTimeSubsumes(paramType, valType)) {
	      throw new Error('expected a ' + JSON.stringify(paramType) + ' for argument ' + name + ' of custom event ' + ast.verb + ', but got a ' + JSON.stringify(valType));
	    }
	    return (name + ': ' + valStr);
	  }).join(', ') +
	  ' }';
      }
      for (var name in sig.namedParams) {
	if (!namedArgSupplied[name]) {
	  throw new Error('missing argument ' + name + ' of custom event ' + ast.name);
	}
      }
      return '    router.emit("' + ast.verb + '"' +
	       positionalArgsStr +
	       namedArgsStr +
	     ").catch(err => console.log(err));\n";
    // conditions
    case 'isa':
      var l = compile(ast.l);
      ast.type = 'boolean';
      return '((' + l + ' in router.adjectives.Typed) &&' +
             ' runTimeSubsumes(yp$' + ast.r + ', ' +
	         'router.adjectives.Typed[' + l + '].type))';
    case 'isin':
      var l = compile(ast.l);
      var lType = getType(ast.l);
      var r = compile(ast.r);
      var rType = getType(ast.r);
      ast.type = 'boolean';
      // check that r is an array
      // NOTE: we don't check the element type against l's type, because they
      // could be overlapping but not subsuming types and the isin expression
      // would still be valid (and we don't have a disjointness test)
      if (!(Array.isArray(rType) && rType[0] == 'Array')) {
	throw new Error('expected an Array after "is in", but got a ' + JSON.stringify(rType));
      }
      if ('at' in ast) {
	ast.at.type = 'number';
	var at = lValue(ast.at);
	return '((' + at + ' = (' + r + ').indexOf(' + l + ')) != -1)';
      } else {
	return '(' + r + ').includes(' + l + ')';
      }
    case 'is':
      var l = compile(ast.l);
      var lType = getType(ast.l);
      // check that l could possibly have an adjective (could be a thing)
      if (!('top' == lType ||
	    (Array.isArray(lType) && lType[0] == 'thing'))) {
	throw new Error('expected a thing before "is ' + (ast.r.op == 'unadjective' ? 'not ' : '') + ast.r.name + '", but got a ' + JSON.stringify(lType));
      }
      ast.type = 'boolean';
      if (ast.r.op == 'adjective') {
	if (!(ast.r.name in adjectiveSignatures)) {
	  throw new Error('unknown adjective ' + ast.r.name);
	}
	var adjSig = adjectiveSignatures[ast.r.name];
	// further restrict the var ast.l's type, assuming this condition is
	// satisfied
	if ('top' == lType) {
	  ast.l.type = ['thing', ast.r.name, 'Typed'];
	  setInitialized(ast.l);
	} else if (!lType.slice(1).includes(ast.r.name)) { // don't already have
	  ast.l.type = ast.l.type.concat(ast.r.name);
	  setInitialized(ast.l);
	}
        return '(' +
	  '(' + l + ' in router.adjectives.' + ast.r.name + ')' +
	  ast.r.properties.map(p => {
	    if (!(p[0] in adjSig)) {
	      throw new Error('unknown property ' + p[0] + ' of adjective ' + ast.r.name);
	    }
	    var propType = adjSig[p[0]];
	    var rhs =
	      'router.adjectives.' + ast.r.name + '[' + l + '].' +
	      p[0];
	    if (isVariable(p[1]) && !isInitialized(p[1])) {
	      // p[1] is an uninitialized variable, assign to it, but make sure
	      // the condition is true regardless of the value we assign
	      p[1].type = propType;
	      return ' && ((' + lValue(p[1]) + ' = ' + rhs + ') || true)';
	    } else {
	      // p[1] is an initialized variable or some other kind of value,
	      // test equality
	      // NOTE: no static type check here, see also 'isin'
	      return ' && Object.equals(' + compile(p[1]) + ', ' + rhs + ')';
	    }
	  }).join('') +
	')';
      } else { // unadjective
	return '(!(' + l + ' in router.adjectives.' + ast.r.name +'))';
      }
    case 'firstIn':
      var collStr = compile(ast.collection);
      var collType = ast.collection.type;
      var elemType;
      if (collType == 'string') {
	elemType = 'string';
      } else if (Array.isArray(collType) && collType[0] == 'Array') {
	elemType = collType[1];
      } else {
	throw new Error('expected a string or array after "first thing in", but got a ' + JSON.stringify(collType));
      }
      ast.type = 'boolean';
      ast.variable.type = elemType;
      return '((' + lValue(ast.variable) + ' = ' + collStr +
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
      if (!(positiveAdjective.r.name in adjectiveSignatures)) {
	throw new Error('unknown adjective ' + positiveAdjective.r.name);
      }
      ast.type = 'boolean';
      ast.variable.type = ['thing', positiveAdjective.r.name];
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
      ast.type = 'boolean';
      var playerStr = compile(ast.player);
      var playerType = getType(ast.player);
      if (!types.compileTimeSubsumes(['thing', 'Interfaced'], playerType)) {
	throw new Error('expected an Interfaced thing before "is (not) holding down", but got a ' + JSON.stringify(playerType));
      }
      if ('keys' in ast) {
	var keys = '(' + compile(ast.keys) + ')';
	var keysType = getType(ast.keys);
	if (!(['Array', 'string'].equals(keysType))) {
	  throw new Error('expected key list to be an Array of strings, but got a ' + JSON.stringify(keysType));
	}
	var predicate =
	  '(x => router.playerKeyState(' + compile(ast.player) + ', x))';
	if ('key' in ast) {
	  if (!ast.state) { throw new Error('WTF'); }
	  if (ast.key.op != 'var') { throw new Error('WTF'); }
	  ast.key.type = 'string';
	  return '(' + lValue(ast.key) + ' = ' + keys + '.find' + predicate + ')';
	} else { // no key variable
	  return '(' + (ast.state ? '' : '!') + keys +
	           '.' + (ast.quantifier == 'any' ? 'some' : 'every') +
		     predicate + ')';
	}
      } else {
	var keyStr = compile(ast.key);
	var keyType = getType(ast.key);
	if (keyType != 'string') {
	  throw new Error('expected a string after "is (not) holding down", but got a ' + JSON.stringify(keyType));
	}
	return '(' + (ast.state ? '' : '!') +
		 'router.playerKeyState(' + playerStr + ', ' + keyStr + '))';
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
      ast.type = variableTypes[ast.name];
      return 'yp$' + ast.name;
    case 'const':
      ast.type = 'number';
      return ast.name;
    case 'new':
      // TODO? allow more constructors
      // TODO? disallow Interface (JS code makes that now)
      if (!/^(Vec2|Array|SpatialIndex|Interface)$/.test(ast.constructor)) {
	throw new Error("constructing a new " + ast.constructor + " not allowed");
      }
      ast.type = ['object', ast.constructor];
      return 'new ' + ast.constructor + '(' + ast.args.map(compile).join(', ') + ')';
    case 'math':
      ast.type = 'number';
      return 'Math.' + ast.fn + '(' + compile(ast.arg) + ')';
    case '[]':
      var str = '[' + ast.args.map(compile).join(', ') + ']';
      var elemType =
        ast.args.
	map(getType).
	reduce(types.leastCommonSubsumer, 'bottom');
      ast.type = ['Array', elemType];
      return str;
    case '_':
      var objStr = compile(ast.l);
      var objType = getType(ast.l);
      var propStr = compile(ast.r);
      var propType = getType(ast.r);
      if (objType == 'string' ||
	  (Array.isArray(objType) && objType[0] == 'Array')) {
	if (ast.r == 'length') {
	  ast.type = 'number';
	} else if (propType == 'number') {
	  ast.type = ((objType == 'string') ? 'string' : objType[1]);
	} else {
	  throw new Error('expected string/array index to be a number or "length", but got a ' + JSON.stringify(propType));
	}
      } else if (Array.isArray(objType) &&
		 objType[0] == 'object' && objType[1] == 'Vec2') {
	if (!(ast.r == 'x' || ast.r == 'y')) {
	  // TODO allow arbitrary expressions that evaluate to one of these
	  // strings?
	  throw new Error('expected Vec2 index to be either "x" or "y", but got ' + JSON.stringify(ast.r)); // FIXME should show this in its original form
	}
	ast.type = 'number';
      } else {
	throw new Error('expected subscripted object to be an Array or a Vec2, but got a ' + JSON.stringify(objType));
      }
      return '(' + objStr + ')[' + propStr + ']';
    case 'graphics':
      ast.type = ['object', 'SVGGeometryElement'];
      var usedVars = ast.string.match(/\?[a-z]\w*/g);
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
	var strsAndVars = ast.string.split(/\?([a-z]\w*)/);
	var concatExpr = '';
	var i;
	for (i = 0; i < strsAndVars.length - 1; i += 2) {
	  var str = strsAndVars[i];
	  var v = { op: 'var', name: strsAndVars[i + 1] + 'Str$' };
	  // TODO check that var type is interpolatable? most are, in some sense
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
      var lStr = compile(ast.l);
      var lType = getType(ast.l);
      var rStr = compile(ast.r);
      var rType = getType(ast.r);
      if (!(['object', 'Vec2'].equals(lType) &&
	    ['object', 'Vec2'].equals(rType))) {
	throw new Error('expected two Vec2 objects in dot product, but got ' + JSON.stringify(lType) + ' · ' + JSON.stringify(rType));
      }
      ast.type = 'number';
      return compile(ast.l) + '.dot(' + compile(ast.r) + ')';
    case 'x': // cross product
    case '×': // (unicode)
      var lStr = compile(ast.l);
      var lType = getType(ast.l);
      var rStr = compile(ast.r);
      var rType = getType(ast.r);
      if (!(['object', 'Vec2'].equals(lType) &&
	    ['object', 'Vec2'].equals(rType))) {
	throw new Error('expected two Vec2 objects in cross product, but got ' + JSON.stringify(lType) + ' × ' + JSON.stringify(rType));
      }
      ast.type = ['object', 'Vec2'];
      return compile(ast.l) + '.cross(' + compile(ast.r) + ')';
    default: // arithmetic and comparison operators
      if ('l' in ast) { // infix
	if (!/^([<=>!]=|[<>*/%+-]|&&|\|\|)$/.test(ast.op)) {
	  throw new Error("invalid infix operator: " + ast.op);
	}
	var lStr = compile(ast.l);
	var lType = getType(ast.l);
	var rStr = compile(ast.r);
	var rType = getType(ast.r);
	if (/^[*/%+-]$/.test(ast.op)) {
	  if (Array.isArray(lType)) {
	    var method =
	      ({ '*': 'scale', '/': 'divide', '%': 'remainder',
		 '+': 'add', '-': 'subtract' })[ast.op];
	    if (lType[0] == 'object') {
	      /* FIXME this breaks unless main.js is loaded
	      if (!(method in main[lType[1]].prototype)) {
		throw new Error('no ' + method + ' method for ' + lType[1]);
	      }*/
	      // instead just check for Vec2, the only type with these defined
	      // besides Array, which is handled separately below
	      if (lType[1] != 'Vec2') {
		throw new Error('no ' + method + ' method for ' + lType[1]);
	      }
	      // check rType
	      if (/^[+-]$/.test(ast.op)) { // additive ops take Vec2
		if (!(['object', 'Vec2'].equals(rType))) {
		  throw new Error('expected a Vec2 object after ' + ast.op + ', but got a ' + JSON.stringify(rType));
		}
	      } else { // multiplicative ops take Vec2 or number
		if (!('number' == rType || ['object', 'Vec2'].equals(rType))) {
		  throw new Error('expected a number or a Vec2 object after ' + ast.op + ', but got a ' + JSON.stringify(rType));
		}
	      }
	      ast.type = lType;
	    } else if (lType[0] == 'Array') {
	      switch (method) {
		case 'add':
		  var rElemType;
		  if (Array.isArray(rType) && rType[0] == 'Array') {
		    rElemType = rType[1];
		  } else {
		    rElemType = rType;
		  }
		  ast.type =
		    ['Array', types.leastCommonSubsumer(lType[1], rElemType)];
		  break;
		case 'subtract':
		  // NOTE: we don't check lElemType subsumes rElemType
		  // (see 'isin')
		  ast.type = lType;
		  break;
		case 'scale':
		  if (rType != 'number') {
		    throw new Error('expected number to scale an ' + JSON.stringify(lType) + ' by, but got a ' + JSON.stringify(rType));
		  }
		  ast.type = lType;
		  break;
		case 'divide': // fall through
		case 'remainder':
		  throw new Error(method + ' operation is not defined for an LHS that is an Array of ' + JSON.stringify(lType[1]));
		  break;
	      }
	    } else if (lType[0] == 'thing') {
	      throw new Error(method + ' operation is not defined for an LHS that is a thing');
	    }
	    return lStr + '.' + method + '(' + rStr + ')';
	  } else if (ast.op == '+' &&
		     (lType == 'string' || rType == 'string')) {
	    ast.type = 'string';
	  } else if (lType == 'top') {
	    // fall back to runtime check
	    return '(("object" == typeof ' + lStr + ')? ' +
		   lStr + '.' + method + '(' + rStr + ') : (' +
		   lStr + ' ' + ast.op + ' ' + rStr + '))';
	  } else { // everything else results in numbers
	    ast.type = 'number';
	  }
	} else if (/^[=!]=$/.test(ast.op)) {
	  ast.type = 'boolean';
	  var eq = 'Object.equals(' + lStr + ', ' + rStr + ')';
	  return ((ast.op == '!=') ? '(!' + eq + ')' : eq);
	} else if (/^[<>]=?$/.test(ast.op)) {
	  ast.type = 'boolean';
	} else if (/^(&&|\|\|)$/.test(ast.op)) {
	  if (!(lType == 'boolean' && rType == 'boolean')) {
	    throw new Error('expected two booleans in ' + ast.op + ' but got ' + JSON.stringify(lType) + ' ' + ast.op + ' ' + JSON.stringify(rType));
	  }
	  ast.type = 'boolean';
	}
	// anything that doesn't return above falls through to the JS version
	// of the op:
	return '(' + lStr + ' ' + ast.op + ' ' + rStr + ')';
      } else { // prefix
        if (!/^[!+-]$/.test(ast.op)) {
	  throw new Error("invalid prefix operator: " + ast.op);
	}
	var rStr = compile(ast.r);
	var rType = getType(ast.r);
	if (ast.op == '!') {
	  if (rType != 'boolean') {
	    throw new Error('expected a boolean for argument of ! but got a ' + JSON.stringify(rType));
	  }
	  ast.type = 'boolean';
	} else {
	  if (rType != 'number') {
	    throw new Error('expected a number for argument of unary ' + ast.op + ' but got a ' + JSON.stringify(rType));
	  }
	  ast.type = 'number';
	}
	// TODO? unary +- for Vec2 objects
	return '(' + ast.op + ' ' + rStr + ')';
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
	types.adjectiveDependencies = {};
	adjectiveSignatures = {};
	types.nounDefaultAdjectives = {};
	types.nounSupertypes = {};
	eventSignatures = {};
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
