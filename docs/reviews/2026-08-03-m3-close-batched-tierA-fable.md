<!-- ROLE: M3-close batched Tier A review record (L6). UPDATE-POLICY: frozen once the
     repair wave is verified; repair outcomes appended in the one designated section.
     TRIGGER: gates milestone acceptance for M3; cited by the acceptance report. -->

# M3-close batched Tier A review

**Reviewer**: Fable, in-session, explicit TJO permission (in-chat 2026-08-03: no codex
this session; M3 reviewer choice ratified "Fable in-session"). **Method**: three Opus
hostile lens agents (drive validity; gates/graph validity; residuals/stale-prose) as
review inputs — reviewer adjudicated every cited claim and verified each landing-blocker
against source before listing it (all nine confirmed by direct reads, file:line below).
**Scope** (per HANDOFF + ratified plan): the M3.5 loop's validity changes, bounded schema
repair (rk-xxp/rk-i19), Gate 4 presence-conditionality, Gate 7 single-assembly-path,
structural batch eligibility, load-bearing membership, family fail-closed, three-cause
STALE (rk-xbsx), provenance-11 narrowing (rk-lkeh), rk-xfzg (interactions only), the
P1+P2 wave (interactions + fresh hostile pass at a different granularity), rk-k0m1, and
residuals rk-yx5e/rk-wr58/rk-svd5/rk-gkxs. Master at e3943fb.

Anti-Zeno: this is M3's ONE review round. ONE repair wave follows; repairs are verified
mechanically against the file:line claims below, not re-reviewed hostile. Everything
else goes to beads for the M4-boundary review.

## Landing-blockers (BLOCKER/MAJOR on validity semantics — gate M3 acceptance)

**LB1 — Cross-node challenges are structurally unapplyable, discarded under a FALSE
stale-hash message, and burn the blamed node's retry budget.** CONFIRMED.
`src/drive/driver-verdict-map.ts:97` records the challenge on the BLAMED node;
`src/drive/driver-verify-node.ts:172` returns the REVIEWED node's contentHash;
`src/drive/driver-run-round.ts:141-148` compares the blamed node's fresh hash against
the reviewed node's bound hash — unconditional mismatch whenever blamed ≠ reviewed. The
challenge never reaches af; the skip asserts "af node content hash changed between
dispatch and apply" (never observed — a truthful-rendering violation that propagates
into `stallReasonClass` and the stuck-no-progress stop message); `state.attempts`
increments for the never-dispatched blamed node, so `checkRetryCap` can starve it while
the reviewed node re-dispatches every round. Latent secondary: identical-content sibling
nodes hash-collide legitimately, letting a verdict bound to one node's bytes apply
against another with af's CAS passing coincidentally. No test covers blamed ≠ reviewed
through `dispatchRound`. Repair: bind the hash of the node the item actually targets at
dispatch time; correct the attempts accounting; red-green test for the cross-node path.

**LB2 — An unclassified balloon aborts WITHOUT updating durable state, and the
classification dispatcher degrades silently on the tool's own example config.**
CONFIRMED. `src/drive/driver-balloon-run.ts:32-38` returns before the counter persist
at :49-63; `src/cli/verify-live.ts:141` never checks `classCreated.ok`;
`src/cli/verify-live-deps.ts:103` degrades to `async () => undefined`, which
`parseClassificationReview` always rejects. Preflight requires verifier/hard and
prover/hard but never verifier/l5, and `WORKERS_CONFIG_EXAMPLE` shows only those — so
the DEFAULT path yields balloon-unclassified aborts with `balloons:` stuck at 0,
making `routeBalloon`'s repeat clause and Gate 2 Check 15's threshold permanently
unreachable. Violates M3.6's named "no abort-without-state-update" criterion and Check
15's contract prose. Repair: persist `count` (never a guessed class) on the
unclassified path; report classification-dispatcher creation failure at preflight.

**LB3 — Gate-side retraction veto has store-presence and status-list holes the graph
side deliberately refused.** CONFIRMED (a hostile re-derivation catch against the P1
wave this reviewer passed clean — the different-granularity mechanism working as the
postmortem predicts). `src/gates/linker-l5.ts:73-74` early-returns on absent
`.rk/l5-verdicts.jsonl` BEFORE reading retractions; `liveL5`'s only enforcement
consumer is `linker-l5.ts:115` inside two status branches (`stated`,
`proved-mod-audit`); `src/gates/linker.ts:88` passes only `liveAf` to `checkStatus`.
Net: a live `l5-shard-bytes` retraction on a `proved`/`af: validated` shard — the
LIKELY hand-authored domain, since af-canonical hashes are unobservable (rk-iejw) and
`appendRetraction` has zero callers — produces ZERO gate findings while
`computeExpectedConflicts` (`src/graph/validate-conflicts.ts:134-151`) vetoes
unconditionally: `rk check` exit 0, `rk render` defect, same tree. The coverage line
"N live (l5-shard-bytes)" reads as enforcement with no S/J joined-accounting (the
rk-lkeh discipline). Repair: Check 16 enforces a live retraction in EITHER domain
independent of L5-store presence and independent of status list (mirror the graph
rule's rationale verbatim); coverage gains driven/live accounting; corpus fixture for
the fail-closed half and for the store-absent + retracted-proved case (gates-F14).

**LB4 — Structural loss has a third class the diagnostics surface cannot name, and bd
parse failures are not structural loss at all.** CONFIRMED mechanism.
`src/store/build-graph.ts:40-44,129-133` counts `retractionStoreProblems` toward
`isStructurallyComplete` but `src/render/diagnostics-view.ts:33-36,57-62` mirrors only
two arrays — `rk render`/`rk graph`/`rk verify` refuse "naming every entry" while
enumerating zero entries, and `check-regen.ts:127-133` reports "0 structural-loss
entries: see rk render for detail". Separately `src/store/bd-load.ts:41-46` silently
`continue`s on JSON parse failure (`totalRecords` dead) — a truncated
`.beads/issues.jsonl` line drops its edge with `isStructurallyComplete === true`,
while fr's identically-shaped defect is first-class. Repair: third array named in the
diagnostics view + Gate 7 loss count; bd malformed lines become structural loss.

**LB5 — Retraction/L5 store-corruption ERRORs are phase-demotable; the four newest
phase-matrix rows have no classification tests.** CONFIRMED.
`retractionStoreFindings` emits no `structural: true` while every sibling
parse-integrity fault (linker-parse, defs, refs payload-absent) is structural; in
exploration phase `rk check` prints OK on a corrupt retraction ledger while `rk render`
refuses — the pre-commit hook runs the permissive surface. And
`test/gates/phase-classification.test.ts` asserts nothing for Checks 13/14/16 or Gate 7
— the contract's own three-way mutation-proof rule (doc+code+tests same commit) unmet
exactly where classifications are newest (gates-F7). Ruling: ledger/parse-integrity
faults on the retraction and L5 stores are STRUCTURAL (both phases); the phase-matrix
doc row, the `structural` flags, and classification tests move in one commit.

**LB6 — Gate 4 check 5 reproduces incident (a): a configured-but-absent status-table
path is silent, and read-but-zero-rows is indistinguishable from absent.** CONFIRMED.
`src/gates/provenance-md.ts:162-168` maps absent → non-finding by design, but
`provenanceStatusTableFile` has a non-undefined default (`config.ts:131`) so the gate
cannot distinguish "day-1 default, no report" from "explicit override, stale path" —
`ConfigValidationResult.overrides` already knows which keys were present. A renamed
table file ⇒ check 5 (OVERCLAIM, the gate's #1 guarded failure mode) verifies nothing,
green, coverage `0 tab:status rows (0 joined)` — byte-identical to the no-table state
(gates-F5: a missing `\label{tab:status}`/`\midrule` also yields silent `[]`). Repair:
explicitly-overridden-but-absent ⇒ ERROR (provenance-22's own reasoning one step
further); coverage line renders the source state (`read`/`present-but-unloaded`/
`absent`).

**LB7 — The render edge's own live fr-residual read degrades invisibly, collapsing
three-cause STALE cause 3 into cause 1.** CONFIRMED path.
`src/cli/check-regen.ts:73-78` inspects only `buildGraphDocument`'s two source
statuses; `src/cli/render.ts:128`'s independent `loadFrResiduals` degrades to
`EMPTY_FR_RESIDUALS` on binary failure/shape mismatch with no fidelity record — a
deterministic degradation passes the reproducibility probe and reports DRIFT,
advising a re-render that re-pins the artifact to degraded output — the exact harm
`unattributableFinding` exists to prevent. Repair: `loadFrResiduals` reports its
fidelity; `classifyRegen` treats it as cause-3 input.

**LB8 — The normative contract asserts the INVERSE acceptance direction of the
enforced cross-vendor gate, in four places.** CONFIRMED.
`docs/gate-contracts.md:1070-1071` (fixture-ledger rows for linker-32/33) say
"WARNING `legacy-same-family`, never ERROR" / "WARNING naming the batch id";
`corpus/linker/linker-32/expected.json` and `linker-33/expected.json` both enforce
`"severity": "ERROR"` (2026-07-19 review blockers 5a/5c hardening, which the SAME
document states correctly at :735-742). An implementer "restoring parity to the
contract" would undo a fail-closed hardening. Repair: correct the four rows, cite the
blockers.

**LB9 — docs/worker-contract.md asserts safety mechanisms that do not exist as
stated.** CONFIRMED. (:273) "a repair that also fails is a normal terminal 12, and
the ORIGINAL failure representation is preserved verbatim" — false on the exit-0
branch: `foldRepairTurn` (`verdict-repair.ts:167-175`) preserves exit 0 + invalid
body + RepairRecord; terminality is supplied by `bindVerdicts`/`extractProofContent`
rejection (the latter only since rk-xfzg), neither pinned on this path (rk-wr58).
(:508-517) "never a blind resume … MUST reuse the SAME turnId or open a fresh
session" — `driver-live.ts:219-222` mints a fresh turnId on the same resumed session;
the real duplicate defense is the pre-apply hash re-read + af `--expect-hash` CAS.
(:269) the verifier-repair trigger understates its own trigger set (also fires on
exit-0 raw-shape-invalid), contradicting the prover paragraph. Repair: rewrite all
three passages to state the ACTUAL mechanisms; the turnId idempotency design goes to
a bead, not silent implementation.

## Follow-ups (beads; batched to the M4-boundary review)

Drive: timed-out turns report ZERO usage so real spend is invisible to `checkBudget`
(interacts with rk-k0m1's raisable ceilings); exit 11 handled nowhere (and the verifier
repair's own 1500-token cap can manufacture exit 11 on the GAP-11 shape — the one
bounded repair defeated by its own mitigation on its target incident); reviewer==author
pre-dispatch guard reads `node.author` while cross-vendor reads `proverOfRecord`;
`dispatchL5Plan` has no `checkBudget` (unwired today — must gain it before CLI wiring);
worker-contract drift list D1/D5/D6/D7 (snippet cap 500→2000 + parse-failures
persistence; session-validation prose vs structural isolation + per-dispatcher
`emptySessionManagerState`; seconds vs ms units; module-move citations). Gates: Gate 7
`checked N/N` against a degraded-but-matching regeneration is unearned and `rk check`
never prints source-status lines (F9); "matching bytes stay clean in all three cases"
false for cause 2 — code is stricter (F10); Gate 7 structural-loss enumeration two of
three classes (F11 — folds into LB4's doc edit); `linker-graph.ts:189-192` "NOT YET
wired" comment false (F12); `REPORT_ROOT` duplicated literal (F13); Check 16
fail-closed corpus fixture missing (F14 — folds into LB3's fixture work). Residuals:
rk-yx5e both halves still present (`driver-prove-node.ts:141-142`); rk-wr58 gap
confirmed load-bearing (it pins LB9's rewritten sentence); rk-rxq corrected and
widened (prover repair uncapped at 8000; reserve is output-only; no reserve knob);
rk-sp3n corrected (132 vs 145 definition must be chosen, two per-term errors);
rk-gkxs widened (three defensive returns); schemas/verdict prose "not yet built" ×3
(F4-residuals); corpus/README `:162` internally inconsistent (F8-residuals).

Verified clean (by the lenses, spot-confirmed by the reviewer): the 20-property drive
clean-list (driver-owned fields unforgeable; exactly-one-verdict ×3; repair fire-once
structural, cannot launder, usage attributed; overreach survives repair; family
fail-closed pre-compose with af-side agreement via shared `proverOfRecord`; batch
eligibility closed-constructor; batchId re-derivation; correction-pending;
retraction/promotion domain pinning; timeout verdict-invariance; seam round-trip) and
the gates clean-list (Gate 4 checks 1-4+6 presence semantics incl. B1; Gate 7 single
mechanism confirmed across all 442 lines; rk-xbsx taxonomy correct within its input
set; unresolved-bucket exact accounting; conflict recomputation strictness; canonical
serialization total order; applyPhase fail-strict).

## Verdict

M3 acceptance is GATED on the repair wave for LB1-LB9. The wave is dispatched
in-session (two Opus lanes: drive LB1/LB2/LB9; gates LB3-LB8), verified mechanically
against the file:line claims above, then this record's repair section is completed and
M3 acceptance proceeds. Live-fire attempt 13 (running) additionally validated: rk-k0m1
wiring in production, the honest single-vendor preflight (rk-id1's ask — bead
closeable), opus decomposition past the attempt-12 starvation point, and family
fail-closed live (accepts refused same-family on the load-bearing path).

## Repair-wave outcomes (completed post-wave)

(appended after mechanical verification)
