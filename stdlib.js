const fs = require('fs');
module.exports = {
  "aligned.yp":	fs.readFileSync(__dirname + '/aligned.yp',	'utf8'),
  "base.yp":	fs.readFileSync(__dirname + '/base.yp',		'utf8'),
  "bouncy.yp":	fs.readFileSync(__dirname + '/bouncy.yp',	'utf8'),
  "bullet.yp":	fs.readFileSync(__dirname + '/bullet.yp',	'utf8'),
  "controls.yp":fs.readFileSync(__dirname + '/controls.yp',	'utf8'),
  "fleeting.yp":fs.readFileSync(__dirname + '/fleeting.yp',	'utf8'),
  "gun.yp":	fs.readFileSync(__dirname + '/gun.yp',		'utf8'),
  "holding.yp":	fs.readFileSync(__dirname + '/holding.yp',	'utf8'),
  "inertial.yp":fs.readFileSync(__dirname + '/inertial.yp',	'utf8'),
  "mortal.yp":	fs.readFileSync(__dirname + '/mortal.yp',	'utf8'),
  "motile.yp":	fs.readFileSync(__dirname + '/motile.yp',	'utf8'),
  "no-friendly-fire.yp":	fs.readFileSync(__dirname + '/no-friendly-fire.yp',	'utf8'),
  "no-self-fire.yp":		fs.readFileSync(__dirname + '/no-self-fire.yp',		'utf8'),
  "owned.yp":	fs.readFileSync(__dirname + '/owned.yp',	'utf8'),
  "wall.yp":	fs.readFileSync(__dirname + '/wall.yp',		'utf8')
};

