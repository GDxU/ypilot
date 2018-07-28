/* functions dealing with .yp value types
 *
 * Mostly these deal with compile time types (runTimeSubsumes instead deals
 * with run time Typing things). Compile time types are type expressions as
 * parsed by parser.pegjs, i.e. one of the following:
 *
 * strings for simple types:
 *   'bottom', 'top', 'nothing', 'string', 'number', 'boolean'
 *   (note that 'bottom' is almost never the type of an expression; it's just
 *   used for the empty array [], which has type ['Array', 'bottom'])
 * ['Array', elemType]
 * ['object', 'ConstructorName']
 * ['thing', 'AdjName1'[, 'AdjName2'...]] (intersection of adjectives)
 * ['thing', ['Typed', 'NounName']]
 * TODO
 * ['thing', ['Typed', 'NounName'], 'AdjName1'[, 'AdjName2'...]]
 *
 * The first couple of functions deal with adjective and nouns at compile time,
 * represented by their name strings.
 */

// given a set of adjectives, return the set expanded by including all its
// transitive dependencies
// if included is given (as an object), add adj: true for each adjective in the
// resulting set
function expandAdjectiveSet(adjectives, included) {
  if (!included) included = {};
  var queue = Array.from(adjectives); // copy array so we can mod it
  while (queue.length > 0) {
    var adj = queue.shift();
    if (!(adj in included)) {
      included[adj] = true;
      if (!(adj in module.exports.adjectiveDependencies)) {
	throw new Error("undefined adjective " + adj);
      }
      module.exports.adjectiveDependencies[adj].forEach(d => queue.push(d));
    }
  }
  return Object.keys(included);
}

// compute the complete set of adjectives implied by a noun definition, and
// update nounSupertypes and nounDefaultAjectives
function expandNounDefaultAdjectives(noun, supertypes, defaultAdjectives) {
  module.exports.nounSupertypes[noun] = supertypes;
  var included = {};
  supertypes.forEach(pa => {
    module.exports.nounDefaultAdjectives[pa].forEach(grampa => {
      included[grampa] = true;
    });
  });
  var adjs = expandAdjectiveSet(defaultAdjectives, included);
  module.exports.nounDefaultAdjectives[noun] = adjs;
  return adjs;
}

function isNominalType(type) {
  return (Array.isArray(type) && type.length >= 2 && type[0] == 'thing' &&
	  Array.isArray(type[1]) && type[1].length == 2 &&
	  type[1][0] == 'Typed');
}

// given a thing type (noun or not), return the expanded adjective set it
// implies
function getAdjectiveDependencies(type) {
  var deps;
  if (isNominalType(type)) {
    // convert to expanded adjective intersection
    var deps = module.exports.nounDefaultAdjectives[type[1][1]];
    if (type.length > 2) { // also has adjective intersection
      deps = expandAdjectiveSet(deps.concat(type.slice(2)));
    }
  } else {
    // expand adj set with each adj's dependencies
    deps = expandAdjectiveSet(type.slice(1));
  }
  // all things are Typed
  if (!deps.includes('Typed')) deps = deps.concat('Typed');
  return deps;
}

// is ancestor a (non-strict) ancestor of descendant, in the .yp type graph?
// ancestor and descendant are the thing numbers of runtime types (nouns)
function runTimeSubsumes(ancestor, descendant) {
  return (ancestor == descendant ||
          router.adjectives.Typing[descendant].supertypes.
            some(t => runTimeSubsumes(ancestor, t)));
}

// like runTimeSubsumes, but with name strings instead of thing numbers
function compileTimeNominalSubsumes(ancestor, descendant) {
  return (ancestor == descendant ||
          module.exports.nounSupertypes[descendant].
	    some(t => compileTimeNominalSubsumes(ancestor, t)));
}

// is ancestor a (non-strict) ancestor of descendant, in the compile-time type
// system?
// note that this covers both nominal types (nouns) and other kinds of type,
// unlike the above two functions
function compileTimeSubsumes(ancestor, descendant) {
  // 'top' subsumes everything by definition
  if (ancestor == 'top') return true;
  if (descendant == 'top') return false;
  // 'bottom' is subsumed by everything by definition
  if (descendant == 'bottom') return true;
  if (ancestor == 'bottom') return false;
  // simple types must match exactly
  if ('string' == typeof ancestor) return (ancestor == descendant);
  if ('string' == typeof descendant) return false;
  // here both ancestor and descendant should each be one of the complex types
  if (!(Array.isArray(ancestor) && Array.isArray(descendant) &&
        ancestor.length >= 2 && descendant.length >= 2)) {
    throw new Error('bogus type in subsumption test: ' + JSON.stringify(ancestor) + ' subsumes? ' + JSON.stringify(descendant));
  }
  // complex types must be of the same kind
  if (ancestor[0] != descendant[0]) return false;
  // the rest depends on the kind
  switch (ancestor[0]) {
    // arrays are covariant with their element type (normally they're
    // invariant, but we can get away with this because in .yp arrays are
    // immutable)
    case 'Array':
      return compileTimeSubsumes(ancestor[1], descendant[1]);
    case 'object':
      // technically this should use Object.isPrototypeOf, but practically the
      // only such types allowed in .yp are disjoint from one another
      return (ancestor[1] == descendant[1]);
    case 'thing':
      if (isNominalType(ancestor)) {
	if (isNominalType(descendant)) {
	  if (!compileTimeNominalSubsumes(ancestor[1][1], descendant[1][1])) {
	    return false;
	  }
	  if (ancestor.length > 2) { // also has adjective intersection
	    var adjAnc = ['thing', ...ancestor.slice(2)];
	    return compileTimeSubsumes(adjAnc, descendant);
	  } else {
	    return true;
	  }
	} else { // nominal type never subsumes adjective intersection
	  return false;
	}
      } else { // ancestor is adjective intersection
        var descDeps = getAdjectiveDependencies(descendant);
	// check for ancestor subseteq descendant WRT adj sets
	return ancestor.slice(1).every(adj => descDeps.includes(adj));
      }
    default:
      throw new Error('bogus types in subsumption test: ' + JSON.stringify(ancestor) + ' subsumes? ' + JSON.stringify(descendant));
  }
}

// return a compile time type that is the least common subsumer of types a and b
function leastCommonSubsumer(a, b) {
  // if one subsumes the other, return it
  if (compileTimeSubsumes(a, b)) return a;
  if (compileTimeSubsumes(b, a)) return b;
  // if either is a simple type, return top (we already know they're !=)
  if (!(Array.isArray(a) && Array.isArray(b))) return 'top';
  if (a.length < 2) throw new Error('bogus type in LCS: ' + JSON.stringify(a));
  if (b.length < 2) throw new Error('bogus type in LCS: ' + JSON.stringify(b));
  // if they're different kinds of complex type, return top
  if (a[0] != b[0]) return 'top';
  // the rest depends on the kind (see compileTimeSubsumes())
  switch (a[0]) {
    case 'Array':
      // again, covariant
      return ['Array', leastCommonSubsumer(a[1], b[1])];
    case 'object':
      // again, disjoint
      // NOTE: technically should use ['object', 'Object'] instead of 'top'
      // here, but that's not really a valid type in .yp
      return ((a[1] == b[1]) ? a[1] : 'top');
    case 'thing':
      var aNom = isNominalType(a);
      var bNom = isNominalType(b);
      if (aNom && bNom) {
	// do a breadth-first search of a's ancestors for those that subsume b
	var answers = [];
	var queue = [a[1][1]];
	while (queue.length > 0) {
	  var aAnc = queue.shift();
	  if (answers.includes(aAnc)) {
	    // do nothing
	  } else if (compileTimeNominalSubsumes(aAnc, b[1][1])) {
	    answers.push(aAnc);
	    // NOTE: we don't enqueue aAnc's supertypes in this case because
	    // we're looking for the *least* common subsumer, not all common
	    // subsumers
	  } else {
	    queue = queue.concat(module.exports.nounSupertypes[aAnc]);
	  }
	}
	// if there is a unique answer that is a nominal type, return it,
	// otherwise fall through to adj intersection below
	if (answers.length == 1) {
	  // TODO? also include adjs in common that aren't covered by this type?
	  return ['thing', ['Typed', answers[0]]];
	}
      }
      // take the intersection of the expanded adjective sets
      var aDeps = getAdjectiveDependencies(a);
      var bDeps = getAdjectiveDependencies(b);
      var intersection = aDeps.filter(adj => bDeps.include(adj));
      // TODO? contract the intersection again? not really necessary
      return ['thing', ...intersection];
    default:
      throw new Error('bogus types in LCS: ' + JSON.stringify(a) + ' and ' + JSON.stringify(b));
  }
}

// return a string that would parse back to the given type (except for
// bottom/top/nothing)
function format(type) {
  if ('string' == typeof type) {
    return type;
  } else if (Array.isArray(type) && type.length >= 1 &&
	     'string' == typeof type[0]) {
    switch (type[0]) {
      case 'object':
        return type[1] + ' object';
      case 'thing':
        var noun = 'thing';
	var adjs;
        if (Array.isArray(type[1]) && type[1][0] == 'Typed') {
	  noun = type[1][1];
	  adjs = type.slice(2);
	} else {
	  adjs = type.slice(1);
	}
	// all things are Typed, don't bother saying it
	adjs = adjs.filter(x => (x != 'Typed'));
	return ((adjs.length == 0 ? '' : (adjs.join(', ') + ' ')) + noun);
      case 'Array':
        var elType = type[1];
	if (elType == 'top') { return 'Array'; }
	var elTypeStr = format(elType);
	if (Array.isArray(elType) && elType[0] == 'Array') {
	  elTypeStr = elTypeStr.replace(/^Array/, 'Arrays');
	} else {
	  elTypeStr += 's';
	}
        return 'Array of ' + elTypeStr;
    }
  }
  var json = JSON.stringify(type);
  // NOTE: not an error, since this is usually part of an error message anyway
  console.warn('bogus kind of type: ' + json);
  return json;
}

// roughly decide whether to put "a" or "an" before a type name
function aAn(str) {
  return 'a' + (/^[aeiou]/i.test(str) ? 'n' : '') + ' ' + str;
}

function assertSubsumes(a, b, desc) {
  if (!compileTimeSubsumes(a, b)) {
    throw new TypeError('expected ' + desc + ' to be ' + aAn(format(a)) + ', but got ' + aAn(format(b)));
  }
}

module.exports = {
  expandNounDefaultAdjectives: expandNounDefaultAdjectives,
  runTimeSubsumes: runTimeSubsumes,
  compileTimeSubsumes: compileTimeSubsumes,
  leastCommonSubsumer: leastCommonSubsumer,
  format: format,
  aAn: aAn,
  assertSubsumes: assertSubsumes,
  adjectiveDependencies: {},
  nounDefaultAdjectives: {},
  nounSupertypes: {}
};
