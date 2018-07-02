NODE=node
NPM=npm
REQUIRES = \
	base64-js \
	brfs \
	browserify \
	deep-equal \
	jquery \
	mocha \
	pegjs \
	qr-image \
	setimmediate \
	uuid
INSTALLED_REQUIRES=$(REQUIRES:%=node_modules/%/package.json)
MAIN=main.js
SRCS = \
	$(MAIN) \
	arrays.js \
	ask.js \
	chat.js \
	clock.js \
	compile.js \
	define-methods.js \
	errors.js \
	game.js \
	id2svg.js \
	interface.js \
	menu.js \
	parser.js \
	peer-connection.js \
	profile.js \
	router.js \
	signaling-relay.js \
	space.js \
	svg.js \
	stdlib.js \
	uplink.js \
	user-names.js \
	vec2.js \
	welcome.js

STDLIBS = \
	aligned.yp \
	base.yp \
	bouncy.yp \
	bullet.yp \
	controls.yp \
	deathmatch.yp \
	defeats.yp \
	elo-scoring.yp \
	fleeting.yp \
	gun.yp \
	holding.yp \
	inertial.yp \
	join-smallest-team.yp \
	last-player-standing.yp \
	mortal.yp \
	motile.yp \
	no-friendly-fire.yp \
	no-self-fire.yp \
	owned.yp \
	play-to-score-threshold.yp \
	players-score-for-teams.yp \
	round.yp \
	score-players.yp \
	score-teams.yp \
	scoreboard.yp \
	scored.yp \
	scores-count-defeats.yp \
	team.yp \
	wall.yp

all:: ypilot.js

node_modules/%/package.json:
	$(NPM) install $*

stdlib.js: $(STDLIBS)
	( echo -e "const fs = require('fs');\nmodule.exports = {" && \
	  for l in $^ ; do \
	    echo "  '$$l':	fs.readFileSync(__dirname + '/$$l',	'utf8')," ; \
	  done && \
	  echo -e "  'not-a-library-dont-use-this': undefined\n};" \
	) >$@

ypilot.js: $(INSTALLED_REQUIRES) $(SRCS)
	node_modules/browserify/bin/cmd.js -t brfs --debug $(MAIN) >$@

parser.js: node_modules/pegjs/package.json parser.pegjs
	node_modules/pegjs/bin/pegjs --cache parser.pegjs

test:: $(INSTALLED_REQUIRES) $(SRCS) tests/*.js
	cd tests && ../node_modules/mocha/bin/mocha *.js

test-%:: $(INSTALLED_REQUIRES) $(SRCS) tests/%.js
	cd tests && ../node_modules/mocha/bin/mocha $*.js

docs: README.html README-yp.html stdlib.html

%.html: md2html.rb %.md 
	./$+ >$@

stdlib.md: $(STDLIBS)
	( echo -e "# YPilot Standard Libraries" && \
	  for l in $^ ; do \
	    echo " - [$$l]($$l)" ; \
	  done \
	) >$@

clean::
	rm -f ypilot.js parser.js stdlib.js stdlib.md README.html README-yp.html stdlib.html

distclean:: clean
	rm -rf node_modules
