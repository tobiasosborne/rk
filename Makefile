# ROLE: authored build entry point. UPDATE POLICY: edited when the install/build surface changes.
# TRIGGER: package.json scripts change, or scripts/install.sh's contract changes.
#
# `make install` is the PRD §3 product-shape promise ("git clone <rk> && make install"). It is a
# thin wrapper around scripts/install.sh (kept as one script, not duplicated logic here, so there
# is exactly one place that knows how to go from clone to PATH binary). See README.md's Install
# section for what's required (Bun) versus optional (af, fr, bd) and what degrades without each.

.PHONY: build install test selftest clean bootstrap restore-siblings refresh-bundles

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

# New-device wiring (CLAUDE.md rule 13 + fresh-clone self-containment, rk-he3r).
bootstrap:
	sh scripts/bootstrap.sh

restore-siblings:
	sh scripts/restore-siblings.sh

# Refresh vendored snapshots from the live ../ siblings (CLAUDE.md §6 item 5).
# Only LIVE siblings are refreshed; wound-down siblings' last snapshots stay committed
# in vendor/ as-is (rk-campaign-A/-C, rk-bench, rk-m3.5-baseline were removed from disk
# after their final refresh — restore-siblings recreates them from the bundles).
# Delete-then-copy for evidence so deletions propagate; bundles carry all refs.
refresh-bundles:
	git -C ../rk-campaign-D bundle create "$(CURDIR)/vendor/bundles/rk-campaign-D.bundle" --all
	@echo "refresh-bundles: done — commit vendor/ if anything changed"
