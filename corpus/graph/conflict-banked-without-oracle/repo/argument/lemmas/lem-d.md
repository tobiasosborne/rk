---
id: lem-d
kind: lemma
contract: There exists an explicit bound on the escape rate.
status: conjecture
af: none
---

Conflict-detection fixture (M2.3, class (d) — fr banked-claim without a fresh oracle verdict,
IMPLEMENTATION_PLAN.md M2.3 acceptance row). This shard carries no af workspace at all (`af:
none`) — the conflict lives entirely on the fr edge: `repo/.frontier/log.jsonl` (read via the
direct-ledger fallback, `frCommand` pointed at a guaranteed-absent binary) records one cycle
whose `outcome` is `"banked"` and whose `evidence.artifact` names this shard's own path
(`argument/lemmas/lem-d.md`) — fr's own bank-gate ("▣ banked needs an audit verdict from an
oracle other than the author", ../knowledge-frontier/docs/concepts.md) is unmet: the cycle's
`evidence.verdict` is `"claimed"`, never `"banked"`. See
test/graph/corpus-conflict-banked-without-oracle.test.ts.
