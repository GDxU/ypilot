const $ = require('jquery');
const UserNames = require('./user-names.js');
const Profile = require('./profile.js');

if (!('function' == typeof assert)) {
  function assert(condition) {
    if (!condition) throw new Error("failed assertion");
  }
}

function changedProfile() {
  if (window.profile.useLocalStorage) {
    window.profile.toObject(o => {
      window.localStorage.setItem('profile', JSON.stringify(o));
    });
  }
}

function setProfile(p) {
  window.profile = p;
  $('#id').val(p.id);
  $('#handle').val(p.handle).change();
  $('#use-local-storage').prop('checked', p.useLocalStorage);
  changedProfile();
}

function newProfile() {
  Profile.generateRandom(p => {
    p.useLocalStorage = $('#use-local-storage').prop('checked');
    setProfile(p);
  });
}

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

$('#generate-handle').on('click', evt => {
  $('#handle').val(UserNames.generateRandom()).change();
});

$('#handle').on('change', evt => {
  window.profile.handle = $('#handle').val();
  $('h1').text("Welcome to YPilot, " + window.profile.handle);
  changedProfile();
});

$('#import-profile').on('change', evt => {
  var file = evt.target.files[0]
  Profile.fromFile(file, setProfile);
  // keep the filename we opened as the one to save back to
  $('#export-profile-link').prop('download', file.name);
  $('#export-profile-link').text(file.name); // why not
});

$('#export-profile').on('click', evt => {
  window.profile.toObject(o => {
    $('#export-profile-link').attr('href',
      'data:application/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(o))
    ).click();
  });
});

$('#new-profile').on('click', newProfile);

try {
  window.localStorage.setItem('__TEST_KEY__', '__TEST_VAL__');
  assert(window.localStorage.getItem('__TEST_KEY__') == '__TEST_VAL__');
} catch (e) {
  // can't use local storage
  $('#use-local-storage').prop('checked', false);
  $('#use-local-storage').prop('disabled', true);
}

try {
  assert($('#use-local-storage').prop('checked'));
  var profileStr = window.localStorage.getItem('profile');
  assert(profileStr !== null);
  Profile.fromString(profileStr, setProfile);
  // FIXME some errors just get printed to console
} catch (e) {
  newProfile();
}

});
