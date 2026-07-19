---
id: lem-f
kind: lemma
contract: There exists a uniform decay rate across the whole family.
status: conjecture
af: none
---

Conflict-detection fixture (M2-boundary-review blocker 6, degraded-fallback half). This shard
carries no af workspace at all (`af: none`) — the conflict lives entirely on the fr edge:
`repo/.frontier/log.jsonl` is read via the direct-ledger fallback (`frCommand` pointed at a
guaranteed-absent binary, src/store/fr-load.ts's `runLedgerFallback`), which NEVER recomputes
verdict freshness — `verdictFresh` stays `undefined` unconditionally on this path (fr-load.ts's
own doc comment). The one log record has `outcome:"banked"` AND `evidence.verdict:"banked"` — if
`undefined` were ever treated as "not false" (the pre-repair bug), this would wrongly read as
oracle-backed and the mandatory `banked-without-oracle` conflict would vanish. See
test/graph/corpus-conflict-banked-unfresh-ledger.test.ts.
