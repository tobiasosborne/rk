---
id: def-cited-no-provenance
term: cited no provenance term
kind: cited
status: locked
locus: p.1
consensus: internal
---

**Cited shard naming neither `source:` nor `sha256:` at all.** Under AISM's current
check-defs.py (check-defs.py:112-118, `if src`/`if sha` guards), this passes completely
silently — no ERROR, no WARN. Under the pending strict-provenance contract update (TJO,
2026-07-17), this is ERROR: a `cited` claim with no source and no hash is unprovenanced,
which Layer 0 exists to forbid.
