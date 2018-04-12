const defineMethods = require('./define-methods.js');
const SignalingRelay = require('./signaling-relay.js');
const PeerConnection = require('./peer-connection.js');

function Uplink(hubID) {
  this.id = window.profile.id;
  this.router = window.router;
  this.server = null; // SignalingRelay we listen for initial messages on
  this.client = null; // SignalingRelay we listen for handshakes on, and later reuse for WebRTC setup messages
  this.hubID = null; // player ID of the hub
  this.players = {}; // map IDs to player descriptions
  this.connections = {}; // map IDs to SignalingRelays or PeerConnections
}

Uplink.startNewGame = function() {
  var ul = new Uplink();
  ul.listen();
  return ul;
};

Uplink.askStatus = function(remoteID, callback) {
  var relay = new SignalingRelay($('#signaling-relay-url').val(), remoteID);
  relay.ondata(signedMsg => {
    window.profile.verifyTOFU(signedMsg, callback);
    relay.close(); // TODO somehow save this for later join?
  });
  window.profile.sign(
    { op: 'askStatus', replyTo: relay.recvID },
    relay.write.bind(relay)
  )
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
  window.profile.sign(
    { op: 'join', replyTo: this.client.recvID },
    this.client.write.bind(this.client)
  );
},

function listen() {
  this.server =
    new SignalingRelay($('#signaling-relay-url').val(), null, this.id);
  this.server.ondata = this.receiveInitialMessage.bind(this, this.server);
},

function receiveInitialMessage(relay, signedMsg) {
  window.profile.verifyTOFU(signedMsg, (msg) => {
    window.profile.ifAllowed(msg.sender.id, msg.op, () => {
      switch (msg.op) {
	case 'askStatus':
	  this.sendStatus(msg.sender.id, msg.replyTo);
	  break;
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
	    window.profile.loadGameFromURL(msg.configURL, () => {
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
    });
  });
},

function sendStatus(remoteID, sendID) {
  // send what game we're playing and with whom
  window.profile.sign({
    op: 'status',
    configURL: this.router.configURL,
    players: this.players // TODO put id/handle/publicKey here instead of playerThing?
  }, (signedMsg) => {
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
  window.profile.ifAllowed(msg.vouchee.id, 'join', () => {
    this.accept(msg.vouchee.id, msg.replyTo);
  });
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
  window.profile.sign(
    { op: 'handshake',
      replyTo: relay.recvID,
      configURL: this.router.configURL
    },
    relay.write.bind(relay)
  )
  // open a PeerConnection to the new player
  this.connect(remoteID);
  this.connections[remoteID].onopen = () => {
    // when it's open, send them the current game state
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
      // TODO add frame number to msg?
      this.broadcast(msg);
      break;
    // TODO? more ops
    default:
      throw new Error('WTF');
  }
},

function receivePeerMessageAsNonHub(senderID, msg) {
  switch (msg.op) {
    case 'setState':
      this.router.setState(msg);
      joinLoadedGame();
      break;
    case 'addPlayer':
      var playerID = msg.player.id;
      var playerThing = this.router.newThing();
      if (playerID == this.id) { // we just got added
	this.router.add(playerThing, {
	  Named: { name: window.profile.handle },
	  Local: { interface: new Interface(playerThing) }
	});
      } else { // someone else just got added
        window.profile.know(msg.player);
	this.router.add(playerThing, {
	  // TODO Type: Player? except we don't have Player in base.yp
	  Named: { name: window.profile.knownPlayers[playerID].handle },
	  // FIXME don't really need to expose the connection; also it might
	  // not exist since we might not be the hub
	  Remote: { connection: this.connections[playerID] }
	});
      }
      this.players[playerID] = {
	thing: playerThing
      };
      break;
    case 'removePlayer':
      // TODO
      break;
    case 'press':
    case 'release':
      this.router.emit(msg.op, msg.player, msg.code);
      break;
    // TODO? more ops
    default:
      throw new Error('WTF');
  }
},

// send msg to all players (not necessarily all connections)
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
