const $ = require('jquery');
const defineMethods = require('./define-methods.js');

// get what the value of evt.code should be, even if it's actually ""
// (that happens on mobile)
// NOTE: this is probably not complete; it just works for the keys we use
function getRobustKeyCode(evt) {
  if (evt.code != '') {
    return evt.code;
  } else if (/^[0-9a-z]$/i.test(evt.key)) {
    return 'Key' + evt.key.toUpperCase();
  } else {
    return evt.key;
  }
}

function Interface(player) {
  this.player = player;
  this.isLocal = (
    (router.uplink.id in router.uplink.players) &&
    (router.uplink.players[router.uplink.id].thing == player)
  );
  if (this.isLocal) {
    this.playerShipLocated = undefined;
    this.toroidSize = undefined;
    this.piloting = router.getAdjectivePropertiesMap('Piloting');
    router.on('becomePiloting', this.becomePiloting.bind(this));
    this.visible = router.getAdjectivePropertiesMap('Visible');
    router.on('becomeVisible', this.becomeVisible.bind(this));
    router.on('unbecomeVisible', this.unbecomeVisible.bind(this));
    this.located = router.getAdjectivePropertiesMap('Located');
    router.on('becomeLocated', this.becomeLocated.bind(this));
    router.on('unbecomeLocated', this.unbecomeLocated.bind(this));
    this.oriented = router.getAdjectivePropertiesMap('Oriented');
    router.on('becomeOriented', this.becomeOriented.bind(this));
    router.on('unbecomeOriented', this.unbecomeOriented.bind(this));
    this.toroidal = router.getAdjectivePropertiesMap('Toroidal');
    // TODO support dynamically changing Toroidal status of a space?
    this.boardLike = router.getAdjectivePropertiesMap('BoardLike');
    router.on('becomeBoardLike', this.becomeBoardLike.bind(this));
    router.on('unbecomeBoardLike', this.unbecomeBoardLike.bind(this));
    this.columnar = router.getAdjectivePropertiesMap('Columnar');
    this.named = router.getAdjectivePropertiesMap('Named');
    this.typed = router.getAdjectivePropertiesMap('Typed');
    this.svg = $('#svg-container svg')[0];
    document.body.onkeydown = this.keydown.bind(this);
    document.body.onkeyup = this.keyup.bind(this);
    $('.key').
      on('mousedown', this.mousedown.bind(this)).
      on('mouseup', this.mouseup.bind(this)).
      on('touchstart', this.touchstart.bind(this)).
      on('touchend', this.touchend.bind(this));
    // TODO mouse enter/leave etc.?
    router.on('finish', () => {
      delete document.body.onkeydown;
      delete document.body.onkeyup;
      $('.key').off();
      this.svg.innerHTML = '';
    });
    if (this.player in this.piloting) {
  //    console.log('interface found player ' + this.player + ' piloting on creation');
      this.becomePiloting(this.player, this.piloting[this.player], null);
    }
    for (var thing in this.boardLike) {
      this.startBoard(this.boardLike[thing]);
      $('#board-container').show();
      break; // there can be only one
    }
  }
}

defineMethods(Interface, [

function toJSON() {
  return { op: 'Interface', args: [this.player] };
},

function thingIsInPlayersSpace(thing) {
  return (this.playerShipLocated && (thing in this.located) &&
	  this.located[thing].space == this.playerShipLocated.space);
},

function setViewBox() {
  if (this.playerShipLocated) {
    var w = this.svg.width.baseVal.value;
    var h = this.svg.height.baseVal.value;
    var pos = this.playerShipLocated.position;
    this.svg.setAttributeNS(null, 'viewBox',
      '' + (pos.x - w/2) + ' ' + (pos.y - h/2) + ' ' + w + ' ' + h);
  }
},

function setThingTransform(graphics, position, orientation) {
  var wrappedPos = position;
  // when the space is Toroidal, wrap the position of things that are distant
  // from the player around to the opposite side
  if (this.toroidSize !== undefined) {
    var wrappedPos = new Vec2(position.x, position.y);
    var playerPos = this.playerShipLocated.position;
    var relPos = position.subtract(playerPos);
    if (relPos.x < -this.toroidSize.x / 2) {
      wrappedPos.x += this.toroidSize.x;
    } else if (relPos.x > this.toroidSize.x / 2) {
      wrappedPos.x -= this.toroidSize.x;
    }
    if (relPos.y < -this.toroidSize.y / 2) {
      wrappedPos.y += this.toroidSize.y;
    } else if (relPos.y > this.toroidSize.y / 2) {
      wrappedPos.y -= this.toroidSize.y;
    }
  }
  // TODO maybe put everything in a <g> instead of setting transform on each?
  var attrVal =
    'translate(' + wrappedPos.x + ', ' + wrappedPos.y + ') ' +
    'rotate(' + (orientation * 180 / Math.PI) + ')';
  graphics.forEach(g => g.setAttributeNS(null, 'transform', attrVal));
},

function getThingOrientation(thing) {
  return (thing in this.oriented) ? this.oriented[thing].orientation : 0;
},

function changeSpace() {
//  console.log('Interface#changeSpace()');
  // apply toroidal wrapping or not
  if (this.playerShipLocated.space in this.toroidal) {
    this.toroidSize = this.toroidal[this.playerShipLocated.space].size;
  } else {
    this.toroidSize = undefined;
  }
  this.svg.innerHTML = ''; // remove all children from the old space
  // add all graphics of visible things located in the new space
  for (var t in this.located) {
    t |= 0; // enforce integer thing IDs (not strings)
    if (this.located[t].space == this.playerShipLocated.space &&
        (t in this.visible)) {
      this.becomeVisible(t, this.visible[t], undefined);
    }
  }
},

function updateWrap(newPlayerPos, oldPlayerPos) {
  // go through all visible things located in the player's space
  for (var thing in this.visible) {
    if ((thing in this.located) &&
        this.located[thing].space === this.playerShipLocated.space) {
      // if the thing's position relative to the player's new and old positions
      // crosses the toroidSize/2 boundary in either direction, redo its
      // transform
      var thingPos = this.located[thing].position;
      var oldRelPos = thingPos.subtract(oldPlayerPos);
      var newRelPos = thingPos.subtract(newPlayerPos);
      var oldXInRange = (Math.abs(oldRelPos.x) <= this.toroidSize.x / 2);
      var oldYInRange = (Math.abs(oldRelPos.y) <= this.toroidSize.y / 2);
      var newXInRange = (Math.abs(newRelPos.x) <= this.toroidSize.x / 2);
      var newYInRange = (Math.abs(newRelPos.y) <= this.toroidSize.y / 2);
      if ((oldXInRange ^ newXInRange) || (oldYInRange ^ newYInRange)) {
	// see also becomeLocated()
	this.setThingTransform(this.visible[thing].graphics,
	  thingPos, this.getThingOrientation(thing));
      }
    }
  }
},

function becomePiloting(thing, {ship}, oldPiloting) {
//  console.log('Interface#becomePiloting(' + thing + ', { ship: ' + ship + ' }, #)');
  if (thing == this.player) {
//    console.log('interface found player ' + thing + ' piloting after creation');
    this.playerShipLocated = this.located[ship];
    this.setViewBox();
    this.changeSpace();
  }
},

function becomeVisible(thing, {graphics}, oldVisible) {
//  console.log('Interface#becomeVisible(' + thing + ', #, #)');
  if (this.thingIsInPlayersSpace(thing)) {
//    console.log("...is in player's space, appending");
    // first remove any old graphics we no longer have
    if (oldVisible && oldVisible.graphics) {
      oldVisible.graphics.forEach(g => {
	if (!graphics.includes(g) && g.parentNode === this.svg) {
	  g.remove();
	}
      });
    }
    // then append all the new graphics (any we already had will just move in
    // the DOM)
    graphics.forEach(g => {
      this.svg.appendChild(g);
    });
    // and make sure the graphics are positioned and oriented properly
    this.setThingTransform(graphics,
      this.located[thing].position, this.getThingOrientation(thing));
  } else if (oldVisible) {
    this.unbecomeVisible(thing, oldVisible);
  }
},

function unbecomeVisible(thing, {graphics}) {
//  console.log('Interface#unbecomeVisible(' + thing + ', #)');
  graphics.forEach(g => {
    if (g.parentNode === this.svg) {
      g.remove();
    }
  });
},

function becomeLocated(thing, {space, position}, oldLocated) {
  if (!(thing in this.visible)) return;
  if (this.playerShipLocated && space == this.playerShipLocated.space) {
    if ((!oldLocated) || oldLocated.space != space) {
      this.becomeVisible(thing, this.visible[thing], null);
    } else {
      this.setThingTransform(this.visible[thing].graphics,
	position, this.getThingOrientation(thing));
    }
    if ((this.player in this.piloting) &&
        thing == this.piloting[this.player].ship) { // just moved player's ship
      this.setViewBox();
      if (space != oldLocated.space) {
	this.changeSpace();
      } else if (this.toroidSize !== undefined) {
	this.updateWrap(position, oldLocated.position);
      }
    }
  } else if (oldLocated) {
    this.unbecomeLocated(thing, oldLocated);
  }
},

function unbecomeLocated(thing, {space, position}) {
  if (this.playerShipLocated && space == this.playerShipLocated.space &&
      (thing in this.visible)) {
    this.unbecomeVisible(thing, this.visible[thing]);
  }
},

function thingIsShown(thing) {
  return ((thing in this.visible) && (thing in this.located) &&
	  this.visible[thing].graphics.parentNode === this.svg);
},

function becomeOriented(thing, {orientation}, oldOriented) {
  if (this.thingIsShown(thing)) {
    this.setThingTransform(this.visible[thing].graphics,
      this.located[thing].position, orientation);
  }
},

function unbecomeOriented(thing, {orientation}) {
  if (this.thingIsShown(thing)) {
    this.setThingTransform(this.visible[thing].graphics,
      this.located[thing].position, 0);
  }
},

function startBoard(board) {
  this.board = board;
  this.updateBoard();
  $('#board-container').show();
},

function updateBoard() {
  var {columns, rowTypes, sortedColumns} = this.board;
  var table = $('#board');
  table.empty();
  // make headings
  var headingRow = $(document.createElement('tr'));
  var column2index = {};
  var i = 0;
  columns.forEach(column => {
    column2index[column] = i;
    i++;
    var heading = $(document.createElement('th'));
    heading.text(this.named[column].name);
    headingRow.append(heading);
  });
  table.append(headingRow);
  // make data rows for each type of row separately
  rowTypes.forEach(rowType => {
    // get the data
    var data = [];
    for (var thing in this.typed) {
      if (this.typed[thing].type == rowType) {
	var row = [];
	columns.forEach(column => {
	  row.push(router.evaluatePath(thing, this.columnar[column].cellPath));
	});
	data.push(row);
      }
    }
    // sort the data
    if (sortedColumns.length) {
      data.sort((rowA, rowB) => {
	for (var i = 0; i < sortedColumns.length; i++) {
	  var column = sortedColumns[i];
	  var reverse = (this.columnar[column].reverseSort ? -1 : 1);
	  var j = column2index[column];
	  var cellA = rowA[j];
	  var cellB = rowB[j];
	  if (cellA < cellB) return -1 * reverse;
	  if (cellA > cellB) return  1 * reverse;
	}
	return 0;
      });
    }
    // make the rows
    data.forEach(row => {
      var tr = $(document.createElement('tr'));
      row.forEach(cell => {
	var td = $(document.createElement('td'));
	td.addClass(typeof cell);
	if ('number' == typeof cell) {
	  td.text(cell.toFixed(1));
	} else {
	  td.text('' + cell);
	}
	tr.append(td);
      });
      table.append(tr);
    });
    // make a spacer row to separate from the next rowType
    var spacerTR = $(document.createElement('tr'));
    spacerTR.addClass('spacer');
    var spacerTD = $(document.createElement('td'));
    spacerTD.attr('colspan', '' + columns.length);
    spacerTR.append(spacerTD);
    table.append(spacerTR);
  });
  // update again in 1 second
  this.boardTimeout = window.setTimeout(this.updateBoard.bind(this), 1000);
},

function stopBoard() {
  window.clearTimeout(this.boardTimeout);
  delete this.board;
  delete this.boardTimeout;
  $('#board-container').hide();
},

function becomeBoardLike(thing, boardLike, oldBoardLike) {
  if (!this.boardTimeout) {
    console.log('got board ' + boardLike);
    this.startBoard(boardLike);
  }
},

function unbecomeBoardLike(thing, boardLike) {
  if (this.board === boardLike) {
    this.stopBoard();
  }
},

function keydown(evt) {
  router.uplink.localInput('press', this.player, getRobustKeyCode(evt));
},

function keyup(evt) {
  router.uplink.localInput('release', this.player, getRobustKeyCode(evt));
},

function mousedown(evt) {
  router.uplink.localInput('press', this.player, evt.currentTarget.id);
},

function mouseup(evt) {
  router.uplink.localInput('release', this.player, evt.currentTarget.id);
},

function touchstart(evt) {
  $.each(evt.changedTouches, (i, touch) => {
    $(touch.target).closest('button').each((j, btn) => {
      router.uplink.localInput('press', this.player, btn.id);
    });
  });
},

function touchend(evt) {
  $.each(evt.changedTouches, (i, touch) => {
    $(touch.target).closest('button').each((j, btn) => {
      router.uplink.localInput('release', this.player, btn.id);
    });
  });
}

]);

module.exports = Interface;
