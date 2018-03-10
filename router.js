const defineMethods = require('./define-methods.js');

function Router() {
  this.adjectives = {};
  this.listeners = {};
}

defineMethods(Router, [

//
// EventEmitter-style methods
//
// FIXME need to select on more than just event name, and do variable bindings

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
    oldProperties = this.adjectives[adjective][thing];
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
}

]);

module.exports = Router;
