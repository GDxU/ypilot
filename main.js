// put certain things in window so that compiled configuration can use them
require('setimmediate');
window.PeerConnection = require('./peer-connection.js');
const Router = require('./router.js');
window.router = new Router();
window.Vec2 = require('./vec2.js');
window.SpatialIndex = require('./space.js');
window.Interface = require('./interface.js');
const svgjs = require('./svg.js');
window.stringToSVGGraphicsElement = svgjs.stringToSVGGraphicsElement;
SVGGraphicsElement.prototype.toJSON = svgjs.svgGraphicsElementToJSON;

window.subsumes = function(ancestor, descendant) {
  return (ancestor == descendant ||
          router.adjectives.Typing[descendant].supertypes.
            some(t => subsumes(ancestor, t)));
}

require('./welcome.js');
require('./menu.js');
