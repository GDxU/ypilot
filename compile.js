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
      if (eventName == 'become') {
	var adjective = ast.trigger.adjectives[0]
	if (adjective.op == 'unadjective') {
	  eventName = 'unbecome' + adjective.name;
	} else {
	  eventName = 'become' + adjective.name;
	}
      }
      return "router.on('" + eventName + "', function(" +
	  // TODO args for the specific event type
	") {\n" +
	"  if (" +
	  // TODO check conditions
	") {\n" +
	  // TODO do effects
	"  }\n});\n";
    // TODO!!! (some (most?) of these might go away since they're taken care of by compilation farther up the AST, e.g. unadjective)
    // events / effects
    case 'clockTick':
    case 'hit':
    case 'add':
    case 'remove':
    case 'become':
    case 'press':
    case 'release':
    // conditions
    case 'isa':
    case 'is':
    case 'exists':
    case 'holdingDown':
    case 'notHoldingDown':
    // adjective_inst?
    case 'adjective':
    case 'unadjective':
    // expressions
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
