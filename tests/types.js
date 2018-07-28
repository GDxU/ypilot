const assert = require('assert');

const types = require('../types.js');

// TODO? runTimeSubsumes, expandNounDefaultAdjectives

describe('compileTimeSubsumes', function() {
  afterEach(function() {
    // reset state of types
    types.adjectiveDependencies = {};
    types.nounDefaultAdjectives = {};
    types.nounSupertypes = {};
  });

  function assertSubsumes(a, b) {
    if (!types.compileTimeSubsumes(a, b)) {
      assert.fail(a, b, undefined, '!subsumes', assertSubsumes);
    }
  }

  function assertNotSubsumes(a, b) {
    if (types.compileTimeSubsumes(a, b)) {
      assert.fail(a, b, undefined, 'subsumes', assertNotSubsumes);
    }
  }

  it('should say top subsumes everything', function() {
    assertSubsumes('top', 'top');
    assertSubsumes('top', 'bottom');
    assertSubsumes('top', 'string');
    assertSubsumes('top', ['Array', 'string']);
    assertSubsumes('top', ['object', 'Interface']);
    assertSubsumes('top', ['thing', 'Adj1', 'Adj2']);
    assertSubsumes('top', ['thing', ['Typed', 'Noun']]);
  });

  it('should treat Arrays covariantly', function() {
    assertSubsumes(['Array', 'string'], ['Array', 'string']);
    assertSubsumes(['Array', 'top'], ['Array', 'string']);
    assertNotSubsumes(['Array', 'string'], ['Array', 'top']);
  });

  it('should treat objects invariantly', function() {
    assertSubsumes(['object', 'Interface'], ['object', 'Interface']);
    assertNotSubsumes(['object', 'SpatialIndex'], ['object', 'Interface']);
    assertNotSubsumes(['object', 'Interface'], ['object', 'SpatialIndex']);
  });

  it('should handle simple noun inheritance', function() {
    types.nounSupertypes = { A: ['B'], B: ['C'], C: [] };
    assertSubsumes   (['thing', ['Typed', 'A']], ['thing', ['Typed', 'A']]);
    assertNotSubsumes(['thing', ['Typed', 'A']], ['thing', ['Typed', 'B']]);
    assertNotSubsumes(['thing', ['Typed', 'A']], ['thing', ['Typed', 'C']]);
    assertSubsumes   (['thing', ['Typed', 'B']], ['thing', ['Typed', 'A']]);
    assertSubsumes   (['thing', ['Typed', 'B']], ['thing', ['Typed', 'B']]);
    assertNotSubsumes(['thing', ['Typed', 'B']], ['thing', ['Typed', 'C']]);
    assertSubsumes   (['thing', ['Typed', 'C']], ['thing', ['Typed', 'A']]);
    assertSubsumes   (['thing', ['Typed', 'C']], ['thing', ['Typed', 'B']]);
    assertSubsumes   (['thing', ['Typed', 'C']], ['thing', ['Typed', 'C']]);
  });

  it('should handle multiple noun inheritance', function() {
    types.nounSupertypes = { A: ['B', 'C'], B: [], C: [] };
    assertSubsumes   (['thing', ['Typed', 'A']], ['thing', ['Typed', 'A']]);
    assertNotSubsumes(['thing', ['Typed', 'A']], ['thing', ['Typed', 'B']]);
    assertNotSubsumes(['thing', ['Typed', 'A']], ['thing', ['Typed', 'C']]);
    assertSubsumes   (['thing', ['Typed', 'B']], ['thing', ['Typed', 'A']]);
    assertSubsumes   (['thing', ['Typed', 'B']], ['thing', ['Typed', 'B']]);
    assertNotSubsumes(['thing', ['Typed', 'B']], ['thing', ['Typed', 'C']]);
    assertSubsumes   (['thing', ['Typed', 'C']], ['thing', ['Typed', 'A']]);
    assertNotSubsumes(['thing', ['Typed', 'C']], ['thing', ['Typed', 'B']]);
    assertSubsumes   (['thing', ['Typed', 'C']], ['thing', ['Typed', 'C']]);
  });

  it('should handle simple adjective dependencies', function() {
    types.adjectiveDependencies = { A: ['B', 'C'], B: [], C: [], D: [] };
    assertSubsumes(['thing', 'A'], ['thing', 'A']);
    assertSubsumes(['thing', 'B'], ['thing', 'A']);
    assertSubsumes(['thing', 'C'], ['thing', 'A']);
    assertSubsumes(['thing', 'C', 'B'], ['thing', 'A']);
    assertNotSubsumes(['thing', 'A'], ['thing', 'C', 'B']);
    assertSubsumes(['thing', 'D'], ['thing', 'C', 'D']);
    assertNotSubsumes(['thing', 'C', 'D'], ['thing', 'D']);
    assertNotSubsumes(['thing', 'B'], ['thing', 'C']);
  });

  it('should handle mixing nouns and adjectives', function() {
    types.adjectiveDependencies = { Aa: ['Ac'], Ab: [], Ac: [] };
    /* these are wrong because nounDefaultAdjectives needs expanding
    types.nounSupertypes = { Ni: ['Nj'], Nj: [], Nk: [] };
    types.nounDefaultAdjectives = { Ni: ['Aa'], Nj: ['Ab'], Nk: ['Aa', 'Ab'] };
    instead call expandNounDefaultAdjectives for each noun
    */
    types.expandNounDefaultAdjectives('Nk', [], ['Aa', 'Ab']);
    types.expandNounDefaultAdjectives('Nj', [], ['Ab']);
    types.expandNounDefaultAdjectives('Ni', ['Nj'], ['Aa']);

    assertSubsumes(['thing', 'Aa'], ['thing', ['Typed', 'Ni']]);
    assertSubsumes(['thing', 'Aa', 'Ab', 'Ac'], ['thing', ['Typed', 'Ni']]);
    // TODO more?
  });
});

describe('leastCommonSubsumer', function() {
  afterEach(function() {
    // reset state of types
    types.adjectiveDependencies = {};
    types.nounDefaultAdjectives = {};
    types.nounSupertypes = {};
  });

  function assertLCS(a, b, expected) {
    assert.deepEqual(types.leastCommonSubsumer(a, b), expected);
  }

  it('should handle a noun supertype chain', function() {
    types.nounSupertypes = { A: ['B'], B: ['C'], C: [] };
    assertLCS(['thing', ['Typed', 'A']], ['thing', ['Typed', 'A']],
	      ['thing', ['Typed', 'A']]);
    assertLCS(['thing', ['Typed', 'A']], ['thing', ['Typed', 'B']],
	      ['thing', ['Typed', 'B']]);
    assertLCS(['thing', ['Typed', 'A']], ['thing', ['Typed', 'C']],
	      ['thing', ['Typed', 'C']]);
    assertLCS(['thing', ['Typed', 'B']], ['thing', ['Typed', 'C']],
	      ['thing', ['Typed', 'C']]);
    assertLCS(['thing', ['Typed', 'C']], ['thing', ['Typed', 'C']],
	      ['thing', ['Typed', 'C']]);
  });

  it('should handle a noun supertype tree', function() {
    types.nounSupertypes = { A: ['C'], B: ['C'], C: ['D'], D: [] };
    assertLCS(['thing', ['Typed', 'A']], ['thing', ['Typed', 'B']],
	      ['thing', ['Typed', 'C']]);
  });

  it('should handle diamond noun inheritance', function() {
    types.nounSupertypes = { A: ['C'], B: ['C'], C: ['D', 'E'], D: ['F'], E: ['F'], F: [] };
    assertLCS(['thing', ['Typed', 'A']], ['thing', ['Typed', 'B']],
	      ['thing', ['Typed', 'C']]); // not F
  });

  // TODO LCS tests for non-noun types?
});
