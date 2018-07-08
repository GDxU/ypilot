// put certain things in window so that compiled configuration can use them
require('setimmediate');
require('./arrays.js');
window.PeerConnection = require('./peer-connection.js');
const Router = require('./router.js');
window.router = new Router();
window.Vec2 = require('./vec2.js');
window.SpatialIndex = require('./space.js');
window.Interface = require('./interface.js');
window.Chat = require('./chat.js');
const svgjs = require('./svg.js');
window.stringToSVGGraphicsElement = svgjs.stringToSVGGraphicsElement;
SVGGraphicsElement.prototype.toJSON = svgjs.svgGraphicsElementToJSON;

// is ancestor a (non-strict) ancestor of descendant, in the .yp type graph?
window.subsumes = function(ancestor, descendant) {
  return (ancestor == descendant ||
          router.adjectives.Typing[descendant].supertypes.
            some(t => subsumes(ancestor, t)));
}

// return a deep copy of x if x is an Array or DOM Node; otherwise return x
// (the goal is to clone the DOM Nodes even if they're in nested Arrays)
function cloneNodes(x) {
  if (Array.isArray(x)) {
    return x.map(cloneNodes);
  } else if (x instanceof Node) {
    return x.cloneNode(true);
  } else {
    return x;
  }
}

// add a new thing that is a copy of original modified with newAdjs
window.addCopy = function(original, newAdjs) {
  var adjs = {};
  // get all the adjective properties from the original
  for (var adj in router.adjectives) {
    if (original in router.adjectives[adj]) {
      adjs[adj] = Object.assign({}, router.adjectives[adj][original]);
    }
  }
  // merge in newAdjs
  for (var adj in newAdjs) {
    adjs[adj] = Object.assign(adjs[adj] || {}, newAdjs[adj]);
  }
  // clone all the DOM Nodes and Arrays containing them
  for (var adj in adjs) {
    var props = adjs[adj];
    for (var prop in props) {
      props[prop] = cloneNodes(props[prop]);
    }
  }
  // grab the name of the type from adjs
  var typeName = router.adjectives.Named[adjs.Typed.type].name;
  // but then delete Typed from adjs because that's done by addFn
  delete adjs.Typed;
  // find the generated add* function for the type
  var addFn = this['yp$add' + typeName];
  // call it and return the new copy's thing number
  return addFn(adjs);
}

require('./welcome.js');
require('./menu.js');
