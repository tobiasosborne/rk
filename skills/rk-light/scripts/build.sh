#!/bin/sh
# build.sh -- compile report/main.tex into a FRESH build directory and install the PDF only on
#   success. Fails (exit 1) on: compiler failure, undefined references/citations, multiply-
#   defined labels. A pre-existing report/main.pdf is never mistaken for a result. Bounded.
#   Writes the page count to report/.pages for check.py's page-target warning.
set -u
[ -f report/main.tex ] || { echo "build: report/main.tex missing" >&2; exit 2; }
cd report || exit 2
OUT=.build
rm -rf "$OUT" && mkdir -p "$OUT"
rm -f main.pdf .pages
RC=0
if command -v latexmk >/dev/null 2>&1; then
  timeout 600 latexmk -pdf -interaction=nonstopmode -halt-on-error -outdir="$OUT" main.tex >"$OUT/build.out" 2>&1 || RC=$?
else
  export TEXINPUTS=".:${TEXINPUTS:-}"; export BIBINPUTS=".:${BIBINPUTS:-}"
  timeout 300 pdflatex -interaction=nonstopmode -halt-on-error -output-directory="$OUT" main.tex >"$OUT/build.out" 2>&1 || RC=$?
  if [ $RC = 0 ] && [ -f refs.bib ]; then (cd "$OUT" && timeout 120 bibtex main >/dev/null 2>&1) || RC=$?; fi
  [ $RC = 0 ] && { timeout 300 pdflatex -interaction=nonstopmode -halt-on-error -output-directory="$OUT" main.tex >>"$OUT/build.out" 2>&1 || RC=$?; }
  [ $RC = 0 ] && { timeout 300 pdflatex -interaction=nonstopmode -halt-on-error -output-directory="$OUT" main.tex >>"$OUT/build.out" 2>&1 || RC=$?; }
fi
LOG="$OUT/main.log"
if [ $RC != 0 ] || [ ! -f "$OUT/main.pdf" ]; then
  echo "build: compiler failed (rc=$RC); see report/$LOG" >&2; grep -m5 '^!' "$LOG" 2>/dev/null | sed 's/^/  /' >&2; exit 1; fi
FAIL=0
if grep -q 'There were undefined references' "$LOG"; then echo "build: undefined references" >&2; grep "Reference .* undefined" "$LOG" | sed 's/^/  /' >&2; FAIL=1; fi
if grep -q 'Citation .* undefined' "$LOG"; then echo "build: undefined citations" >&2; grep "Citation .* undefined" "$LOG" | sed 's/^/  /' >&2; FAIL=1; fi
if grep -q 'multiply defined' "$LOG"; then echo "build: multiply-defined labels" >&2; grep "multiply defined" "$LOG" | sed 's/^/  /' >&2; FAIL=1; fi
[ $FAIL = 0 ] || exit 1
cp "$OUT/main.pdf" main.pdf
if command -v pdfinfo >/dev/null 2>&1; then PAGES="$(pdfinfo main.pdf 2>/dev/null | awk '/^Pages:/{print $2}')"; else
  PAGES="$(grep -o 'Output written on [^ ]*main.pdf ([0-9]* page' "$LOG" | grep -o '[0-9]*' | tail -1)"; fi
printf '%s\n' "${PAGES:-0}" > .pages
echo "build: report/main.pdf, ${PAGES:-?} pages -> PASS"
