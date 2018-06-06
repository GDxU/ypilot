const $ = require('jquery');
const id2color = require('./id2svg.js').id2color;

// remove all chat messages, but keep the welcome message at the beginning
function clearHistory() {
  var history = $('#chat-history');
  var welcomeMsg = history.children('div:first')[0];
  $('div.chat-message').remove();
  history.append(welcomeMsg);
}

function appendToHistory(speakerID, speakerName, text) {
  var chat = $(document.createElement('div'));
  chat.addClass('chat-message');
  var text = text;
  var prefix = speakerName
  if (/^\/me /.test(text)) {
    text = text.slice(3);
    prefix = '* ' + prefix;
    chat.attr('style', 'font-style: italic');
  } else {
    prefix += ': ';
  }
  chat.text(text);
  var speaker = $(document.createElement('span'));
  speaker.addClass('speaker');
  speaker.attr('style', 'color: ' + id2color(speakerID));
  speaker.text(prefix);
  chat.prepend(speaker);
  var history = $('#chat-history');
  history.append(chat);
  // scroll to bottom
  history.scrollTop(history[0].scrollHeight);
}

function showInput() {
  $('#chat-input').show().focus();
}

function hideInput() {
  $('#chat-input').blur().hide().val('');
}

function inputFocused() {
  return ($('#chat-input:focus').length != 0);
}

function inputVal() {
  return $('#chat-input').val();
}

module.exports = {
  clearHistory: clearHistory,
  appendToHistory: appendToHistory,
  showInput: showInput,
  hideInput: hideInput,
  inputFocused: inputFocused,
  inputVal: inputVal
};
