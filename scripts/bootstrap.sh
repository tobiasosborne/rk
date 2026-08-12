#!/bin/sh
# ROLE: one-shot dev-machine wiring for a fresh clone. UPDATE POLICY: edited when
# the dev-environment contract changes. TRIGGER: run once per clone (`make bootstrap`).
#
# What it wires and why:
#   1. .claude/settings.json -> BASH_ENV=scripts/agent-limits.sh (CLAUDE.md rule 13:
#      every tool-spawned shell gets the 8 GiB RLIMIT_DATA guard). .claude/ is
#      gitignored and the path must be absolute, so this cannot ship pre-wired.
#   2. bun install (dev deps only; runtime deps are {} by law L4).
# It does NOT restore campaign siblings; that is scripts/restore-siblings.sh,
# deliberately separate so CI-of-the-tool or a quick fix does not materialize 35 MB.
set -eu
cd "$(dirname "$0")/.."

SETTINGS=.claude/settings.json
LIMITS="$PWD/scripts/agent-limits.sh"
if [ -f "$SETTINGS" ]; then
  # Content-aware: the file may legitimately carry more (hooks etc.); all rule 13
  # needs is the BASH_ENV wiring to THIS clone's absolute path.
  if grep -qF "\"BASH_ENV\": \"$LIMITS\"" "$SETTINGS" || grep -qF "\"BASH_ENV\":\"$LIMITS\"" "$SETTINGS"; then
    echo "bootstrap: $SETTINGS already wired (BASH_ENV -> $LIMITS)"
  else
    echo "bootstrap: $SETTINGS exists WITHOUT this clone's BASH_ENV wiring — not overwriting." >&2
    echo "  add to its env object:  \"BASH_ENV\": \"$LIMITS\"  (CLAUDE.md rule 13)." >&2
    exit 1
  fi
else
  mkdir -p .claude
  printf '{"env":{"BASH_ENV":"%s"}}\n' "$LIMITS" > "$SETTINGS"
  echo "bootstrap: wrote $SETTINGS"
fi

bun install
echo "bootstrap: done. Verify from an agent shell: bash -c 'ulimit -S -d' -> 8388608."
echo "next: 'make test' + 'make selftest'; 'sh scripts/restore-siblings.sh' for campaign repos."
