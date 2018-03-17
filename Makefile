NODE=node
NPM=npm
REQUIRES=browserify jquery mocha pegjs setimmediate
INSTALLED_REQUIRES=$(REQUIRES:%=node_modules/%/package.json)
MAIN=main.js
SRCS = \
	$(MAIN) \
	define-methods.js \
	compile.js \
	config.js \
	interface.js \
	peer-connection.js \
	router.js \
	signaling-relay.js \
	space.js \
	user-names.js \
	vec2.js

all:: ypilot.js

node_modules/%/package.json:
	$(NPM) install $*

ypilot.js: $(INSTALLED_REQUIRES) $(SRCS)
	node_modules/browserify/bin/cmd.js --debug $(MAIN) >$@

config.js: node_modules/pegjs/package.json config.pegjs
	node_modules/pegjs/bin/pegjs --cache config.pegjs

test:: $(INSTALLED_REQUIRES) $(SRCS) tests/*.js
	cd tests && ../node_modules/mocha/bin/mocha *.js

test-%:: $(INSTALLED_REQUIRES) $(SRCS) tests/%.js
	cd tests && ../node_modules/mocha/bin/mocha $*.js

clean::
	rm -f ypilot.js config.js

distclean:: clean
	rm -rf node_modules
