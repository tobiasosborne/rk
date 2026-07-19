---
id: lem-b
kind: lemma
contract: The sequence converges to zero in the sup norm.
status: proved
af: validated
workspace: proofs/ws-b
---

Conflict-detection fixture (M2.3, class (b) — contract byte-mismatch: resolved workspace,
`contractMatch:false`, mandatory conflict record, IMPLEMENTATION_PLAN.md M2.3 acceptance row).
The registry's `contract` field and the (deterministically stubbed) af export's root `statement`
(`../fake-af`) name RELATED but byte-DIFFERENT claims — the export names a strictly weaker
hypothesis than the registry actually asserts. `epistemic_state`/`taint_state` are held at their
non-conflicting values (`"validated"`/`"clean"`) so this fixture exercises ONLY
`src/graph/validate-conflicts.ts`'s `contract-mismatch` push, never `status-mismatch` or
`taint-status-mismatch` — see test/graph/corpus-conflict-contract-mismatch.test.ts.
