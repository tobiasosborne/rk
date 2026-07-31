<!-- ROLE: banked Tier A review record. UPDATE POLICY: append-only historical record, never
     rewritten. TRIGGER: written at review completion (CLAUDE.md §3). -->

# Tier A review — rk-xfzg: extractProofContent defers to validateRawProverOutput

- **Date**: 2026-07-31
- **Reviewer**: Claude Fable 5, with explicit TJO permission this session ("work on this by
  yourself, do not use codex") per the 2026-07-18 L6 amendment.
- **Scope**: branch `rk-xfzg-pending-review` (f93de62) vs master (45d0282) — 6 files,
  +129/−48. Validity semantics: prover-body acceptance.
- **Verdict**: CLEAN. Zero landing-blockers. Merged.

## What was verified (file:line, on the branch)

1. **Single source of truth holds by construction.** `extractProofContent`
   (src/drive/driver-prove-node.ts:50) accepts iff `validateRawProverOutput`
   (src/drive/prover-raw.ts:112) returns zero issues, then builds `ProofChild`s by known-key
   copy from the validated body. The cast to `RawProverOutput` is sound: the validator checks
   plain-objectness, the exact key sets (`TOP_LEVEL_KEYS`/`CHILD_KEYS`, prover-raw.ts:57-58),
   non-blank `statement`/`justification`, and all-string `depends` before the cast is reached.
2. **Strictly stricter, never laxer.** Enumerated both acceptance sets: every input the old
   extractor rejected (non-object raw, missing/empty/non-array children, non-object child,
   blank statement) the validator also rejects. The new rejections (unknown keys, non-string
   depends entry, present-but-blank justification, present-but-non-array depends,
   whitespace-only justification) were all old silent-drop or silent-keep paths. No input
   became acceptable. L5 stricter-by-design bar met.
3. **Overreach ordering preserved.** `detectProverOverreach` runs at driver-prove-node.ts:111,
   before extraction at :133 — a verdict-carrying body is still discarded as `prover-overreach`,
   never misreported as `prover-body-invalid`. `diagnoseRepairableProverTurn`
   (verdict-repair.ts:109) likewise exempts overreach from repair before validating shape, so
   repair cannot launder an overreach (verdict-repair.ts:159 re-validates the repair reply).
4. **Failed-repair hardening is real.** `foldRepairTurn` preserves the original exit-0 invalid
   body on a failed repair; that body now hits the new rejection instead of recording with
   silent loss. The "downstream outcome = as if no repair attempted" invariant
   (verdict-repair.ts:145-149) still holds — both paths go through the same stricter
   extraction. End-to-end test of that exact path is rk-wr58 (filed pre-review).
5. **Diagnostics are total and named.** The `proof === undefined` branch recomputes issues,
   names the first 3 in the skip reason, and writes `prover-body-invalid` with full issues +
   bounded snippet. `boundedRawSnippet` (driver-verify-node.ts:38) accepts `unknown` and
   stringifies — the object-valued call is correct. The kind is registered in `OTHER_KINDS`
   (report-parse.ts:101) and typed (report-parse.ts:41); report.ts does not count it —
   diagnostic-only, same family as `prover-overreach`. No report-math change.
6. **No shared-state hazard.** `child.depends = k.depends` shares the raw array, but
   `buildRecordProofChildren` (driver-af.ts:234) builds a fresh `translated` array — nothing
   mutates the shared reference.
7. **Docs current.** prover-raw.ts's header rewrote the now-false "deliberately stricter than
   extractProofContent" divergence note; docs/worker-contract.md's prover-repair section
   ("identical validation and then the unchanged extractProofContent") remains true, now
   tautologically. No schemas/ or rk.compat.json surface touched; `OtherDriverLogRecord`
   widening follows the `proof-recorded`/`churn-cap` precedent.
8. **Mechanical verification (re-run independently, not taken from the HANDOFF):** branch gates
   `bun test` 2333 pass / 1 skip / 0 fail + selftest OK (corpus 127/127). Mutation 1: lax
   extractor reinstated → **8 tests RED**; restored byte-identical. Mutation 2: diagnostics
   block reverted to bare skip → **1 test RED**; restored byte-identical. Both match the
   implementer's claims exactly.

## LANDING-BLOCKERS

None.

## FOLLOW-UPS

1. **Tier C, cosmetic** — the skip reason's fixed parenthetical "(need a non-empty children[]
   decomposition)" (driver-prove-node.ts:142) can misdescribe the failure when children IS
   non-empty and the body sank on an unknown key; the appended issue summary names the true
   cause, so this is wording only.
2. **Tier C, cosmetic** — `prover-body-invalid` carries no `role` field, unlike its
   `parse-failed` sibling; the role is implicit (only the prover path writes it) but a log
   reader grepping by role misses it.

Both filed as one bead (rk-yx5e); batched to the M3 milestone review per the anti-Zeno rule.
