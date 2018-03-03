NODE=node
NPM=npm
REQUIRES=browserify mocha
INSTALLED_REQUIRES=$(REQUIRES:%=node_modules/%/package.json)
MAIN=main.js
SRCS = \
	$(MAIN) \
	define-methods.js \
	peer-connection.js \
	signaling-relay.js \
	user-names.js

all:: ypilot.js

node_modules/%/package.json:
	$(NPM) install $*

ypilot.js: $(INSTALLED_REQUIRES) $(SRCS)
	node_modules/browserify/bin/cmd.js $(MAIN) >$@

test:: $(INSTALLED_REQUIRES) $(SRCS) tests/*.js
	cd tests && ../node_modules/mocha/bin/mocha *.js

test-%:: $(INSTALLED_REQUIRES) $(SRCS) tests/%.js
	cd tests && ../node_modules/mocha/bin/mocha $*.js

clean::
	rm -f ypilot.js

distclean:: clean
	rm -rf node_modules
