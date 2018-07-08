const errors = require('./errors.js');
const parse = require('./parser.js').parse;

function tryToParseString(ypText, url) {
  try {
    return parse(ypText);
  } catch (e) {
    errors.rethrowError(e, "while parsing " + url + ", at " + (('location' in e) ? "line " + e.location.start.line + " column " + e.location.start.column + " to line " + e.location.end.line + " column " + e.location.end.column : 'unknown location') + ":\n");
  }
}

module.exports = {
  tryToParseString: tryToParseString
};
