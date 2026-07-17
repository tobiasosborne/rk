---
id: def-cited-payload-absent
term: cited payload absent term
kind: cited
status: locked
source: src-alpha
locus: p.1
sha256: b6a6c1147c7cdf07
consensus: internal
---

**Cited, sha256 resolves but the payload file is absent on disk (gitignored).** The manifest
records this hash for `src-alpha/gitignored.pdf`, but that file does not exist in this
fixture — the real-world case of a copyrighted payload that is fetched, not committed
(check-defs.py:123-124, WARN never ERROR).
