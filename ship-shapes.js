const Vec2 = require('./vec2.js');

// throw an informative error if shape is not a valid ship shape
// also convert any Array points to Vec2 points
function ensureValid(shape) {
  if (!Array.isArray(shape))
    throw new Error('expected an Array');
  if (shape.length < 3 || shape.length > 24)
    throw new Error('expected between 3 and 24 points inclusive, but got ' + shape.length);
  var minCorner = new Vec2(0,0), maxCorner = new Vec2(0,0);
  var haveN = false, haveE = false, haveS = false, haveW = false;
  var numOuterPoints = 0;
  var newShape = [];
  shape.forEach(p => {
    if (Array.isArray(p)) {
      if (p.length != 2)
	throw new Error('expected exactly 2 coordinates for point, but got ' + p.length);
      p = new Vec2(p[0], p[1]);
    }
    if (!(p instanceof Vec2))
      throw new Error('expected an Array or Vec2 object but got ' + p);
    if (Math.abs(p.x) > 15)
      throw new Error('expected point to be within 15 pixels of the Y axis, but got ' + p);
    if (Math.abs(p.y) > 15)
      throw new Error('expected point to be within 15 pixels of the X axis, but got ' + p);
    if (p.y <= -8) haveN = true;
    if (p.x >=  8) haveE = true;
    if (p.y >=  8) haveS = true;
    if (p.x <= -8) haveW = true;
    if (p.magnitude() >= 8) numOuterPoints++;
    if (p.x < minCorner.x) minCorner.x = p.x;
    if (p.y < minCorner.y) minCorner.y = p.y;
    if (p.x > maxCorner.x) maxCorner.x = p.x;
    if (p.y > maxCorner.y) maxCorner.y = p.y;
    newShape.push(p);
  });
  var dims = maxCorner.subtract(minCorner);
  var dimSum = dims.x + dims.y;
  if (dimSum < 38)
    throw new Error('expected width + height to be at least 38, but got ' + dims.x + ' + ' + dims.y + ' = ' + dimSum);
  return newShape;
}

function isValid(shape) {
  try {
    return ensureValid(shape);
  } catch (e) {
    console.error(e);
    return false;
  }
}

module.exports = {
  ensureValid: ensureValid,
  isValid: isValid
};
