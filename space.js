const defineMethods = require('./define-methods.js');

function Space() {
  this.bin2things = {};
  this.thing2position = {};
  this.thing2shape = {};
  this.thing2orientation = {};
}

Space.position2bin = function(position) {
  return JSON.stringify([Math.floor(position.x), Math.floor(position.y)]);
}

defineMethods(Space, [
  function removeFromBin(thing, bin) {
    var i = this.bin2things[bin].indexOf(thing)
    if (i < 0) { throw new Error("WTF"); }
    this.bin2things[bin].splice(i, 1);
    if (this.bin2things[bin].length == 0) {
      delete this.bin2things[bin];
    }
  },

  function becomeLocated(thing, position) {
    var oldBin = null;
    if (thing in this.thing2position) {
      var oldPosition = this.thing2position[thing];
      oldBin = Space.position2bin(position);
    }
    this.thing2position[thing] = position;
    var bin = Space.position2bin(position);
    if (bin != oldBin) {
      if (!(bin in this.bin2things)) {
	this.bin2things[bin] = [thing];
      } else {
	this.bin2things[bin].push(thing);
      }
      if (oldBin) {
	this.removeFromBin(thing, oldBin);
      }
    }
  },

  function unbecomeLocated(thing) {
    if (thing in this.thing2position) {
      var position = this.thing2position[thing];
      var bin = Space.position2bin(position);
      this.removeFromBin(thing, bin);
    }
  },

  function becomeSolid(thing, shape) {
    this.thing2shape[thing] = shape;
  },

  function unbecomeSolid(thing) {
    delete this.thing2shape[thing];
  },

  function becomeOriented(thing, orientation) {
    this.thing2orientation[thing] = orientation;
  },

  function unbecomeOriented(thing) {
    delete this.thing2orientation[thing];
  },

  function clockTick() {
    // TODO check for hits and emit them
  }
]);

module.exports = Space;
