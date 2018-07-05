const assert = require('assert');

const parse = require('../parser.js').parse;
const compile = require('../compile.js');
compile.strictly = true; // allow errors to propagate to top

describe('compile', function() {
  it('should accept the null program', function() {
    compile([]);
  });

  it('should catch undeclared variables', function() {
    // in conditions
    assert.throws(() =>
      compile(parse("when ?x becomes Located and ?y is a Player then debug ?y")));
    // in effects
    assert.throws(() =>
      compile(parse("when ?x becomes Located then debug ?y")));
  });

  it('should allow variables to be declared', function() {
    // in triggers
    compile(parse("when ?x becomes Located with space ?y then debug ?y"));
    // in conditions
    compile(parse("when ?x becomes Located and ?x is Oriented with orientation ?y then debug ?y"));
    // in let in conditions
    compile(parse("when ?x becomes Located and let ?y be 42 then debug ?y"));
    // in let in effects
    compile(parse("when ?x becomes Located then let ?y be 42 debug ?y"));
  });

  // TODO way more tests
});

