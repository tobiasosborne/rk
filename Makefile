# ROLE: authored build entry point. UPDATE POLICY: edited when the install/build surface changes.
# TRIGGER: package.json scripts change, or scripts/install.sh's contract changes.
#
# `make install` is the PRD §3 product-shape promise ("git clone <rk> && make install"). It is a
# thin wrapper around scripts/install.sh (kept as one script, not duplicated logic here, so there
# is exactly one place that knows how to go from clone to PATH binary). See README.md's Install
# section for what's required (Bun) versus optional (af, fr, bd) and what degrades without each.

.PHONY: build install test selftest clean

build:
	bun install
	bun run build

install:
	sh scripts/install.sh

test:
	bun test

selftest:
	bun run selftest

clean:
	rm -rf dist build
