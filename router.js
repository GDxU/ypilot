const defineMethods = require('./define-methods.js');

function Router() {
  this.nextThing = 0;
  this.adjectives = {};
  this.listeners = {};
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
    // the middle of another listener and sees its effect only partly applied
    this.listeners[eventName].forEach(listener => setImmediate(listener, ...args));
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
  this.emit('remove', thing);
},

//
// more events
//

function clockTick() {
  this.emit('clockTick');
},

function penetrate(penetrator, point, penetrated, edgeFrom, edgeTo, ticksAgo, relativeVelocity) {
  this.emit('penetrate', penetrator, point, penetrated, edgeFrom, edgeTo, ticksAgo, relativeVelocity);
  // TODO deduplicate hits for a given clock tick
  this.hit(penetrator, penetrated);
},

function hit(x, y) {
  if (y < x) { // FIXME? sort by type instead of ID
    this.emit('hit', y, x);
  } else {
    this.emit('hit', x, y);
  }
},

// TODO track which keys are currently down for each player
function press(player, key) {
  this.emit('press', player, key);
},

function release(player, key) {
  this.emit('release', player, key);
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
}

]);

module.exports = Router;
