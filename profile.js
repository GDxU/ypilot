const uuidv4 = require('uuid/v4');
const UserNames = require('./user-names.js');
const defineMethods = require('./define-methods.js');

const cryptoOptions = {
  name: 'RSA-PSS',
  modulusLength: 2048,
  publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
  hash: { name: 'SHA-256' }
};

function generateKeyPair(callback) {
  crypto.subtle.generateKey(
    cryptoOptions,
    true, // can be exported
    ['sign', 'verify']
  ).then(callback).catch(err => console.error(err));
}

function Profile(opts) {
  this.id = opts.id;
  this.handle = opts.handle;
  this.useLocalStorage = opts.useLocalStorage;
  this.keyPair = opts.keyPair;
}

defineMethods(Profile, [

function toObject(callback) {
  // export keys from crypto API
  var pub;
  crypto.subtle.exportKey('jwk', this.keyPair.publicKey).
  then(x => {
    pub = x;
    return crypto.subtle.exportKey('jwk', this.keyPair.privateKey);
  }).
  then(priv => {
    // make a plain object
    callback({
      id: this.id,
      handle: this.handle,
      useLocalStorage: this.useLocalStorage,
      keyPair: { publicKey: pub, privateKey: priv },
    });
  }).catch(err => console.error(err));
}

]);

Profile.generateRandom = function(callback) {
  generateKeyPair(keyPair => {
    callback(new Profile({
      id: uuidv4(),
      handle: UserNames.generateRandom(),
      useLocalStorage: true,
      keyPair: keyPair
    }));
  });
};

Profile.fromString = function(str, callback) {
  try {
    var o = JSON.parse(str);
    // import keys into the crypto API
    crypto.subtle.importKey('jwk', o.keyPair.publicKey, cryptoOptions,
			    true, ['verify']).
    then(importedPublicKey => {
      o.keyPair.publicKey = importedPublicKey;
      return (
	crypto.subtle.importKey('jwk', o.keyPair.privateKey, cryptoOptions,
				true, ['sign']));
    }).
    then(importedPrivateKey => {
      o.keyPair.privateKey = importedPrivateKey;
      // make a new profile with the loaded options
      callback(new Profile(o));
    }).
    catch(err => console.error(err));
  } catch (err) {
    console.error(err);
  }
}

Profile.fromFile = function(file, callback) {
  var reader = new FileReader();
  reader.onload = function() {
    Profile.fromString(reader.result, callback);
  };
  reader.readAsText(file);
};

module.exports = Profile;
