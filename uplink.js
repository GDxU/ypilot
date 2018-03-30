const defineMethods = require('./define-methods.js');
const SignalingRelay = require('./signaling-relay.js');
const PeerConnection = require('./peer-connection.js');

function Uplink(hubID) {
  this.id = window.profile.id;
  this.router = window.router;
  this.hubID = hubID;
  this.connections = {};
  if (id != hubID) {
    this.connect(hubID);
  }
  // NOTE: we listen even if we're not the hub, because we want to let people
  // join through us (if we vouch for them to the hub)
  this.listen();
}

defineMethods(Uplink, [

function listen() {
  this.server =
    new SignalingRelay($('#signaling-relay-url').val(), null, this.id);
  this.server.ondata = this.receiveInitialMessage.bind(this);
},

function receiveInitialMessage(signedMsg) { // FIXME we get a parsed message,
  window.profile.verifyTOFU(signedMsg, (msg) => { // but verify wants a string
    window.profile.ifAllowed(msg.sender.id, msg.op, () => {
      switch (msg.op) {
	case 'askStatus':
	  this.sendStatus(msg.replyTo);
	  break;
	case 'join':
	  if (this.id == this.hubID) {
	    this.accept(msg.sender.id, msg.replyTo);
	  } else {
	    this.vouch(msg);
	  }
	  break;
	default:
	  throw new Error('WTF');
      }
    });
  });
},

function sendStatus(sendID) {
  // TODO send what game we're playing and with whom
},

function vouch(msg) {
  // TODO forward msg to hub
},

function receiveVoucher(msg) {
  // TODO as hub, check ifAllowed join, then accept
},

function accept(remoteID, sendID) {
  // TODO set up remote player to join the game we're the hub of
},

function connect(remoteID, sendID, recvID) {
  var relay =
    new SignalingRelay($('#signaling-relay-url').val(), sendID, recvID);
  this.connections[remoteID] = new PeerConnection(relay);
  this.connections[remoteID].ondata = this.receiveMessage.bind(this, remoteID);
},

function receiveMessage(senderID, msg) {
  // TODO
}

]);

module.exports = Uplink;
