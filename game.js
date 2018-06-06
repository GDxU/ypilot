const parse = require('./parser.js').parse;
const compile = require('./compile.js');
const $ = require('jquery');
const Clock = require('./clock.js');
const convertFailToReject = require('./errors.js').convertFailToReject;

function tryToParseString(ypText) {
  try {
    return parse(ypText);
  } catch (e) {
    $('#welcome').
      append("<p>Error parsing config file:</p><pre>" + e.message + "</pre>").
      append("<p>At line " + e.location.start.line + " column " + e.location.start.column + " to line " + e.location.end.line + " column " + e.location.end.column + "</p>");
    return null;
  }
}

function loadFromAST(ast, sourceURL) {
  try {
    var jsText = compile(ast);
    if (sourceURL) {
      jsText += "\n//# sourceURL=" + sourceURL + "\n";
    }
    var script = document.createElement('script');
    script.setAttribute('id', 'game-script');
    script.setAttribute('type', 'text/javascript');
    script.text = jsText;
    $('head').append(script);
    router.configURL = sourceURL;
  } catch (e) {
    $('#welcome').append("<p>Error compiling config file:</p><pre>" + e + "</pre>");
  }
}

function loadFromString(ypText, sourceURL) {
  var ast = tryToParseString(ypText);
  if (ast === null) return;
  loadFromAST(ast, sourceURL);
}

function loadFromProfile(gameIndex) {
  return new Promise((resolve, reject) => {
    var url = profile.games[gameIndex].url;
    $.get(url).
    done((data, textStatus, jqXHR) => {
      loadFromString(jqXHR.responseText, url);
      resolve(null);
    }).
    fail((jqXHR, textStatus, errorThrown) => {
      $('#welcome').append("<p>Error fetching config file:</p><pre>" + textStatus + "</pre>");
      convertFailToReject(textStatus, errorThrown, reject);
    });
  });
}

function unload() {
  deleteToUnload.forEach(x => { delete window[x]; });
  deleteToUnload.length = 0;
  $('#game-script').remove();
}

module.exports = {
  tryToParseString: tryToParseString,
  loadFromAST: loadFromAST,
  loadFromString: loadFromString,
  loadFromProfile: loadFromProfile,
  unload: unload
};
