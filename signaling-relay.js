const defineMethods = require('./define-methods.js');
const uuidv4 = require('uuid/v4');

function SignalingRelay(url, sendID, recvID) {
  this.url = url;
  this.recvID = (recvID || uuidv4());
  this.sendID = sendID;
  this.writeBuffer = [];
  this.isOpen = true;
  this.receive();
  // FIXME I hate that I have to use this beforeunload mechanism, but I have to
  // buy time for the write(null) to happen (it doesn't if the tab closes
  // immediately)
  this.boundClose = (evt) => {
    this.close();
    evt.returnValue = 'sorry, I have to do this in order to close the signaling relay';
    return evt.returnValue;
  };
  window.addEventListener('beforeunload', this.boundClose);
}

defineMethods(SignalingRelay, [

  function receive() {
//    console.log('listening to ' + this.recvID + ' via signaling relay');
    var that = this;
    this.receiveXHR = new XMLHttpRequest();
    this.receiveXHR.onload = function() {
      try {
	var text = that.receiveXHR.responseText;
//	console.log('received from ' + that.recvID + ' via signaling relay: ' + text);
	that.ondata(JSON.parse(text));
      } catch (err) {
	console.error(err);
      }
      if (that.isOpen) {
	that.receive();
      }
    };
    this.receiveXHR.onerror = function(e) {
      console.log(e);
    };
    this.receiveXHR.open('POST', this.url, true);
    this.receiveXHR.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    this.receiveXHR.send('k=' + this.recvID);
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
//      console.log('sending to ' + this.sendID + ' via signaling relay: ' + text);
      xhr.open('POST', this.url, true);
      xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
      xhr.send(
	'k=' + this.sendID +
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
    this.isOpen = false;
    this.receiveXHR.abort();
    // give receiving relay.pl something to let it finish
    this.sendID = this.recvID;
    this.write(null);
    window.removeEventListener('beforeunload', this.boundClose);
  }

]);
 
module.exports = SignalingRelay;
