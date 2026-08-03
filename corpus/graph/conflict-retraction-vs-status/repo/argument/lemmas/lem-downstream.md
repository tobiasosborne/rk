---
id: lem-downstream
kind: lemma
contract: The compressed orbit argument extends to the full stage-2 construction.
status: stated
af: none
deps: lem-stage1-approximate-group-laws
---

The propagation half of the fixture: this shard carries NO retraction of its own, but it depends on
one that is retracted. The ratified semantics are "propagation cascades exactly as an INVALID would"
(docs/memos/2026-08-03-rk-improvement-plan-from-aism.md §P1), so `computeTaintTrace` must report it
`tainted` with `isSource: false`, naming the retracted requirement — and no `retraction-vs-status`
conflict of its own, because no retraction record names it.
