const $ = require('jquery');
const defineMethods = require('./define-methods.js');

// get what the value of evt.code should be, even if it's actually ""
// (that happens on mobile)
// NOTE: this is probably not complete; it just works for the keys we use
function getRobustKeyCode(evt) {
  if (evt.code != '') {
    return evt.code;
  } else if (/^[0-9a-z]$/i.test(evt.key)) {
    return 'Key' + evt.key.toUpperCase();
  } else {
    return evt.key;
  }
}

function Interface(player) {
  this.player = player;
  this.isLocal = (
    (router.uplink.id in router.uplink.players) &&
    (router.uplink.players[router.uplink.id].thing == player)
  );
  if (this.isLocal) {
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
    this.toroidal = router.getAdjectivePropertiesMap('Toroidal');
    // TODO support dynamically changing Toroidal status of a space?
    this.svg = $('#svg-container svg')[0];
    this.centerG = $('#center-g')[0];
    document.body.onkeydown = this.keydown.bind(this);
    document.body.onkeyup = this.keyup.bind(this);
    $('.key').
      on('mousedown', this.mousedown.bind(this)).
      on('mouseup', this.mouseup.bind(this)).
      on('touchstart', this.touchstart.bind(this)).
      on('touchend', this.touchend.bind(this));
    // TODO mouse enter/leave etc.?
    if (this.player in this.piloting) {
  //    console.log('interface found player ' + this.player + ' piloting on creation');
      this.becomePiloting(this.player, this.piloting[this.player], null);
    }
  }
}

defineMethods(Interface, [

function toJSON() {
  return { op: 'Interface', args: [this.player] };
},

function thingIsInPlayersSpace(thing) {
  return (this.playerShipLocated && (thing in this.located) &&
	  this.located[thing].space == this.playerShipLocated.space);
},

function setViewBox() {
  if (this.playerShipLocated) {
    var w = this.svg.width.baseVal.value;
    var h = this.svg.height.baseVal.value;
    var pos = this.playerShipLocated.position;
    this.svg.setAttributeNS(null, 'viewBox',
      '' + (pos.x - w/2) + ' ' + (pos.y - h/2) + ' ' + w + ' ' + h);
  }
},

function setThingTransform(graphics, position, orientation) {
  // TODO maybe put everything in a <g> instead of setting transform on each?
  var attrVal =
    'translate(' + position.x + ', ' + position.y + ') ' +
    'rotate(' + (orientation * 180 / Math.PI) + ')';
  graphics.forEach(g => g.setAttributeNS(null, 'transform', attrVal));
},

function getThingOrientation(thing) {
  return (thing in this.oriented) ? this.oriented[thing].orientation : 0;
},

function changeSpace() {
//  console.log('Interface#changeSpace()');
  this.centerG.innerHTML = ''; // remove all children from the old space
  // add all graphics of visible things located in the new space
  for (var t in this.located) {
    t |= 0; // enforce integer thing IDs (not strings)
    if (this.located[t].space == this.playerShipLocated.space &&
        (t in this.visible)) {
      this.becomeVisible(t, this.visible[t], undefined);
    }
  }
  // apply toroidal wrapping or not
  if (this.playerShipLocated.space in this.toroidal) {
    var size = this.toroidal[this.playerShipLocated.space].size;
    $('#nw-use').attr({ x: -size.x, y: -size.y });
    $('#n-use' ).attr({ x:       0, y: -size.y });
    $('#ne-use').attr({ x:  size.x, y: -size.y });
    $( '#w-use').attr({ x: -size.x, y:       0 });
    $( '#e-use').attr({ x:  size.x, y:       0 });
    $('#sw-use').attr({ x: -size.x, y:  size.y });
    $('#s-use' ).attr({ x:       0, y:  size.y });
    $('#se-use').attr({ x:  size.x, y:  size.y });
    $('#periphery-g').show();
  } else {
    $('#periphery-g').hide();
  }
},

function becomePiloting(thing, {ship}, oldPiloting) {
//  console.log('Interface#becomePiloting(' + thing + ', { ship: ' + ship + ' }, #)');
  if (thing == this.player) {
//    console.log('interface found player ' + thing + ' piloting after creation');
    this.playerShipLocated = this.located[ship];
    this.setViewBox();
    this.changeSpace();
  }
},

function becomeVisible(thing, {graphics}, oldVisible) {
//  console.log('Interface#becomeVisible(' + thing + ', #, #)');
  if (this.thingIsInPlayersSpace(thing)) {
//    console.log("...is in player's space, appending");
    graphics.forEach(g => {
      this.centerG.appendChild(g);
    });
    this.setThingTransform(graphics,
      this.located[thing].position, this.getThingOrientation(thing));
  } else if (oldVisible) {
    this.unbecomeVisible(thing, oldVisible);
  }
},

function unbecomeVisible(thing, {graphics}) {
//  console.log('Interface#unbecomeVisible(' + thing + ', #)');
  graphics.forEach(g => {
    if (g.parentNode === this.centerG) {
      g.remove();
    }
  });
},

function becomeLocated(thing, {space, position}, oldLocated) {
  if (!(thing in this.visible)) return;
  if (this.playerShipLocated && space == this.playerShipLocated.space) {
    this.setThingTransform(this.visible[thing].graphics,
      position, this.getThingOrientation(thing));
    if ((this.player in this.piloting) &&
        thing == this.piloting[this.player].ship) { // just moved player's ship
      this.setViewBox();
      if (space != oldLocated.space) this.changeSpace();
    }
  } else if (oldLocated) {
    this.unbecomeLocated(thing, oldLocated);
  }
},

function unbecomeLocated(thing, {space, position}) {
  if (this.playerShipLocated && space == this.playerShipLocated.space &&
      (thing in this.visible)) {
    this.unbecomeVisible(thing, this.visible[thing]);
  }
},

function thingIsShown(thing) {
  return ((thing in this.visible) && (thing in this.located) &&
	  this.visible[thing].graphics.parentNode === this.centerG);
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
  router.uplink.localInput('press', this.player, getRobustKeyCode(evt));
},

function keyup(evt) {
  router.uplink.localInput('release', this.player, getRobustKeyCode(evt));
},

function mousedown(evt) {
  router.uplink.localInput('press', this.player, evt.currentTarget.id);
},

function mouseup(evt) {
  router.uplink.localInput('release', this.player, evt.currentTarget.id);
},

function touchstart(evt) {
  $.each(evt.changedTouches, (i, touch) => {
    $(touch.target).closest('button').each((j, btn) => {
      router.uplink.localInput('press', this.player, btn.id);
    });
  });
},

function touchend(evt) {
  $.each(evt.changedTouches, (i, touch) => {
    $(touch.target).closest('button').each((j, btn) => {
      router.uplink.localInput('release', this.player, btn.id);
    });
  });
}

]);

module.exports = Interface;
