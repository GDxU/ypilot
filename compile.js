// yes, globals are usually bad, but these are global because otherwise we'd
// have to pass them to literally every function in this file, so I think it's
// OK.
var adjectiveDependencies = {};
var nounDefaultAdjectives = {};
var nounSupertypes = {};

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
      adjectiveDependencies[adj].forEach(d => queue.push(d));
    }
  }
  return (nounDefaultAdjectives[noun] = Object.keys(included));
}

function compileOp(ast) {
  switch (ast.op) {
    // top-level statements
    case 'defineAdjective':
      adjectiveDependencies[ast.name] = ast.dependencies;
      return 'function ' + ast.name + '({ ' + properties.map(p => {
	  return p[0] + ((p.length == 3) ? ' = ' + compile(p[2]) : '');
        }).join(', ') + " }) {\n" +
	properties.map(p => {
	  // TODO? check that p[0] is of type p[1]
	  return '  this.' + p[0] + ' = ' + p[0] + ";\n";
	}).join('') + "}\n" +
	ast.name + '.dependencies = [' + ast.dependencies.join(', ') + "];\n";
    case 'defineNoun':
      var supertypes =
        ast.supertypes.filter(t => (t[0] == 'noun')).map(t => t[1]);
      var defaultAdjectives =
	expandNounDefaultAdjectives(ast.name, supertypes,
	  ast.supertypes.filter(t => (t[0] == 'adjective')).map(t => t[1]));
      return '' +
        // define the type as a thing
        'var ' + ast.name + " = router.newThing();\n" +
        'router.add(' + ast.name + ', { ' +
	  'Named: new Named({ name: "' + ast.name + '" }), ' +
	  'Typing: new Typing({ supertypes: [' +
	    supertypes.join(', ') + "] }) });\n" +
	// define a function that makes a new instance of the type and adds it
        'function add' + ast.name + "(adjectivesProps) {\n" +
        "  var thing = router.newThing();\n" +
	   // add Typed and all the defaultAdjectives, using the properties
	   // from the argument when we have them
	"  var adjectives = {\n" +
	'    Typed: new Typed({ type: ' + ast.name  + " }),\n" +
	defaultAdjectives.map(adj => {
	  return adj + ': new ' + adj + '(' +
	    '("' + adj + '" in adjectivesProps) ? adjectivesProps.' + adj +
	    " : {})";
	}).join(",\n    ") + "\n  };\n" +
	   // add any extra adjectives from the argument, and put their
	   // dependencies in the queue to be added
	"  var queue = [];\n" +
	"  for (var adjective in adjectiveProps) {\n" +
	"    if (!(adjective in adjectives)) {\n" +
	"      adjectives[adjective] = this[adjective](adjectiveProps);\n" +
	"      this[adjective].dependencies.forEach(d => queue.push(d));\n" +
	"    }\n" +
	"  }\n" +
	   // keep adding dependencies until we have them all
	"  while (queue.length > 0) {\n" +
	"    var d = queue.shift();\n" +
	"    if (!(d in adjectives)) {\n" +
	"      adjectives[d] = this[d]({});\n" +
	"      this[d].dependencies.forEach(d2 => queue.push(d2));\n" +
	"    }\n" +
	"  }\n" +
	   // finally, add the thing to the router with its adjectives
	"  router.add(thing, adjectives);\n" +
        "}\n" +
    case 'rule':
      var eventName = ast.trigger.op;
      var eventParams =
        ['thing', 'player', 'key'].
	filter(k => (k in ast.trigger)).
	map(k => ast.trigger[k].name);
      if (eventName == 'become') {
	var adjective = ast.trigger.adjectives[0]
	if (adjective.op == 'unadjective') {
	  eventName = 'unbecome' + adjective.name;
	} else {
	  eventName = 'become' + adjective.name;
	}
	// TODO check that all property values are simple variables
	eventParams.push('{ ' + adjective.properties.map(p => p[0] + ': ' + p[1].name) + ' }');
      }
      if ('args' in ast.trigger) {
	ast.trigger.args.forEach(a => eventParams.push(a.name));
      }
      return "router.on('" + eventName + "', function(" +
	  eventParams.join(', ') +
	") {\n" +
	"  if (" +
	  ast.conditions.map(compile).join(" &&\n      ") +
	") {\n" +
	  ast.effects.map(compile).join('') +
	"  }\n});\n";
    /* events (handled as part of 'rule' case)
    case 'clockTick':
    case 'hit':
    case 'press':
    case 'release':*/
    // TODO!!!
    // effects (these can also be events, but if they are they're handled in
    // the 'rule' case)
    case 'add':
    case 'remove':
    case 'become':
    // conditions
    case 'isa':
      return '((' + ast.l.name + ' in router.adjectives.Typed) &&' +
             ' subsumes(' + ast.r + ', ' +
	         'router.adjectives.Typed[' + ast.l.name + '].type))';
    case 'is':
      if (ast.r.op == 'adjective') {
        return '(' +
	  '(' + ast.l.name + ' in router.adjectives.' + ast.r.name + ') && ' +
	  ast.r.properties.map(p =>
	    'router.adjectives.' + ast.r.name + '[' + ast.l.name + '].' +
	    // FIXME == or === ?
	    p[0] + ' == ' + compile(p[1])
	  ).join(' && ') +
	')';
      } else { // unadjective
	return '(!(' + ast.l.name + ' in router.adjectives.' + ast.r.name +'))';
      }
    case 'exists':
      // TODO nested loop: for each thing that matches the description, if...
    case 'holdingDown':
    case 'notHoldingDown':
      // TODO how?
      throw new Error("TODO");
    /* adjective_inst handled in other cases
    case 'adjective':
    case 'unadjective':*/
    // expressions
    case 'variable:
      return ast.name;
    case 'new':
      // TODO? allow more constructors
      if (!/^(Vec2|Array)$/.test(ast.constructor)) {
	throw new Error("constructing a new " + ast.constructor + " not allowed");
      }
      return 'new ' + ast.constructor + '(' + ast.args.map(compile).join(', ') + ')';
    case '[]':
      return '[' + ast.args.map(compile).join(', ') + ']';
    default: // arithmetic and comparison operators
      if ('r' in ast) { // infix
	if (!/^([<=>!]=|[<>*/%+-])$/.test(ast.op)) {
	  throw new Error("invalid infix operator: " + ast.op);
	}
	return '(' + compile(ast.l) + ' ' + ast.op + ' ' + compile(ast.r) + ')';
      } else { // prefix
        if (!/^[+-]$/.test(ast.op)) {
	  throw new Error("invalid prefix operator: " + ast.op);
	}
	return '(' + compile(ast.l) + ' ' + ast.op + ')';
      }
  }
}

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
	// TODO define subsumes(nounID,nounID) after router
	return "this.router = new Router();\n\n" + ast.map(compile).join("\n");
      } else if ('op' in ast) {
	return compileOp(ast);
      } else {
	throw new Error("expected AST object to be an Array or have op: " + JSON.stringify(ast));
      }
    case 'number': // fall through
    case 'string':
      return JSON.stringify(ast);
    default:
      throw new Error("unhandled JS type " + (typeof ast) + " for value: " + JSON.stringify(ast));
  }
}

module.exports = compile;
