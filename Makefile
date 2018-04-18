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
	setimmediate \
	uuid
INSTALLED_REQUIRES=$(REQUIRES:%=node_modules/%/package.json)
MAIN=main.js
SRCS = \
	$(MAIN) \
	clock.js \
	compile.js \
	define-methods.js \
	errors.js \
	game.js \
	id2svg.js \
	interface.js \
	parser.js \
	peer-connection.js \
	profile.js \
	router.js \
	signaling-relay.js \
	space.js \
	stdlib.js \
	uplink.js \
	user-names.js \
	vec2.js \
	welcome.js

all:: ypilot.js

node_modules/%/package.json:
	$(NPM) install $*

ypilot.js: $(INSTALLED_REQUIRES) $(SRCS)
	node_modules/browserify/bin/cmd.js -t brfs --debug $(MAIN) >$@

parser.js: node_modules/pegjs/package.json parser.pegjs
	node_modules/pegjs/bin/pegjs --cache parser.pegjs

test:: $(INSTALLED_REQUIRES) $(SRCS) tests/*.js
	cd tests && ../node_modules/mocha/bin/mocha *.js

test-%:: $(INSTALLED_REQUIRES) $(SRCS) tests/%.js
	cd tests && ../node_modules/mocha/bin/mocha $*.js

%.html: md2html.rb %.md 
	./$+ >$@

clean::
	rm -f ypilot.js parser.js README.html README-yp.html

distclean:: clean
	rm -rf node_modules
