const $ = require('jquery');
const id2svg = require('./id2svg.js');

function answer(resolve, div, option) {
  var always = div.find('input').prop('checked');
  div.remove();
  resolve({ answer: option, always: always });
}

// display a prompt to the user and promise the option they select, as an
// object of the form { answer: 'oneoftheoptions', always: bool }
function ask(playerID, handle, text, options) {
  var svgID = id2svg(playerID);
  var handleColor = id2svg.id2color(playerID);
  var div = $(document.createElement('div'));
  div.addClass('ask');
  div.html(
    '<div class="id-svg">' + svgID + '</div>' +
    '<span class="speaker" style="color: ' + handleColor + '"></span><br>' +
    text + '<br>' +
    '<label><input type="checkbox"> Always</label><br>'
  );
  div.children('span:empty').text(handle);
  return new Promise((resolve, reject) => {
    options.forEach(o => {
      var button = document.createElement('button');
      var span = document.createElement('span');
      $(span).text(o);
      $(button).append(span);
      div.append(button);
      $(button).on('click', answer.bind(this, resolve, div, o));
    });
    $('#asks').append(div);
  });
}

module.exports = ask;
