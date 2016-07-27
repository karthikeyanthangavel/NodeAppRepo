#
# StockExchange Node.js project
#

PROJECT = "StockExchange Node.js project"

REPORTER = spec
test:
    @NODE_ENV=test ./node_modules/mocha/bin/mocha test \
    --reporter $(REPORTER) \
    --recursive
.PHONY: test