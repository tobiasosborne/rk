<!-- ROLE: pre-registration record for the autonomy/goal-graph system (N-series).
     AUTHORED. UPDATE POLICY: APPEND-ONLY — numbers here may be changed only at the
     named re-registration points, by dated append, never by edit. TRIGGER: read
     before implementing or flipping any N-series flag; N5.2 postmortem re-registers. -->

# Pre-registration: autonomy v1 (2026-08-08)

Rulings (TJO, 2026-08-08, in-session): Q1 = (a) — no Lean in any v1 role; sampled
Lean spot-checking is a v2 feature behind a future explicit TJO decision (bead filed).
Q2 = confirmed split (rk owns graph/frontier/gates/event ledger; fr owns allocation
policy/returns/instrumentation). Q3 = numbers below. Q4 = yes, `question` shard kind.

Governance for N-series implementation (TJO, same session, verbatim intent): the
orchestrator (Fable) codes the core itself and delegates to Opus lanes when a parcel
is clearly specified; keep the big picture; do NOT burn heavily on adversarial
checking of the orchestrator's own code — red-green TDD stays law, the odd code
review catches the rest, and the SMOKE TEST is expected to reveal the most problems.
Live-fire is wanted as soon as a smoke test is possible. This relaxes the per-landing
Tier A cadence for N-series work specifically, by TJO directive; L1/L2 (red-green,
red corpus) are NOT relaxed.

## 1. Payout function v1 (all values pre-registered)

Tier weights w(t): proved = 1.0; proved-mod-audit = 0.6; numerical = 0.25 (ceiling
rung, never promotes); cited = n/a (definitions earn via REUSE only); stated = 0.

- CLOSE(O) = w(tier) x H_real(O), where H_real(O) = log2(1 + spent_tokens(O)/T0),
  T0 = 100k tokens. Log scaling: grind cannot be farmed linearly.
- REDUCE(O -> O1..Ok): value V = max(0, H_pred(O) - Σ H_pred(Oi)) computed from
  pre-registered hardness predictions. Paid 25% on verification of the conditional
  implication; 75% held in escrow, vesting pro-rata as each Oi CLOSEs. Escrow
  EXPIRES (unvested remainder voided) if the subtree is frozen — no CLOSE or PRUNE
  event anywhere in it for E = 12 consecutive allocation rounds — or if the
  decomposition is superseded/pruned.
- PRUNE(branch) = 0.3 x H_pred(pruned obligation), requires a verified refutation
  record (death certificate). Flat rate; refuting hard-looking things pays more.
- REUSE: 10% of each CLOSE payout is distributed, equal split, to the definitions and
  lemmas DIRECTLY cited by the closing proof (one hop only in v1; multi-hop cascade
  is a v2 question). This is the only income definitions have.
- COMPRESS = 0.1 x H_real(node), requires >= 2 distinct use sites, payable at most
  once per node.

## 2. Hardness predictions + calibration

A prediction is appended BEFORE the first attempt on an obligation: P(CLOSE within
250k tokens) and P(CLOSE within 1M tokens). Predictions are immutable. On resolution
(close/prune/freeze at budget), Brier-scored. Estimator weight = clip(0.25/brier,
0.5, 2.0), recomputed per audit window. Unresolved predictions do not score.

## 3. Quotas and rates

- Wildcard arm: 5% compute share; FLOOR 2% (immutable within a campaign — no
  auto-tuning below it); incubation 8 allocation rounds (exempt from demotion clocks
  and bandit deprioritization; guaranteed >= 2 attempts); maxActive 3.
- Wildcard lottery: novelty weights = embedding distance to corpus, clipped to
  [1, 4]; sources = transplant prompts (uniform over config deck), discard
  resurrection (uniform over rejects whose ONLY causes are unattached/subsumed-prior;
  vacuous/falsified/trivial are never resurrected), surviving non-equivalent mutants.
- Prospecting arm: 15% compute share.
- Calibration sampling: 1 in 10 accepted claims gets an independent deep
  re-verification (fresh context, cross-vendor, higher effort, numerics where
  applicable — Q1(a): no Lean). Critical-path claims: always. False-accept ledger is
  append-only.

## 4. Wandering thresholds (rk audit WARN lines)

- Pull rate < 0.5 over the trailing 50 banked events.
- Frontier stagnation: no CLOSE/REDUCE/PRUNE for > 40 allocation rounds or > 24h
  wall-clock, whichever first.
- Concentration: Gini over obligations > 0.8.
- Drift: monotone increase of active-work embedding distance to goal statement over 3
  consecutive audit windows.
- Chaos yield: reported, no threshold in v1 (measurement first).

## 5. Allocation experiment decision rule (N3.4)

Shadow mode first; ABAB only if shadow agreement/divergence report is reviewed.
Adopt if the policy-on arm is >= policy-off on BOTH banked-per-100-rounds and pull
rate. Kill if pull rate drops > 20% vs control, or any laundering-fixture class is
observed live (reformulation-close paying nonzero; escrow vesting on a frozen
subtree). No threshold edits after the fact.

## 6. Smoke-test gate (S0, precedes everything heavy)

TJO directive: live-fire as soon as a smoke test is possible. S0 = minimal vertical
slice — schema v2 + frontier query + event ledger with escrow + minimal Gate C
(record-presence checks) + payout computation in SHADOW (computed and logged, not
allocating) — driven on a toy goal repo for a bounded window. Success: ledger
consistent (no double-pay, no orphan vest), frontier monotone under CLOSE, injected
worker failure dies legibly, payout log matches hand-computed values on the fixture
script. S0 failures feed fixes BEFORE N2 completes; N5.1 (real unattended run)
follows the first clean S0.

## 7. Re-registration points

Numbers above change only: (a) after S0 smoke findings, for mechanics that S0 proves
broken (dated append required); (b) after the N5.1 postmortem (N5.2). Nothing else.

## Appended 2026-08-08 (same day, TJO-ratified): N5.1 paper-firewall benchmark protocol

Ratified in-session. The N5.1 "real research goal" becomes a settled-question benchmark:
a post-cutoff arXiv paper's question, campaign firewalled from the answer.

- Leakage channels controlled: (1)/(2) search -> NO network for any worker; ONE librarian
  role, arXiv API only, hard submittedDate <= D cap, append-only request/response ledger;
  PreToolUse deny hooks as defense-in-depth. (3) weights -> paper must postdate the newest
  fleet cutoff + buffer; CANARY PREFLIGHT mandatory (probe every fleet model with the
  question + title probes in throwaway contexts; any confident hit burns the paper).
  (4) setup -> examiner context (reads paper, seals answer) is DISJOINT from the campaign
  orchestrator, which never reads the paper; goal statement must be posable in pre-cutoff
  language, ideally sourced from a pre-cutoff public statement (MathOverflow / conjecture
  catalog). (5) residue -> fresh campaign repo and stores.
- Answer envelope: examiner commits sha256 of the settled statement + a sealed
  method-fingerprint term list BEFORE launch (sealed dir, orchestrator-pledged unread;
  audit subagents read it). Tripwire: an audit lens greps banked artifacts + librarian
  ledger for fingerprint terms each round via an ISOLATED subagent reporting only
  hit/no-hit; a hit halts the campaign.
- Pre-registered outcome classes: (a) settled at comparable strength; (b) weaker version /
  key lemma / same crux reached; (c) different-but-valid route; (d) goal unmet but
  nontrivial banked byproducts (examiner-scored blind); (e) validity held (zero false
  banked claims under sampled deep verification) regardless of progress. Ledger metrics
  (pull rate, false-accept) are co-primary endpoints. Batch of 3-5 papers across
  difficulty is the unit of evidence; single papers are anecdotes. Results expire per
  model generation (rolling benchmark; the time series is the deliverable).
- Asymmetry disclosure (fixed framing): "can the orchestration reach a known frontier
  point unaided" — never a head-to-head with the authors.
