---
id: lem-c
kind: lemma
contract: No two distinct primes p, q > 2 satisfy p^2 - q^2 = 1.
status: proved
af: validated
workspace: proofs/ws-c
---

Conflict-detection fixture (M2.3, class (c) — taint vs status inconsistency: `proved` + tainted,
IMPLEMENTATION_PLAN.md M2.3 acceptance row). The registry's `contract` byte-matches the
(deterministically stubbed) af export's root `statement` (`../fake-af`), and `epistemic_state`
is `"validated"` — but `taint_state` is `"tainted"`: the workspace's own validation history
carries an admitted-but-unresolved taint, contradicting a clean `status: proved` claim.
`contractMatch`/`epistemicState` are held at their non-conflicting values so this fixture
exercises ONLY `src/graph/validate-conflicts.ts`'s `taint-status-mismatch` push, never
`status-mismatch` or `contract-mismatch` — see
test/graph/corpus-conflict-taint-status.test.ts.
