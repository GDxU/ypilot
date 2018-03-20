NODE=node
NPM=npm
REQUIRES=browserify jquery mocha pegjs setimmediate
INSTALLED_REQUIRES=$(REQUIRES:%=node_modules/%/package.json)
MAIN=main.js
SRCS = \
	$(MAIN) \
	define-methods.js \
	compile.js \
	parser.js \
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

parser.js: node_modules/pegjs/package.json parser.pegjs
	node_modules/pegjs/bin/pegjs --cache parser.pegjs

test:: $(INSTALLED_REQUIRES) $(SRCS) tests/*.js
	cd tests && ../node_modules/mocha/bin/mocha *.js

test-%:: $(INSTALLED_REQUIRES) $(SRCS) tests/%.js
	cd tests && ../node_modules/mocha/bin/mocha $*.js

%.html: %.md
	ruby -e " \
	  require 'github/markup'; \
	  file=\"$<\"; \
	  IO.write(\"$@\", \
	    \"<!DOCTYPE html>\\n<html><meta charset=\\\"utf-8\\\">\n\" + \
	    GitHub::Markup.render(file, IO.read(file) + \
	    \"<html>\n\"))"

clean::
	rm -f ypilot.js parser.js README.html README-yp.html

distclean:: clean
	rm -rf node_modules
