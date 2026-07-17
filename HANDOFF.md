<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-07-17)

Repo bootstrapped: CLAUDE.md/AGENTS.md constitution, package skeleton, license, dirs.
No source code yet. Design authority: `../research-workflows/{PRD,IMPLEMENTATION_PLAN}.md`
(both v2, review-hardened).

## Current milestone: M0 — gate extraction

- M0.1 gate contracts doc: DONE (e17bbe8) + Fable L6 review APPROVE-WITH-CORRECTIONS
  (docs/reviews/2026-07-17-gate-contracts-fable-review.md) + corrections applied
  (77a488e; F1-F12 + MIN_RUN whole-quote tightening; ledger now 74 fixtures; deferred
  items filed as rk-af8/zjq/rko/t14).
- M0.2 red corpus: DONE (75/75 fixtures, 7 commits 1498933..2d579b3). All
  script-validated via module-import harness (AISM gates hardcode ROOT from __file__ —
  cd+run silently re-checks AISM; documented in corpus/README.md). aism_behavior:
  70 same, 5 differs (all rk-stricter-intended: defs-15, linker-15, linker-21, refs-07,
  provenance-11), 0 unrunnable. defs retrofitted post-premise-correction; defs-15
  (strict cited-shard provenance) added, becomes enforceable via M0.7.
- M0.7 contract stance amendment: DISPATCHED.
- M0.6 refs acquisition: DONE (7537f80, ae7c539, 5d4e791). 95 tests/163 asserts,
  selftest+purity green, compiled binary works. AISM status round-trip: full agreement.
  Divergence ledger: 2 rk-stricter-intended (path-traversal guard — fetch-refs.py:137-140
  joins lock paths unvalidated; whole-quote rule), 1 ambiguous deferred (fetchSpec
  catch-all→null), 0 rk-bug. Fable review of this code pending at the pre-M0.3 boundary.
- ORCHESTRATION NOTE: agents share this working tree — orchestrator commits must use
  explicit paths, never `git add -A` (542197c swept an in-flight M0.6 snapshot; verified
  clean by the agent, no damage — do not repeat).
- F0 `fr version`: DONE (knowledge-frontier commit 9db2af7, 276/276 tests, not pushed).
  NOTE: the installed ~/.local/bin/fr binary predates F0 (and all of main since Jun 22,
  including P0 field-feedback fixes) — `fr version` will fail until a rebuild is
  installed. Refreshing the binary touches the live AISM campaign's hooks: TJO decision.
  rk doctor's mismatch detection will correctly flag this state (that is the feature).
- V0 firstproof corpus: no local checkout exists (verified 2026-07-17) — recover from
  another machine/remote if possible, else strike from V1 acceptance per plan.
- M0.2 red corpus: blocked on M0.1.
- M0.3 gates implementation: blocked on M0.1/M0.2.
- M0.4 doctor: blocked on F0.
- M0.5 AISM staged cutover: blocked on M0.3.
- M0.6 refs acquisition port: unblocked, not yet dispatched.

## Next steps

1. Harvest M0.1 + F0; Fable review of the gate contracts doc (L6: it defines validity
   semantics) before M0.2 fixtures are built against it.
2. Dispatch M0.2, then M0.3 (parallel by gate, disjoint files), Fable review at the
   M0.3 boundary.
3. bd init (prefix rk-) — not yet done.
