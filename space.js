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

function Space(thingID) {
  this.id = ((thingID === undefined) ? router.newThing() : thingID);
  this.bin2things = {};
  this.located = router.getAdjectivePropertiesMap('Located');
  router.on('becomeLocated', this.becomeLocated.bind(this));
  router.on('unbecomeLocated', this.unbecomeLocated.bind(this));
  this.solid = router.getAdjectivePropertiesMap('Solid');
  this.oriented = router.getAdjectivePropertiesMap('Oriented');
  this.mobile = router.getAdjectivePropertiesMap('Mobile');
  router.on('idle', this.idle.bind(this));
  this.somethingMoved = true;
}

Space.position2bin = function(position) {
  return Math.floor(position.x / 32) + ',' + Math.floor(position.y / 32);
}

// avoid allocating new empty array objects all the time when we're not going
// to modify them
const emptyArray = [];
Object.freeze(emptyArray);

defineMethods(Space, [
  function toJSON() {
    return { op: 'Space', args: [this.id] };
  },

  // called after constructing a new Space from a JSON description
  function reconstitute() {
    for (var thing in this.located) {
      this.becomeLocated(thing | 0, this.located[thing], null);
    }
  },

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
      this.somethingMoved = true;
    }
    if (newBin != oldBin) {
      if (newBin) {
	this.addToBin(thing, newBin);
      }
      if (oldBin) {
	this.removeFromBin(thing, oldBin);
      }
      /*if (newBin && oldBin) {
	console.log('' + thing + ' move from bin ' + oldBin + ' to ' + newBin);
      }*/
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

  function penetrate(penetrator, penetratorShape, pointIndex, penetrated, penetratedShape) {
    var point = penetratorShape[pointIndex];
//    console.log('penetrator ' + penetrator + ' at point ' + point.x + ',' + point.y + '; penetrated ' + penetrated);
    var penetratorVelocity = this.getPointVelocity(penetrator, point);
    var penetratedVelocity = this.getPointVelocity(penetrated, point);
    var relativeVelocity = penetratorVelocity.subtract(penetratedVelocity);
    if (relativeVelocity.x == 0 && relativeVelocity.y == 0) {
//      console.log('relative velocity 0');
      return null;
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
      return null;
    }
//    console.log('' + penetrator + ' point ' + point + ' penetrates ' + penetrated + ' edge from ' + edgeFrom + ' to ' + edgeTo + ' ' + maxTicksAgo + ' ticks ago with velocity ' + relativeVelocity);
    // Calculate the cost of this penetration relative to others for the same
    // point in the same penetrated thing, which is the clockwise angle from
    // the relativeVelocity to the edge of the penetrator shape following the
    // point. If all penetrator shapes are clockwise-wound, this means that
    // each point sticking out of the surface of a solid tesselated into
    // separate things "belongs to" exactly one of those things, in the sense
    // that things penetrated by that point will only ever see the penetration
    // event with the point's owner as the penetrator, not its neighbors.
    // (You could still have a point owned by different things if it belongs to
    // more than one outer surface, e.g. a shape like this: >< . But such
    // points can only really penetrate other things with at most one of those
    // surfaces, the convex one, e.g. the bottom of this shape: \V/ .)
    var nextPoint = penetratorShape[(pointIndex + 1) % penetratorShape.length];
    var rvUnit = relativeVelocity.normalize();
    var edgeUnit = nextPoint.subtract(point).normalize();
    var angle = Math.atan2(rvUnit.cross(edgeUnit), rvUnit.dot(edgeUnit));
    var cost = angle + (angle < 0 ? 2*Math.PI : 0);
    return {
      penetrator: penetrator, point: point,
      penetrated: penetrated, edgeFrom: edgeFrom, edgeTo: edgeTo,
      ticksAgo: maxTicksAgo, relativeVelocity: relativeVelocity,
      cost: cost
    };
  },

  function idle() {
    // don't do an infinite(?) sequence of idles while there is unhandled
    // penetration
    if (!this.somethingMoved) {
      router.emit('noMoreHits'); // FIXME what if there's more than one Space?
      return;
    }
    this.somethingMoved = false;
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
    // map "x,y,penetrated" to the least-cost penetration object returned by
    // penetrate()
    var penetrations = {};
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
      // FIXME for mobile things, their points should be extended to line segments according to relativeVelocity and checked against each edge of the other shape, instead of merely checking whether the point is inside the shape, since the point may have entirely moved through the shape
      // ...but in order to do that, we need to save the time of the last bounce so we don't find it again by mistake
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
		secondShape.forEach((secondPoint, secondPointIndex) => {
		  if (pointIsInPolygon(secondPoint, firstShape)) {
		    var penetration =
		      this.penetrate(second, secondShape, secondPointIndex,
				     first, firstShape);
		    if (penetration !== null) {
		      var key =
		        Math.floor(secondPoint.x) + ',' +
			Math.floor(secondPoint.y) + ',' +
			first;
		      if ((!(key in penetrations)) ||
			  penetration.cost < penetrations[key].cost) {
			penetrations[key] = penetration;
		      }
		    }
		  }
		});
		firstShape.forEach((firstPoint, firstPointIndex) => {
		  if (pointIsInPolygon(firstPoint, secondShape)) {
		    var penetration =
		      this.penetrate(first, firstShape, firstPointIndex,
				     second, secondShape);
		    if (penetration !== null) {
		      var key =
		        Math.floor(firstPoint.x) + ',' +
			Math.floor(firstPoint.y) + ',' +
			second;
		      if ((!(key in penetrations)) ||
			  penetration.cost < penetrations[key].cost) {
			penetrations[key] = penetration;
		      }
		    }
		  }
		});
	      }
	    });
	  });
	}
      });
    }
    // map penetrators and penetrateds to the first penetration they
    // participate in (greatest ticksAgo)
    var hits = {};
    var haveHits = false;
    for (var key in penetrations) {
      var p = penetrations[key];
      if ((!(p.penetrator in hits)) ||
	  hits[p.penetrator].ticksAgo < p.ticksAgo) {
	hits[p.penetrator] = p;
	haveHits = true;
      }
      if ((!(p.penetrated in hits)) ||
	  hits[p.penetrated].ticksAgo < p.ticksAgo) {
	hits[p.penetrated] = p;
	haveHits = true;
      }
    }
    if (haveHits) {
      // emit one penetrate and two hit events for each (first, least-cost)
      // penetration
      for (var thing in hits) {
	var p = hits[thing];
	if (thing == p.penetrator) {
	  router.emit('penetrate', p.penetrator, p.point, p.penetrated, p.edgeFrom, p.edgeTo, p.ticksAgo, p.relativeVelocity);
	  router.emit('hit', p.penetrator, p.penetrated);
	  router.emit('hit', p.penetrated, p.penetrator);
	}
      }
    } else { // have no hits
      router.emit('noMoreHits');
    }
  }
]);

module.exports = Space;
