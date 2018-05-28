const $ = require('jquery');
const deepEqual = require('deep-equal');
const defineMethods = require('./define-methods.js');
const SignalingRelay = require('./signaling-relay.js');
const PeerConnection = require('./peer-connection.js');
const Clock = require('./clock.js');
const Game = require('./game.js');
const Chat = require('./chat.js');

function Uplink(hubID) {
  this.id = window.profile.id;
  this.router = window.router;
  this.server = null; // SignalingRelay we listen for initial messages on
  this.client = null; // SignalingRelay we listen for handshakes on, and later reuse for WebRTC setup messages
  this.hubID = null; // player ID of the hub
  this.players = {}; // map IDs to player descriptions
  this.connections = {}; // map IDs to SignalingRelays or PeerConnections
  this.inputBuffer = []; // hub->nonhub messages since the last clockTick
  this.newPlayerQueue = []; // (hub only) new players to be added next tick
  this.numTicks = 0;
  // all clock ticks we've received so far have actually been flushed to the
  // router
  this.allTicksFlushed = true;
  this.chatShown = false;
}

Uplink.startNewGame = function() {
  var ul = new Uplink();
  ul.hubID = ul.id; // we're the hub since we're the only player so far
  ul.listen();
  Clock.start(ul.clockTick.bind(ul));
  window.profile.getPlayerDescription().
  then(playerDesc => {
    ul.newPlayerQueue.push(playerDesc);
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
  this.broadcast({ op: 'clockTick', numTicks: this.numTicks });
  this.numTicks++;
},

// if there are new players waiting to be added, add the first one
function maybeAddNewPlayer() {
  // send setState to the next new player, and addPlayer to all players for
  // the new player (this should take effect at the beginning of next tick)
  // NOTE: we don't do multiple setState/addPlayers per tick, since each one
  // affects the game state we're sending to the subsequent ones, and causes
  // events to be emitted, so we need to wait for the game state to settle
  // before sending another setState/addPlayer
  if (this.newPlayerQueue.length > 0) {
    var player = this.newPlayerQueue.shift();
    if (this.id != player.id) { // this is some other player, not us
      console.log('sending setState to ' + player.id);
      var setState =
	Object.assign({ op: 'setState', players: this.getPlayerList() },
		      this.router.getState());
      this.connections[player.id].send(setState);
    }
    if (!(player.id in this.players)) { // not a rejoin after hub change
      console.log('sending addPlayer for ' + player.id);
      var addPlayer = { op: 'addPlayer', player: player };
      // NOTE: player is only fully added when 'addPlayer' is *dispatched* at
      // the next clock tick, but we must add something to this.players here so
      // that broadcast will send 'addPlayer' and all subsequent messages to
      // the new player
      this.players[player.id] = {};
      this.broadcast(addPlayer);
    }
  }
},

function receiveInitialMessage(relay, signedMsg) {
  window.profile.verifyTOFU(signedMsg).
  then(msg => {
    if (msg.op == 'join' && msg.sender.id in this.players) {
      return msg; // skip ifAllowed for rejoin after hub disconnect
    } else {
      return window.profile.ifAllowed(msg.sender.id, msg.op).then(() => msg);
    }
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
	    this.connections[remoteID] = relay; // in case this handshake is from a hub that isn't the player we initially asked to join (they vouched for us)
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
      // NOTE: we use unshift instead of push to put ourself first, because
      // someone asking our status will then use the first player (us) to join
      // the game, so we can vouch for them
      players.unshift({
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

function receiveVoucher(senderID, msg) {
  // as hub, check ifAllowed join, then accept
  window.profile.know(msg.vouchee); // FIXME should we really just blindly accept the vouchee's credentials from the 3rd-party vouch-er?
  window.profile.ifAllowed(msg.vouchee.id, 'join', senderID).
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
      // add the new player to the queue of players to be added on subsequent
      // clock ticks
      this.newPlayerQueue.push({
	id: remoteID,
	handle: window.profile.knownPlayers[remoteID].handle,
	publicKey: window.profile.knownPlayers[remoteID].publicKey
      });
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
  this.connections[remoteID].onclose =
    this.onPeerConnectionClose.bind(this, remoteID);
},

function receivePeerMessage(senderID, msg) {
  if (this.id == this.hubID) {
    this.receivePeerMessageAsHub(senderID, msg);
  } else {
    this.receivePeerMessageAsNonHub(msg);
  }
},

function receivePeerMessageAsHub(senderID, msg) {
  switch (msg.op) {
    case 'vouch':
      this.receiveVoucher(senderID, msg);
      break;
    case 'press':
    case 'release':
    case 'chat':
    case 'removePlayer':
      this.broadcast(msg);
      break;
    // TODO? more ops
    default:
      throw new Error('WTF');
  }
},

function receivePeerMessageAsNonHub(msg) {
  this.inputBuffer.push(msg);
  if (this.allTicksFlushed && msg.op == 'clockTick') {
    // we thought we had flushed all ticks, but we just got another
    this.allTicksFlushed = false;
    this.maybeFlushOneTick();
  }
},

function maybeFlushOneTick() {
  try {
    var clockTickIndex = this.inputBuffer.findIndex(m => (m.op == 'clockTick'));
    if (clockTickIndex != -1) {
      // shift all the messages for this tick out of the input buffer
      // (including the clockTick message itself)
      var thisTickMsgs = this.inputBuffer.splice(0, clockTickIndex+1);
      // dispatch all the messages for this tick
      thisTickMsgs.forEach(this.dispatchPeerMessageAsNonHub.bind(this));
      // try this function again after the all the effects of those messages
      // settle out
      this.router.once('noMoreHits', this.maybeFlushOneTick.bind(this));
    } else { // no more clockTicks in inputBuffer
      this.allTicksFlushed = true;
      // We can only add a new player between ticks; the router must be truly
      // idle, the input buffer must be empty, and a clockTick must be the last
      // message sent hub->nonhub. This way, the state we send to the new
      // player is consistent, and everyone sees the addPlayer message as the
      // first one in the next tick (except the added player, who sees setState
      // first).
      if (this.inputBuffer.length == 0) {
        this.maybeAddNewPlayer();
      }
    }
  } catch (err) {
    console.error(err);
  }
},

function dispatchPeerMessageAsNonHub(msg) {
  switch (msg.op) {
    case 'setState':
      console.log('received setState');
      // get player info from msg, and profile.know() each player after
      // checking for public key mismatches
      msg.players.forEach(player => {
	if ((player.id != this.hubID) && // no need to check hub's public key again, since we've already verified their messages (also they don't send their public key in their player description because it would be another async call)
	    (player.id in window.profile.knownPlayers) &&
	    !deepEqual(player.publicKey,
	               window.profile.knownPlayers[player.id].publicKey)
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
      console.log('received addPlayer ' + playerID);
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
      Chat.appendToHistory(playerID, playerName, '/me just joined the game');
      break;
    case 'removePlayer':
      this.router.remove(msg.player.thing);
      delete this.players[msg.player.id];
      delete this.connections[msg.player.id]; // in case we're the hub
      break;
    case 'press':
    case 'release':
      this.router.emit(msg.op, msg.player, msg.code);
      break;
    case 'clockTick':
      if (this.numTicks < msg.numTicks) {
	this.numTicks = msg.numTicks;
      }
      this.router.emit('clockTick', msg.numTicks);
      break;
    case 'chat':
      // FIXME need a better way to get speaker's player ID
      var speakerID = 'ffffff'; // default to white if not found
      for (var id in this.players) {
	if (this.players[id].thing == msg.player) {
	  speakerID = id;
	  break;
	}
      }
      var speakerName = router.adjectives.Named[msg.player].name;
      Chat.appendToHistory(speakerID, speakerName, msg.text);
      break;
    // TODO? more ops
    default:
      throw new Error('WTF');
  }
},

// return the next hub ID: the ID of the non-hub player with the smallest thing
// number
function nextHubID() {
  var minThing = router.nextThing;
  var minThingPlayerID = undefined;
  for (var id in this.players) {
    if (id != this.hubID && this.players[id].thing < minThing) {
      minThing = this.players[id].thing;
      minThingPlayerID = id;
    }
  }
  return minThingPlayerID;
},

function onPeerConnectionClose(remoteID) {
  // replace the closed connection with a dummy whose send() does nothing,
  // instead of throwing an error
  this.connections[remoteID] = { send: function() {} };
  if (remoteID == this.hubID) { // we're not the hub, the hub disconn'd
    this.hubID = this.nextHubID();
    if (this.id == this.hubID) { // become the new hub
      // all we have to do for now is start our own clock; other players will
      // contact us to rejoin in their own time
      // TODO what if they never do? should have a timeout
      Clock.start(this.clockTick.bind(this));
    } else { // reconnect to the new hub
      this.join(this.hubID);
    }
  }
  if (this.id == this.hubID) {
    // either we were the hub, and a non-hub player disconnected, or we are now
    // the hub, and the hub disconnected; either way:
    // make a removePlayer message
    var p = window.profile.knownPlayers[remoteID];
    this.receivePeerMessageAsHub(remoteID,
      { op: 'removePlayer',
	player: {
	  id: remoteID,
	  handle: p.handle,
	  publicKey: p.publicKey,
	  thing: this.players[remoteID].thing
	}
      }
    );
  }
  // else we're not the hub; if we disconnected from another non-hub player,
  // that's fine, we weren't supposed to be connected anyway
},

function showChatInput() {
  this.chatShown = true;
  Chat.showInput();
},

function hideChatInput() {
  this.chatShown = false;
  Chat.hideInput();
},

function sendChatMessage() {
  var player = this.players[this.id].thing;
  var msg = { op: 'chat', player: player, text: Chat.inputVal() };
  this.hideChatInput();
  if (this.id == this.hubID) {
    this.receivePeerMessageAsHub(this.id, msg);
  } else {
    this.connections[this.hubID].send(msg);
  }
},

function localInput(op, player, code) {
  if (code == 'Escape') { // general cancel key
    if (op == 'press') {
      $('#menu').hide();
      this.hideChatInput();
    }
  }
  if (Chat.inputFocused()) {
    if (code == 'Enter' && op == 'release') {
      this.sendChatMessage();
    }
    return;
  }
  switch (code) {
    case 'Backquote': // menu key
      if (op == 'press') {
	$('#menu').toggle();
      }
      break;
    case 'KeyM': // chat key
      if (op == 'release') { // release not press, so we don't type 'm' in chat
	if (this.chatShown) {
	  this.hideChatInput();
	} else {
	  this.showChatInput();
	}
      }
      break;
    default: // ship controls (general case)
      var msg = { op: op, player: player, code: code };
      if (this.id == this.hubID) {
	this.receivePeerMessageAsHub(this.id, msg);
      } else {
	this.connections[this.hubID].send(msg);
      }
  }
},

// send msg to all players (not necessarily all connections)
function broadcast(msg) {
  // send to everyone else
  for (var playerID in this.players) {
    if (playerID in this.connections &&
        this.connections[playerID].isOpen) {
      this.connections[playerID].send(msg);
    }
  }
  this.receivePeerMessageAsNonHub(msg);
}

]);

module.exports = Uplink;
