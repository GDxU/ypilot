function compileOp(ast) {
  switch (ast.op) {
    // top-level statements
    case 'defineAdjective':
      return 'function ' + ast.name + '({' + properties.map(p => {
	  return p[0] + ((p.length == 3) ? ' = ' + compile(p[2]) : '');
        }).join(', ') + "}) {\n" +
	properties.map(p => {
	  // TODO? check that p[0] is of type p[1]
	  return '  this.' + p[0] + ' = ' + p[0] + ";\n";
	}).join('') + "}\n" +
	ast.name + '.dependencies = [' + ast.dependencies.join(', ') + "];\n";
    case 'defineNoun':
      var supertypes =
        ast.supertypes.filter(t => (t[0] == 'noun')).map(t => t[1]);
      var defaultAdjectives =
        ast.supertypes.filter(t => (t[0] == 'adjective')).map(t => t[1]);
      return 'function add' + ast.name + "(adjectivesProps) {\n" +
        "  var thing = router.newThing();\n" +
	"  var adjectives = {};\n" +
	"  for (var adjective in adjectiveProps) {\n" +
	"    adjectives[adjective] = this[adjective](adjectiveProps);\n" +
	"  }\n" +
	// TODO add those of defaultAdjectives that are not in adjectiveProps, as well as any dependencies of either defaultAdjectives or adjectiveProps
	// maybe add defaults first, checking for non-default props as we go, and then make a final pass through adjectiveProps adding things that aren't already in adjectives (need to resolve default dependencies at compile time, non-default dependencies at run time)
	"  router.add(thing, adjectives);\n" +
        "}\n" +
        'add' + ast.name + '.supertypes = [' + supertypes.join(', ') + "];\n";
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
    // events
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
      if (!/^()$/.test(ast.constructor)) {
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
