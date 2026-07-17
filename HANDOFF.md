<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-07-17)

Repo bootstrapped: CLAUDE.md/AGENTS.md constitution, package skeleton, license, dirs.
No source code yet. Design authority: `../research-workflows/{PRD,IMPLEMENTATION_PLAN}.md`
(both v2, review-hardened).

## Current milestone: M0 — gate extraction

- M0.1 gate contracts doc: DISPATCHED (Sonnet implementer).
- F0 `fr version` in ../knowledge-frontier: DISPATCHED (Sonnet implementer).
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
