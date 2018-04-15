// put certain things in window so that compiled configuration can use them
require('setimmediate');
window.PeerConnection = require('./peer-connection.js');
const Router = require('./router.js');
window.router = new Router();
window.Vec2 = require('./vec2.js');
window.Space = require('./space.js');
window.Interface = require('./interface.js');

window.subsumes = function(ancestor, descendant) {
  return (ancestor == descendant ||
          router.adjectives.Typing[descendant].supertypes.
            some(t => subsumes(ancestor, t)));
}

// turn a string from a 'graphics' ast node into an SVGGraphicsElement
// NOTE: syntax error/security checking happens at parse time, and this
// function just assumes the checks passed
window.stringToSVGGraphicsElement = function(str) {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.innerHTML = str;
  return svg.childNodes[0];
}

require('./welcome.js');
