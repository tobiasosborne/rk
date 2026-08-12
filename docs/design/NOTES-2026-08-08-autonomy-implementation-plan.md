# NOTES 2026-08-08 — Autonomy implementation plan (goal-graph reward, admission gates, wildcard arm)

Status: proposed, awaiting TJO ratification (rk-23pr). On ratification this folds into
IMPLEMENTATION_PLAN.md v3 and amends PRD §5/§6. Design record: rk
`docs/memos/2026-08-08-{proof-search-sota-survey,tjo-directives-autonomy-north-star,
autonomy-assessment-and-plan}.md` (the last contains the anti-wandering reward design
amendment). Directives D-a..D-d and the goal-graph payout design are TJO-accepted in
session 2026-08-08; the wildcard arm was added by TJO the same day ("a small chaos
element that admits alien technology").

## 0. Design summary (what is being implemented)

North star: an orchestrator left alone on a big research goal, effectively infinite
horizon, producing valuable banked results on the way. Anti-wandering principle:
progress is verified change in the goal graph; nothing earns credit at creation.

1. **Goal graph + frontier.** Root = north-star contract (already stamped by rk init).
   Decompositions are conditional claims ("if L1..Lk then T"), verified like any claim.
   Frontier = open obligations of live decompositions = the measurable campaign state.
   Direction-shaped goals maintain a milestone-question portfolio (each question carries
   a verified serves-the-direction rationale + subsumption check); competing
   decompositions coexist as a population.
2. **Attachment as admission.** Every conjecture names the frontier obligation it
   serves via an implication edge, adversarially verified (subsumed edge = named
   reject). Every definition names its intended use site. Unattached proposals go to
   the prospecting pool or wildcard lane, never the graph.
3. **Zero-at-admission; five payout events**, appended to a ledger:
   - CLOSE(O): tier-weight x realized hardness (measured prover effort, Elo-style).
   - REDUCE(O -> O1..Ok): verified conditional decomposition; paid mostly in ESCROW
     (fraction now, remainder as children close; escrow expires on frozen subtrees —
     the anti-theatre device against decomposition inflation).
   - PRUNE: verified refutation of a conjecture/branch; positive payout with death
     certificate.
   - REUSE: retroactive trickle credit up the dependency DAG — the only way
     definitions earn.
   - COMPRESS: proof shortening on re-derivation; requires >=2 distinct use sites.
4. **Calibrated hardness.** Every REDUCE/prior carries a pre-registered hardness
   prediction, Brier-scored against realized cost; estimator weights follow
   calibration. LLM taste = a prior with a scoreboard, never a reward.
5. **Hindsight attachment** (HER): prospecting/wildcard output and accidental lemmas
   earn only when they later attach to the frontier.
6. **Admission gates** (mip-re 7-layer stack, mechanized): conjectures — vacuity
   (derive-False attempt + hypothesis satisfiability sampling), triviality-by-
   automation, subsumption-vs-graph, falsification budget (coverage-guided numerics,
   cheap->expensive cascade), with "survived N trials" as first-class provenance.
   Definitions — mandatory sanity instances (positive AND negative canonical
   examples, mechanically checked), mutation self-test (mutants must be killed by the
   instances, else ERROR untestable-definition), source-anchored contracts
   (macro-expanded extraction + sha256 pin; the mip-re \abc fix), provisional status
   until first REUSE, blind dual formalization for load-bearing definitions.
7. **Wildcard arm** (the chaos element). Invariant: chaos lives on the ALLOCATION
   side only; payout rules are identical for wildcard items, so the ledger stays
   non-gameable. Spec:
   - Compute share: default 5%, pre-registered FLOOR 2% that no auto-tuning may
     cross (chaos yield is heavy-tailed; the optimizer must not starve it), maxActive
     cap, incubation M rounds (exempt from demotion clocks and bandit
     deprioritization, guaranteed minimum attempt budget; after incubation, normal
     rules — attach or archive).
   - Candidate sources, all mechanical: (a) transplant prompts — conjecturer seeded
     with a uniformly drawn distant technique/domain from a config deck; (b)
     discard-pile resurrection — uniform sample over items rejected ONLY for
     unattached/subsumed-prior causes (vacuous/falsified/trivial stay dead); (c)
     surviving mutants — the Gate D mutation engine run generatively: a mutant NOT
     killed by the parent's sanity instances and provably non-equivalent to the
     parent (differs on some instance) is a candidate new object. Alien != broken:
     wildcard items still pass all soundness checks.
   - Selection: lottery over eligible candidates, novelty-weighted by embedding
     distance to the existing corpus with weights clipped to [1,4] (pure-uniform is
     the degenerate config). Clipping keeps it chaos, not an optimized novelty
     objective (which would be gameable).
   - Accounting: wildcard-tagged events; chaos yield = retroactive attachments +
     CLOSEs per wildcard token, reported by rk audit; share tunable by evidence,
     floor immutable within a campaign.
8. **Wandering as audit defect.** rk audit metrics: pull rate (banked events attached
   to frontier / all banked), frontier stagnation clock, drift trend, concentration,
   chaos yield.
9. **Dead-end resolution** (unattended-run blockers): balloon mandatory-review routes
   to a fresh adversarial panel (mip-re layer-4 pattern; escalate only on split
   verdict); graph conflicts quarantine the node + file a bead instead of stalling;
   consensus rung made machine-verifiable or renamed.
10. **Calibration sampling.** 1-in-N accepted claims re-verified by an independent
    deep pass (fresh-context, cross-vendor, higher effort + numerics) to measure the
    false-accept rate of the cheap tiers; full deep verification mandatory on
    critical-path claims (query exists, M2.5).

## Decision points for TJO (N0 gates on these)

- **Q1 (D5).** The calibration oracle: (a) independent re-derivation + numerics only —
  stays within settled D5 (no Lean in any role); or (b) amend D5 to permit SAMPLED
  Lean spot-checks as a measurement instrument only (never a rung, never a gate).
  TJO's directive D-b ("Lean only if untrusted") cuts both ways for a dark factory
  whose claims are untrusted-by-default at scale. Plan proceeds with (a) either way;
  (b) is an additive later WP.
- **Q2 (ownership).** Confirm the settled split: rk owns graph/frontier/gates/event
  ledger; fr owns allocation policy/returns/audit instrumentation (F-items). Plan
  assumes yes.
- **Q3 (numbers).** Wildcard share 5%/floor 2%/incubation 8 rounds; prospecting arm
  10-20%; calibration sample rate 1-in-10 initially. All pre-registered in N0, tuned
  only at pre-registered review points.
- **Q4 (portfolio).** Milestone-question portfolio for direction-shaped goals as a new
  registry shard kind (`question`), gated like conjectures. Plan assumes yes.

## Milestones (N-series; interleaves with existing M4/M5, renumber on fold-in)

Sizes: S (<=1 session), M (2-3), L (4+). Existing M3-final-close and M4.0-M4.4 run
first, unchanged. N1/N2 before the M4.5 flag flip (gates before bandit: a bandit over
an ungated pool optimizes slop throughput).

### N0 — Ratification + pre-registration (S)

| WP | Deliverable | Acceptance |
|---|---|---|
| N0.1 | TJO rules Q1-Q4; PRD §5/§6 amendment text drafted (goal-graph returns replace the M4.5/F6 return list; wildcard arm added; rigour-ladder note for provisional definitions); this file folds into IMPLEMENTATION_PLAN v3 | Amendments committed in research-workflows |
| N0.2 | Pre-registration doc (append-only, M4.0 style): payout weights, escrow fractions + expiry, hardness-prediction protocol + Brier scoring, wildcard share/floor/incubation, prospecting quota, calibration sample rate, wandering-metric thresholds, kill criteria | Reviewed before any N3 flag flips |

### N1 — Goal-graph substrate (M-L; Tier A throughout)

| WP | Deliverable | Acceptance |
|---|---|---|
| N1.1 | Schema: graph v2 (obligation nodes, decomposition claims, attachment edges, question shards per Q4); compat bump + fixtures (rule 10) | Round-trip + rename-hazard fixtures green |
| N1.2 | `src/graph/frontier.ts` (pure): frontier computation over live decompositions; population semantics (competing decompositions); extends critical-path query | Property tests: frontier monotone under CLOSE; PRUNE removes branches; agrees with linker ground truth |
| N1.3 | Event ledger (store edge + pure core): append-only CLOSE/REDUCE/PRUNE/REUSE/COMPRESS with escrow state machine (grant/vest/expire), hash-bound to claim content | Escrow property tests incl. expiry-on-freeze; corpus fixtures for double-pay and orphan-vest attempts |
| N1.4 | Hardness records: pre-registered prediction entries, realized-cost capture from driver token accounting (M3.9 machinery), Brier scoring (pure) | Seeded fixture: miscalibrated estimator's weight decays; no post-hoc prediction edits possible (append-only) |

### N2 — Admission gates + evidence workers (L; Tier A gate logic, red corpus FIRST)

| WP | Deliverable | Acceptance |
|---|---|---|
| N2.1 | Red corpus for Gates C/D: vacuous (False-derivable hypotheses), trivial (automation-dispatchable), subsumed reformulation, unattached non-wildcard, untested (missing falsification record), definition without negative sanity instance, untestable definition (mutant survives instances), unanchored cited contract (the \abc class), forged evidence record (content/schema mismatch — mip-re lesson: validate CONTENT not shape) | Each fixture fails exactly its target check |
| N2.2 | Gate C (conjecture admission, pure): validates presence + integrity of admission evidence records (vacuity, falsification N-trials, subsumption result, attachment edge or wildcard/prospect tag); named reject causes {trivial, vacuous, subsumed, falsified, unattached, untested}; coverage line | Corpus green; contract in gate-contracts.md; silent skip = bug |
| N2.3 | Gate D (definition admission, pure; extends defs gate): sanity-instance records (>=1 positive, >=1 negative), mutation self-test record, named use site (or wildcard), source anchoring for kind=cited via macro-expanded quote-at-locus (extends Gate 3 + C7 refs); provisional-until-REUSE status wired into linker propagation | Corpus green; provisional status renders truthfully (truthfulness fixture) |
| N2.4 | Evidence workers (drive, bounded per rule 13): numerics-mirror role (writes + runs mirror script under timeout, emits content-validated falsification record), vacuity prober (derive-False attempt), mutation engine (hypothesis-drop / quantifier-flip / constant-perturb / bound-swap mutators) serving Gate D self-test AND gate-mutant fixture generation AND wildcard source (c) | Live-fire on 3 known-bad + 3 known-good statements from the mip-re incident set; all six classified correctly |
| N2.5 | Blind dual formalization flow for load-bearing definitions (two independent workers, never sharing drafts; referee diffs; findings need mechanically-confirmed counterexamples); HAZARDS checklist as reusable artifact type | Re-run on mip-re's StrategyDist incident inputs: the blocking bug is caught |

### N3 — Reward + allocation integration (L; mostly fr per Q2)

| WP | Deliverable | Acceptance |
|---|---|---|
| N3.1 | fr F6 return function upgraded to goal-graph payouts (amends M4.5): CLOSE/REDUCE-escrow/PRUNE/REUSE/COMPRESS consumed from rk's ledger; rigor-weighting retained; additive-only schema | Laundering fixtures: reformulation-close pays zero; decomposition-inflation subtree freezes and escrow expires |
| N3.2 | Prospecting arm (quota per N0.2) + hindsight attachment (retroactive credit event on late attachment) | HER fixture: unattached lemma banked at t, attached at t+k, credit flows at t+k with provenance |
| N3.3 | Wildcard arm per design §7: config (share/floor/incubation/maxActive, fail-closed validation), three candidate sources, clipped-novelty lottery, incubation exemptions in promotion/demotion logic, chaos-yield accounting | Fixtures: floor cannot be tuned to zero; unsound candidate cannot enter via wildcard; incubation exemption expires; resurrection never samples falsified items |
| N3.4 | Shadow mode then ABAB on a live campaign (reuses M4.6/M4.7 protocol + M4.0/N0.2 pre-registration) | Pre-registered thresholds decide adopt/kill; no post-hoc edits |

### N4 — Autonomy loop closure (L)

| WP | Deliverable | Acceptance |
|---|---|---|
| N4.1 | rk audit wandering lenses (extends M5.1): pull rate, frontier stagnation clock, drift trend, concentration, chaos yield; scheduled, findings filed as beads | Runs unprompted on dogfood; seeded wandering fixture (activity without frontier change) is flagged |
| N4.2 | Dead-end resolution: mandatory-review -> fresh adversarial panel worker (escalate only on split verdict); graph-conflict quarantine + auto-filed bead; both leave the campaign runnable | Synthetic balloon + synthetic conflict both resolve or quarantine without human input |
| N4.3 | Calibration sampling worker: 1-in-N independent deep re-verification (per Q1 ruling) of accepted claims; false-accept ledger + report; mandatory deep pass on critical-path claims | False-accept rate reported on dogfood; a seeded wrong-accept is caught by the sampler |
| N4.4 | Consensus rung: machine-verifiable sign-off record or renamed honestly (per TJO ruling at N0) | An unattended agent cannot self-sign the human rung (fixture) |
| N4.5 | Render (extends M2.4): frontier page (obligations, hardness, escrow state) + results ledger page ("banked so far": survived lemmas/definitions with evidence trails) — the dark factory's output shelf | Truthfulness fixtures; SC5-style third-party read test |

### N5 — Dark-factory live-fire (M)

| WP | Deliverable | Acceptance |
|---|---|---|
| N5.1 | Unattended dogfood: a real, small research goal; orchestrator runs a bounded window (e.g. 72h wall-clock, budget-capped per rule 13) with zero human input after launch | Run completes or dies legibly; pull rate, chaos yield, false-accept, frontier delta all reported; at least one banked artifact a domain reader judges non-trivial |
| N5.2 | Postmortem memo + PRD/plan adjustments; wildcard/prospecting/calibration numbers re-registered from evidence | Memo committed; next-window parameters pre-registered |

## Sequencing constraints

- M3 final close and M4.0-M4.4 unchanged, first. N1 before N2 (gates validate N1's
  record schemas). N2 before N3.1 flag flip (gates before bandit). N0.2 before any N3
  flag. N3.4 shadow gates ABAB. N4.1-N4.3 before N5 (no unattended run without audit +
  calibration). N4.5 anytime after N1. Wildcard (N3.3) requires N2.4's mutation engine.
- Existing rk-j4vg (multiplayer) ratification is orthogonal; MP items slot after N1 if
  TJO folds them into M5.
- Estimates are tripwires (rk rule 11): any N-WP ballooning past 2x plan size stops and
  re-plans.

## What this does not change

D1-D4, D6-D8 untouched. D5 untouched under Q1(a); Q1(b) is an explicit TJO-only
amendment. Zero runtime deps, pure core / thin edges, no servers, no remote CI. fr
remains allocator, rk remains ground truth. Anti-Zeno and Tier A discipline unchanged
for rk development. The entry gates are pure gate logic + corpus fixtures — rk's
existing shape, two more gates (8 -> 10).

## Rulings (appended 2026-08-08, TJO in-session)

Q1 = (a): no Lean in any v1 role; sampled-Lean calibration is a v2 feature behind a
future explicit TJO decision. Q2 = confirmed. Q3 = numbers as proposed (pre-registered
in rk docs/memos/2026-08-08-prereg-autonomy-v1.md). Q4 = yes. Additional TJO
directives: live-fire as soon as a smoke test is possible (S0 smoke slice defined in
the prereg doc, pulled ahead of full N2); orchestrator codes core itself, Opus lanes
for clearly-specified parcels; per-landing adversarial review relaxed for N-series
(red-green + red corpus stay law; occasional code review; smoke test is the primary
bug-finder). Plan status: RATIFIED; this file is the working plan for the N-series.

## Correction (2026-08-08, TJO): mip-re is not a golden master

mip-re was a mini prototype; it is NOT a source of golden masters (same stance L5
takes on AISM: incident history is load-bearing data, behavior is not the spec).
N2.4/N2.5 acceptance is amended: no re-running of mip-re inputs. Instead, distill at
most a small number of SYNTHETIC corpus fixtures from mip-re incident CLASSES (e.g.
one vacuous-definition fixture in the StrategyDist shape; one unanchored-macro
fixture in the \abc shape), authored fresh for rk's corpus with rk's own contracts.
