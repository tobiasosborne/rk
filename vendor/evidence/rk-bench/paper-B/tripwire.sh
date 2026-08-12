#!/usr/bin/env bash
# EXAMINER-SIDE leakage tripwire (N5.1). Greps the campaign repo's banked content and
# librarian ledger for the sealed provenance fingerprints. Run by the examiner or an
# isolated audit subagent, never by the campaign orchestrator.
set -uo pipefail
CAMP="${1:-/home/tobiasosborne/Projects/rk-campaign-B}"
TERMS="$(dirname "$0")/seal/fingerprint-terms.txt"
HITS=0
while IFS= read -r term; do
  [[ -z "$term" || "$term" == \#* ]] && continue
  c=$(grep -ri --include='*.md' --include='*.jsonl' --include='*.tex' -F "$term" "$CAMP" 2>/dev/null | wc -l)
  if [[ "$c" -gt 0 ]]; then echo "TRIPWIRE HIT: '$term' x$c"; HITS=$((HITS+c)); fi
done < "$TERMS"
if [[ "$HITS" -eq 0 ]]; then echo "tripwire: clean (0 hits)"; else echo "tripwire: $HITS hit(s) — HALT THE CAMPAIGN"; exit 1; fi
