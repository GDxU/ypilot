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

function onPolicyChange(evt) {
  var targ = $(evt.target);
  var newVal = targ.val();
  var targID = targ.prop('id');
  var playerID = targID.substring(0,36);
  var field = targID.substring(37).replace(/-[a-z]/g, m => m[1].toUpperCase());
  window.profile.knownPlayers[playerID][field] = newVal;
  changedProfile();
}

function requestPlayerStatus(evt) {
  var targ = $(evt.target);
  var targID = targ.prop('id');
  var playerID = targID.substring(0,36);
  // TODO
  console.log('would request status of player ' + playerID);
}

function forgetPlayer(evt) {
  var targ = $(evt.target);
  var targID = targ.prop('id');
  var playerID = targID.substring(0,36);
  delete window.profile.knownPlayers[playerID];
  targ.parent().parent().remove();
  changedProfile();
}

function setProfile(p) {
  window.profile = p;
  p.onKnownPlayersChange = function() {
    updatePlayersTable();
    changedProfile();
  };
  $('#id').val(p.id);
  $('#handle').val(p.handle).change();
  $('#use-local-storage').prop('checked', p.useLocalStorage);
  updatePlayersTable();
  updateGamesTable();
  changedProfile();
}

function updatePlayersTable() {
  // clear the players table
  $('#players > table tr').has('td').remove();
  // re-fill it from the new profile
  for (var id in profile.knownPlayers) {
    var player = profile.knownPlayers[id];
    var row = document.createElement('tr');
    row.innerHTML =
      '<td class="id">' + id + '</td>' +
      '<td></td>' +
      '<td><select id="' + id + '-status-response-policy">' +
        '<option value="askMe">ask me</option>' +
	'<option value="alwaysGive">always give it</option>' +
	'<option value="alwaysIgnore">always ignore</option>' +
      '</select></td>' +
      '<td><select id="' + id + '-join-policy">' +
        '<option value="askMe">ask me</option>' +
	'<option value="alwaysAllowOrVouch">always allow/vouch</option>' +
	'<option value="alwaysIgnoreOrReject">always ignore/reject</option>' +
      '</select></td>' +
      '<td>' +
        '<button id="' + id + '-status-request-button">Now</button> ' +
	'<select id="' + id + '-status-request-policy">' +
	  '<option value="onlyOnRequest">only on request</option>' +
	  '<option value="onSearch">when I search</option>' +
	'</select>' +
      '</td>' +
      '<td><button id="' + id + '-forget">Forget</button></td>';
    $(row.childNodes[1]).text([player.handle, ...player.oldHandles].join(', '));
    $(row.childNodes[2].childNodes[0]).
      val(player.statusResponsePolicy).
      on('change', onPolicyChange);
    $(row.childNodes[3].childNodes[0]).
      val(player.joinPolicy).
      on('change', onPolicyChange);
    $(row.childNodes[4].childNodes[0]).on('click', requestPlayerStatus);
    $(row.childNodes[4].childNodes[2]).
      val(player.statusRequestPolicy).
      on('change', onPolicyChange);
    $(row.childNodes[5].childNodes[0]).on('click', forgetPlayer);
    $('#players > table').append(row);
  }
}

function addGameRow(game, i) {
  var row = document.createElement('tr');
  row.innerHTML =
    '<td><button id="start-game-' + i + '">Start</button></td>' +
    '<td></td><td></td>' +
    '<td><a href="' + game.url + '">' + game.url + '</a></td>';
    // TODO forget button? need to manage indices. maybe instead make profile.games an object with hashed urls as keys, and use the hash instead of i in the button ids
  $(row.childNodes[0].childNodes[0]).on('click', function(evt) {
    startGameFromProfile(evt.target.id.replace(/^start-game-/,'') | 0)
  });
  $(row.childNodes[1]).text(game.title);
  $(row.childNodes[2]).text(game.author);
  $('#games').append(row);
}

function updateGamesTable() {
  // clear the games table
  $('#games tr').has('td').remove();
  // re-fill it from the new profile
  profile.games.forEach(addGameRow);
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

$('#config-file').on('change', function(evt) {
  try {
    var file = evt.target.files[0];
    var reader = new FileReader();
    reader.onload = function() {
      startGameFromString(reader.result, encodeURI(file.name));
    };
    reader.readAsText(file);
  } catch (e) {
    $('#welcome').append("<p>Error loading config file:</p><pre>" + e + "</pre>");
  }
});

$('#add-from-url').on('click', function(evt) {
  var url = $('#config-url').val();
  $.get(url).
  done((data, textStatus, jqXHR) => {
    var ast = tryToParseString(jqXHR.responseText);
    if (ast === null) return;
    var title = 'Untitled';
    var author = 'Anonymous';
    ast.forEach(statement => {
      if (statement.op == 'metadata') {
	switch (statement.key.toLowerCase()) {
	  case 'title':
	    title = statement.value;
	    break;
	  case 'author':
	    author = statement.value;
	    break;
	  default:
	    break;
	}
      }
    });
    // TODO sort? make table sortable by clicking headings?
    var i = profile.games.length;
    profile.games.push({ url: url, title: title, author: author });
    changedProfile();
    addGameRow(profile.games[i], i);
  }).
  fail((jqXHR, textStatus, errorThrown) => {
    $('#welcome').append("<p>Error fetching config file:</p><pre>" + textStatus + "</pre>");
  })
});

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
