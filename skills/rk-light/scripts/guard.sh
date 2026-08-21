#!/bin/sh
# guard.sh -- mechanical check that workers wrote ONLY under notes/.
#   Run AFTER a harvest and BEFORE the orchestrator edits anything: the orchestrator commits
#   before dispatch, so any change outside notes/ since HEAD was made by a worker (or by you,
#   out of order). Also enforces append-only DEAD-ROUTES.md, CONVENTIONS.md and BRIEF.md.
#   Run the INSTALLED copy (the Makefile does: a worker could edit the project's copy):
#     sh "$HOME/.claude/skills/rk-light/scripts/guard.sh"
#   Exit 1 on any violation; exit 2 without git history.
set -u
git rev-parse --verify HEAD >/dev/null 2>&1 || { echo "guard: no git HEAD; commit before dispatching workers" >&2; exit 2; }
FAIL=0
CHANGED="$(git status --porcelain --untracked-files=all 2>/dev/null | awk '{print $NF}' | grep -Ev '^(notes/|report/\.build/|report/main\.pdf$|report/\.pages$|RELEASE\.md$)' || true)"
if [ -n "$CHANGED" ]; then
  echo "guard: paths outside notes/ changed since HEAD (workers may write only under notes/):" >&2
  printf '%s\n' "$CHANGED" | sed 's/^/  /' >&2
  FAIL=1
fi
for f in DEAD-ROUTES.md CONVENTIONS.md BRIEF.md; do
  if git diff HEAD -- "$f" 2>/dev/null | grep -E '^-[^-]' >/dev/null; then
    echo "guard: $f is append-only; lines were removed or changed:" >&2
    git diff HEAD -- "$f" | grep -E '^-[^-]' | head -5 | sed 's/^/  /' >&2
    FAIL=1
  fi
done
[ $FAIL = 0 ] && echo "guard: only notes/ changed since HEAD; append-only ledgers intact"
exit $FAIL
