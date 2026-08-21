#!/bin/sh
# fetch_arxiv.sh <arxiv-id> [key] -- acquire ground truth for one arXiv paper.
#   Downloads the e-print (TeX source when the authors uploaded it; PDF otherwise), extracts
#   it under sources/<key>/, records what was fetched (URL, time, served filename which
#   carries the version, e.g. 2206.13228v3) in sources/<key>/RETRIEVED.txt, runs pdftotext on
#   a PDF when available, appends every file to sources/manifest.sha256, and prints the
#   PROVENANCE Part-1 row. Pin a version by passing it in the id (2206.13228v2).
#   Bounded; refuses to overwrite an existing key; refuses archives with unsafe paths.
set -eu
ID="${1:?usage: fetch_arxiv.sh <arxiv-id>[vN] [key]}"
printf '%s' "$ID" | grep -Eq '^([0-9]{4}\.[0-9]{4,5}|[a-z-]+(\.[A-Z]{2})?/[0-9]{7})(v[0-9]+)?$' || { echo "fetch_arxiv: '$ID' is not an arXiv id" >&2; exit 2; }
KEY="${2:-$(printf '%s' "$ID" | tr './' '--')}"
printf '%s' "$KEY" | grep -Eq '^[a-z0-9][a-z0-9-]{0,40}$' || { echo "fetch_arxiv: key '$KEY' must be lowercase alnum/dash (it is also the BibTeX key)" >&2; exit 2; }
DEST="sources/$KEY"
[ -f .rk-light.json ] || { echo "fetch_arxiv: run from an rk-light project root (.rk-light.json missing)" >&2; exit 2; }
[ ! -e "$DEST" ] || { echo "fetch_arxiv: $DEST exists; remove it first to re-fetch" >&2; exit 2; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
BLOB="$TMP/eprint"; HDR="$TMP/headers"
URL="https://arxiv.org/e-print/$ID"
timeout 120 curl -sSL --max-time 110 -D "$HDR" -A "rk-light/1 (mailto:${RK_LIGHT_MAIL:-unknown})" -o "$BLOB" "$URL" \
  || { echo "fetch_arxiv: download failed for $ID" >&2; exit 1; }
mkdir -p "$DEST"
SERVED="$(grep -i '^content-disposition' "$HDR" | sed -n 's/.*filename="\{0,1\}\([^";]*\).*/\1/p' | tail -1)"
{ echo "id: $ID"; echo "url: $URL"; echo "retrieved: $(date -u +%Y-%m-%dT%H:%M:%SZ)"; echo "served-filename: ${SERVED:-unknown}";
  echo "note: pdftotext output is a text rendering; equations in it are NOT byte-faithful to the paper -- quote prose, or check the rendered page."; } > "$DEST/RETRIEVED.txt"
TYPE="$(file -b "$BLOB" 2>/dev/null || echo unknown)"
case "$TYPE" in
  *gzip*|*tar*)
    if [ "${TYPE#*gzip}" != "$TYPE" ] && ! gzip -dc "$BLOB" | tar -tf - >/dev/null 2>&1; then
      gzip -dc "$BLOB" > "$DEST/main.tex"
    else
      LIST="$( { [ "${TYPE#*gzip}" != "$TYPE" ] && gzip -dc "$BLOB" || cat "$BLOB"; } | tar -tf - )"
      if printf '%s\n' "$LIST" | grep -Eq '(^/|^\.\./|/\.\./)' || { [ "${TYPE#*gzip}" != "$TYPE" ] && gzip -dc "$BLOB" || cat "$BLOB"; } | tar -tvf - | grep -Eq '^[lh]'; then echo "fetch_arxiv: archive contains unsafe paths; refusing" >&2; exit 1; fi
      { [ "${TYPE#*gzip}" != "$TYPE" ] && gzip -dc "$BLOB" || cat "$BLOB"; } | tar -xf - -C "$DEST" --no-same-owner
    fi ;;
  *PDF*)  cp "$BLOB" "$DEST/paper.pdf"
          if command -v pdftotext >/dev/null 2>&1; then timeout 300 pdftotext -layout "$DEST/paper.pdf" "$DEST/paper.txt"; else
            echo "fetch_arxiv: PDF only and no pdftotext; quotes cannot be byte-checked until a text extraction exists" >&2; fi ;;
  *)      cp "$BLOB" "$DEST/eprint.bin"; echo "fetch_arxiv: unrecognised e-print type: $TYPE" >&2 ;;
esac
find "$DEST" -type f | LC_ALL=C sort | while IFS= read -r f; do sha256sum "$f"; done >> sources/manifest.sha256
MAIN="$(find "$DEST" -maxdepth 2 -name '*.tex' -exec grep -l '\\documentclass' {} + 2>/dev/null | head -1 || true)"
[ -n "$MAIN" ] || MAIN="$(find "$DEST" -type f \( -name '*.txt' -o -name '*.tex' \) | head -1 || true)"
SHA="$( [ -n "$MAIN" ] && sha256sum "$MAIN" | cut -c1-64 || echo '<sha256>' )"
echo "fetched $ID -> $DEST ($(find "$DEST" -type f | wc -l) files; served as ${SERVED:-unknown}). PROVENANCE.md Part 1 row:"
echo "| $KEY | ${MAIN:-$DEST/<file>} | $SHA | arXiv:$ID -- <what it is> |"
