const $ = require('jquery');
const defineMethods = require('./define-methods.js');

function Interface(player) {
  this.player = player;
  this.playerShipLocated = undefined;
  this.piloting = router.getAdjectivePropertiesMap('Piloting');
  router.on('becomePiloting', this.becomePiloting.bind(this));
  this.visible = router.getAdjectivePropertiesMap('Visible');
  router.on('becomeVisible', this.becomeVisible.bind(this));
  router.on('unbecomeVisible', this.unbecomeVisible.bind(this));
  this.located = router.getAdjectivePropertiesMap('Located');
  router.on('becomeLocated', this.becomeLocated.bind(this));
  router.on('unbecomeLocated', this.unbecomeLocated.bind(this));
  this.oriented = router.getAdjectivePropertiesMap('Oriented');
  router.on('becomeOriented', this.becomeOriented.bind(this));
  router.on('unbecomeOriented', this.unbecomeOriented.bind(this));
  this.svg = $('#svg-container svg');
  this.svg.on('keydown', this.keydown.bind(this));
  this.svg.on('keyup', this.keyup.bind(this));
  if (this.player in this.piloting) {
    this.playerShipLocated = this.located[this.piloting[this.player].ship];
    this.setViewBox();
  }
}

defineMethods(Interface, [

function thingIsInPlayersSpace(thing) {
  return (this.playerShipLocated && (thing in this.located) &&
	  this.located[thing].space === this.playerShipLocated.space);
},

function setViewBox() {
  if (this.playerShipLocated) {
    var w = this.svg.width;
    var h = this.svg.height;
    var pos = this.playerShipLocated.position;
    this.svg.setAttributeNS(null, 'viewBox',
      '' + (pos.x - w/2) + ' ' + (pos.y - h/2) + ' ' + w + ' ' + h);
  }
},

function setThingTransform(graphics, position, orientation) {
  graphics.setAttributeNS(null, 'transform',
    'translate(' + position.x + ', ' + position.y + ') ' +
    'rotate(' + orientation + ')');
},

function getThingOrientation(thing) {
  return (thing in this.oriented) ? this.oriented[thing].orientation : 0;
},

function becomePiloting(thing, {ship}, oldPiloting) {
  if (thing == this.player) {
    this.playerShipLocated = this.located[ship];
    this.setViewBox();
  }
},

function becomeVisible(thing, {graphics}, oldVisible) {
  if (oldVisible) this.unbecomeVisible(thing, oldVisible);
  if (this.thingIsInPlayersSpace(thing)) {
    this.svg.appendChild(graphics);
    this.setThingTransform(graphics,
      this.located[thing].position, this.getThingOrientation(thing));
  }
},

function unbecomeVisible(thing, {graphics}) {
  if (graphics.parentNode === this.svg) {
    graphics.remove();
  }
},

function becomeLocated(thing, {space, position}, oldLocated) {
  if (!(thing in this.visible)) return;
  if (oldLocated) this.unbecomeLocated(thing, oldLocated);
  if (this.playerShipLocated && space === this.playerShipLocated.space) {
    this.setThingTransform(this.visible[thing].graphics,
      position, this.getThingOrientation(thing));
    if ((this.player in this.piloting) &&
        thing === this.piloting[this.player].ship) { // just moved player's ship
      this.setViewBox();
      if (space !== oldLocated.space) { // player just changed spaces
	this.svg.innerHTML = ''; // remove all children from the old space
	// add all graphics of visible things located in the new space
	for (var t in this.located) {
	  if (this.located[t].space === space && (t in this.visible)) {
	    this.becomeVisible(t, this.visible[t], undefined);
	  }
	}
      }
    }
  }
},

function unbecomeLocated(thing, {space, position}) {
  if (space === this.playerShipLocated.space && (thing in this.visible)) {
    this.unbecomeVisible(thing, this.visible[thing]);
  }
},

function thingIsShown(thing) {
  return ((thing in this.visible) && (thing in this.located) &&
	  this.visible[thing].graphics.parentNode === this.svg);
},

function becomeOriented(thing, {orientation}, oldOriented) {
  if (this.thingIsShown(thing)) {
    this.setThingTransform(this.visible[thing].graphics,
      this.located[thing].position, orientation);
  }
},

function unbecomeOriented(thing, {orientation}) {
  if (this.thingIsShown(thing)) {
    this.setThingTransform(this.visible[thing].graphics,
      this.located[thing].position, 0);
  }
},

function keydown(evt) {
  router.press(this.player, evt.code);
},

function keyup(evt) {
  router.release(this.player, evt.code);
}

]);

module.exports = Interface;
