const assert = require('assert');

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
    'Located Solid Oriented Mobile'.split(/ /).forEach(adj => 
      router.declareAdjective(adj));
    space = new Space();
    wall = router.newThing();
    router.add(wall, {
      Located: { space: space, position: new Vec2(0,0) },
      Solid: { shape: [].concat(wallShape) },
    });
    ship = router.newThing();
    router.add(ship, {
      Located: { space: space, position: new Vec2(0,0) },
      Oriented: { orientation: -Math.PI/2 }, // point up by default
      Mobile: { velocity: new Vec2(0,0), angularVelocity: 0 },
      Solid: { shape: [].concat(shipShape) }
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
    router.on('penetrate', function(penetrator, point, penetrated, edgeFrom, edgeTo, ticksAgo, relativeVelocity) {
      assert.equal(penetrator, ship);
      assert.deepEqual(point, new Vec2(16, 31));
      assert.equal(penetrated, wall);
      assert.deepEqual(edgeFrom, new Vec2(32,32));
      assert.deepEqual(edgeTo, new Vec2(0,32));
      assert.equal(ticksAgo, 0.5);
      assert.deepEqual(relativeVelocity, new Vec2(0, -2));
      done();
    });
    router.on('hit', function(x, y) {
      assert.fail("got a hit event instead of a penetrate event");
    });
    setImmediate(function() {
      logAdjectiveState();
      var locatedWallShape = space.getShape(wall);
      space.penetrate(ship, new Vec2(16, 31), wall, locatedWallShape);
    });
  });

  it('should handle ship penetrating wall from above', function(done) {
    router.become(ship, 'Oriented', { orientation: Math.PI/2 }); // point down
    router.become(ship, 'Located', { position: new Vec2(16, -14) });//above wall
    router.become(ship, 'Mobile', { velocity: new Vec2(0, 2) }); // downward
    router.on('penetrate', function(penetrator, point, penetrated, edgeFrom, edgeTo, ticksAgo, relativeVelocity) {
      assert.equal(penetrator, ship);
      assert.deepEqual(point, new Vec2(16, 1));
      assert.equal(penetrated, wall);
      assert.deepEqual(edgeFrom, new Vec2(0,0));
      assert.deepEqual(edgeTo, new Vec2(32,0));
      assert.equal(ticksAgo, 0.5);
      assert.deepEqual(relativeVelocity, new Vec2(0, 2));
      done();
    });
    router.on('hit', function(x, y) {
      assert.fail("got a hit event instead of a penetrate event");
    });
    setImmediate(function() {
      logAdjectiveState();
      var locatedWallShape = space.getShape(wall);
      space.penetrate(ship, new Vec2(16, 1), wall, locatedWallShape);
    });
  });

  it('should handle ship penetrating wall from left', function(done) {
    router.become(ship, 'Oriented', { orientation: 0 }); // point right
    router.become(ship, 'Located', { position: new Vec2(-14, 16) });//leftofwall
    router.become(ship, 'Mobile', { velocity: new Vec2(2, 0) }); // rightward
    router.on('penetrate', function(penetrator, point, penetrated, edgeFrom, edgeTo, ticksAgo, relativeVelocity) {
      assert.equal(penetrator, ship);
      assert.deepEqual(point, new Vec2(1, 16));
      assert.equal(penetrated, wall);
      assert.deepEqual(edgeFrom, new Vec2(0,32));
      assert.deepEqual(edgeTo, new Vec2(0,0));
      assert.equal(ticksAgo, 0.5);
      assert.deepEqual(relativeVelocity, new Vec2(2, 0));
      done();
    });
    router.on('hit', function(x, y) {
      assert.fail("got a hit event instead of a penetrate event");
    });
    setImmediate(function() {
      logAdjectiveState();
      var locatedWallShape = space.getShape(wall);
      space.penetrate(ship, new Vec2(1, 16), wall, locatedWallShape);
    });
  });

  it('should handle ship penetrating wall from right', function(done) {
    router.become(ship, 'Oriented', { orientation: Math.PI }); // point left
    router.become(ship, 'Located', { position: new Vec2(46, 16) });//riteofwall
    router.become(ship, 'Mobile', { velocity: new Vec2(-2, 0) }); // leftward
    router.on('penetrate', function(penetrator, point, penetrated, edgeFrom, edgeTo, ticksAgo, relativeVelocity) {
      assert.equal(penetrator, ship);
      assert.deepEqual(point, new Vec2(31, 16));
      assert.equal(penetrated, wall);
      assert.deepEqual(edgeFrom, new Vec2(32,0));
      assert.deepEqual(edgeTo, new Vec2(32,32));
      assert.equal(ticksAgo, 0.5);
      assert.deepEqual(relativeVelocity, new Vec2(-2, 0));
      done();
    });
    router.on('hit', function(x, y) {
      assert.fail("got a hit event instead of a penetrate event");
    });
    setImmediate(function() {
      logAdjectiveState();
      var locatedWallShape = space.getShape(wall);
      space.penetrate(ship, new Vec2(31, 16), wall, locatedWallShape);
    });
  });
});
