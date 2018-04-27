const $ = require('jquery');
const deepEqual = require('deep-equal');
const defineMethods = require('./define-methods.js');
const SignalingRelay = require('./signaling-relay.js');
const PeerConnection = require('./peer-connection.js');
const Clock = require('./clock.js');
const Game = require('./game.js');

function Uplink(hubID) {
  this.id = window.profile.id;
  this.router = window.router;
  this.server = null; // SignalingRelay we listen for initial messages on
  this.client = null; // SignalingRelay we listen for handshakes on, and later reuse for WebRTC setup messages
  this.hubID = null; // player ID of the hub
  this.players = {}; // map IDs to player descriptions
  this.connections = {}; // map IDs to SignalingRelays or PeerConnections
  this.inputBuffer = []; // input event messages since the last clockTick
}

Uplink.startNewGame = function() {
  var ul = new Uplink();
  ul.hubID = ul.id; // we're the hub since we're the only player so far
  ul.listen();
  Clock.start(ul.clockTick.bind(ul));
  window.profile.getPlayerDescription().
  then(playerDesc => {
    ul.receivePeerMessageAsNonHub({
      op: 'addPlayer',
      player: playerDesc
    });
  }).
  catch(err => console.error(err));
  hideWelcome();
  return ul;
};

Uplink.askStatus = function(remoteID) {
  return new Promise((resolve, reject) => {
    var relay = new SignalingRelay($('#signaling-relay-url').val(), remoteID);
    relay.ondata = (signedMsg) => {
      resolve(window.profile.verifyTOFU(signedMsg));
      relay.close(); // TODO somehow save this for later join?
    };
    window.profile.sign({ op: 'askStatus', replyTo: relay.recvID }).
    then(relay.write.bind(relay)).
    catch(reject);
  });
};

Uplink.joinGame = function(remoteID) {
  var ul = new Uplink();
  ul.join(remoteID);
  return ul;
};

defineMethods(Uplink, [

function join(remoteID) {
  this.client = new SignalingRelay($('#signaling-relay-url').val(), remoteID);
  this.connections[remoteID] = this.client;
  this.client.ondata = this.receiveInitialMessage.bind(this, this.client); // just handshake
  window.profile.sign({ op: 'join', replyTo: this.client.recvID }).
  then(this.client.write.bind(this.client)).
  catch(err => console.error(err));
},

function listen() {
  this.server =
    new SignalingRelay($('#signaling-relay-url').val(), null, this.id);
  this.server.ondata = this.receiveInitialMessage.bind(this, this.server);
},

function clockTick() {
  this.broadcast({ op: 'clockTick' });
},

function receiveInitialMessage(relay, signedMsg) {
  window.profile.verifyTOFU(signedMsg).
  then(msg => {
    return window.profile.ifAllowed(msg.sender.id, msg.op).then(() => msg);
  }).
  then(msg => {
    switch (msg.op) {
      case 'askStatus':
	return this.sendStatus(msg.sender.id, msg.replyTo);
      case 'join':
	if (this.id == this.hubID) {
	  this.accept(msg.sender.id, msg.replyTo);
	} else {
	  this.vouch(msg);
	}
	break;
      case 'handshake':
	if (this.client === relay) {
	  // only the hub could send us a handshake
	  this.hubID = msg.sender.id;
	  // load the .yp file
	  return window.profile.loadGameFromURL(msg.configURL).
	  then(() => {
	    this.client.sendID = msg.replyTo;
	    // wrap the relay as a PeerConnection in place
	    var remoteID = msg.sender.id;
	    this.connect(remoteID);
	    // initiate creating the data channel since we're the client
	    this.connections[remoteID].createDataChannel();
	    this.connections[remoteID].onopen = () => console.log('channel open');
	    // NOTE: we listen even if we're not the hub, because we want to
	    // let people join through us (if we vouch for them to the hub)
	    this.listen();
	  });
	}
	break;
      default:
	throw new Error('WTF');
    }
  }).
  catch(err => console.error(err));
},

function getPlayerList() {
  // compile list of players we're playing with, with information from profile
  var players = [];
  for (var id in this.players) {
    if (id == this.id) {
      players.push({
	id: id,
	handle: window.profile.handle,
	/* publicKey: TODO? client doesn't actually need this, and it's an async call */
	thing: this.players[id].thing
      });
    } else {
      var p = window.profile.knownPlayers[id];
      players.push({
	id: id,
	handle: p.handle,
	publicKey: p.publicKey,
	thing: this.players[id].thing
      });
    }
  }
  return players;
},

function sendStatus(remoteID, sendID) {
  // send what game we're playing and with whom
  return window.profile.sign({
    op: 'status',
    configURL: this.router.configURL,
    players: this.getPlayerList()
  }).
  then(signedMsg => {
    var relay =
      new SignalingRelay($('#signaling-relay-url').val(), sendID);
    this.connections[remoteID] = relay;
    relay.write(signedMsg);
    // TODO? reuse this relay for final connection if we're the hub? or for a join message if the hub doesn't know them yet?
  });
},

function vouch(msg) {
  this.connections[this.hubID].
  send({ op: 'vouch', vouchee: msg.sender, replyTo: msg.replyTo });
},

function receiveVoucher(msg) {
  // as hub, check ifAllowed join, then accept
  window.profile.know(msg.vouchee); // FIXME should we really just blindly accept the vouchee's credentials from the 3rd-party vouch-er?
  window.profile.ifAllowed(msg.vouchee.id, 'join').
  then(() => {
    this.accept(msg.vouchee.id, msg.replyTo);
  }).
  catch(err => console.error(err)); // FIXME maybe push this up? but would spread the Promise plague
},

// set up remote player to join the game we're the hub of
function accept(remoteID, sendID) {
  // make sure the relay is set up properly
  if (!(remoteID in this.connections)) {
    this.connections[remoteID] =
      new SignalingRelay($('#signaling-relay-url').val(), sendID);
  } else {
    this.connections[remoteID].sendID = sendID;
  }
  var relay = this.connections[remoteID];
  // send the handshake
  window.profile.sign({
    op: 'handshake',
    replyTo: relay.recvID,
    configURL: this.router.configURL
  }).
  then(relay.write.bind(relay)).
  catch(err => console.error(err));
  // open a PeerConnection to the new player
  this.connect(remoteID);
  this.connections[remoteID].onopen = () => {
    try {
      // TODO? sync with next clock tick like input events
      // when it's open, send them the current game state and player list
      this.connections[remoteID].send(
	Object.assign({ op: 'setState', players: this.getPlayerList() },
		      this.router.getState())
      );
      // and tell everyone (including the remote player and ourselves) to add
      // the new player to the game
      var msg = {
	op: 'addPlayer',
	player: {
	  id: remoteID,
	  handle: window.profile.knownPlayers[remoteID].handle,
	  publicKey: window.profile.knownPlayers[remoteID].publicKey
	}
      }
      // NOTE: must send to new player separately, because receiving addPlayer
      // is what adds them to the list of players to be broadcast to
      this.connections[remoteID].send(msg);
      this.broadcast(msg);
    } catch (err) {
      console.error(err);
    }
  };
},

// assumes this.connections[remoteID] is a SignalingRelay with sendID and
// recvID set to random IDs specifically for this connection
function connect(remoteID) {
  var relay = this.connections[remoteID];
  this.connections[remoteID] = new PeerConnection(relay);
  this.connections[remoteID].onmessage =
    this.receivePeerMessage.bind(this, remoteID);
},

function receivePeerMessage(senderID, msg) {
  if (this.id == this.hubID) {
    this.receivePeerMessageAsHub(msg);
  } else {
    this.receivePeerMessageAsNonHub(msg);
  }
},

function receivePeerMessageAsHub(msg) {
  switch (msg.op) {
    case 'vouch':
      this.receiveVoucher(msg);
      break;
    case 'press':
    case 'release':
      this.broadcast(msg);
      break;
    // TODO? more ops
    default:
      throw new Error('WTF');
  }
},

function receivePeerMessageAsNonHub(msg) {
  switch (msg.op) {
    case 'setState':
      // get player info from msg, and profile.know() each player after
      // checking for public key mismatches
      msg.players.forEach(player => {
	if ((player.id != this.hubID) && // no need to check hub's public key again, since we've already verified their messages (also they don't send their public key in their player description because it would be another async call)
	    (player.id in window.profile.knownPlayers) &&
	    !deepEqual(player.publicKey, window.profile.knownPlayers.publicKey)
	   ) {
	  throw new Error("public key of player in setState doesn't match those in previous messages from the same sender");
	  // FIXME if the mismatched player is already a part of the game, this
	  // exception will cause this client to de-sync, and cause further
	  // errors down the line. maybe report the problem to the hub and
	  // disconnect?
	}
	window.profile.know(player);
	this.players[player.id] = { thing: player.thing };
      });
      this.router.setState(msg);
      hideWelcome();
      break;
    case 'addPlayer':
      var playerID = msg.player.id;
      var playerThing = this.router.newThing();
      var playerName = 'Anonymous';
      if (playerID == this.id) { // we just got added
	playerName = window.profile.handle;
      } else { // someone else just got added
        window.profile.know(msg.player);
	playerName = window.profile.knownPlayers[playerID].handle;
      }
      this.players[playerID] = {
	thing: playerThing
      };
      // NOTE: can't use addPlayer because we need playerThing first in order
      // to make the Interface
      this.router.add(playerThing, {
	Typed: new Typed({ type: Player }),
	Named: new Named({ name: playerName }),
	Interfaced: new Interfaced({ interface: new Interface(playerThing) })
      });
      break;
    case 'removePlayer':
      // TODO
      break;
    case 'press':
    case 'release':
      this.inputBuffer.push(msg);
      break;
    case 'clockTick':
      // call flushInputBuffer when the router is next truly idle
      if (this.router.isIdle()) {
	this.flushInputBuffer();
      } else {
	this.router.once('noMoreHits', this.flushInputBuffer.bind(this));
      }
      break;
    // TODO? more ops
    default:
      throw new Error('WTF');
  }
},

function flushInputBuffer() {
  this.inputBuffer.forEach(m => this.router.emit(m.op, m.player, m.code));
  this.inputBuffer.length = 0;
  this.router.emit('clockTick');
},

function localInput(op, player, code) {
  if (code == 'Backquote') { // special case for menu key
    if (op == 'press') {
      $('#menu').toggle();
    }
  } else {
    var msg = { op: op, player: player, code: code };
    if (this.id == this.hubID) {
      this.receivePeerMessageAsHub(msg);
    } else {
      this.connections[this.hubID].send(msg);
    }
  }
},

// send msg to all players (not necessarily all connections)
function broadcast(msg) {
  // send to everyone else
  for (var playerID in this.players) {
    if (playerID in this.connections && // should always be true, but whatever
        this.connections[playerID].isOpen) {
      this.connections[playerID].send(msg);
    }
  }
  // send to the non-hub part of self
  this.receivePeerMessageAsNonHub(msg);
}

]);

module.exports = Uplink;
