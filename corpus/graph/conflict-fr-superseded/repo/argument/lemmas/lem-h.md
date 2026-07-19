---
id: lem-h
kind: lemma
contract: The estimate holds along the whole subsequence.
status: conjecture
af: none
---

Conflict-detection fixture (M2-boundary-review blocker 7). `.frontier/log.jsonl` (read via the
direct-ledger fallback, `frCommand` pointed at a guaranteed-absent binary) records TWO cycles for
this same shard's path: cycle 1 (`outcome:"banked"`, `evidence.verdict:"claimed"` — eligible for
`banked-without-oracle` in isolation) and cycle 2, the SAME shape, with `supersedes:1`. Cycle 1 is
superseded — it must contribute NO conflict at all (only cycle 2, the live/unsuperseded sibling,
does) — never TWO conflicts for the same node, and never a conflict that lingers on the
superseded cycle indefinitely. See test/graph/corpus-conflict-fr-superseded.test.ts.
