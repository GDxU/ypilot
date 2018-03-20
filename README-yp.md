# YPilot Language

YPilot's game rules and maps are described in a simple English-like language, described in this document. Files written in this language normally have the extension `.yp`. A `.yp` file contains a sequence of statements. Statements can be adjective definitions, noun definitions, or rules. A `.yp` file may also contain comments anywhere (including within statements). Comments start with a `#` character and continue until the end of the line. Comments are treated as whitespace. For the most part, any amount of whitespace is treated the same as a single space character, but there are a few situations where line breaks are significant.

## Adjective definitions

An adjective definition gives a name for an adjective, optionally a list of other adjectives implied by this adjective, and then a list of properties that things described by this adjective have. Properties have a name, and optionally a type and/or a default value. Here's an example of an adjective definition:

    a Wiggly thing is Located and Mobile and has
      a frequency which is a number
      an amplitude which is a number (default 1)
      a phase which is a number (default 0)

This defines the adjective `Wiggly`, which implies the (built-in) adjectives `Located` and `Mobile`. Its properties are `frequency`, `amplitude`, and `phase`, which are all numbers. The default `amplitude` for a `Wiggly` thing is 1, and the default `phase` is 0. The `frequency` has no default, so it must be specified when a thing becomes `Wiggly`.

Note that adjectives always start with a capital letter, and properties always start with a lower case letter. Also note that where this syntax uses the word `a`, you can use `an` instead, in order to make it read more naturally.

The following is a list of ways to define properties with different types. In this list, `foo` stands in for the property name, and `Bar` is a noun or object type name. Each line has a comment after it describing its meaning.

    a foo			# no type, anything can go in foo
    a foo which is a Bar thing	# Bar is an adjective describing the thing foo
    a foo which is a Bar object	# foo instanceof Bar in JavaScript
    a foo which is a boolean	# foo is either true or false
    a foo flag			# shorthand for the previous one
    a foo which is a number	# foo is a number, like 1, 2.3, or PI
    a foo which is a string	# foo is a text string, like "hello, world!"
    a foo which is an Array of Bar things	# foo is an array whose elements are of the type "Bar thing"
	# (any pluralized type can go here, including another "Arrays of ...")
    some foo which are Bar things		# shorthand for the previous one

## Noun definitions

A noun definition gives a name for a noun, and a list of other nouns and adjectives it implies. Like adjectives, nouns must start with a capital letter. Here's an example of a noun definition:

    a Worm is a Ship and Wiggly

This defines the noun `Worm`, which implies the noun `Ship` (which in turn may imply other nouns and adjectives...) and the adjective `Wiggly`. According to this definition, all `Worm`s are also `Ship`s, but a `Ship` is not necessarily a `Worm`. And when a new `Worm` is added to the game, it becomes `Wiggly`, and gains the properties of a `Wiggly` thing. It may later become not `Wiggly`. A new `Worm` also becomes all the other adjectives that `Ship` implies, and gains all of their properties.

## Rules

A rule has a triggering event and an optional set of conditions that determine when a sequence of effects happen. All three of these things (events, conditions, and effects) may contain variables, which start with a `?` character. Here is a simple example of a rule that makes `Worm`s instantly lethal on contact:

    when ?x hits ?y and
      ?x is a Worm
      ?y is Mortal
    then
      ?y is removed

Here, `?x` and `?y` are variables, and `?x hits ?y` is the triggering event. `?x is a Worm` is a condition that tests whether the thing assigned to variable `?x` can be described using the noun `Worm`. `?y is Mortal` is a condition that tests whether the thing assigned to variable `?y` can be described using the adjective `Mortal`. When an event that matches the triggering event occurs, the variables are assigned, and the conditions are tested. If all the conditions are satisfied, the effects happen, in order. Here there is one effect: `?y is removed`. This means that the thing assigned to variable `?y` is completely removed from the game along with all its adjectives and properties.

### Events

There are only a few types of events, all built-in for now. The variable names used here are not part of the syntax of the events; you may use different names if you like.

    the game starts

This event happens once, and is the first event to happen.

    the clock ticks

This event happens once per animation frame, currently 20 times a second.

    ?thing is added

This event happens when a new thing is added. It is best used with conditions that test what kind of thing `?thing` is and retrieve its properties.

    ?thing is removed

This event happens when an existing thing is removed from the game.

    ?thing becomes Wiggly with frequency ?f and amplitude ?a

The `becomes` event happens when an adjective and its properties are first added to a thing, and also when any of those properties change. Here the adjective is `Wiggly`, and we capture the `frequency` property in the variable `?f`, and the `amplitude` property in the variable `?a`. The adjective may not be a variable.

    ?thing becomes not Wiggly

The `becomes not` event happens when an adjective and its properties are removed from a thing. Since the properties are already removed, they can't be assigned into variables.

    ?map reads "c" at ?position

This event happens for each character of a `Map` as it is read. `?map` is the map, `"c"` is the character (it must be a literal one-character string, not a variable), and `?position` is a `Vec2` object where the X coordinate is the column number and the Y coordinate is the line number (both starting at zero).

    ?x hits ?y

This event happens twice for every collision between `Solid` things, once for each ordering of `?x` and `?y`.

    ?penetrator point ?point
    penetrates ?penetrated edge from ?from to ?to
    ?ticks ticks ago with velocity ?velocity

(line breaks not required but included here for ease of reading)
This event happens once for every collision between `Solid` things, and gives more detailed information than the `?x hits ?y` event does. When two `Solid` things collide, a point (`Vec2` object) `?point` from the `shape` of one of the things, the `?penetrator`, penetrates inside the `shape` of the other thing, the `?penetrated`. The individual line segment, or edge, that that point passed through is given by its endpoints, `?from` and `?to`. All three points are given relative to the `Space`, not the `Solid`s they belong to. The time at which the point passed through the edge is given as a fractional number of ticks ago, `?ticks`, which will always be in the interval `[0, 1)`. And the current relative velocity of the two things is given in `?velocity` (if something isn't `Mobile` its velocity is considered to be `Vec2[0,0]`).

    ?player presses "ControlLeft"

This event happens when the player `?player` starts pressing the identified key on their keyboard (in this case, the control key on the left side of the keyboard). The string identifying the key must match the value of the `code` property of the `KeyboardEvent` object; see the [MDN page for KeyboardEvent.code](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code) for some tables of values.

    ?player releases "ControlLeft"

This event happens when the player `?player` stops pressing the identified key.

### Conditions

Conditions can be true or false, depending on the state of the game, and if true, can capture values from the game into variables that can be used later in the rule (in effects or other conditions). If any of a rule's conditions is false, the rule's effects don't happen.

    ?thing is a Worm

This condition is true when `?thing` is described by the noun `Worm`.

    ?thing is Wiggly with frequency ?f and amplitude ?a

This condition is true when `?thing` is described by the adjective `Wiggly`, and it captures the `frequency` and `amplitude` properties in the variables `?f` and `?a`, respectively.

    ?thing is not Wiggly

This condition is true when `?thing` is not described by the adjective `Wiggly`. As with the `becomes not` event, no properties can be assigned to variables.

    there is a thing ?thing which is
      Wiggly with phase ?phase
      not Mortal

This condition searches the game for a thing described by all of the given adjectives (or `not`), and if found, assigns it to the `?thing` variable and makes the condition true. If a variable like `?phase` is bound to a property like `phase`, it can mean one of two things. If the variable was already assigned, it further constrains the search by requiring that the property have the same value. If the variable was not already assigned, the value of the property is assigned to the variable. More complex expressions can be bound to a property, not just variables, and in this case the first meaning is used. A `there is` condition must include at least one adjective without `not` in front of it.

    ?player is holding down "ControlLeft"

This condition is true when the player `?player` has pressed the identified key and has not yet released it.

    ?player is not holding down "ControlLeft"

This condition is true when the previously described condition is false.

    (?x <= ?y)

This condition is used to compare values. `?x` and `?y` can be arbitrary value expressions, not just variables. The comparison operation (here `<=`) can be any of the usual C-style operators: `<`, `<=`, `==`, `!=`, `>=`, or `>`.

### Effects

Effects describe what happens when the triggering event happens and all the conditions are satisfied. Effects happen in the order they are listed in the rule.

    a new Worm ?worm is added which is
      Wiggly with frequency 42
      Located with position ?pos

This effect adds a new thing to the game which is described by the noun `Worm` and the adjectives `Wiggly` and `Located`, with the `frequency` property of `Wiggly` set to `42`, and the `position` property of `Located` set to the value of the `?pos` variable. It also assigns the new thing to the `?worm` variable for use in later effects in the same rule. Other adjectives and their properties may apply automatically, as described in the relevant noun and adjective definitions. If a new thing is described by an adjective (even implicitly) that has properties without default values, you must supply values for those properties when the thing is added.

    a new Worm ?worm is added

This alternate form of the above effect should be used when no adjectives are explicitly specified.

    ?thing is removed

This effect removes a previously-added thing from the game completely, including all of its adjectives and properties.

    ?thing becomes
      Wiggly with frequency 42
      Located with position ?pos

This effect causes `?thing` to be described by the adjectives that follow, with the given property values. For now, it's up to you to include any other adjectives that those adjectives imply; it's not done automatically like with `a new Worm ?worm is added`.

    ?map is read

This effect causes `?map` to be read, which causes a `map reads` event for each character in the `map` string of `?map` (except for line break characters).

    let ?x be (?y + 42)

This effect assigns the value of the expression the right (`(?y + 42)` in this case) to the variable on the left (`?x`) for use in later effects in the same rule.

    debug (?y + 42)

This effect prints the value of the expression `(?y + 42)` to the browser console for debugging purposes.

### Value expressions

Several conditions and effects can use value expressions instead of just variables in some places. A value expression can be one of several things:

A variable as always.

A numeric constant, `π` or `e` (or equivalently `PI` or `E`), a boolean constant `true` or `false`, or the `nothing` constant (equivalent to `null` in JavaScript).

A decimal number, e.g. `1.23`. If the decimal point is included, there must be some digits on both sides of it, e.g. `1.` and `.23` are not allowed (use `1.0` or `0.23` instead).

A string in double quotes, e.g. `"Hello, world!\n"`. This supports escape sequences as in JSON.

Arithmetic and comparison operations with other value expressions as the operands. These obey the usual precedence rules, but at the top level you must include parentheses, e.g. `debug (?x + ?y * ?z)` is OK, and does the multiplication before the addition, but `debug ?x + ?y * z` won't parse. In addition to the usual addition `+`, subtraction `-`, multiplication `*`, division `/`, and remainder `%` operators, you also have cross product `x` or `×`, and dot product `.` or `·` operators for use with `Vec2` operands. The other operators can also work with `Vec2`s in certain ways, as long as at least the first operand is a `Vec2`. With `Vec2`s, `*` means scaling. And with strings, `+` means concatenation.

Math functions with one argument in parentheses, including trigonometric functions, `abs`, `sign`, `ceil`, `floor`, `round`, `sqrt`, `cbrt`, various logarithms, and exponentials. These use the methods on the [JavaScript `Math` object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math). For now, methods with more than one argument aren't supported.

Constructors for a few JavaScript object types, with arguments in square brackets (no `new` keyword required):

    Array[?length]
    Interface[?player]
    Space[]
    Vec2[?x, ?y]

Array literals in square brackets, e.g. `[1, 2, "buckle my shoe"]`.

[SVG](https://www.w3.org/TR/SVG11/) literals. These are used for the `graphics` property of the builtin adjective `Visible`. An SVG literal must be a single valid SVG element of the type `SVGGraphicsElement`, which includes `<g>`, `<path>`, `<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polyline>`, `<polygon>`, and `<text>`. It must not include any `<script>` elements or event handler attributes like `onclick="launchTheNukes()"`.

## Builtins

These names are defined in the YPilot language (see [base.yp](base.yp)), but since the core JavaScript code refers to them, they are always included.

### Adjectives

TODO

### Nouns

TODO

## Standard libraries

TODO

