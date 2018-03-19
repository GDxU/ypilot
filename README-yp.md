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

    a foo	# no type, anything can go in foo
    a foo which is a Bar thing	# Bar is an adjective describing the thing foo
    a foo which is a Bar object	# foo instanceof Bar in JavaScript
    a foo which is a boolean	# foo is either true or false
    a foo flag	# shorthand for the previous one
    a foo which is a number	# foo is a number, like 1, 2.3, or PI
    a foo which is a string	# foo is a text string, like "hello, world!"
    a foo which is an Array of Bar things # foo is an array whose elements are of the type "Bar thing" (any pluralized type can go here, including another "Arrays of ...")
    some foo which are Bar things # shorthand for the previous one

## Noun definitions

A noun definition gives a name for a noun, and a list of other nouns and adjectives it implies. Like adjectives, nouns must start with a capital letter. Here's an example of a noun definition:

    a Worm is a Ship and Wiggly

This defines the noun `Worm`, which implies the noun `Ship` (which in turn may implies other nouns and adjectives...) and the adjective `Wiggly`. According to this definition, all `Worm`s are also `Ship`s, but a `Ship` is not necessarily a `Worm`. And when a new `Worm` is added to the game, it becomes `Wiggly`, and gains the properties of a `Wiggly` thing. It may later become not `Wiggly`. A new `Worm` also becomes all the other adjectives that `Ship` implies, and gains all of their properties.

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

This event happens twice for every collision between Solid things, once for each ordering of ?x and ?y.

    ?penetrator point ?point
    penetrates ?penetrated edge from ?from to ?to
    ?ticks ticks ago with velocity ?velocity

(line breaks not required but included here for ease of reading)
This event happens once for every collision between Solid things, and gives more detailed information than the `?x hits ?y` event does. When two Solid things collide, a point (`Vec2` object) `?point` from the shape of one of the things, the `?penetrator`, penetrates inside the shape of the other thing, the `?penetrated`. The individual line segment, or edge, that that point passed through is given by its endpoints, `?from` and `?to`. The time that it passed through is given as a fractional number of ticks ago, `?ticks`, which will always be in the interval `[0, 1)`. And the current relative velocity of the two things is given in `?velocity` (if something isn't `Mobile` its velocity is considered to be `Vec2[0,0]`).

    ?player presses "ControlLeft"

This event happens when the player `?player` starts pressing the identified key on their keyboard (in this case, the control key on the left side of the keyboard). The string identifying the key must match the value of the `code` property of the `KeyboardEvent` object; see the [MDN page for KeyboardEvent.code] for some tables of values.

    ?player releases "ControlLeft"

This event happens when the player `?player` stops pressing the identified key.

### Conditions

TODO

### Effects

TODO

## Builtins

These names are defined in the YPilot language (see [base.yp](base.yp)), but since the core JavaScript code refers to them, they are always included.

### Adjectives

TODO

### Nouns

TODO

