// get the random bits of a uuidv4 as an array of 0s and 1s
function id2bits(id) {
  var bits = [];
  id = id.replace(/-/g,'');
  for (var i = 0; i < id.length; i++) {
    var nybble = parseInt(id[i], 16);
    bits.push((nybble>>3)&1, (nybble>>2)&1, (nybble>>1)&1, nybble&1);
  }
  // discard non-random bits
  bits.splice(64, 2); // 0, 1
  bits.splice(48, 4); // 0, 1, 0, 0
  return bits;
}

// take the first 9 bits out, and use 3 each for R,G,B
function bits2color(bits) {
  var r = (bits.shift()<<3) | (bits.shift()<<2) | (bits.shift()<<1) | 1;
  var g = (bits.shift()<<3) | (bits.shift()<<2) | (bits.shift()<<1) | 1;
  var b = (bits.shift()<<3) | (bits.shift()<<2) | (bits.shift()<<1) | 1;
  var color = '#' + r.toString(16) + g.toString(16) + b.toString(16);
  return color;
}

// convert a UUIDv4 to a representative SVG that's easy to compare at a glance
function id2svg(id) {
  var bits = id2bits(id);
  var color = bits2color(bits);
  var points = [];
  for (var i = 0; i < 36; i++) {
    points.push((bits.shift()<<2) | (bits.shift()<<1) | bits.shift());
  }
  return '<svg viewBox="0 0 16 16" width="64" height="64">' + 
  '<rect x="0" y="0" width="16" height="16" fill="black"/>' +
  '<g transform="translate(8,8)">' +
  '<polygon id="' + id + '-q"' +
  ' fill="' + color + '"' +
  ' points="' + points.join(',') + '" />' +
  '<use href="#' + id + '-q" transform="rotate(-90)" />' +
  '<use href="#' + id + '-q" transform="scale(-1,1)" />' +
  '<use href="#' + id + '-q" transform="scale(-1,1) rotate(-90)" />' +
  '</g>' +
  '</svg>';
}

// just do the color part of id2svg
function id2color(id) {
  var bits = id2bits(id);
  var color = bits2color(bits);
  return color;
}

id2svg.id2color = id2color; // so it shows up in exports

module.exports = id2svg;
