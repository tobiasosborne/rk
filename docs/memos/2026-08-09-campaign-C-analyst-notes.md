<!-- ROLE: examiner's running analyst notes on campaign C (real-research smoke run) —
     rk-relevant observations for upgrade/remediation. APPEND-ONLY, timestamped entries.
     Triage codes as in ../rk-bench/paper-A/analyst-notes.md: [INFRA] tooling, [PROC]
     process/protocol, [MATH] mathematical content, [BEHAV] agent behavior.
     TRIGGER: appended at every examiner sweep or orchestrator check-in; findings that
     demand action become beads (named inline). -->

# Analyst notes — campaign C (rings/ideals/varieties), window 1

Examiner: Fable session 2026-08-09. Orchestrator: Fable subagent (TJO exceptional
grant), all worker seats codex gpt-5.6-sol at xhigh, workspace-write (workers execute).
Purpose: first rk campaign on a REAL open research goal; smoke test of the pipeline
TJO registered as success criteria (rk-4305): (1) question generation -> (2) direction
identification -> (3) explore/exploit -> (4) exploration-tree updates -> (5) rigorous
results even off-north-star.

## 2026-08-09 ~09:15 — launch context

- [PROC] Scaffold: `rk init` stamped clean; campaign-A learnings ported into the
  constitution BEFORE launch (probe protocol I.1-I.3 incl. the window-5 immutable-
  archive patch, brief format, hostile-seat rule, worker lifecycle, orchestrator
  discretion clause). First campaign whose constitution starts with prior campaigns'
  scars instead of learning them again.
- [INFRA] Differences from campaign A, deliberate: workers EXECUTE (codex
  workspace-write; eval-era read-only sandbox was a handicap, TJO directive);
  librarian date-cap lifted (real research needs live novelty sweeps); no seal, no
  tripwire, examiner steering permitted (process-level only so far).

## 2026-08-09 ~09:30-10:10 — window 1, rounds 1-2 (sweeps + check-ins)

- [BEHAV] Orchestrator's first moves, unprompted: literature baseline FIRST (8
  ledgered sweeps + 4 anchor abstracts — van Dam-Seroussi Gauss sums, Chen-Gao
  Boolean/QLSA, Yamakawa-Zhandry, Aharonov et al. Tutte) before generating anything;
  a written decision record interpreting "novelty" + banking bar + taxonomy; a 5-arm
  fr portfolio (later self-extended to 6: spectral-zone-audits). Discretion clause is
  being used as intended — structure invented, reasoning recorded.
- [PROC] STAGE 4 FIRED. Six op- route shards wired into north-star `routes:` in r1 —
  the decomposition machinery campaign A never touched in five windows (reduces=0
  standing fact). Whether verified reduce EVENTS follow (the escrow half) is the
  remaining stage-4 question; watch at close.
- [BEHAV] Wildcard streak extends: the wildcard seat produced the window's first
  artifact (EP-amplification route killed with cause, probe ledgered) — wildcard arms
  are now first-to-content in three consecutive campaigns. The 2% floor is earning
  its binding status.
- [PROC] First bank: obs-ep-amplification at proved-mod-audit, hostile-verified,
  same-family caveat recorded in provenance, "hash-bound fr bank verdict through a
  record-integrity oracle" — an orchestrator-invented integrity check on bank
  records. WORTH PORTING: examine at close; if sound, this belongs in rk proper
  (Gate 8 or the verify driver), not in one campaign's scripts.
- [BEHAV] Self-adversarial seat mix without prompting: round 2 included a hostile
  dequantization seat attacking its own surviving candidates with known classical-
  simulation tools, and a premise-check pass re-verifying recalled DQC1 theorems
  against fetched sources before relying on them. Kill-tests-before-claims
  (2111.00405 condition-number bounds vs Macaulay routes) is the right shape for
  novelty claims.
- [PROC] WATCH ITEM: commit a15b587 banks prop-pauli-logdet-dqc1-hard at
  "proved-mod-audit, unverified" per its own commit message. If a pma rung can carry
  an unverified node even transiently, that is either an honest staging convention
  (verify panel queued, round 3) or a Gate 8 hole. Resolve at close; if the latter,
  bead it as Tier A.
- [INFRA] Worker throughput data (first real xhigh sample): 4-seat waves, roughly
  10-25 min/seat, transcripts 0.3-1.2 MB. Four codex OS processes per seat (wrapper,
  binary, sandbox children) — liveness checks must count by cwd, not by name.

## 2026-08-09 ~10:32 — STALL: missed wake-on-worker-completion (second occurrence of the class)

- [INFRA] The orchestrator went idle at 10:08:12; its last worker (access-
  conditioning) exited cleanly at 10:09; the harness wake-up never fired; the 19.7 KB
  report sat uncollected for ~25 min until the examiner noticed and resumed the agent
  by message. Same failure class as campaign A window 5's turn-boundary kill
  (RUN-REPORT-5 §6.3) but a DIFFERENT mechanism: there the turn end killed live
  workers; here the workers survived and the wake was lost. Folded into rk-4w2y:
  the N2 worker contract needs BOTH halves — don't kill on turn end, and don't trust
  wake-on-completion as the only resume path (poll tracked handles before stopping;
  harvest-all-on-wake).
- [INFRA] Observability gap, user-reported: TJO could not tell whether anything was
  running — the orchestrator is an in-process subagent (invisible in ps), and the
  examiner's own first liveness check was wrong (stat on the task-output SYMLINK
  reported the link, not the transcript; must stat -L). A campaign needs a one-command
  liveness answer: live worker procs by cwd + orchestrator transcript mtime
  (dereferenced) + last commit age. Candidate: `rk status --live` or a
  scripts/liveness.sh in the campaign template. Bead at close.

## Standing watch items for window close

1. Stage-4 second half: do verified reduce events (escrow) fire, or only route wiring?
2. The "proved-mod-audit, unverified" staging convention — honest staging or gate hole?
3. The record-integrity oracle — port to rk if sound.
4. Pipeline scorecard vs rk-4305's five stages, graded honestly.
5. Missed-wake recurrence count under the new poll-before-stopping guard.
