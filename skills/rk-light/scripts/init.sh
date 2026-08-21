#!/bin/sh
# init.sh <mode> [stakes] -- stamp an rk-light project into the current directory.
#   mode: formalise | explore      stakes: report (default) | note
#   Copies templates, scripts and the three saved workflows from the skill directory, never
#   overwrites an existing file, installs a project-level Stop hook (persists across sessions,
#   unlike the skill's own hook), regenerates the banner, and runs the gate once.
set -eu
MODE="${1:?usage: init.sh <formalise|explore> [report|note]}"
STAKES="${2:-report}"
case "$MODE" in formalise|explore) ;; *) echo "init: mode must be formalise or explore" >&2; exit 2;; esac
case "$STAKES" in report|note) ;; *) echo "init: stakes must be report or note" >&2; exit 2;; esac
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
copy() { if [ -e "$2" ]; then echo "  keep   $2"; else mkdir -p "$(dirname "$2")"; cp "$1" "$2"; echo "  create $2"; fi; }

for f in BRIEF.md STATE.md CONVENTIONS.md CLAIMS.md PROVENANCE.md DEAD-ROUTES.md Makefile; do copy "$SKILL/templates/$f" "$f"; done
for f in report/main.tex report/refs.bib report/sections/01_summary.tex report/sections/02_setup.tex; do copy "$SKILL/templates/$f" "$f"; done
for f in check.py rkl_parse.py rkl_status.py rkl_checks.py build.sh fetch_arxiv.sh guard.sh stop-hook.sh tests/test_check.py; do copy "$SKILL/scripts/$f" "scripts/$f"; done
for f in "$SKILL"/templates/workflows/*.js; do copy "$f" ".claude/workflows/$(basename "$f")"; done
chmod +x scripts/*.sh
mkdir -p sources notes/reviews notes/audit report/generated
[ -f sources/manifest.sha256 ] || : > sources/manifest.sha256
if [ ! -f .rk-light.json ]; then
  sed -e "s/\"formalise\"/\"$MODE\"/" -e "s/\"report\"/\"$STAKES\"/" "$SKILL/templates/rk-light.json" > .rk-light.json
  echo "  create .rk-light.json ($MODE, $STAKES)"
fi
[ -f .gitignore ] || printf 'report/.build/\nreport/main.pdf\nreport/*.aux\nreport/*.log\nreport/*.out\nreport/*.toc\nreport/*.bbl\nreport/*.blg\nreport/*.fls\nreport/*.fdb_latexmk\nreport/*.synctex.gz\nreport/.pages\n__pycache__/\n' > .gitignore

# Project-level Stop hook: the skill's own hook lasts one session; this one lasts the project.
HOOK='{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"sh scripts/stop-hook.sh"}]}]}}'
if [ ! -f .claude/settings.json ]; then
  mkdir -p .claude; printf '%s\n' "$HOOK" > .claude/settings.json; echo "  create .claude/settings.json (Stop hook -> scripts/stop-hook.sh)"
elif grep -q 'stop-hook.sh' .claude/settings.json; then
  echo "  keep   .claude/settings.json (hook present)"
else
  echo "  NOTE   .claude/settings.json exists without the rk-light Stop hook; add by hand:"; echo "         $HOOK"
fi
[ -d .git ] || echo "  NOTE   not a git repository: run 'git init' -- make guard and the review receipts rely on git history"
timeout 120 python3 scripts/check.py --regen >/dev/null 2>&1 || true
echo "rk-light: stamped ($MODE, $STAKES). Next: fill BRIEF.md and .rk-light.json, then 'make fetch ID=<arxiv-id>'."
timeout 120 python3 scripts/check.py --quiet || true
