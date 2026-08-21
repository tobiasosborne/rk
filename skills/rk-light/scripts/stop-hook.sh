#!/bin/sh
# stop-hook.sh -- Stop hook registered by the rk-light skill for the rest of the session.
#   Fires when the orchestrator is about to end its turn. If the cwd is an rk-light project
#   and `check.py` reports an ERROR, exit 2: the turn cannot end on a red ledger silently;
#   the ERROR lines are fed back as the reason. Allows the stop when:
#     - the cwd is not an rk-light project (.rk-light.json absent)   -> no-op elsewhere
#     - stop_hook_active is already true (we blocked once this turn)  -> no infinite loop
#     - python3 is missing                                            -> cannot judge, say so
set -u
IN="$(cat 2>/dev/null || true)"
CWD="$(printf '%s' "$IN" | sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
[ -n "$CWD" ] || CWD="$(pwd)"
[ -f "$CWD/.rk-light.json" ] || exit 0
case "$IN" in *'"stop_hook_active"'*'true'*) exit 0 ;; esac
command -v python3 >/dev/null 2>&1 || { echo "rk-light: python3 not found; gate not run" >&2; exit 0; }
OUT="$(cd "$CWD" && timeout 120 python3 scripts/check.py --quiet 2>&1)"
RC=$?
if [ "$RC" -ne 0 ]; then
  printf 'rk-light gate is RED in %s. Fix or honestly demote before ending the turn:\n%s\n' "$CWD" "$(printf '%s\n' "$OUT" | grep '^ERROR' | head -20)" >&2
  exit 2
fi
exit 0
