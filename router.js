const Uplink = require('./uplink.js');
const stringToSVGGraphicsElementSafely = require('./svg.js').stringToSVGGraphicsElementSafely;
const defineMethods = require('./define-methods.js');

function Router() {
  this.configURL = null;
  this.uplink = null;
  this.nextThing = 0;
  this.adjectives = {};
  this.listeners = {};
  this.onceListeners = {};
  this.numPendingListeners = 0;
  this.playerKeysDown = {};
  this.on('press',   (player,code) => this.playerKeyState(player, code, true));
  this.on('release', (player,code) => this.playerKeyState(player, code, false));
  this.eventLog = [];
  this.eventLogEnabled = false;
}

defineMethods(Router, [

//
// EventEmitter-style methods
//

function on(eventName, listener) {
  if (eventName in this.listeners) {
    this.listeners[eventName].push(listener);
  } else {
    this.listeners[eventName] = [listener];
  }
},

function removeListener(eventName, listener) {
  if (eventName in this.listeners) {
    var i = this.listeners[eventName].indexOf(listener);
    if (i >= 0) {
      this.listeners[eventName].splice(i, 1);
    }
  }
},

function once(eventName, listener) {
  if (eventName in this.onceListeners) {
    this.onceListeners[eventName].push(listener);
  } else {
    this.onceListeners[eventName] = [listener];
  }
  this.on(eventName, listener);
},

function emit(eventName, ...args) {
  if (this.eventLogEnabled) {
    this.eventLog.push(JSON.stringify([eventName, ...args]));
  }
  if (eventName in this.listeners) {
    // call each listener via setImmediate so that no listener gets called in
    // the middle of another listener and sees its effect only partly applied.
    // Also (if this isn't already an 'idle' or 'noMoreHits' event) keep track
    // of how many setImmediate calls are outstanding, and when that count
    // drops to 0, emit an 'idle' event, which is used for e.g. detecting
    // secondary collisions that happen when a primary collision causes
    // something to move (bounce)
    if (eventName == 'idle' || eventName == 'noMoreHits') {
      this.listeners[eventName].forEach(listener => setImmediate(listener));
    } else {
      this.listeners[eventName].forEach(listener => {
	this.numPendingListeners++;
	setImmediate(() => {
	  try {
	    listener(...args);
	  } finally {
	    if ((--this.numPendingListeners) == 0) {
	      this.emit('idle');
	    }
	  }
	});
      });
    }
    // remove any listeners that were added with once
    if (eventName in this.onceListeners) {
      this.onceListeners[eventName].forEach(l => {
        var i = this.listeners[eventName].indexOf(l);
	if (i != -1) {
	  this.listeners[eventName].splice(i,1);
	}
      });
      this.onceListeners[eventName] = [];
    }
  }
},

function isIdle() {
  return (this.numPendingListeners == 0);
},

function getEventLogURL() {
  return URL.createObjectURL(new Blob([this.eventLog.join("\n")]));
},

//
// adjectives and (un)becoming events
//

function declareAdjective(adjective) {
  if (!(adjective in this.adjectives)) {
    this.adjectives[adjective] = {};
  }
},

function getAdjectivePropertiesMap(adjective) {
  this.declareAdjective(adjective); // make sure it exists first
  return this.adjectives[adjective];
},

function become(thing, adjective, properties) {
  this.declareAdjective(adjective); // make sure it exists first
  var oldProperties = null;
  if (thing in this.adjectives[adjective]) {
    // FIXME is copying to oldProperties all the time too expensive?
    oldProperties = Object.assign({}, this.adjectives[adjective][thing]);
    properties = Object.assign(this.adjectives[adjective][thing], properties);
  } else {
    this.adjectives[adjective][thing] = properties;
  }
  // FIXME? since emit() calls listeners via setImmediate, more changes could have happened between now and when the listeners are actually called
  this.emit('become' + adjective, thing, properties, oldProperties);
},

function unbecome(thing, adjective) {
  this.declareAdjective(adjective); // make sure it exists first
  oldProperties = this.adjectives[adjective][thing];
  delete this.adjectives[adjective][thing];
  this.emit('unbecome' + adjective, thing, oldProperties);
},

//
// things
//

function newThing() {
  return this.nextThing++;
},

function add(thing, adjectives) {
  this.emit('add', thing);
  for (var adjective in adjectives) {
    this.become(thing, adjective, adjectives[adjective]);
  }
},

function remove(thing) {
  for (var adjective in this.adjectives) {
    if (thing in this.adjectives[adjective]) {
      this.unbecome(thing, adjective);
    }
  }
  this.emit('remove', thing); // FIXME this event is pretty useless unless it comes before the unbecome events
},

//
// map reading
//

function readMap(mapThing) {
  var { space, position: mapPosition } = this.adjectives.Located[mapThing];
  var { blockSize, map } = this.adjectives.Mapped[mapThing];
  var blockPosition = new Vec2(0,0).add(mapPosition);
  for (var i = 0; i < map.length; i++) {
    var character = map[i];
    if (/\n/.test(character)) {
      blockPosition = new Vec2(mapPosition.x, blockPosition.y + blockSize.y);
    } else {
      this.emit('read' + character, mapThing, blockPosition);
      blockPosition = new Vec2(blockPosition.x + blockSize.x, blockPosition.y);
    }
  }
},

//
// key state tracking
//

function playerKeyState(player, code, state) {
  if (!(player in this.playerKeysDown)) {
    this.playerKeysDown[player] = {};
  }
  if (!(code in this.playerKeysDown[player])) {
    this.playerKeysDown[player][code] = false;
  }
  if (state === undefined) { // get
    return this.playerKeysDown[player][code];
  } else { // set
    this.playerKeysDown[player][code] = state;
  }
},

//
// full game state
//

function getState() {
  if (this.eventLogEnabled) {
    this.eventLog.push('getState');
  }
  // NOTE: a few things that can be in adjective properties have toJSON
  // methods, which turn them into plain objects (notably, without cycles).
  // This includes Vec2, SpatialIndex, Interface, and SVGGraphicsElement. The
  // process is reversed in setState below.
  return {
    nextThing: this.nextThing,
    adjectives: this.adjectives,
    playerKeysDown: this.playerKeysDown
  };
},

function convertAdjPropValFromJSON(prop2val, prop, alreadyConverted) {
  var val = prop2val[prop];
  if (!(('object' == typeof val) && (val !== null))) return;
  if (val instanceof Array) {
    for (var i = 0; i < val.length; i++) {
      this.convertAdjPropValFromJSON(val, i, alreadyConverted);
    }
  } else if ('op' in val) {
    switch (val.op) {
      case 'SpatialIndex': // fall through
      case 'Interface':
	if (!(('args' in val) &&
	      (val.args instanceof Array) &&
	      val.args.length == 1))
	  throw new Error('expected exactly one args for ' + val.op + ', but got ' + JSON.stringify(val.args));
	if ('number' != typeof val.args[0])
	  throw new Error('expected ' + val.op + ' first arg to be a number, but got ' + JSON.stringify(val.args[0]));
	var valStr = JSON.stringify(val);
	if (valStr in alreadyConverted) {
	  prop2val[prop] = alreadyConverted[valStr];
	} else {
	  if (val.op == 'SpatialIndex') {
	    prop2val[prop] = new SpatialIndex(val.args[0]);
	  } else {
	    prop2val[prop] = new Interface(val.args[0]);
	  }
	  alreadyConverted[valStr] = prop2val[prop];
	}
	break;
      case 'Vec2':
	if (!(('args' in val) &&
	      (val.args instanceof Array) &&
	      val.args.length == 2))
	  throw new Error('expected exactly two args for Vec2, but got ' + JSON.stringify(val.args));
	if ('number' != typeof val.args[0])
	  throw new Error('expected Vec2 first arg to be a number, but got ' + JSON.stringify(val.args[0]));
	if ('number' != typeof val.args[1])
	  throw new Error('expected Vec2 second arg to be a number, but got ' + JSON.stringify(val.args[1]));
	prop2val[prop] = new Vec2(val.args[0], val.args[1]);
	break;
      case 'graphics':
	if (!(('string' in val) && ('string' == typeof val.string)))
	  throw new Error('missing string property of graphics');
	prop2val[prop] = stringToSVGGraphicsElementSafely(val.string);
	break;
      default:
	// leave it as is
    }
  }
},

function setState(msg) {
  if (this.eventLogEnabled) {
    this.eventLog.push('setState');
  }
  this.nextThing = msg.nextThing;
  this.adjectives = msg.adjectives;
  this.playerKeysDown = msg.playerKeysDown;
  // reverse toJSON->{op:...} conversions
  // map stringified JSON to final objects for SpatialIndex and Interface, so
  // object identity is restored (Vec2 and SVGGraphicsElement should remain
  // separate objects regardless)
  var alreadyConverted = {};
  for (var adj in this.adjectives) {
    var thing2props = this.adjectives[adj];
    for (var thing in thing2props) {
      var prop2val = thing2props[thing];
      for (var prop in prop2val) {
	this.convertAdjPropValFromJSON(prop2val, prop, alreadyConverted);
      }
    }
  }
  // SpatialIndex requires additional initialization after everything points to
  // it instead of the JSON version
  for (var key in alreadyConverted) {
    var val = alreadyConverted[key];
    if (val instanceof SpatialIndex) {
      val.reconstitute();
    }
  }
},

//
// two ways to start playing (both assume config is already loaded)
//

// start a new game
function startNewGame() {
  this.emit('start');
  this.uplink = Uplink.startNewGame();
},

// join an existing game being played by the ID'd player
function joinGame(remoteID) {
  this.uplink = Uplink.joinGame(remoteID);
}

]);

module.exports = Router;
