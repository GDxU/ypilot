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

const Router = require('../router.js');
const Space = require('../space.js');
const Vec2 = require('../vec2.js');
const wallShape = [new Vec2(0,0), new Vec2(32,0),
		   new Vec2(32,32), new Vec2(0,32)];
const shipShape = [new Vec2(15,0), new Vec2(-9,8), new Vec2(-9,-8)];

describe('penetrate', function() {
  var space;
  var wall;
  var ship;
  
  beforeEach(function(done) {
    global.router = new Router();
    // quick and dirty base.conf for just what Space needs
    'Located Tangible Oriented Mobile'.split(/ /).forEach(adj => 
      router.declareAdjective(adj));
    space = new Space();
    wall = router.newThing();
    router.add(wall, {
      Located: { space: space, position: new Vec2(0,0) },
      Tangible: { shape: [].concat(wallShape) },
    });
    ship = router.newThing();
    router.add(ship, {
      Located: { space: space, position: new Vec2(0,0) },
      Oriented: { orientation: -Math.PI/2 }, // point up by default
      Mobile: { velocity: new Vec2(0,0), angularVelocity: 0 },
      Tangible: { shape: [].concat(shipShape) }
    });
    setImmediate(done); // wait for events
  });

  function logAdjectiveState() {
    /*for (var adj in router.adjectives) {
      console.log(adj + ':');
      for (var thing in router.adjectives[adj]) {
	console.log('  ' + thing + ':', router.adjectives[adj][thing]);
      }
    }*/
  }

  it('should handle ship penetrating wall from below', function(done) {
    router.become(ship, 'Located', { position: new Vec2(16, 46) }); //below wall
    router.become(ship, 'Mobile', { velocity: new Vec2(0, -2) }); // upward
    setImmediate(function() {
      logAdjectiveState();
      var locatedWallShape = space.getShape(wall);
      var penetration = space.penetrate(ship, [new Vec2(16, 31)], 0, wall, locatedWallShape);
      assert.equal(typeof penetration, 'object');
      var { penetrator, point, penetrated, edgeFrom, edgeTo, ticksAgo, relativeVelocity } = penetration;
      assert.equal(penetrator, ship);
      assert.deepEqual(point, new Vec2(16, 31));
      assert.equal(penetrated, wall);
      assert.deepEqual(edgeFrom, new Vec2(32,32));
      assert.deepEqual(edgeTo, new Vec2(0,32));
      assert.equal(ticksAgo, 0.5);
      assert.deepEqual(relativeVelocity, new Vec2(0, -2));
      done();
    });
  });

  it('should handle ship penetrating wall from above', function(done) {
    router.become(ship, 'Oriented', { orientation: Math.PI/2 }); // point down
    router.become(ship, 'Located', { position: new Vec2(16, -14) });//above wall
    router.become(ship, 'Mobile', { velocity: new Vec2(0, 2) }); // downward
    setImmediate(function() {
      logAdjectiveState();
      var locatedWallShape = space.getShape(wall);
      var penetration = space.penetrate(ship, [new Vec2(16, 1)], 0, wall, locatedWallShape);
      assert.equal(typeof penetration, 'object');
      var { penetrator, point, penetrated, edgeFrom, edgeTo, ticksAgo, relativeVelocity } = penetration;
      assert.equal(penetrator, ship);
      assert.deepEqual(point, new Vec2(16, 1));
      assert.equal(penetrated, wall);
      assert.deepEqual(edgeFrom, new Vec2(0,0));
      assert.deepEqual(edgeTo, new Vec2(32,0));
      assert.equal(ticksAgo, 0.5);
      assert.deepEqual(relativeVelocity, new Vec2(0, 2));
      done();
    });
  });

  it('should handle ship penetrating wall from left', function(done) {
    router.become(ship, 'Oriented', { orientation: 0 }); // point right
    router.become(ship, 'Located', { position: new Vec2(-14, 16) });//leftofwall
    router.become(ship, 'Mobile', { velocity: new Vec2(2, 0) }); // rightward
    setImmediate(function() {
      logAdjectiveState();
      var locatedWallShape = space.getShape(wall);
      var penetration = space.penetrate(ship, [new Vec2(1, 16)], 0, wall, locatedWallShape);
      assert.equal(typeof penetration, 'object');
      var { penetrator, point, penetrated, edgeFrom, edgeTo, ticksAgo, relativeVelocity } = penetration;
      assert.equal(penetrator, ship);
      assert.deepEqual(point, new Vec2(1, 16));
      assert.equal(penetrated, wall);
      assert.deepEqual(edgeFrom, new Vec2(0,32));
      assert.deepEqual(edgeTo, new Vec2(0,0));
      assert.equal(ticksAgo, 0.5);
      assert.deepEqual(relativeVelocity, new Vec2(2, 0));
      done();
    });
  });

  it('should handle ship penetrating wall from right', function(done) {
    router.become(ship, 'Oriented', { orientation: Math.PI }); // point left
    router.become(ship, 'Located', { position: new Vec2(46, 16) });//riteofwall
    router.become(ship, 'Mobile', { velocity: new Vec2(-2, 0) }); // leftward
    setImmediate(function() {
      logAdjectiveState();
      var locatedWallShape = space.getShape(wall);
      var penetration = space.penetrate(ship, [new Vec2(31, 16)], 0, wall, locatedWallShape);
      assert.equal(typeof penetration, 'object');
      var { penetrator, point, penetrated, edgeFrom, edgeTo, ticksAgo, relativeVelocity } = penetration;
      assert.equal(penetrator, ship);
      assert.deepEqual(point, new Vec2(31, 16));
      assert.equal(penetrated, wall);
      assert.deepEqual(edgeFrom, new Vec2(32,0));
      assert.deepEqual(edgeTo, new Vec2(32,32));
      assert.equal(ticksAgo, 0.5);
      assert.deepEqual(relativeVelocity, new Vec2(-2, 0));
      done();
    });
  });
});
