config
  = statement*

statement
  = adjective_def
  / noun_def
  / rule

rule
  = 'when' sp event ('and' sp condition+) 'then' sp effect+

event
  = 'the' sp 'clock' sp 'ticks' sp
  / variable 'hits' sp variable
  / variable 'is' sp 'added' sp
  / variable 'is' sp 'removed' sp
  / variable 'becomes' sp adjective_inst+
  / variable 'presses' sp value_expr
  / variable 'releases' sp value_expr

effect
  = a 'new' sp type_name 'is' sp 'added' sp 'which' sp 'is' sp adjective_inst+
  / variable 'is' sp 'removed' sp
  / variable 'becomes' sp adjective_inst+

condition
  = parens
  / variable 'is' sp a type_name
  / variable 'is' sp adjective_inst
  / 'there' sp 'is' sp a 'thing' sp variable 'which' sp 'is' sp adjective_inst+
  / variable 'is' sp ('not' sp)? 'holding' sp 'down' sp value_expr

adjective_inst
  = type_name 'with' sp (property_name sp value_expr ('and' sp property_name sp value_expr)*)
  / 'not' sp type_name

value_expr
  = variable
  / parens
  / array
  / number
  / string
  / boolean

// TODO math function calls, e.g. floor()?

parens
  = '(' sp cmp ')' sp

array
  = '[' sp ((value_expr / cmp) (',' sp (value_expr / cmp))*)? ']' sp

cmp
  = add ([<=>!] '=' sp add)?

add
  = mul ([+-] sp mul)*

mul
  = sgn ([*/%] sp sgn)*

sgn
  = [+-]? value_expr

number
  = [0-9]+ ('.' [0-9]+)? sp

string
  = '"' ("\\" . / [^"\\])* '"' sp

boolean
  = ('true' / 'false') sp

noun_def
  = a type_name 'is' sp (a? type_name ('and' sp a? type_name)*)+

adjective_def
  = a type_name 'thing' sp
    ('is' sp (type_name 'and' sp)+)?
    'has' sp property_decl+

property_decl
  = a property_name ilsp ('flag' / 'which' sp 'is' sp a singular_type)? sp
  / 'some' sp property_name ('flags' / 'which' sp 'are' sp plural_type)? sp

singular_type
  = 'Array' ilsp 'of' sp plural_type
  / type_name ('thing' / 'object')
  / 'boolean' / 'number' / 'string'

plural_type
  = 'Arrays' ilsp 'of' sp plural_type /
    ( type_name ('thing' / 'object')
    / 'boolean' / 'number' / 'string'
    ) 's'?

type_name
  = [A-Z] id_char* sp

property_name
  = !reserved_word [a-z] id_char*

variable
  = '?' id_char+ sp

id_char
  = '_' / [0-9] / [a-z]i

// indefinite article
a
  = ('an' / 'a') sp

reserved_word
  = ( 'true' / 'false'
    / 'added' / 'removed' / 'becomes'
    / 'is' / 'are' / 'and' / 'an' / 'a' / 'has' / 'there'
    / 'which' / 'with' / 'when' / 'then' / 'of' / 'new'
    / ('thing' / 'object' / 'flag' / 'boolean' / 'number' / 'string') 's'?
    / 'the' / 'clock' / 'ticks' / 'hits'
    / 'presses' / 'releases' / 'holding' / 'down'
    ) !id_char

// in-line space
ilsp
  = [ \t]*

// potentially multi-line space (and comments)
sp
  = ( [ \n\r\t]
    / '#' [^\r\n]+ [\r\n]
    )*
