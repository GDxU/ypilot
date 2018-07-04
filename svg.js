// like Array#toString, but call toSVGString recursively if it's there
Array.prototype.toSVGString = function() {
  return this.map(x => (('function' == typeof x.toSVGString) ? x.toSVGString() : x.toString())).toString();
}

// throw an error if str does not represent an SVGGraphicsElement that's safe
// to include in our web page.
// called at parse time (and upon receiving game state from the hub)
function ensureSafeSVGGraphicsElementString(str) {
  if (/<script\b/i.test(str)) throw new Error("script tags not allowed");
  if (/\bon[\w-]+=/i.test(str)) throw new Error("event handlers not allowed");
  if ('object' == typeof document) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.innerHTML = str;
    if (svg.childNodes.length != 1)
      throw new Error("expected graphics to parse to exactly 1 element, but got " + svg.childNodes.length + " elements");
    var node = svg.childNodes[0];
    if (!(node instanceof SVGGraphicsElement))
      throw new Error("expected graphics to parse to an SVGGraphicsElement, but got an " + node.constructor.name);
  } else {
    console.warn("not in browser; skipping trying to parse graphics markup");
  }
}

// turn a string from a 'graphics' ast node into an SVGGraphicsElement
// NOTE: syntax error/security checking happens at parse time, and this
// function just assumes the checks passed
function stringToSVGGraphicsElement(str) {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.innerHTML = str;
  return svg.childNodes[0];
}

function stringToSVGGraphicsElementSafely(str) {
  ensureSafeSVGGraphicsElementString(str);
  return stringToSVGGraphicsElement(str);
}

// toJSON method to be added to SVGGraphicsElement
function svgGraphicsElementToJSON() {
  return { op: 'graphics', string: this.outerHTML };
}

module.exports = {
  ensureSafeSVGGraphicsElementString: ensureSafeSVGGraphicsElementString,
  stringToSVGGraphicsElement: stringToSVGGraphicsElement,
  stringToSVGGraphicsElementSafely: stringToSVGGraphicsElementSafely,
  svgGraphicsElementToJSON: svgGraphicsElementToJSON  
};
