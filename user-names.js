// very simple attempt to generate pronounceable names
var vowels = 'aeiou'; // no y
var consonants = 'bcdfghjklmnprstvwxz'; // no q, y
function generateRandom() {
  var name = '';
  var cv = 's';
  for (var i = Math.floor(Math.random() * 6) + 5; // 5-10 letters at random
       i > 0;
       i--) {
    // alternate consonants and vowels, starting at random
    switch (cv) {
      case 's': cv = (Math.random() < 0.5 ? 'c' : 'v'); break;
      case 'c': cv = 'v'; break;
      case 'v': cv = 'c'; break;
    }
    // add a random consonant or vowel
    var str = (cv == 'c' ? consonants : vowels);
    name += str[Math.floor(Math.random() * str.length)];
  }
  return name;
}

function isValid(n) {
  return /^[\w-]+$/.test(n);
}

function ensureValid(n) {
  if (!isValid(n)) {
    var msg = "Invalid user name: " + n + "\nUser names should contain only letters, numbers, hyphens, and underscores.";
    alert(msg);
    throw new Error(msg);
  }
  return n;
}

module.exports = {
  generateRandom: generateRandom,
  isValid: isValid,
  ensureValid: ensureValid
};
