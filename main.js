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

const parse = require('./config.js').parse;
const compile = require('./compile.js');
const $ = require('jquery');

function clockTick(now) {
  router.emit('clockTick');
  requestAnimationFrame(clockTick);
}

$(function() {
  $('#config-file').on('change', function(evt) {
    try {
      var file = evt.target.files[0];
      var reader = new FileReader();
      reader.onload = function() {
	try {
	  var ast = parse(reader.result);
	} catch (e) {
	  $('#welcome').
	    append("<p>Error parsing config file:</p><pre>" + e.message + "</pre>").
	    append("<p>At line " + e.location.start.line + " column " + e.location.start.column + " to line " + e.location.end.line + " column " + e.location.end.column + "</p>");
	  return;
	}
	try {
	  var jsText = compile(ast);
	  var script = document.createElement('script');
	  script.setAttribute("type", "text/javascript");
	  script.text = jsText;
	  $('head').append(script);
	  router.emit('start');
	  $('#welcome').hide();
	  requestAnimationFrame(clockTick);
	} catch (e) {
	  $('#welcome').append("<p>Error compiling config file:</p><pre>" + e + "</pre>");
	}
      };
      reader.readAsText(file);
    } catch (e) {
      $('#welcome').append("<p>Error loading config file:</p><pre>" + e + "</pre>");
    }
  });
});
