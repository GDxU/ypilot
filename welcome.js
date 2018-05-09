const $ = require('jquery');
const qr = require('qr-image');
const UserNames = require('./user-names.js');
const Profile = require('./profile.js');
const Game = require('./game.js');
const Uplink = require('./uplink.js');
const convertFailToReject = require('./errors.js').convertFailToReject;
const id2svg = require('./id2svg.js');

if (!('function' == typeof assert)) {
  function assert(condition) {
    if (!condition) throw new Error("failed assertion");
  }
}

function changedProfile() {
  if (window.profile.useLocalStorage) {
    window.profile.toObject().then(o => {
      window.localStorage.setItem('profile', JSON.stringify(o));
    });
    // TODO catch
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
  askStatus(playerID).
  catch(err => console.error(err));
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
  var hrefNoHash = location.href.slice(0, location.href.length - location.hash.length);
  var href = hrefNoHash + '#' + p.id;
  var inviteSvgStr = qr.imageSync(href, { type: 'svg' });
  $('#invite-svg').html(inviteSvgStr);
  $('#invite-url').text(href);
  $('#handle').val(p.handle).change();
  $('#use-local-storage').prop('checked', p.useLocalStorage);
  $('#id-svg').html(id2svg(p.id));
  updatePlayersTable();
  updateNewGamesTable();
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

function onClickStart(evt) {
  Game.loadFromProfile(evt.target.id.replace(/^start-game-/,'') | 0).
  then(router.startNewGame.bind(router));
  // TODO catch
}

function addNewGameRow(game, i) {
  var row = document.createElement('tr');
  row.innerHTML =
    '<td><button id="start-game-' + i + '">Start</button></td>' +
    '<td></td><td></td>' +
    '<td><a href="' + game.url + '">' + game.url + '</a></td>';
    // TODO forget button? need to manage indices. maybe instead make profile.games an object with hashed urls as keys, and use the hash instead of i in the button ids
  $(row.childNodes[0].childNodes[0]).on('click', onClickStart);
  $(row.childNodes[1]).text(game.title);
  $(row.childNodes[2]).text(game.author);
  $('#games').append(row);
}

function updateNewGamesTable() {
  // clear the new games table
  $('#games tr').has('td').remove();
  // re-fill it from the new profile
  profile.games.forEach(addNewGameRow);
}

function onClickJoin(evt) {
  var m = /^join-game-(\d+)-via-([0-9a-f-]{36})$/.exec(evt.target.id);
  if (!m) {
    console.log('bogus join game button ID: ' + evt.target.id);
    return;
  }
  var gameIndex = m[1] | 0;
  var remoteID = m[2];
  /* FIXME?
   * Right now we only load the game after receiving the handshake from the hub
   * that tells us which game is being played, so there could be a big lagspike
   * on joining as the game is loaded and compiled, behind which clock ticks
   * and input events would pile up. It might be better to proactively load the
   * game here, before attempting to join, like this:
     Game.loadFromProfile(gameIndex).
     then(router.joinGame.bind(router, remoteID));
   * and then just check that the correct game was loaded when we get the
   * handshake.
   */
  router.joinGame(remoteID);
}

function addJoinGameRow(gameIndex, players) {
  var game = window.profile.games[gameIndex];
  var row = document.createElement('tr');
  row.innerHTML =
    '<td><button id="join-game-' + gameIndex + '-via-' + players[0].id + '">Join</button></td>' +
    '<td></td><td></td>'
  $(row.childNodes[0].childNodes[0]).on('click', onClickJoin);
  $(row.childNodes[1]).text(game.title);
  $(row.childNodes[1]).attr('title', game.title + ' by ' + game.author + ' at ' + game.url);
  var playersTD = $(row.childNodes[2]);
  players.forEach((p, i) => {
    if (i != 0) {
      playersTD.append(document.createTextNode(', '));
    }
    var span = $(document.createElement('span'));
    span.text(p.handle);
    span.attr('title', p.id + ' ' + p.handle /* + ', AKA ' + p.handles.join(', ') */);
    playersTD.append(span);
  });
  $('#games-to-join').append(row);
}

function askStatus(remoteID) {
  console.log('asking status...');
  return Uplink.askStatus(remoteID).
  then(s => {
    console.log('got status');
    console.log(s);
    var i = window.profile.games.findIndex(g => (g.url == s.configURL));
    if (i == -1) { // never seen this game before, add it to profile
      console.log('game is new to me');
      return addNewGameFromURL(s.configURL).
	     then(({ i, ast }) => { return { i: i, s: s }; });
    } else {
      console.log('game is known to me');
      return { i: i, s: s };
    }
  }).
  then(({i, s}) => {
    console.log('adding join game row');
    addJoinGameRow(i, s.players)
  });
}

function updateJoinGamesTable() {
  // clear the join games table
  $('#games-to-join tr').has('td').remove();
  // search for games to join among players we know and policy says we should
  window.profile.knownPlayers.forEach(p => {
    if (p.statusRequestPolicy == 'onSearch') {
      askStatus(remoteID).
      catch(err => console.error(err));
    }
  });
}

function newProfile() {
  return Profile.generateRandom().
  then(p => {
    p.useLocalStorage = $('#use-local-storage').prop('checked');
    setProfile(p);
  });
}

function selectElement(selectedElement, elementGroup) {
  elementGroup.removeClass('selected');
  selectedElement.addClass('selected');
}

// FIXME this seems like it might belong in Game, but it uses a bunch of stuff
// from welcome, so here it is. Really there are three things going on here:
// loading the yp file to get its metadata, adding that metadata to the Profile
// object, and adding the metadata to the displayed table of games.
window.addNewGameFromURL = function(url) {
  return new Promise((resolve, reject) => {
    $.get(url).
    done((data, textStatus, jqXHR) => {
      var ast = Game.tryToParseString(jqXHR.responseText);
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
      addNewGameRow(profile.games[i], i);
      resolve({ i: i, ast: ast });
    }).
    fail((jqXHR, textStatus, errorThrown) => {
      $('#welcome').append("<p>Error fetching config file:</p><pre>" + textStatus + "</pre>");
      convertFailToReject(textStatus, errorThrown, reject);
    });
  });
}

window.hideWelcome = function() {
  console.log('hiding welcome screen');
  $('#welcome').hide();
};

$(function() {

var tabItems = $('.tabs ul li');
var tabPanes = $('.tabs div');

function switchToTab(tabItem) {
  var href = tabItem.children('a').attr('href');
  selectElement(tabItem, tabItems);
  selectElement($(href), tabPanes);
}

tabItems.on('click', evt => {
  evt.preventDefault();
  switchToTab($(evt.currentTarget));
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
  Profile.fromFile(file).then(setProfile);
  // keep the filename we opened as the one to save back to
  $('#export-profile-link').prop('download', file.name);
  $('#export-profile-link').text(file.name); // why not
});

$('#export-profile').on('click', evt => {
  window.profile.toObject().then(o => {
    $('#export-profile-link').attr('href',
      'data:application/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(o))
    );
    // for some reason jq's .click() doesn't work, while DOM's does
    $('#export-profile-link')[0].click();
  }).
  catch(err => console.error(err));
});

$('#new-profile').on('click', newProfile);

$('#config-file').on('change', function(evt) {
  try {
    var file = evt.target.files[0];
    var reader = new FileReader();
    reader.onload = function() {
      Game.loadFromString(reader.result, encodeURI(file.name));
      router.startNewGame();
    };
    reader.readAsText(file);
  } catch (e) {
    $('#welcome').append("<p>Error loading config file:</p><pre>" + e + "</pre>");
  }
});

$('#add-from-url').on('click', function(evt) {
  var url = $('#config-url').val();
  addNewGameFromURL(url);
});

$('#search-for-games').on('click', updateJoinGamesTable);

$('#restore-default-network-settings').on('click', function(evt) {
  $('#signaling-relay-url').val(
    "https://willdb.net/cgi-bin/relay.pl"
  );
  $('#ice-servers').val(
    "[\n" +
    "{\"urls\":\"stun:stun.ekiga.net\"},\n" +
    "{\"urls\":\"stun:stun.l.google.com:19302\"},\n" +
    "{ \"urls\": \"turns:willdb.net\",\n" +
    "  \"username\": \"ypilot\",\n" +
    "  \"credential\": \"I agree not to use this service to break the law.\"\n"+
    "}\n"+
    "]"
  );
});

try {
  window.localStorage.setItem('__TEST_KEY__', '__TEST_VAL__');
  assert(window.localStorage.getItem('__TEST_KEY__') == '__TEST_VAL__');
} catch (e) {
  // can't use local storage
  $('#use-local-storage').prop('checked', false);
  $('#use-local-storage').prop('disabled', true);
}

new Promise((resolve, reject) => {
  assert($('#use-local-storage').prop('checked'));
  var profileStr = window.localStorage.getItem('profile');
  assert(profileStr !== null);
  resolve(Profile.fromString(profileStr));
}).
then(setProfile).
catch(newProfile).
then(() => {
  console.log('testing for remote ID in fragment');
  if (/^#[0-9a-f-]{36}$/.test(location.hash)) {
    // someone gave us their ID in the fragment part of the URL
    // ask their status and switch to join tab
    var remoteID = location.hash.slice(1); // remove # from beginning
    console.log('remote ID is ' + remoteID);
    switchToTab($(".tabs ul li:contains('Join a game')"));
    return askStatus(remoteID);
  }
}).
catch(err => console.error(err));

});
