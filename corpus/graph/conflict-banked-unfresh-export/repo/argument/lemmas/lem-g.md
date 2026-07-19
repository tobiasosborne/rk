---
id: lem-g
kind: lemma
contract: The bound holds uniformly over the parameter family.
status: conjecture
af: none
---

Conflict-detection fixture (M2-boundary-review blocker 6, primary-export half). This shard
carries no af workspace at all (`af: none`) — the conflict lives entirely on the fr edge: `fr
export` (stubbed deterministically by the sibling `fake-fr` script) reports one cycle with
`outcome:"banked"` AND `evidence.verdict:"banked"`, but names NO matching claim in its own
`verdicts` array — so `verdictFresh` stays `undefined` (no oracle freshness record exists at
all, distinct from the ledger-fallback case where recomputation is simply unavailable). If
`undefined` were ever treated as "not false" (the pre-repair bug), this would wrongly read as
oracle-backed and the mandatory `banked-without-oracle` conflict would vanish. See
test/graph/corpus-conflict-banked-unfresh-export.test.ts.
