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

const parse = require('./parser.js').parse;
const compile = require('./compile.js');
const $ = require('jquery');
require('./welcome.js');

var prevFrameStart = performance.now();
const fps = 20;
const frameDuration = 1000 / fps - 2; // milliseconds (-2 is a fudge term)
function clockTick(now) {
  if (now - prevFrameStart >= frameDuration) {
    prevFrameStart = now;
    router.emit('clockTick');
  }
  requestAnimationFrame(clockTick);
}

window.tryToParseString = function(ypText) {
  try {
    return parse(ypText);
  } catch (e) {
    $('#welcome').
      append("<p>Error parsing config file:</p><pre>" + e.message + "</pre>").
      append("<p>At line " + e.location.start.line + " column " + e.location.start.column + " to line " + e.location.end.line + " column " + e.location.end.column + "</p>");
    return null;
  }
};

window.startGameFromString = function(ypText, sourceURL) {
  var ast = tryToParseString(ypText);
  if (ast === null) return;
  try {
    var jsText = compile(ast);
    if (sourceURL) {
      jsText += "\n//# sourceURL=" + sourceURL + "\n";
    }
    var script = document.createElement('script');
    script.setAttribute("type", "text/javascript");
    script.text = jsText;
    $('head').append(script);
    router.configURL = sourceURL;
    router.emit('start');
    $('#welcome').hide();
    requestAnimationFrame(clockTick);
  } catch (e) {
    $('#welcome').append("<p>Error compiling config file:</p><pre>" + e + "</pre>");
  }
};

window.startGameFromProfile = function(gameIndex) {
  var url = profile.games[gameIndex].url;
  $.get(url).
  done((data, textStatus, jqXHR) => {
    startGameFromString(jqXHR.responseText, url);
  }).
  fail((jqXHR, textStatus, errorThrown) => {
    $('#welcome').append("<p>Error fetching config file:</p><pre>" + textStatus + "</pre>");
  });
};
