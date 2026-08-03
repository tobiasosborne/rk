---
id: lem-stage1-approximate-group-laws
kind: lemma
contract: Stage-1 approximate group laws hold on the compressed orbit.
status: proved-mod-audit
af: none
---

Conflict-detection fixture (rk-0ehr / P1, class (e) — `retraction-vs-status`, the fifth conflict
kind and the reason graph.v1 became `schema_version: "2"`). This shard is labeled
`proved-mod-audit` and its bytes have NOT changed since that label was earned; a retraction record
in `.rk/retractions.jsonl` is pinned to exactly these current bytes (`l5-shard-bytes` domain), so
it is LIVE and the claim is withdrawn.

Deliberately `af: none` with no workspace, so this fixture exercises ONLY the retraction path —
no af edge exists to produce a `status-mismatch`, `contract-mismatch`, or `taint-status-mismatch`
alongside it. See test/graph/corpus-conflict-retraction-vs-status.test.ts.

THE INCIDENT (CLAUDE.md L2, real and dated): AISM 2026-07-28. This shard's id is the real one.
It was af-validated on 2026-07-27 and retracted the next day after an independent sweep found it
defective — recorded only as a hand-edited prose paragraph, so the af ledger, `export.md`, and the
oracle verdict file all still reported pass. See
docs/memos/2026-08-03-aism-postmortem/03-datamodel.md, "Drift & inconsistency found" item 1.
