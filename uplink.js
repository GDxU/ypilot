const $ = require('jquery');
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
    ul.receivePeerMessageAsNonHub(ul.id, {
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
  this.flushInputBuffer();
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
	  // load the .yp file
	  return window.profile.loadGameFromURL(msg.configURL).
	  then(() => {
	    this.client.sendID = msg.replyTo;
	    // wrap the relay as a PeerConnection in place
	    this.connect(remoteID);
	    // initiate creating the data channel since we're the client
	    this.connections[remoteID].createDataChannel();
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

function sendStatus(remoteID, sendID) {
  // compile list of players we're playing with, with information from profile
  var players = [];
  for (var id in this.players) {
    if (id == this.id) {
      players.push({
	id: id,
	handle: window.profile.handle,
	/* publicKey: TODO? */
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
  // send what game we're playing and with whom
  return window.profile.sign({
    op: 'status',
    configURL: this.router.configURL,
    players: players
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
    // when it's open, send them the current game state
    // TODO also send current player info as in sendStatus
    this.connections[remoteID].send(
      Object.assign({ op: 'setState' }, this.router.getState())
    );
    // and tell everyone (including the remote player and ourselves) to add the
    // new player to the game
    this.broadcast({
      op: 'addPlayer',
      player: {
	id: remoteID,
	handle: window.profile.knownPlayers[remoteID].handle,
	publicKey: window.profile.knownPlayers[remoteID].publicKey
      }
    });
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
    this.receivePeerMessageAsHub(senderID, msg);
  } else {
    this.receivePeerMessageAsNonHub(senderID, msg);
  }
},

function receivePeerMessageAsHub(senderID, msg) {
  switch (msg.op) {
    case 'vouch':
      this.receiveVoucher(msg);
      break;
    case 'press':
    case 'release':
      this.broadcast(msg);
      this.inputBuffer.push(msg);
      break;
    // TODO? more ops
    default:
      throw new Error('WTF');
  }
},

function receivePeerMessageAsNonHub(senderID, msg) {
  switch (msg.op) {
    case 'setState':
      // TODO get player info from msg, and profile.know() each player
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
      this.router.add(playerThing, {
	Typed: { type: Player },
	Named: { name: window.profile.handle },
	Interfaced: { interface: new Interface(playerThing) }
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
      this.flushInputBuffer();
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
  var msg = { op: op, player: player, code: code };
  if (this.id == this.hubID) {
    this.receivePeerMessageAsHub(this.id, msg);
  } else {
    this.connections[this.hubID].send(msg);
  }
},

// send msg to all players (not necessarily all connections)
// FIXME should this send to the local player (as non-hub)? currently it doesn't
function broadcast(msg) {
  for (var playerID in this.players) {
    if (playerID in this.connections && // should always be true, but whatever
        this.connections[playerID].isOpen) {
      this.connections[playerID].send(msg);
    }
  }
}

]);

module.exports = Uplink;
