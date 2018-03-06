const defineMethods = require('./define-methods.js');

function Space(router) {
  this.bin2things = {};
  this.located = router.getAdjectivePropertiesMap('Located');
  this.solid = router.getAdjectivePropertiesMap('Solid');
  this.oriented = router.getAdjectivePropertiesMap('Oriented');
  router.on('becomeLocated', this.becomeLocated.bind(this));
  router.on('unbecomeLocated', this.unbecomeLocated.bind(this));
  router.on('clockTick', this.clockTick.bind(this));
}

Space.position2bin = function(position) {
  return JSON.stringify([Math.floor(position.x), Math.floor(position.y)]);
}

defineMethods(Space, [
  function addToBin(thing, bin) {
    if (!(bin in this.bin2things)) {
      this.bin2things[bin] = [thing];
    } else {
      this.bin2things[bin].push(thing);
    }
  }

  function removeFromBin(thing, bin) {
    var i = this.bin2things[bin].indexOf(thing)
    if (i < 0) { throw new Error("WTF"); }
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
      oldBin = Space.position2bin(position);
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
    }
  },

  function unbecomeLocated(thing, {space, position}) {
    if (space === this) {
      var bin = Space.position2bin(position);
      this.removeFromBin(thing, bin);
    }
  },

  function clockTick() {
    // TODO check for hits among Located things whose space === this and emit them
  }
]);

module.exports = Space;
