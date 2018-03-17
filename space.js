const defineMethods = require('./define-methods.js');
const Vec2 = require('./vec2.js');

// return true if point is inside polygon
function pointIsInPolygon(point, polygon) {
  // how many times does polygon wind clockwise around point on the screen (+x
  // right, +y down); counterclockwise counts negatively
  var windingNumber = 0;
  // the "from" point of the current edge
  var prev = polygon[polygon.length-1];
  // whether prev is below the horizontal line through the test point
  var prevBelow = (prev.y > point.y);
  polygon.forEach(next => {
    var nextBelow = (next.y > point.y);
    if (prevBelow != nextBelow) {
      // figure out which way we'd have to turn if we were traveling along the
      // edge from prev to next and wanted to get to point instead of next
      var edge = next.subtract(prev);
      var radius = point.subtract(prev);
      var turn = edge.cross(radius); // +=CW/right, -=CCW/left
      if (nextBelow) { // edge crosses horizon downwards, towards +y
	if (turn > 0) windingNumber++;
      } else { // edge crosses horizon upwards, towards -y
	if (turn < 0) windingNumber--;
      }
    }
    prev = next;
    prevBelow = nextBelow;
  });
  // If polygon winds around point the same number of times in each direction,
  // i.e. windingNumber==0, the point is outside the polygon.
  // If windingNumber > 0, the point is inside a clockwise-wound polygon.
  // If windingNumber < 0, the point is inside a counterclockwise polygon.
  return (windingNumber != 0);
}

function Space() {
  this.bin2things = {};
  this.located = router.getAdjectivePropertiesMap('Located');
  router.on('becomeLocated', this.becomeLocated.bind(this));
  router.on('unbecomeLocated', this.unbecomeLocated.bind(this));
  this.solid = router.getAdjectivePropertiesMap('Solid');
  this.oriented = router.getAdjectivePropertiesMap('Oriented');
  this.mobile = router.getAdjectivePropertiesMap('Mobile');
  router.on('clockTick', this.clockTick.bind(this));
}

Space.position2bin = function(position) {
  return Math.floor(position.x / 32) + ',' + Math.floor(position.y / 32);
}

// avoid allocating new empty array objects all the time when we're not going
// to modify them
const emptyArray = [];
Object.freeze(emptyArray);

defineMethods(Space, [
  function getThings(bin) {
    return ((bin in this.bin2things) ? this.bin2things[bin] : emptyArray);
  },

  function addToBin(thing, bin) {
    if (!(bin in this.bin2things)) {
      this.bin2things[bin] = [thing];
    } else {
      this.bin2things[bin].push(thing);
    }
  },

  function removeFromBin(thing, bin) {
    if (!(bin in this.bin2things)) { throw new Error("WTF tried to remove thing " + thing + " from bin " + bin + ", but the bin is empty; thing is " + ((thing in this.located) ? "located at " + this.located[thing].position : "not located")); }
    var i = this.bin2things[bin].indexOf(thing);
    if (i < 0) { throw new Error("WTF tried to remove thing " + thing + ", which is not in bin " + bin + "; these are: " + JSON.stringify(this.bin2things[bin]) + "; thing " + thing + " is " + ((thing in this.located) ? "located at " + this.located[thing].position : "not located")); }
    this.bin2things[bin].splice(i, 1);
    if (this.bin2things[bin].length == 0) {
      delete this.bin2things[bin];
    }
  },

  function becomeLocated(thing, {space, position}, oldLocated) {
    var oldBin = null;
    var newBin = null;
    if (oldLocated && oldLocated.space === this) {
      var oldPosition = oldLocated.position;
      oldBin = Space.position2bin(oldPosition);
    }
    if (space === this) {
      newBin = Space.position2bin(position);
    }
    if (newBin != oldBin) {
      if (newBin) {
	this.addToBin(thing, newBin);
      }
      if (oldBin) {
	this.removeFromBin(thing, oldBin);
      }
      if (newBin && oldBin) {
	console.log('' + thing + ' move from bin ' + oldBin + ' to ' + newBin);
      }
    }
  },

  function unbecomeLocated(thing, {space, position}) {
    if (space === this) {
      var bin = Space.position2bin(position);
      this.removeFromBin(thing, bin);
    }
  },

  // get the shape of thing expressed in the coordinates of the space (not the
  // local coordinates of the thing). Assumes the thing is located in this
  // space and is solid.
  function getShape(thing) {
    var position = this.located[thing].position;
    if (thing in this.oriented) {
      var orientation = this.oriented[thing].orientation;
      return this.solid[thing].shape.map(point =>
	position.add(point.rotate(orientation))
      );
    } else { // not oriented
      return this.solid[thing].shape.map(point => position.add(point))
    }
  },

  // get the linear velocity of point on thing, including any contribution from
  // thing's angularVelocity. point is in world coordinates
  function getPointVelocity(thing, point) {
    // immobile things always have zero velocity
    if (!(thing in this.mobile)) return new Vec2(0,0);
    var center = this.located[thing].position;
    var linearVel = this.mobile[thing].velocity;
    var angularVel = this.mobile[thing].angularVelocity;
    var centerToPoint = point.subtract(center);
    var tangent = centerToPoint.rotate(Math.PI/2);
    return linearVel.add(tangent.scale(angularVel));
  },

  function penetrate(penetrator, point, penetrated, penetratedShape) {
//    console.log('penetrator ' + penetrator + ' at point ' + point.x + ',' + point.y + '; penetrated ' + penetrated);
    var penetratorVelocity = this.getPointVelocity(penetrator, point);
    var penetratedVelocity = this.getPointVelocity(penetrated, point);
    var relativeVelocity = penetratorVelocity.subtract(penetratedVelocity);
    if (relativeVelocity.x == 0 && relativeVelocity.y == 0) {
//      console.log('relative velocity 0');
      router.hit(penetrator, penetrated); // FIXME maybe don't even do this, just return?
      return;
    }
    var edgeFrom, edgeTo;
    var maxTicksAgo = 0;
    var prev = penetratedShape[penetratedShape.length-1];
    penetratedShape.forEach(next => {
//      console.log('edge from ' + prev.x + ',' + prev.y + ' to ' + next.x + ',' + next.y);
      // figure out how many ticks ago point would have been on this edge's
      // line extension
      var ticksAgo = -1;
      var edge = next.subtract(prev);
      if (edge.x == 0) {
	if (edge.y != 0 && relativeVelocity.x != 0) {
	  ticksAgo = (point.x - prev.x) / relativeVelocity.x;
	  // make sure the intersection is between prev and next (excluding
	  // next itself)
	  var intersectionY = point.y - ticksAgo * relativeVelocity.y;
	  if (edge.y > 0) {
	    if (intersectionY < prev.y || intersectionY >= next.y) ticksAgo =-1;
	  } else { // edge.y < 0
	    if (intersectionY > prev.y || intersectionY <= next.y) ticksAgo =-1;
	  }
//	  if (ticksAgo == -1) console.log('vertical edge, intersection out of bounds');
	} // else edge and velocity are parallel (and horizontal)
      } else { // edge.x nonzero, can have edgeSlope
	var edgeSlope = edge.y / edge.x;
	// FIXME there's probably a more understandable formula for this
	var numerator = edgeSlope * (point.x - prev.x) + prev.y - point.y;
	var denominator = edgeSlope * relativeVelocity.x - relativeVelocity.y;
	if (denominator != 0) {
	  ticksAgo = numerator / denominator;
	  // make sure the intersection is between prev and next (excluding
	  // next itself)
	  var intersectionX = point.x - ticksAgo * relativeVelocity.x;
	  if (edge.x > 0) {
	    if (intersectionX < prev.x || intersectionX >= next.x) ticksAgo =-1;
	  } else { // edge.x < 0
	    if (intersectionX > prev.x || intersectionX <= next.x) ticksAgo =-1;
	  }
//	  if (ticksAgo == -1) console.log('nonvertical edge, intersection out of bounds');
	} // else edge and velocity are parallel
      }
//      console.log('ticksAgo = ' + ticksAgo);
      if (ticksAgo <= 1 && ticksAgo > maxTicksAgo) {
//	console.log('...max!')
	maxTicksAgo = ticksAgo;
	edgeFrom = prev;
	edgeTo = next;
      }/* else {
	console.log('not the max, or past prev position of point');
      }*/
      prev = next;
    });
    if (maxTicksAgo == 0) { // didn't actually penetrate yet
//      console.log('no penetration');
      return;
    }
//    console.log('' + penetrator + ' point ' + point + ' penetrates ' + penetrated + ' edge from ' + edgeFrom + ' to ' + edgeTo + ' ' + maxTicksAgo + ' ticks ago with velocity ' + relativeVelocity);
    router.penetrate(
      penetrator, point,
      penetrated, edgeFrom, edgeTo,
      maxTicksAgo, relativeVelocity
    );
  },

  function clockTick() {
    // get all bins in the Moore neighborhood of any mobile thing in this space
    var bins = {};
    for (var thing in this.mobile) {
      var { space, position } = this.located[thing];
      if (space === this) {
	var bin = Space.position2bin(position);
	bins[bin] = true;
        var here = bin.split(',',2);
	here[0]++; bins[here[0]+','+here[1]] = true;
	here[1]++; bins[here[0]+','+here[1]] = true;
	here[0]--; bins[here[0]+','+here[1]] = true;
	here[0]--; bins[here[0]+','+here[1]] = true;
	here[1]--; bins[here[0]+','+here[1]] = true;
	here[1]--; bins[here[0]+','+here[1]] = true;
	here[0]++; bins[here[0]+','+here[1]] = true;
	here[0]++; bins[here[0]+','+here[1]] = true;
      }
    }
    // iterate over only the mobile-neighbor bins
    for (var bin in bins) {
      if (!(bin in this.bin2things)) continue;
      // everything in this bin can be the first of the two things we check for
      // collision
      var firstThings = this.bin2things[bin];
      // everything in {this bin or the adjacent 4 bins in the Moore
      // neighborhood that are after this bin in raster order} can be the
      // second of the two things we check for collision
      var secondThingses = new Array(5);
      secondThingses[0] = firstThings;
      var here = bin.split(',',2);
      here[0]++; // move right, to east bin
      secondThingses[1] = this.getThings(here[0]+','+here[1]);
      here[1]++; // move down, to southeast bin
      secondThingses[2] = this.getThings(here[0]+','+here[1]);
      here[0]--; // move left, to south bin
      secondThingses[3] = this.getThings(here[0]+','+here[1]);
      here[0]--; // move left, to southwest bin
      secondThingses[4] = this.getThings(here[0]+','+here[1]);
      // check whether each point of each shape of secondThings is inside the
      // shape of each firstThing, and vice versa
      firstThings.forEach((first, firstIndex) => {
	if (first in this.solid) {
	  var firstShape = this.getShape(first);
	  secondThingses.forEach((secondThings, secondThingsIndex) => {
	    secondThings.forEach((second, secondIndex) => {
	      if ((secondThingsIndex > 0 || firstIndex < secondIndex) &&
		  (second in this.solid) &&
		  // don't check collisions between two immobile things
		  ((first in this.mobile) || (second in this.mobile))) {
		var secondShape = this.getShape(second);
		secondShape.forEach(secondPoint => {
		  if (pointIsInPolygon(secondPoint, firstShape)) {
		    this.penetrate(second, secondPoint, first, firstShape);
		  }
		});
		firstShape.forEach(firstPoint => {
		  if (pointIsInPolygon(firstPoint, secondShape)) {
		    this.penetrate(first, firstPoint, second, secondShape);
		  }
		});
	      }
	    });
	  });
	}
      });
    }
  }
]);

module.exports = Space;
