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

## 2026-08-09 ~10:45 — recovery clean; round-3 panel in flight

- [INFRA] The resume-after-missed-wake worked exactly as the rk-4w2y contract sketch
  says it should: the orchestrator harvested the stale report in one pass, dispatched
  the 3-seat round-3 verification panel, then POLLED ITS HANDLES before ending the
  turn and stopped only after confirming all three genuinely mid-run (logs growing,
  processes alive). The poll-before-stopping guard is cheap and worked first try —
  adopt it verbatim in the N2 worker contract.
- [PROC] Watch item 2 update: the "proved-mod-audit, unverified" proposition is
  confirmed as STAGING — it is a named target of the running hostile panel, not a
  quietly-worn rung. Whether the rung label itself should be allowed to say pma
  before the panel returns is still the design question for close (a reader of the
  shard between r2 and r3 would over-trust it).
- Meters at round 3: 10 shards (8 critical-path), 1 banked obstruction, 7 ledgered
  kills, 1 proposition under panel, 2 routes frozen with precise revival facts,
  4 refs sources fetched. Kills outnumber banks 7:1 — the honest shape for a
  first-window portfolio on a hard open goal.

## 2026-08-09 ~10:55 — round-3 panel harvested; watch item 2 RESOLVED

- [PROC] The staged proposition survived: prop-pauli-logdet-dqc1-hard verified by the
  hostile panel with 5 revisions applied and its premise source-anchored; the staging
  convention discharged its debt. Second bank from the panel: prop-macaulay-access
  (pma, hostile-verified), with deps wired op-{membership,hilbert} ->
  prop-macaulay-access — the graph is growing joins, not just leaves. The Dwork
  revival bar was split rather than hand-waved.
- [BEHAV] The panel REFUTED one of the orchestrator's own FINDINGS entries (a
  sketching callout, overclaim refuted-as-written, scoped replacement installed) —
  reviewer-vs-orchestrator asymmetry working in the right direction again.
- [BEHAV] Honesty micro-datum worth keeping: commit 3df8440's message states the
  PREVIOUS commit claimed a correction prematurely (edit had failed on a read-guard)
  and re-applies it with the failure noted. Commit messages as honest record even at
  trivial scale — the culture the constitution wants.
- Round 4 (2 seats) dispatched; close (RUN-REPORT-1 + HANDOFF + worklog) is next.

## 2026-08-09 ~12:00 — SECOND missed wake (same window); wake-on-completion is now measured-unreliable

- [INFRA] w1r5-verify-hilbert finished 11:24:06, four minutes AFTER the
  orchestrator's last activity (11:20:22); no wake fired; 36 min idle before the
  examiner's sweep caught it (user noticed first, again). This is the mechanism the
  poll-before-stopping guard CANNOT cover: the poll was truthful (worker genuinely
  mid-run at turn end); the completion wake simply never arrived. Two misses out of
  roughly six wake opportunities this window (~1/3 loss rate). CONSEQUENCE for rk/N2:
  wake-on-completion must be treated as lossy signal, not contract — the worker
  lifecycle needs an examiner/watchdog-side sweep (cheap: newest .log mtime vs
  orchestrator transcript mtime, alert on inversion) or in-turn bounded waiting.
  Folded into rk-4w2y. The user-facing symptom both times: "nothing seems to be
  running" — the liveness-observability bead and this are the same remediation
  surface.
- [PROC] Round-5 bridge verification (harvested before the stall): Thms 1-2
  ENDORSED, Thm 3 endorsed with repairs (pointwise Weyl, irreducibility, a
  STRENGTHENED no-gap corollary — the reviewer improved the result again); a
  clock-block contract overclaim fixed; a stale naturalness-gap contract rewritten.
  Reviewer-improves-banked-constant is now a recurring positive pattern (campaign A
  window 3, campaign C window 1).

## 2026-08-09 ~12:15 — WINDOW 1 LANDED. Examiner audit CLEAN. Scorecard + one examiner-caused gap

AUDIT: transcript 0/0/0 (0 WebSearch, 0 WebFetch, 0 mcp__ tool_use, despite repeated
MCP-roster injections, all disclosed); tree clean; 19 commits, rk check green
throughout; 34 librarian calls ledgered, 3 full-text sources byte-hashed; 15 worker
seats all collected, no live handles.

YIELD: 6 artifacts banked at proved-mod-audit, ALL hostile-verified (6 of 15 seats
were verification): obs-ep-amplification (scoped after universal wording refuted),
prop-macaulay-access (probe reproduced byte-identically by verifier),
prop-pauli-logdet-dqc1-hard (premise byte-anchored), prop-macaulay-clock-block
(overturns the translation-structure objection), obs-koszul-transparency,
obs-koszul-rigidity. 9 kill certificates + 2 on-record corrections (one of the
orchestrator's own claims refuted by its panel and replaced). NO speedup claim at any
rung — none manufactured. Surviving frontier: one sharply-posed open problem (the
Macaulay naturalness bridge; dilution (2/5)^(n-1) is the named blocker, falsifiers
recorded), + op-truncated-ideal-membership (no prior art surfaced, conditioning
corridor measured), + two Frobenius/Dwork routes frozen with revival facts.

PIPELINE SCORECARD vs rk-4305 (TJO's five stages, graded honestly):
1. Question/conjecture generation — PASS. 4-seat generative wave under a written
   novelty-interpretation + taxonomy decision record; literature baseline laid FIRST.
2. Identify promising directions — PASS with a caveat: triage was literature-grounded
   and kill-test-driven (condition-number bounds, hostile dequantization), but
   predict-before-attempt never ran (see the gap below), so direction-picking has no
   Brier/calibration record this window.
3. Explore and exploit — PASS. 12 budgeted rounds restructured to 5 under discretion
   (generate -> audit -> verify x2 -> deep-dive exploit); wildcard seat first-to-
   content AGAIN (4 campaigns running).
4. Update exploration tree — HALF. Route wiring + dependency edges fired for the
   first time in any campaign (6 op- routes; deps op-{membership,hilbert} ->
   prop-macaulay-access; critical path 8). But verified reduce/escrow events: ZERO —
   and the cause is now known (below), not agent reluctance. Still unexercised after
   two campaigns.
5. Rigorous results even off-north-star — PASS. See yield; the reviewer STRENGTHENED
   a result (no-gap corollary) — second recurrence of reviewer-improves-result.

EXAMINER-CAUSED GAP (the window's most important rk finding): rk reward ledger is
EMPTY — closes=0, reduces=0, prunes=0 against 6 banks and 9 kills. Root cause: the
rk init template contains NO reward/§G protocol section (0 grep hits) — campaign A's
§G was hand-authored during the N-series; the examiner's port to campaign C took
I.1-I.3 and missed §G. The orchestrator followed its stamped constitution faithfully
and invented a sound parallel record (fr bank verdicts, hash-bound). CONSEQUENCES:
(a) reward economics, stuckness meters, and Brier calibration have no data for the
first real-research window; (b) the orchestrator's fr-oracle convergently re-invented
half of Gate 8's job — evidence the design is natural, and a port candidate both
ways. REMEDIATION (bead rk-????): add the S0 reward protocol to templates so rk init
stamps it; backfill campaign C's constitution before window 2; window-2 round-0
chore: rk reward sync to emit the events the registry already implies.

NEW INFRA FINDINGS from the close-out: codex `-o` CLOBBERS worker-written files
(convention fixed campaign-side — workers write their own report path, -o goes to a
scratch file; worker-contract note for N2); wake-on-completion final tally 2 misses /
~6 (both caught, no work lost).

WINDOW-2 QUEUE (campaign bd): refs manifest adoption (t0u) first, then the
naturalness bridge (lyi, P0).
