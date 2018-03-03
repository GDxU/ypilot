const defineMethods = require('./define-methods.js');
const UserNames = require('./user-names.js');

var peerConnections = {};
var collaborationHub = undefined;

function generateRandomName(inputID) {
  var name = UserNames.generateRandom();
  if (inputID) {
    var input = document.getElementById(inputID);
    if (/^remote-user-\d+-name$/.test(input.id)) {
      onFocusRemoteUserName(input);
      input.value = name;
      onChangeRemoteUserName(input);
    } else { // local user name
      input.value = name;
      onChangeLocal();
    }
  }
  return name;
}

function onFocusRemoteUserName(input) {
  input.oldValue = input.value;
}

function onChangeRemoteUserName(input) {
  var id = input.id.replace(/-name$/, '-uri');
  var uriInput = document.getElementById(id);
  if (UserNames.isValid(input.value) && UserNames.isValid(localUserName.value)) {
    uriInput.value = blankWhiteboardUri.value + '#' + input.value + '+' + localUserName.value;
  } else {
    uriInput.value = '';
  }
  if (collaborationHub == localUserName.value) {
    if (UserNames.isValid(input.value) && !UserNames.isValid(input.oldValue)) {
      // value became valid
      // open new peer connection
      if (!/^remote-user-(\d+)-name$/.test(input.id)) { throw new Error('WTF') }
      var i = parseInt(RegExp.lastParen);
      openPeerConnection(i, input.value);
      // notify all other users with addRemoteUser message
      broadcast({
	type: 'addRemoteUser',
	name: input.value,
	status: getUserStatus(input.value)
      }, input.value);
    } else if (UserNames.isValid(input.oldValue) &&
	       !UserNames.isValid(input.value)) {
      // value became invalid
      // close existing peer connection
      if (input.oldValue in peerConnections) {
	peerConnections[input.oldValue].close();
	delete peerConnections[input.oldValue];
      }
      // notify all other users with removeRemoteUser message
      broadcast({ type: 'removeRemoteUser', name: input.oldValue });
    } // TODO both old and new value valid: broadcast name change? really should only be able to change one's own name...
  }
  input.oldValue = input.value;
}

function onChangeLocal() {
  var input;
  for (var i = 1; input = document.getElementById('remote-user-' + i + '-name'); i++) {
    onChangeRemoteUserName(input);
  }
}

function addUserStatus(i, name, status) {
  var newLi = document.createElement('li');
  newLi.id = 'remote-user-' + i + '-status';
  newLi.className = status;
  var span = document.createElement('span');
  span.appendChild(document.createTextNode(name));
  newLi.appendChild(span);
  userStatusList.appendChild(newLi);
}

function addUser(name, status) {
  // get next remote user index
  var lastRemoteUserLi = addRemoveUserLi.previousElementSibling;
  var i = 0;
  if (lastRemoteUserLi && /^remote-user-(\d+)-li$/.test(lastRemoteUserLi.id)) {
    i = parseInt(RegExp.lastParen);
  }
  i++;
  // add to user name input list
  var newUserHTML = remoteUsers.firstElementChild.outerHTML.
    replace(/id="remote-user-1-/g, 'id="remote-user-' + i + '-').
    replace(/-1-name'\)">/g, '-' + i + "-name')\">");
  var newLi = document.createElement('li');
  remoteUsers.insertBefore(newLi, addRemoveUserLi);
  newLi.outerHTML = newUserHTML;
  var newUserNameInput = document.getElementById('remote-user-' + i + '-name');
  newUserNameInput.oldValue = '';
  newUserNameInput.value = (name ? name : '');
  if (name) {
    addUserStatus(i, name, (status || 'disconnected'));
  }
  onChangeRemoteUserName(newUserNameInput);
}

function forEachRemoteUser(fn, includeEmpty) {
  var i;
  var remoteUserNameInput;
  for (i = 1;
       (remoteUserNameInput =
	 document.getElementById('remote-user-' + i + '-name')) &&
       (includeEmpty || remoteUserNameInput.value.length > 0);
       i++) {
    if (!fn(i, remoteUserNameInput.value, remoteUserNameInput)) {
      return false;
    }
  }
  return true;
}

function indexOfRemoteUser(name) {
  var index = -1;
  forEachRemoteUser(function(i, nm) {
    if (nm == name) {
      index = i;
      return false; // break
    }
    return true;
  });
  return index;
}

function removeUser(name) {
  var i = 0;
  var remoteUserLi = undefined;
  if (name) {
    // if a name was given, find the input with that name as the value
    i = indexOfRemoteUser(name);
    if (i > -1) { // if found, get the corresponding li
      remoteUserLi = document.getElementById('remote-user-' + i + '-li');
    }
    // FIXME? if we remove a user from the middle, the indexes in the IDs and on the list item markers will become out of sync. do I care?
  } else {
    // if no name was given, get the last user name and li
    remoteUserLi = addRemoveUserLi.previousElementSibling;
    if (remoteUserLi && /^remote-user-(\d+)-li$/.test(remoteUserLi.id)) {
      i = parseInt(RegExp.lastParen);
      var remoteUserNameInput =
	document.getElementById('remote-user-' + i + '-name');
      name = remoteUserNameInput.value;
    }
  }
  if (remoteUserLi) { // found a user to remove
    // shut down the user's connection if it exists
    if (name in peerConnections) {
      peerConnections[name].close();
      delete peerConnections[name];
    }
    // remove the li
    remoteUsers.removeChild(remoteUserLi);
    // remove the user status li too
    var statusLi = document.getElementById('remote-user-' + i + '-status');
    userStatusList.removeChild(statusLi);
    // if we're the hub, tell others to remove the user as well
    if (collaborationHub == localUserName.value) {
      broadcast({ type: 'removeRemoteUser', name: name});
    }
  }
}

function setUserStatus(name, status) {
  var i = indexOfRemoteUser(name);
  var statusLi = document.getElementById('remote-user-' + i + '-status');
  statusLi.className = status;
  // if we're the hub, broadcast the status change to everyone else
  if (collaborationHub == localUserName.value) {
    broadcast({
      type: 'userStatus',
      name: name,
      status: status
    }, name);
  }
}

function getUserStatus(name) {
  var i = indexOfRemoteUser(name);
  if (i < 0) { return 'disconnected'; }
  var statusLi = document.getElementById('remote-user-' + i + '-status');
  if (!statusLi) { return 'disconnected'; }
  return statusLi.className;
}

function showCollaborationBar() {
  show(collaborationBar);
  // move bottom of svg up to make room for height of collaboration bar
  svgContainer.style.setProperty('bottom', getComputedStyle(collaborationBar).getPropertyValue('height'));
}

function hideCollaborationBar() {
  hide(collaborationBar);
  svgContainer.style.setProperty('bottom', 0);
}

function openPeerConnection(index, remoteUser) {
  var pc = new PeerConnection(remoteUser);
  pc.onopen = onPeerConnectionOpen;
  pc.onmessage = onmessage;
  pc.onclose = onPeerConnectionClose;
  pc.open();
  addUserStatus(index, remoteUser, 'disconnected');
}

function startCollaborating(hub) {
  if (collaborationHub) { // already collaborating
    return;
  }
  if (hub) { // they're the hub
    collaborationHub = hub;
    // only connect to them
    openPeerConnection(1 /* assumed */, collaborationHub);
  } else { // we're the hub
    collaborationHub = localUserName.value;
    // connect to all remote users
    var remoteUserNameInput = undefined;
    forEachRemoteUser(function(i, name) {
      openPeerConnection(i, name);
      return true;
    });
  }
  showCollaborationBar();
}

function stopCollaborating() {
  for (k in peerConnections) {
    peerConnections[k].close();
  }
  peerConnections = {};
  collaborationHub = undefined;
  hideCollaborationBar();
}

function restoreDefaultSettings() {
  signalingRelayUri.value = "https://ssl.uofr.net/~willdb/cgi-bin/relay.pl";
  iceServers.value =
    "[\n" +
    "{\"urls\":\"stun:stun.ekiga.net\"},\n" +
    "{\"urls\":\"stun:stun.iptel.org\"},\n" +
    "{\"urls\":\"stun:stun.l.google.com:19302\"},\n" +
    "{\"urls\":\"stun:stun1.l.google.com:19302\"},\n" +
    "{\"urls\":\"stun:stun2.l.google.com:19302\"},\n" +
    "{\"urls\":\"stun:stun3.l.google.com:19302\"},\n" +
    "{\"urls\":\"stun:stun4.l.google.com:19302\"},\n" +
    "{\n" +
    "        \"urls\": \"turn:numb.viagenie.ca\",\n" +
    "        \"credential\": \"muazkh\",\n" +
    "        \"username\": \"webrtc@live.com\"\n" +
    "}\n" +
    "]";
  enableSignalingFallback.checked = false;
}

//// PeerConnection ////

RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate;

function PeerConnection(remoteUser) {
  this.remoteUser = remoteUser;
  this.localUser = localUserName.value;
  // if we're alphabetically first, we're the one to create the data channel
  this.shouldCreateChannel =
    (this.remoteUser.localeCompare(this.localUser, 'en') > 0);
  this.iceServers = JSON.parse(iceServers.value);
  this.isOpen = false;
  this.fellBack = false;
  peerConnections[remoteUser] = this;
}

defineMethods(PeerConnection, [

  function open() {
    this.relay = new SignalingRelay(
      signalingRelayUri.value, this.localUser, this.remoteUser);
    this.relay.ondata = this.onRelayData.bind(this);
    this.relay.write({ handshake: true });
  },

  function send(msg) {
    if (this.fellBack) {
      this.relay.write(msg);
    } else {
      msg = JSON.stringify(msg);
      console.log('sending to ' + this.remoteUser + ' via data channel: ' + msg);
      this.dataChannel.send(msg);
    }
  },

  function close() {
    this.isOpen = false;
    if (this.relay) {
      this.relay.close();
      delete this.relay;
    }
    if (this.rtcpc) {
      this.rtcpc.close();
      delete this.rtcpc;
    }
    if (this.dataChannel) {
      this.dataChannel.close();
      delete this.dataChannel;
    }
  },

  function logError(e) {
    //console.log(e.name + ': ' + e.message);
    console.log(e);
  },

  function onRelayData(data) {
    if (this.fellBack) {
      // TODO try-catch?
      this.onmessage(data);
      this.rebroadcastIfHub(data);
    } else if (data.fellBack) {
      this.fellBack = true;
    } else if (data.handshake || !this.rtcpc) {
      this.onHandshake();
    } else if (data.desc) {
      var desc = data.desc;
      switch (desc.type) {
	case 'offer':
	  var that = this;
	  /* how the spec does it, vs. Chrome's legacy interface
	  this.rtcpc.setRemoteDescription(new RTCSessionDescription(desc)).
	  then(function() {
	    console.log('setRemoteDescription then');
	    return that.rtcpc.createAnswer();
	  }).then(function(answer) {
	    console.log('setRemoteDescription then then');
	    return that.rtcpc.setLocalDescription(answer);
	  }).then(function() {
	    console.log('setRemoteDescription then then then');
	    that.relay.write({ desc: that.rtcpc.localDescription });
	  }).catch(this.logError.bind(this));
	   */
	  this.rtcpc.setRemoteDescription(new RTCSessionDescription(desc), function() {
	    console.log('setRemoteDescription success');
	    that.rtcpc.createAnswer(function(answer) {
	      console.log('createAnswer success');
	      that.rtcpc.setLocalDescription(answer, function() {
		console.log('setLocalDescription success');
		that.relay.write({ desc: that.rtcpc.localDescription });
	      }, that.logError.bind(that));
	    }, that.logError.bind(that));
	  }, this.logError.bind(this));
	  break;
	case 'answer':
	  this.rtcpc.setRemoteDescription(new RTCSessionDescription(desc)
	  /* ).catch( */ , function() {}, // spec vs. legacy
	  this.logError.bind(this));
	  break;
	default:
	  log("Unsupported SDP type.");
      }
    } else {
      this.rtcpc.addIceCandidate(new RTCIceCandidate(data.candidate)
      /* ).catch( */ , function() {}, // spec vs. legacy
      this.logError.bind(this));
    }
  },

  function onHandshake() {
    this.rtcpc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.rtcpc.onicecandidate = this.onicecandidate.bind(this);
    this.rtcpc.onnegotiationneeded = this.onnegotiationneeded.bind(this);
    this.rtcpc.ondatachannel = this.ondatachannel.bind(this);
    this.rtcpc.onconnectionstatechange =
      this.oniceconnectionstatechange.bind(this);
    if (this.shouldCreateChannel) {
      this.dataChannel = this.rtcpc.createDataChannel(this.remoteUser);
      this.dataChannel.onopen =
        this.onDataChannelOpen.bind(this);
    }
  },

  function oniceconnectionstatechange(e) {
    if (this.rtcpc.iceConnectionState == 'failure') {
      this.onFailure();
    }
  },

  function onFailure() {
    if (enableSignalingFallback.checked) {
      this.fellBack;
      this.relay.write({ fellBack: true });
    }
  },

  function onicecandidate(e) {
    console.log('onicecandidate');
    if (e.candidate) {
      if (this.relay) {
        this.relay.write({ candidate: e.candidate });
      } else {
	console.log('no relay (anymore?)');
      }
    } else {
      console.log('null candidate');
    }
  },

  function onnegotiationneeded(e) {
    console.log('onnegotiationneeded');
    var that = this;
    /* This is how the WebRTC spec and Firefox do it, but Chrome only allows
     * the "legacy" interface, so we use that instead.
    this.rtcpc.createOffer().then(function(offer) {
      console.log('createOffer then');
      return that.rtcpc.setLocalDescription(offer);
    }).then(function() {
      console.log('createOffer then then');
      that.relay.write({ desc: that.rtcpc.localDescription });
    }).catch(this.logError.bind(this));
     */
    this.rtcpc.createOffer(function(offer) {
      console.log('createOffer success');
      that.rtcpc.setLocalDescription(offer, function() {
	console.log('setLocalDescription success');
	that.relay.write({ desc: that.rtcpc.localDescription });
      }, that.logError.bind(that));
    }, this.logError.bind(this));
  },

  function ondatachannel(e) {
    console.log('got data channel from ' + this.remoteUser);
    this.dataChannel = e.channel;
    this.dataChannel.onopen = this.onDataChannelOpen.bind(this);
  },

  function onDataChannelOpen(e) {
    console.log('connected to ' + this.remoteUser);
    this.relay.close();
    delete this.relay;
    this.dataChannel.onmessage = this.onDataChannelMessage.bind(this);
    var that = this;
    this.dataChannel.onclose = function() {
      that.isOpen = false;
      that.onclose();
    };
    this.isOpen = true;
    this.onopen();
  },

  function onDataChannelMessage(e) {
    var data = e.data.toString();
    console.log('received from ' + this.remoteUser + ' via data channel: ' + data);
    try {
      console.log('attempting to parse...');
      data = JSON.parse(data);
      console.log('parsed as: ' + JSON.stringify(data));
      this.onmessage(data);
      this.rebroadcastIfHub(data);
    } catch (err) {
      this.logError(err);
    }
  },

  function rebroadcastIfHub(data) {
    if (collaborationHub == this.localUser) { // if we're the hub
      // rebroadcast the message to everyone except the user we got it from
      broadcast(data, this.remoteUser);
    }
  }

]);

function broadcast(msg, exceptUser) {
  for (var remoteUser in peerConnections) {
    if (remoteUser != exceptUser && peerConnections[remoteUser].isOpen) {
      peerConnections[remoteUser].send(msg);
    }
  }
}

function onPeerConnectionOpen() {
  // send all objects in our document
  // first anchor selection down to doc
  anchorSelection();
  // then make sure all doc children have IDs
  var cs = doc.childNodes;
  for (var i = cs.length-1; i >= 0; i--) {
    if (cs[i] instanceof Element) {
      ensureID(cs[i]);
    }
  }
  // then send doc's innerHTML
  this.send({ type: 'addObjects', outerHTML: doc.innerHTML });
  // send list of other users if we're the hub
  if (collaborationHub == this.localUser) {
    var that = this;
    forEachRemoteUser(function(i, name) {
      if (name != that.remoteUser) {
	that.send({
	  type: 'addRemoteUser',
	  name: name,
	  status: getUserStatus(name)
	});
      }
      return true;
    });
  }
  setIdleTimeout(this);
}

function setIdleTimeout(pc) {
  setUserStatus(pc.remoteUser, 'active');
  if (pc.idleTimeout) {
    clearTimeout(pc.idleTimeout);
  }
  pc.idleTimeout = setTimeout(onPeerConnectionIdle.bind(pc), 60000); // 1m
}

function onPeerConnectionIdle() {
  setUserStatus(this.remoteUser, 'inactive');
  this.idleTimeout = undefined;
}

function onPeerConnectionClose() {
  if (collaborationHub == this.localUser) {
    setUserStatus(this.remoteUser, 'disconnected');
  } else { // we're not the hub, we must've disconnected from the hub
    forEachRemoteUser(function(i, name) {
      setUserStatus(name, 'disconnected');
      return true;
    });
  }
  if (this.idleTimeout) {
    clearTimeout(this.idleTimeout);
  }
}

function addToTextChatHistory(sender, message) {
  var time = (new Date()).toLocaleTimeString(undefined,
    { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  textChatHistory.appendChild(document.createTextNode(time + ' '));
  var b = document.createElement('b');
  // TODO assign colors to users?
  if (/^\/me /.test(message)) {
    b.appendChild(document.createTextNode('* ' + sender));
    message = RegExp.rightContext;
  } else {
    b.appendChild(document.createTextNode('<' + sender + '>'));
  }
  textChatHistory.appendChild(b);
  textChatHistory.appendChild(document.createTextNode(' ' + message));
  textChatHistory.appendChild(document.createElement('br'));
  // scroll to bottom
  textChatHistory.scrollTop = textChatHistory.scrollHeight;
}

function onmessage(data) {
  setIdleTimeout(this);
  console.log('data.type = ' + data.type);
  switch (data.type) {
    case 'chat':
      addToTextChatHistory(data.sender, data.message);
      break;
    case 'addRemoteUser':
      addUser(data.name, data.status);
      break;
    case 'removeRemoteUser':
      removeUser(data.name);
      break;
    case 'userStatus':
      setUserStatus(data.name, data.status);
      break;
    default:
      receiveStep(data);
  }
}

function onTextChatInputKeyUp(e) {
  if (e.keyCode == 13) {
    e.preventDefault();
    broadcast({
      type: 'chat',
      sender: localUserName.value,
      message: textChatInput.value
    });
    addToTextChatHistory(localUserName.value, textChatInput.value);
    textChatInput.value = '';
  }
}

module.exports = PeerConnection;
