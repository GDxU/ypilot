const uuidv4 = require('uuid/v4');
const base64js = require('base64-js');
const UserNames = require('./user-names.js');
const defineMethods = require('./define-methods.js');

const cryptoOptions = {
  name: 'RSA-PSS',
  modulusLength: 2048,
  publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
  hash: { name: 'SHA-256' },
  saltLength: 128
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
  this.knownPlayers = {};
}

defineMethods(Profile, [

// call callback with a representation of this profile as a JSON.stringifiable
// Object, with the key pair exported in JWK format
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
      knownPlayers: this.knownPlayers
    });
  }).catch(err => console.error(err));
},

// create a version of msg (which must be a JSON.stringifiable Object) signed
// with the private key and pass it to the callback
function sign(msg, callback) {
  crypto.subtle.exportKey('jwk', this.keyPair.publicKey).
  then(publicKey => {
    // add sender info to msg
    var msgWithSender = Object.assign(
      { sender: { id: this.id, handle: this.handle, publicKey: publicKey } },
      msg
    );
    // get string and bytes of message
    var msgStr = JSON.stringify(msgWithSender);
    var encoder = new TextEncoder('utf-8'); // note this is always utf-8
    var msgBytes = encoder.encode(msgStr);
    return (
      // get the signature of those bytes
      crypto.subtle.sign(cryptoOptions, this.keyPair.privateKey, msgBytes).
      then(signature => {
	console.log(signature);
	console.log(base64js.fromByteArray(new Uint8Array(signature)));
	// put the string and base64 signature together, and pass to callback
	callback({
	  msg: msgStr,
	  sig: base64js.fromByteArray(new Uint8Array(signature))
	});
      })
    );
  }).
  catch(err => console.error(err));
},

// extract the original message from the signed message string, and either
// verify the signature if we've seen a sender with this ID before, or save the
// sender's ID and public key for future reference otherwise. TOFU = Trust On
// First Use. If the sender is successfully trusted, update their handle if it
// changed, and pass the original message to the callback.
function verifyTOFU(signedMsgStr, callback) {
  var { msg: msgStr, sig } = JSON.parse(signedMsgStr);
  var msg = JSON.parse(msgStr);
  var senderID = msg.sender.id;
  if (senderID in this.knownPlayers) { // not first use
    var player = this.knownPlayers[senderID];
    if (player.publicKey != msg.sender.publicKey) {
      throw new Error("public key in message doesn't match those in previous messages from the same sender");
    }
    this.verify(msgStr, sig, msg, senderID, player.publicKey, callback);
  } else { // first use, trust that the key is correct
    // import the key from the message (this is why this.verify is a separate
    // function)
    crypto.subtle.importKey('jwk', msg.sender.publicKey, cryptoOptions,
			    true, ['verify']).
    then(key => {
      this.verify(msgStr, sig, msg, senderID, key, callback);
    }).
    catch(err => console.error(err));
  }
},

// internal part of verifyTOFU that happens after we get the imported key
function verify(msgStr, sig, msg, senderID, key, callback) {
  var encoder = new TextEncoder('utf-8');
  var msgBytes = encoder.encode(msgStr);
  var sigBytes = base64js.toByteArray(sig);
  console.log(key);
  crypto.subtle.verify(cryptoOptions, key, sigBytes, msgBytes).
  then(isValid => {
    if (isValid) {
      if (senderID in this.knownPlayers) { // already known
	var player = this.knownPlayers[senderID];
	if (player.handle != msg.sender.handle) {
	  // update the current handle and put the old handle in oldHandles
	  player.oldHandles.push(player.handle);
	  player.handle = msg.sender.handle;
	  // remove the new handle from oldHandles if it was there
	  var newOldIndex = player.oldHandles.indexOf(player.handle);
	  if (newOldIndex != -1) {
	    player.oldHandles.splice(newOldIndex, 1);
	  }
	}
      } else { // just met
        // save sender and add default policies
	this.knownPlayers[senderID] = Object.assign(
	  {
	    oldHandles: [],
	    statusResponsePolicy: 'askMe',
	    joinPolicy: 'askMe',
	    statusRequestPolicy: 'onlyOnRequest'
	  }, msg.sender);
      }
      callback(msg);
    } else { // not valid
      console.error("message not verified to be from its claimed sender");
    }
  }).
  catch(err => console.error(err));
}

]);

// make a new Profile with random id, handle, and keyPair, and pass it to the
// callback
Profile.generateRandom = function(callback) {
  generateKeyPair(keyPair => {
    callback(new Profile({
      id: uuidv4(),
      handle: UserNames.generateRandom(),
      useLocalStorage: true,
      keyPair: keyPair,
      knownPlayers: {}
    }));
  });
};

// turn a JSON string of an object obtained from toObject above, back into a
// Profile object, and pass it to the callback
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

// call fromString on the contents of a File (obtained from a file input
// element)
Profile.fromFile = function(file, callback) {
  var reader = new FileReader();
  reader.onload = function() {
    Profile.fromString(reader.result, callback);
  };
  reader.readAsText(file);
};

module.exports = Profile;
