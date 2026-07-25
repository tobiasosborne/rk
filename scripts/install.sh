#!/usr/bin/env sh
# Build rk and install the standalone binary onto PATH so a fresh clone becomes a working `rk`
# without reading source (SC1: PRD.md §3 promises `git clone <rk> && make install`).
#
#   sh scripts/install.sh                      # auto: /usr/local/bin if writable, else ~/.local/bin
#   RK_INSTALL_DIR=/path sh scripts/install.sh  # explicit destination
#   sudo sh scripts/install.sh                  # system-wide (all users) into /usr/local/bin
#
# `make install` (see Makefile) just runs this script. It installs ONLY rk itself: af, fr, and bd
# are separate repos with their own build/install tooling (README.md's Install section has clone
# URLs and version requirements) — this script does not reach into them, per CLAUDE.md Rule 2
# (cross-repo work belongs in the owning repo, never a local hack standing in for it). PRD §3's
# "make install ... installs rk, af, fr, bd (pinned versions)" is the product's eventual shape;
# today this installs rk and prints where to get the other three.
#
# Modeled on ../knowledge-frontier/install.sh (frontier's own install script), the one sibling
# tool in this ecosystem that already solved "clone to binary on PATH" — same shape, same
# auto-destination logic, same PATH/smoke checks at the end.
set -e
cd "$(dirname "$0")/.."

echo "[rk] installing dependencies (bun install)…"
bun install

echo "[rk] building standalone binary (dist/rk)…"
bun run build

DEST="${RK_INSTALL_DIR:-}"
if [ -z "$DEST" ]; then
  if [ -w /usr/local/bin ]; then DEST=/usr/local/bin; else DEST="$HOME/.local/bin"; fi
fi
mkdir -p "$DEST"
cp dist/rk "$DEST/rk"
chmod +x "$DEST/rk"
echo "[rk] installed -> $DEST/rk"

case ":$PATH:" in
  *":$DEST:"*) echo "[rk] $DEST is on PATH - ok" ;;
  *) echo "[rk] WARNING: $DEST is not on PATH. Add it, e.g.:  export PATH=\"$DEST:\$PATH\"" ;;
esac

if "$DEST/rk" --help >/dev/null 2>&1; then
  echo "[rk] smoke OK -- try:  rk --help"
else
  echo "[rk] smoke FAILED -- the binary did not run." >&2
  exit 1
fi

echo "[rk] rk itself is installed. af/fr/bd are separate binaries this repo does not vendor;"
echo "[rk] see README.md's Install section for clone URLs, or run 'rk doctor' once rk is on PATH"
echo "[rk] to check which of them are present and what each one gates."
