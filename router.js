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
    var i = this.listeners.indexOf(listener);
    if (i >= 0) {
      this.listeners.splice(i, 1);
    }
  }
},

function emit(eventName, ...args) {
  if (eventName in this.listeners) {
    this.listeners.forEach(listener => listener(...args));
  }
},

//
// adjectives and (un)becoming events
//

function declareAdjective(adjective) {
  if (!(adjective in this.adjectives)) {
    this.adjectives[adjective] = [];
  }
},

function getAdjectivePropertiesArray(adjective) {
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
  this.emit('become', thing, adjective, properties, oldProperties);
},

function unbecome(thing, adjective) {
  this.declareAdjective(adjective); // make sure it exists first
  oldProperties = this.adjectives[adjective][thing];
  delete this.adjectives[adjective][thing];
  this.emit('unbecome', thing, adjective, oldProperties);
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
}

// TODO keypress tracking? hits? clockTicks?

]);

module.exports = Router;
