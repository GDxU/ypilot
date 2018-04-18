const defineMethods = require('./define-methods.js');
const $ = require('jquery');

RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription;
RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate;

function PeerConnection(relay) {
  this.relay = relay;
  this.relay.ondata = this.onRelayData.bind(this);
  this.iceServers = JSON.parse($('#ice-servers').val());
  this.isOpen = false;
  this.rtcpc = new RTCPeerConnection({ iceServers: this.iceServers });
  this.rtcpc.onicecandidate = this.onicecandidate.bind(this);
  this.rtcpc.onnegotiationneeded = this.onnegotiationneeded.bind(this);
  this.rtcpc.ondatachannel = this.ondatachannel.bind(this);
  this.rtcpc.onconnectionstatechange =
    this.oniceconnectionstatechange.bind(this);
}

defineMethods(PeerConnection, [

  // to be called by the non-hub player after receiving the handshake initial
  // message and loading the .yp file
  function createDataChannel() {
    this.dataChannel =
      this.rtcpc.createDataChannel(this.relay.sendID + ',' + this.relay.recvID);
    this.dataChannel.onopen =
      this.onDataChannelOpen.bind(this);
  },

  function send(msg) {
    msg = JSON.stringify(msg);
    this.dataChannel.send(msg);
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
    console.error(e);
  },

  function onRelayData(data) {
    switch (data.op) {
      case 'offer':
        var desc = data.description;
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
	  that.relay.write({ op: 'answer', description: that.rtcpc.localDescription });
	}).catch(this.logError.bind(this));
	 */
	this.rtcpc.setRemoteDescription(new RTCSessionDescription(desc), function() {
	  console.log('setRemoteDescription success');
	  that.rtcpc.createAnswer(function(answer) {
	    console.log('createAnswer success');
	    that.rtcpc.setLocalDescription(answer, function() {
	      console.log('setLocalDescription success');
	      that.relay.write({ op: 'answer', description: that.rtcpc.localDescription });
	    }, that.logError.bind(that));
	  }, that.logError.bind(that));
	}, this.logError.bind(this));
	break;
      case 'answer':
        var desc = data.description;
	this.rtcpc.setRemoteDescription(new RTCSessionDescription(desc)
	/* ).catch( */ , function() {}, // spec vs. legacy
	this.logError.bind(this));
	break;
      case 'addCandidate':
	this.rtcpc.addIceCandidate(new RTCIceCandidate(data.candidate)
	/* ).catch( */ , function() {}, // spec vs. legacy
	this.logError.bind(this));
	break;
      default:
        this.logError("invalid WebRTC setup message op");
    }
  },

  function oniceconnectionstatechange(e) {
    if (this.rtcpc.iceConnectionState == 'failure') {
      this.onFailure();
    }
  },

  function onFailure() {
    // TODO?
  },

  function onicecandidate(e) {
    console.log('onicecandidate');
    if (e.candidate) {
      if (this.relay) {
        this.relay.write({ op: 'addCandidate', candidate: e.candidate });
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
      that.relay.write({ op: 'offer', description: that.rtcpc.localDescription });
    }).catch(this.logError.bind(this));
     */
    this.rtcpc.createOffer(function(offer) {
      console.log('createOffer success');
      that.rtcpc.setLocalDescription(offer, function() {
	console.log('setLocalDescription success');
	that.relay.write({ op: 'offer', description: that.rtcpc.localDescription });
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
    } catch (err) {
      this.logError(err);
    }
  },

]);

module.exports = PeerConnection;
