const $ = require('jquery');

function selectElement(selectedElement, elementGroup) {
  elementGroup.removeClass('selected');
  selectedElement.addClass('selected');
}

$(function() {

var tabItems = $('.tabs ul li');
var tabPanes = $('.tabs div');
tabItems.on('click', evt => {
  evt.preventDefault();
  var targ = $(evt.currentTarget);
  var href = targ.children('a').attr('href');
  selectElement(targ, tabItems);
  selectElement($(href), tabPanes);
});

});
