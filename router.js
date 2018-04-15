const Uplink = require('./uplink.js');
const defineMethods = require('./define-methods.js');

function Router() {
  this.configURL = null;
  this.uplink = null;
  this.nextThing = 0;
  this.adjectives = {};
  this.listeners = {};
  this.numPendingListeners = 0;
  this.playerKeysDown = {};
  this.on('press',   (player,code) => this.playerKeyState(player, code, true));
  this.on('release', (player,code) => this.playerKeyState(player, code, false));
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

function emit(eventName, ...args) {
  if (eventName in this.listeners) {
    // call each listener via setImmediate so that no listener gets called in
    // the middle of another listener and sees its effect only partly applied.
    // Also (if this isn't already an 'idle' event) keep track of how many
    // setImmediate calls are outstanding, and when that count drops to 0, emit
    // an 'idle' event, which is used for e.g. detecting secondary collisions
    // that happen when a primary collision causes something to move (bounce)
    if (eventName == 'idle') {
      this.listeners.idle.forEach(listener => setImmediate(listener));
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
  }
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
  return {
    nextThing: this.nextThing,
    adjectives: this.adjectives, // TODO serialize certain things
    playerKeysDown: this.playerKeysDown
  };
},

function setState(msg) {
  this.nextThing = msg.nextThing;
  this.adjectives = msg.adjectives; // TODO deserialize certain things
  this.playerKeysDown = msg.playerKeysDown;
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
