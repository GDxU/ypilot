const defineMethods = require('./define-methods.js');
const UserNames = require('./user-names.js');

function SignalingRelay(url, localUser, remoteUser) {
  this.url = url;
  this.localUser = UserNames.ensureValid(localUser);
  this.remoteUser = UserNames.ensureValid(remoteUser);
  this.writeBuffer = [];
  this.receive();
}

defineMethods(SignalingRelay, [

  function receive() {
    console.log('listening to ' + this.remoteUser + ' via signaling relay');
    var that = this;
    this.receiveXHR = new XMLHttpRequest();
    this.receiveXHR.onload = function() {
      try {
	var text = that.receiveXHR.responseText;
	console.log('received from ' + that.remoteUser + ' via signaling relay: ' + text);
	that.ondata(JSON.parse(text));
      } catch (err) {
	console.log(err.stack);
      }
      that.receive();
    };
    this.receiveXHR.onerror = function(e) {
      console.log(e);
    };
    this.receiveXHR.open('POST', this.url, true);
    this.receiveXHR.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    this.receiveXHR.send('k=' + this.remoteUser + '-' + this.localUser);
  },

  function sendBufferedMessages() {
    if (this.writeBuffer.length > 0) {
      var text = this.writeBuffer[0];
      var xhr = new XMLHttpRequest();
      // once we've sent this message, remove it from the buffer, and recurse
      // to send the rest of them
      var that = this;
      xhr.onload = function() {
	that.writeBuffer.shift();
        that.sendBufferedMessages();
      };
      xhr.onerror = function(e) { console.log(e); };
      console.log('sending to ' + this.remoteUser + ' via signaling relay: ' + text);
      xhr.open('POST', this.url, true);
      xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
      xhr.send(
	'k=' + this.localUser + '-' + this.remoteUser +
	'&m=' + encodeURIComponent(text)
      );
    }
  },

  function write(data) {
    var text = JSON.stringify(data);
    this.writeBuffer.push(text);
    // if we just pushed the only entry in the buffer, start
    // sendBufferedMessages
    if (this.writeBuffer.length == 1) {
      this.sendBufferedMessages();
    }
  },

  function close() {
    this.receiveXHR.abort();
  }

]);
 
module.exports = SignalingRelay;
