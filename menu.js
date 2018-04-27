const $ = require('jquery');

$(function() {

$('#close-menu').on('click', evt => {
  $('#menu').hide();
});

$('#display-invite').on('click', evt => {
  $('#invite').show();
  $('#menu').hide();
});

$('#toggle-controls').on('click', evt => {
  $('#controls').toggle();
  $('#menu').hide();
});

$('#leave-game').on('click', evt => {
  // TODO disconnect from hub/uplink, show #welcome
  $('#menu').hide();
});

$('#hide-invite').on('click', evt => {
  $('#invite').hide();
});

// TODO touch versions of above 'click' handlers?

});
