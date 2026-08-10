<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-08-10, session close — remediation wave 1 landed, reviewed, repaired)

This session: (1) synthesized the campaign A/B/C analyst records into a five-wave
remediation plan (docs/memos/2026-08-10-remediation-plan.md — read it; it is the
roadmap for the next several sessions); (2) executed wave 1 (the Tier A validity
batch) end-to-end: codex implementation lanes -> opus review panel (3 lenses, one
round) -> codex repair wave -> mechanical verification against the reviewers' own
probes. All green at close: 2786 tests, corpus 161/161, selftest OK.

**Model policy note (TJO session directive 2026-08-10):** this wave ran with codex
implementers and an OPUS review panel — explicit TJO permission per L6 (supersedes
the codex-default for this wave only; future waves need the directive re-confirmed
or revert to codex gpt-5.6-sol reviews).

**Wave 1 landed (all five beads CLOSED, contract doc + corpus ledger current):**
- rk-uqxh: Gate 3 Checks 8-9 — argument-shard citation quotes byte-verified
  (strict grammar + permissive decoration detector + degenerate-quote guard +
  zero-coverage guard). corpus refs-12..16.
- rk-ne3a: Gate 8 Check 4b v2 — provenance independence via decoded
  case-normalized modelFamily/backend/model (same-model self-review never backs);
  placement-boundary diagnostic. corpus reward-08/09/10/20/21.
- rk-45dj: rk check runs the graph contract-join pass (byte-exact, all statuses);
  unresolved af edges (answering-but-broken af) are structural ERRORs. corpus
  graph/contract-match-check-escape + contract-join-af-broken.
- rk-fs8v: structured verifier-fence barrier (assumedVerified + L5-store
  validation at dispatch; malformed/unknown entries refuse). DORMANT until a
  production fence supplier exists — honesty note in gate-contracts.
- rk-4317: append-only demote event (reward-ledger schema v2): nodeId +
  priorStatus/priorAf, four-condition complete-demotion rule (never-legal /
  target-mismatch / evidence self-reference guards). corpus reward-11..19.

**Review panel results (the process worked):** 7 landing-blockers found and ALL
repaired same-session — headline: the original demotion downgrade predicate was
PROVABLY VACUOUS (identical to Check 4's firing condition over all 54 combos —
one demote line laundered any unsupported close); independence was defeatable by
a sessionId edit (two reviewers independently); answering-but-broken af silenced
the contract-join pass. Every repair was verified by re-running the reviewer's
own probe script. Reviewer probe suites (130+ boundary cases with negative
controls) live in the session scratchpad review-B/ — rk-k4j9 tracks porting the
valuable ones before that tmpdir evaporates. Per anti-Zeno, repairs were NOT
re-reviewed; residuals are beads for the next milestone review.

**Follow-up beads from the panel:** rk-tlwb (P1 — no tool writes the provenance
record shape Check 4b v2 requires; campaign-A live repo now draws 12
[reward-tier-unbacked] findings; needs schemas/provenance-record.v1.json + a
writer + template section + campaign remediation), rk-xwms (reward: REUSE credit
to demoted nodes, no-re-close trap, fold-vs-gate authority disclosure), rk-ew2x
(fence productionization: brand the confirmed type, non-member hash binding),
rk-84dp (Gate 3 grammar edges incl. multi-line rk-refs-quote emission
false-ERROR), rk-3j8b (graph double-build perf, Gate 2 Check 9 re-scope to
whitespace-only), rk-k4j9 (numeric hygiene + probe porting).

## Next steps (the remediation plan's waves, in order)

1. **Wave 2 — reward economics** (blocks a MEASURABLE campaign C window 2):
   rk-0ree (settle ONE token-attribution rule — Tier A payout math — then teach
   reward-sync), rk-6cmx + rk-oeal (template gets §G AND the full campaign-proven
   protocol: probes I.1-I.3, brief format, hostile seat, worker lifecycle — every
   section citing its campaign scar; then backfill campaign C's constitution),
   rk-tlwb (provenance producer — new, from this session's review), rk-io5l
   (port campaign C's record-integrity oracle if sound), rk-cz1h (escrow
   on-ramp design; reduces=0 across all 6 windows of 3 campaigns).
2. **Wave 3 — worker contract / unattended operation**: rk-4w2y (poll-before-
   stop + harvest-all-on-wake + watchdog sweep; wake-on-completion measured ~1/3
   lossy), rk-p037 (codex -o clobber), rk-j8xo (rk status --live), rk-7the
   (no-pattern-kill CLAUDE.md amendment — needs TJO ratification).
3. **Wave 4 — boundary-probe worker** (N2.4 pull-forward, rk-5man notes):
   highest measured-yield quality lever (probed review: 1/6 refutations vs 3/5
   baseline). Acceptance: pre-catches the window-3/4 defect set.
4. **Wave 5 — audit lenses** (rk-czzc, stuckness/theater signatures into
   rk-g7fc) + Tier C friction batch at the next milestone boundary.
Campaign C window 2 launches only after waves 1-2 are in (frozen-environment
rule: tooling changes between windows only). Waves 3-4 gate any further
unattended/zero-intervention window (rk-afyf).

## TJO decision queue (blocking, from the remediation plan)

1. rk-7the — ratify no-pattern-kill amendment (text exists, live incident).
2. rk-23pr — ratify remaining autonomy plan items.
3. Roster policy: is the window-5 same-family waiver ("all codex, no frozen
   banking") standing policy or per-campaign? Shapes rk-ne3a follow-on semantics
   and campaign C verification seats.
4. Campaign codas (cheap, decaying): rk-2h33 (Theorem G -> proved via af; only
   end-to-end test of the af-promotion path ever proposed), rk-iup9 (campaign B
   4-question regrade), rk-mxl3 (C_G contract repair ruling).
5. Review-policy: was the opus-panel directive this-wave-only or standing?

## Key facts for the next session

- The codex implementation-lane sandbox mounts .git READ-ONLY (usually): lanes
  cannot commit; the orchestrator commits path-scoped from lane reports. One
  lane (afc03af) did commit — the mount behavior is not fully deterministic;
  always check git log after a lane lands.
- Corpus counts now live at test/corpus.test.ts:66,68 + discovery
  EXPECTED_FIXTURE_COUNT = 161; README Totals line is RECONCILED (rk-sp3n
  closed) — keep it true from now on.
- reward-ledger schema v2 (schemas/reward-ledger.v1.json) shipped THIS session:
  demote requires nodeId/priorStatus/priorAf. v1 ledgers stay readable.
- Campaign-A repo currently draws 12 [reward-tier-unbacked] findings under the
  new independence rules — intended-stricter, remediation is rk-tlwb. Do NOT
  "fix" by weakening the gate.
- ~/.local/bin/rk symlinks rk/dist/rk — dist NOT rebuilt this session (frozen
  env; campaigns closed/idle). Rebuild deliberately when starting wave 2.
- Five-lane wave pattern proven again: parallel path-disjoint codex lanes,
  orchestrator-owned shared files (corpus/README, gate-contracts, counts,
  worker-contract), lane reports carry exact paste-ready deltas. The memory file
  rk-orchestration-shared-file-writers.md has the no-touch list.
- Opus reviewers write probe scripts that RUN their repros — require repair
  lanes to re-run those probes as the fix acceptance test. It worked: zero
  ambiguity about whether an exploit died.

## Governance (standing)

- Anti-Zeno held: ONE review round + ONE repair wave; repairs verified
  mechanically, not re-reviewed. Residuals are beads at the next milestone.
- L1/L2 never relaxed: every landed change red-green with mutation proofs;
  every closed hole has a corpus fixture reproducing the reviewer's repro.
- D1-D8 + PRD Amendment A1 stand. bd for all tracking. Benchmark hygiene rules
  unchanged (campaign A wound down, B closed, C between windows 1 and 2).
