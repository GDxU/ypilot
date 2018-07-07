const assert = require('assert');

// make sure nobody tries to get jquery, which won't work in node
const Module = require('module');
const oldRequire = Module.prototype.require;
Module.prototype.require = function(x) {
  if (x == 'jquery') {
    return function() {};
  } else {
    return oldRequire.apply(this, arguments);
  }
};

const parse = require('../parser.js').parse;
const compile = require('../compile.js');
compile.strictly = true; // allow errors to propagate to top

function compiles(done, str) {
  compile(parse(str)).
  then(x => { done(); }).
  catch(done);
}

function compilesNot(done, str) {
  compile(parse(str)).
  then(x => { done(new Error("compiled unexpectedly, to:\n" + x)); }).
  catch(x => { done() });
}

describe('compile', function() {
  it('should accept the null program', function(done) {
    compiles(done, '');
  });

  it('should catch undeclared variables in conditions', function(done) {
    compilesNot(done, "when ?x becomes Located and ?y is a Player then debug ?y");
  });

  it('should catch undeclared variables in effects', function(done) {
    compilesNot(done, "when ?x becomes Located then debug ?y");
  });

  it('should allow variables to be declared in triggers', function(done) {
    compiles(done, "when ?x becomes Located with space ?y then debug ?y");
  });

  it('should allow variables to be declared in conditions', function(done) {
    compiles(done, "when ?x becomes Located and ?x is Oriented with orientation ?y then debug ?y");
  });

  it('should allow variables to be declared in let in conditions', function(done) {
    compiles(done, "when ?x becomes Located and let ?y be 42 then debug ?y");
  });

  it('should allow variables to be declared in let in effects', function(done) {
    compiles(done, "when ?x becomes Located then let ?y be 42 debug ?y");
  });

  // TODO way more tests
});

