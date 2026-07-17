---
id: def-cited-source-mismatch
term: cited source mismatch term
kind: cited
status: locked
source: src-beta
locus: p.1
sha256: d256a94773479bb2
consensus: internal
---

**Cited, sha resolves under a DIFFERENT source.** `source: src-beta` IS a known source-id
(so check 8 passes), but the recorded `sha256` prefix `d256a94773479bb2` resolves (in the
manifest) to a path under `src-alpha/`, not `src-beta/` — WARN, not ERROR
(check-defs.py:119-122).
