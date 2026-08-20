#!/bin/sh
# ROLE: materialize the vendored sibling repos/evidence at their live ../ homes.
# UPDATE POLICY: edited when vendor/ contents change. TRIGGER: new device, after
# `make bootstrap` (see vendor/README.md).
#
# Never overwrites: an existing ../<name> is reported and skipped, whatever its
# state — reconciling a divergent live sibling with a bundle is a human decision.
set -eu
cd "$(dirname "$0")/.."

for name in rk-campaign-A rk-campaign-C rk-campaign-D rk-campaign-E; do
  if [ -e "../$name" ]; then
    echo "restore: ../$name exists — skipped"
  else
    git clone "vendor/bundles/$name.bundle" "../$name"
    echo "restore: ../$name cloned from bundle (no remote by design; refresh via 'make refresh-bundles')"
  fi
done

for name in rk-bench rk-m3.5-baseline; do
  if [ -e "../$name" ]; then
    echo "restore: ../$name exists — skipped"
  else
    cp -r "vendor/evidence/$name" "../$name"
    echo "restore: ../$name copied from vendor/evidence"
  fi
done
