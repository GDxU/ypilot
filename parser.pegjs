{
  const ensureSafeSVGGraphicsElementString =
    require('./svg.js').ensureSafeSVGGraphicsElementString;

  // rearrange the AST for a chain of infix operations of the same precedence
  // so that they are performed left to right, i.e. the rightmost operation is
  // the root of the tree
  function nestInfix(first, rest) {
    var ret = first;
    rest.forEach(function(step) {
      ret = { op: step.op, l: ret, r: step.r };
    });
    return ret;
  }
}

config
  = sp statements:statement* { return statements; }

statement
  = s:( use
      / adjective_def
      / noun_def
      / rule
      / metadata
      )
    {
      s.text = text();
      s.src = peg$computeLocation(peg$savedPos, peg$currPos);
      return s;
    }

metadata
  = key:property_name ilsp ':' sp val:string
  { return { op: 'metadata', key: key, value: val }; }

use
  = 'use' sp url:string { return { op: 'use', url: url }; }

rule
  = 'when' sp trigger:event 'and' sp conditions:condition+
    'then' sp effects:effect+
    { return {
	op: 'rule',
	trigger: trigger,
	conditions: conditions,
	effects: effects
    }; }
  / 'when' sp trigger:event 'then' sp effects:effect+
    { return {
        op: 'rule',
	trigger: trigger,
	conditions: [true],
	effects: effects
    }; }

event
  = 'the' sp 'game' sp 'starts' sp { return { op: 'start' }; }
  / 'the' sp 'clock' sp 'ticks' sp { return { op: 'clockTick' }; }
  / map:variable sp 'reads' sp character:string 'at' sp position:variable
    { return {
        op: 'read',
	map: map,
	character: character,
	position: position
    }; }
  / x:variable 'hits' sp y:variable { return { op: 'hit', args: [x,y] }; }
  / x:variable 'point' sp p:variable 'penetrates' sp
    y:variable 'edge' sp 'from' sp from:variable 'to' sp to:variable
    t:variable 'ticks' sp 'ago' sp 'with' sp 'velocity' sp v:variable
    { return {
	op: 'penetrate',
	penetrator: x, point: p,
	penetrated: y, edgeFrom: from, edgeTo: to,
	ticksAgo: t, relativeVelocity: v
    }; }
  / thing:variable 'is' sp 'added' sp { return { op: 'add', thing: thing }; }
  / thing:variable 'is' sp 'removed' sp
    { return { op: 'remove', thing: thing }; }
  / thing:variable 'becomes' sp adjective:adjective_inst
    { return { op: 'become', thing: thing, adjectives: [adjective] }; }
  / player:variable 'presses' sp key:value_expr
    { return { op: 'press', player: player, key: key }; }
  / player:variable 'releases' sp key:value_expr
    { return { op: 'release', player: player, key: key }; }

effect
  = a 'new' sp type:type_name thing:variable 'is' sp 'added' sp 'which' sp 'is' sp adjectives:adjective_inst+
    { return { op: 'add', type: type, thing: thing, adjectives: adjectives }; }
  / a 'new' sp type:type_name thing:variable 'is' sp 'added' sp
    { return { op: 'add', type: type, thing: thing, adjectives: [] }; }
  / thing:variable 'is' sp 'removed' sp
    { return { op: 'remove', thing: thing }; }
  / thing:variable 'becomes' sp adjectives:adjective_inst+
    { return { op: 'become', thing: thing, adjectives: adjectives }; }
  / thing:variable 'is' sp 'read' sp { return { op: 'read', thing: thing }; }
  / l:let { l.isCondition = false; return l; }
  / 'debug' sp value:value_expr
    { return { op: 'debug', value: value }; }

let
  = 'let' sp variable:variable 'be' sp value:value_expr
    { return { op: 'let', variable: variable, value: value }; }

condition
  = parens
  / l:let { l.isCondition = true; return l; }
  / l:variable 'is' sp a r:type_name { return { op: 'isa', l: l, r: r }; }
  / l:variable 'is' sp r:adjective_inst { return { op: 'is', l: l, r: r }; }
  / 'there' sp 'is' sp a 'thing' sp v:variable
    'which' sp 'is' sp st:adjective_inst+
    { return { op: 'exists', variable: v, suchThat: st }; }
  / player:variable 'is' sp not:('not' sp)? 'holding' sp 'down' sp key:value_expr
    { return {
	op: 'keyState',
	player: player,
	key: key,
	state: (!not)
    }; }

adjective_inst
  = name:type_name
    'with' sp first_prop:property_name sp first_val:value_expr
    rest:( 'and' sp rest_prop:property_name sp rest_val:value_expr
           { return [rest_prop, rest_val]; }
         )*
    { return { op: 'adjective', name: name, properties: [[first_prop, first_val], ...rest] }; }
  / 'not' sp name:type_name { return { op: 'unadjective', name: name }; }

value_expr
  = first:value_expr_no_subscript rest:('[' sp r:(value_expr / or) ']' { return { op: '_', r: r }; })*
  { return nestInfix(first, rest); }

value_expr_no_subscript
  = variable
  / constant
  / parens
  / constructor
  / math
  / array
  / number
  / string
  / graphics
  / boolean
  / nothing

parens
  = '(' sp expr:or ')' sp { return expr; }

constructor
  = name:type_name args:array
  { return { op: 'new', constructor: name, args: args.args }; }

math
  = name:$(
      'a'? ('sin' / 'cos' / 'tan') 'h'?
    / 'abs' / 'sign'
    / 'ceil' / 'floor' / 'round'
    / 'sqrt' / 'cbrt'
    / 'log' ('2' / '10' / '1p' / '') / 'exp' 'm1'?
  ) arg:parens
  { return { op: 'math', fn: name, arg: arg }; }

array
  = '[' sp first:(value_expr / or) rest:(',' sp arg:(value_expr / or) { return arg; })* ']' sp
  { return { op: '[]', args: [first, ...rest] }; }
  / '[' sp ']' sp { return { op: '[]', args: [] }; }

or
  = first:and rest:('or' sp r:and { return { op: '||', r: r }; })*
  { return nestInfix(first, rest); }

and
  = first:not rest:('and' sp r:not { return { op: '&&', r: r }; })*
  { return nestInfix(first, rest); }

not
  = 'not' sp r:cmp { return { op: '!', r: r}; }
  / cmp

cmp
  = l:add op:$([<=>!] '=' / [<>]) sp r:add { return { op: op, l: l, r: r }; }
  / add
// TODO? also allow conditions in parens as boolean expressions

add
  = first:mul rest:(op:[+-] sp r:mul { return { op: op, r: r}; })*
  { return nestInfix(first, rest); }

mul
  = first:sgn rest:(op:$([*/%\.·×] / 'x' !id_char) sp r:sgn { return { op: op, r: r }; })*
  { return nestInfix(first, rest); }

sgn
  = op:[+-]? sp r:value_expr { return (op ? { op: op, r: r } : r ); }

number
  = expr:$([0-9]+ ('.' [0-9]+)?) sp { return JSON.parse(expr); }

string
  = '"""\n' str:$((!'\n"""' .)*) '\n"""' sp { return str; }
  / expr:$('"' ("\\" . / [^"\\])* '"') sp { return JSON.parse(expr); }

graphics
  = str:$(
    '<g' ![0-9a-z_-]i (graphics / !'</g>' .)* '</g>'
    / '<' graphics_element_name ![0-9a-z_-]i (!'/>' [^<>])* '/>'
    / '<' graphics_element_name ![0-9a-z_-]i
      (!('</' graphics_element_name '>') . )*
      '</' graphics_element_name '>'
  ) sp {
    ensureSafeSVGGraphicsElementString(str);
    return { op: 'graphics', string: str };
  }

graphics_element_name
  = 'path' / 'rect' / 'circle' / 'ellipse' / 'line' / 'polyline' / 'polygon' / 'text'

boolean
  = val:('true' { return true; } / 'false' { return false; }) sp { return val; }

nothing
  = 'nothing' sp { return null; }

noun_def
  = a name:type_name 'is' sp
    first_art:a? first_name:type_name
    rest:('and' sp rest_art:a? rest_name:type_name
          { return [rest_art ? 'noun' : 'adjective', rest_name] })*
    { return {
        op: 'defineNoun',
	name: name,
	supertypes: [[first_art ? 'noun' : 'adjective', first_name], ...rest]
    }; }

adjective_def
  = a name:type_name 'thing' sp
    deps:('is' sp deps1:(dep:type_name 'and' sp { return dep; })+ { return deps1; })?
    'has' sp props:property_decl+
    { return {
        op: 'defineAdjective',
	name: name,
	dependencies: deps || [],
	properties: props
    }; }

property_decl
  = p:property_decl_without_default d:defalt { return [...p, d]; }
  / property_decl_without_default

property_decl_without_default
  = 'a' sp 'number' sp 'of' sp name:property_name sp
    { return [name, 'number']; }
  / a name:property_name ilsp
    type:( 'flag' { return 'boolean'; }
         / 'which' sp 'is' sp a type:singular_type { return type; }
	 )? sp {
    return [name, type];
  }
  / 'some' sp name:property_name ilsp
    eltype:( 'flags' { return 'boolean'; }
	   / 'which' sp 'are' sp type:plural_type { return type; }
	   )? sp {
    return [name, ['Array', eltype]];
  }

defalt
  = '(' sp 'default' sp v:value_expr ')' sp { return v; }

singular_type
  = 'Array' ilsp 'of' sp eltype:plural_type { return ['Array', eltype]; }
  / name:type_name kind:('thing' / 'object') { return [kind, name]; }
  / name1:type_name { return ['thing', name1]; }
  / 'boolean' / 'number' / 'string'

plural_type
  = 'Arrays' ilsp 'of' sp eltype:plural_type { return ['Array', eltype]; }
  / scalar:
    ( name:type_name kind:('thing' / 'object') { return [kind, name]; }
    / 'boolean' / 'number' / 'string'
    ) 's' { return scalar; }
  / name1:plural_type_name { return ['thing', name1]; }

type_name
  = name:$([A-Z] id_char*) sp { return name; }

plural_type_name
  = name:$([A-Z] (id_char &id_char)*) 's' sp { return name; }

property_name
  = !reserved_word name:$([a-z] id_char*) { return name; }

variable
  = '?' name:$(id_char+) sp { return { op: 'var', name: name }; }

// FIXME since these are "var"s, but aren't in variableInitialized, they might
// get assigned to if they're used in the wrong place
constant
  = ('PI' / 'π') !id_char sp { return { op: 'var', name: 'Math.PI' }; }
  / ('E' / 'e') !id_char sp { return { op: 'var', name: 'Math.E' }; }

id_char
  = '_' / [0-9] / [a-z]i

// indefinite article
a
  = ('an' / 'a') sp

reserved_word
  = ( 'true' / 'false'
    / 'added' / 'removed' / 'becomes'
    / 'is' / 'are' / 'and' / 'an' / 'a' / 'has' / 'there'
    / 'which' / 'with' / 'when' / 'then' / 'of' / 'new' / 'use'
    / ('thing' / 'object' / 'flag' / 'boolean' / 'number' / 'string') 's'?
    / 'the' / 'clock' / 'ticks' / 'hits' / 'penetrates'
    / 'presses' / 'releases' / 'holding' / 'down'
    ) !id_char

// in-line space
ilsp
  = [ \t]*

// potentially multi-line space (and comments)
sp
  = ( [ \n\r\t]
    / '#' [^\r\n]* [\r\n]
    )*
