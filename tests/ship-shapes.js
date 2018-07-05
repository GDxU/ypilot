const assert = require('assert');

const Vec2 = require('../vec2.js');
const ensureValid = require('../ship-shapes.js').ensureValid;

describe('ensureValid', function() {
  it('should accept the default ship shape', function() {
    ensureValid([new Vec2(15,0), new Vec2(-9,8), new Vec2(-9,-8)]);
    // also try with Array points
    ensureValid([[15,0], [-9,8], [-9,-8]]);
  });

  it('should accept my ship shape', function() {
    ensureValid([[9,10],[1,8],[-6,4],[-9,0],[-5,-2],[-9,-4],[-7,-7],[-3,-9],[3,-10],[-3,-7],[-4,-4],[2,-2],[-4,0],[-3,3],[3,7]]);
  });

  it('should reject the empty shape', function() {
    assert.throws(() => ensureValid([]));
  });

  it('should reject bogus point types', function() {
    assert.throws(() => ensureValid(["a", "b", "c"]));
  });

  it('should reject too few points', function() {
    assert.throws(() => ensureValid([[-10,-10],[10,10]]));
  });

  it('should reject too many points', function() {
    assert.throws(() => ensureValid([
      [1,2],[3,4],[5,6],[7,8],[9,0],[1,2],[3,4],[5,6],[7,8],[9,0],
      [1,2],[3,4],[5,6],[7,8],[9,0],[1,2],[3,4],[5,6],[7,8],[9,0],
      [1,2],[3,4],[5,6],[7,8],[9,0],[1,2],[3,4],[5,6],[7,8],[9,0]
    ]));
  });

  it('should reject too small', function() {
    assert.throws(() => ensureValid([[-8,8],[8,8],[0,-8]]));
  });

  it('should reject too big', function() {
    assert.throws(() => ensureValid([[-100,100],[100,100],[0,-100]]));
  });

  it('should reject too narrow', function() {
    assert.throws(() => ensureValid([[-1,10],[1,10],[0,-10]]));
  });

  it('should reject too short', function() {
    assert.throws(() => ensureValid([[-10,1],[10,1],[0,-1]]));
  });

  it('should reject off-center', function() {
    assert.throws(() => ensureValid([[0,10],[10,10],[5,0]]));
  });

});
