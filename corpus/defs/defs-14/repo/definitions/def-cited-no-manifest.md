---
id: def-cited-no-manifest
term: cited no manifest term
kind: cited
status: locked
source: src-fabricated
locus: p.1
sha256: fabricatedsha01
consensus: internal
---

**Manifest entirely absent.** No `refs/manifest/checksums.sha256` file exists at all in this
fixture — `load_manifest` returns empty dicts + one generic WARN "manifest absent"
(check-defs.py:57-59), and checks 8-9 become silent no-ops (guarded by `and source_ids` /
`and prefix2path`): this shard's fabricated `source`/`sha256` produce NEITHER an ERROR nor a
per-claim WARN. rk's coverage-line deviation makes the resulting `0/1 cited shards
hash-verified` count visible instead of silently swallowed (see gate-contracts.md
Deviations).
