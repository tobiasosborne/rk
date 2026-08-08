<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-08-08, session close — autonomy N-series launched; benchmark trial ran 4 windows)

One very large session, three arcs. Master pushed at every step.

**Arc 1 — SOTA survey + autonomy design (all TJO-ratified).** Five-lane web survey
banked (docs/memos/2026-08-08-proof-search-sota-survey.md). TJO directives D-a..D-d +
goal-graph reward design + wildcard chaos arm ratified; plan =
../research-workflows/NOTES-2026-08-08-autonomy-implementation-plan.md (N0-N5);
pre-registration = docs/memos/2026-08-08-prereg-autonomy-v1.md (APPEND-ONLY; payout
formulas, quotas, thresholds, S0 gate, N5.1 firewall protocol). Q1=(a) no Lean in v1
(sampled-Lean calibration = v2, rk-3yg1). Governance: N-series relaxes per-landing
Tier A (red-green + red corpus stay law; "odd code review"; smoke test is the
bug-finder) — but see Arc 2: the one codex review run found 4 real holes; reviews on
validity fixes are load-bearing.

**Arc 2 — N-series code landed** (all tests green: 2695+ pass, corpus 142, selftest OK):
- Goal frontier: src/graph/query-frontier.ts (live-route obligations, attachment
  boundary, dead-ends).
- Reward core: src/reward/{types,engine,parse,tier,calibration}.ts — pure fold payouts
  (CLOSE/escrowed-REDUCE/PRUNE/REUSE/COMPRESS), Brier scoreboard, ONE ledger validator.
- Gate 8 (reward): checks 1-4b incl. tier-by-mapping (self-report never banks) and
  pma BACKING (fresh healthy-store unretracted VALID L5 verdict OR provenance whose
  first token names an existing file). Check 4b was Tier-A-reviewed (codex): 2
  BLOCKERs + 2 MAJORs found and fixed (report runs the gate; provenance must resolve;
  store health; retractions). corpus/reward/ = 7 fixtures.
- CLI: rk reward report (gate-integrated, --strict), rk reward sync (shadow emitter,
  withholds unbacked/unpredicted, gate-agreement by construction), rk frontier,
  rk refs adopt (offline cited rung; fetch:null honesty).
- Known reward-econ defect: spentTokens=0 everywhere (rk-0ree, P1) — prunes outpay
  real closes until per-node attribution lands.

**Arc 3 — N5.1 paper-firewall benchmark: 4 windows run, extraordinary yield.**
Candidate A = arXiv 2607.19852 (SEALED — examiner-only; campaign must never see id).
Campaign repo ../rk-campaign-A (own git, no remote); examiner records + sealed answer
+ ANALYST NOTES (the trial's full record, triage-coded) = ../rk-bench/paper-A/.
Canary CLEAN pre-launch. Four windows, all audited 0/0/0 firewall, tripwire at
baseline (1 known-benign), gates green at every commit. Cumulative: 7 pma nodes
(cross-vendor-verified; one constant reviewer-improved), 2 byte-verified cited facts,
B' at stated, frontier honest (obligations 1->26, satisfied 0->9). Scoring vs sealed
key: CLASS (b) — same crux (tail-mass invariant at K=1; ignorance-not-noncommutativity
mechanism; why-prior-bounds-miss diagnosis) — with (c)/(d)/(e) elements. Sealed second
half (min-over-K in ignorance models, poly-1/eps gate necessity) UNREACHED; registered
prediction: it should emerge if the campaign assaults M-G (the named "circuit
lower-bound genre" wall). Named process discoveries (all campaign-self-found):
over-correction under review pressure; scepticism-is-a-standard-not-a-direction;
verifier-brief fencing; probe-is-itself-a-quantified-claim; probe debt. Constitution
I.1 (boundary probes before review) + I.2 (no fencing without a citable record) landed
mid-trial from the campaign's own findings; first probed review dropped refutations
to 1/6 components (n=1).

## Next steps (in order)

1. **Probe-runner channel** (window-4 structural finding): campaign workers cannot
   execute ANY commands (sandbox), so I.1 probe records are orchestrator-only.
   Build a librarian-pattern probe-runner (orchestrator-executed, ledgered) or grant
   evidence workers execution. Blocks window 5. Feeds N2.4 (probes must be RUN —
   both window-4 probes failed at their own boundaries, caught only by execution).
2. **Window 5** (TJO cadence: zero-intervention preferred): campaign's own agenda —
   general-profile floor probe completion, then the M-G wall (the min-over-K
   prediction's test). Examiner protocol: silence except firewall emergencies;
   tooling changes only between windows.
3. **N2 proper** (rk-5man): Gate C/D + evidence workers. Boundary-probe worker FIRST
   (window-3 evidence: 3/5 defects mechanically catchable at quantifier extremes);
   inherit probe-debt + negative-control + run-don't-collect lessons.
4. **Tier A queue**: rk-uqxh (cited-shard quotes not re-verified per run — cited rung
   reachable but ungated), rk-fs8v (verifier-fence needs citable record — worker
   contract), rk-ne3a (provenance INDEPENDENCE — prover's own report must not back).
5. **rk-0ree** (P1): per-node token attribution (driver has two conflicting usage
   conventions — see bead) so closes stop paying zero.
6. M3-final-close items (SC4 cross-vendor run, auto-prove.sh disposition, acceptance
   report) + rk-j4vg (multiplayer memo) remain from before this session, unchanged.

## Governance (standing)

- N-series velocity governance per prereg memo; L1/L2 never relaxed. Reviews: codex
  gpt-5.6-sol; concentrate them on validity fixes (evidence: 4 real holes in the one
  reviewed diff). Fable = examiner/orchestrator this arc per TJO.
- Benchmark hygiene: examiner never reads campaign math steering into briefs
  (steering ledger in analyst notes; one flagged slip, refuted by the campaign);
  environment FROZEN during zero-intervention windows; examiner writes in campaign
  repo confined to scripts/ + refs/sources/; never `git add -A` there.
- Anti-Zeno + D1-D8 + PRD Amendment A1 stand. bd for all tracking.

## Key facts for the next session

- Campaign orchestrator agent carries 4 windows of transcript context; resume via
  SendMessage to the SAME agent (window-5 launch message pattern: authorization +
  protocol only). Its measured properties: steers wrong ~3/4 (it now self-discounts
  in briefs); banking restraint strong; discipline survives zero-intervention.
- Wildcard arm went 2-for-2 on load-bearing content in window 2 (prereg quota 5%,
  floor 2% — do not let anyone tune it away).
- Stuckness signature (first data, window 3): obligations UP + satisfied FLAT +
  self-report = honest wall; theater would be closes without frontier contact
  (pull-rate). Wire into N4.1 lenses (rk-czzc = over-correction lens too).
- corpus counts live at test/corpus.test.ts:66,68 + discovery EXPECTED_FIXTURE_COUNT
  (now 142); corpus/README Totals still deliberately inconsistent (rk-sp3n).
- ~/.local/bin/rk symlinks rk/dist/rk — campaign picks up rebuilds instantly; do NOT
  rebuild mid-window (frozen-environment rule).
- Purity grep 'node:' trap bit twice more this session — rename fields, never touch
  the guard.

## Standing cautions

- Rule 13 + NEW: never pattern-kill (rk-7the, from a live incident — CLAUDE.md
  amendment pending TJO); codex exec needs `< /dev/null`.
- Verify subagent claims at source — but also the mirror failure: over-correction
  under review pressure is now a NAMED mode; don't soften untouched claims.
- numpy under 8GiB RLIMIT needs OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1.
- bd in rk-campaign-A is dolt-backed with no issues.jsonl (rk-svwy display gap);
  run bd commands for rk FROM the rk repo (cwd decides which tracker answers).
