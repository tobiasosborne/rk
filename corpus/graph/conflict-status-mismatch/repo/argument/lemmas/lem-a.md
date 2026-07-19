---
id: lem-a
kind: lemma
contract: Every bounded orbit accumulates at a fixed point.
status: proved
af: validated
workspace: proofs/ws-a
---

Conflict-detection fixture (M2.3, class (a) — registry-status vs af-epistemic-state
disagreement, IMPLEMENTATION_PLAN.md M2.3 acceptance row). The registry claims `status: proved`
and `af: validated`; the (deterministically stubbed) af export for `proofs/ws-a`
(`../fake-af`, invoked via `afCommand`) reports a root node whose `statement` byte-matches this
shard's `contract` and whose `taint_state` is `"clean"`, but whose `epistemic_state` is
`"pending"` — a workspace that has never actually been validated, contradicting the registry's
proved claim. `contractMatch`/`taintState` are held constant at their non-conflicting values so
this fixture exercises ONLY `src/graph/validate-conflicts.ts`'s `status-mismatch` push, never
`contract-mismatch` or `taint-status-mismatch` — see
test/graph/corpus-conflict-status-mismatch.test.ts.
