---
id: lem-stage1-approximate-group-laws
kind: lemma
status: proved
af: validated
contract: Stage-1 approximate group laws hold on the compressed orbit.
workspace: proofs/lem-stage1-approximate-group-laws
---

The AISM incident, transcribed (docs/memos/2026-08-03-aism-postmortem/03-datamodel.md,
"Drift & inconsistency found" item 1). This shard was af-validated on 2026-07-27, then found
DEFECTIVE by an independent sweep on 2026-07-28 and retracted. In AISM the retraction existed
only as hand-edited prose, so the af ledger's last event was still `node_validated`, `export.md`
still read `**Status:** validated`, and the oracle verdict file still read `"result":"pass"` —
three of four layers reporting pass on a withdrawn proof. Here the retraction is a RECORD
(`.rk/retractions.jsonl`, `af-canonical` domain), and the shard's unchanged `af: validated`
claim is a Gate 2 ERROR.
