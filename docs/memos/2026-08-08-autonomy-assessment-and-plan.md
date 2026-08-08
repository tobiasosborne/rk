<!-- ROLE: assessment + proposed plan for the autonomy north star (TJO directives
     D-a..D-d, memo 2026-08-08-tjo-directives-autonomy-north-star.md). AUTHORED.
     UPDATE POLICY: immutable except appending TJO's ratification outcome and dated
     amendments. TRIGGER: TJO ratification pending; read before M4.0. -->

# Autonomy assessment and plan (2026-08-08)

Inputs: SOTA survey memo (same date); mip-re extraction (7-layer definition-integrity
stack, incident ledger, $28.32 campaign); rk process inventory (14 step-classes, 8
gates/83 checks, 170 src files); gating-literature survey (counterexample gates,
mutation testing of specs, library-learning value signals, reward shaping). Full lane
reports are in the session transcript; every claim below traces to one of them.

## 1. Evaluation of the four directives

### D-a (af-first catches classes Lean cannot): SUPPORTED, with one sharpened caveat

mip-re is direct evidence: the 7-layer stack caught 1 BLOCKING + 2 MAJOR
statement-level bugs across 13 definitions for ~$11 — all faults that compile cleanly
and yield "verified" theorems in a Lean-only pipeline (vacuous StrategyDist, dropped
unit-norm constraint, wrong constants). External corroboration: ~43% of proved
LLM-formalized statements match their source [RCLJ'26]; miniF2F v1 shipped vacuous/
mis-formalized statements at benchmark scale; Herald's LLM-judge pipeline claimed 97%
faithfulness, audited at 67%.

Sharpened caveat 1: the catching was done by MECHANICAL layers — blind dual-draft
diff, numerics mirror (500 trials/constant), compile. Back-translation LLM judges
passed everything INCLUDING the blocking bug. "NL checking" is not the mechanism;
independent re-derivation + mechanical falsification is. Port those, not judges.

Sharpened caveat 2: the one documented miss (the \abc macro incident) is the residual
class for the whole af stack — every layer verified a wrong transcription against
itself; only a human reading the paper source caught it. The mechanical fix is
source-anchoring: contract extraction must macro-expand from the pinned true source
(sha256), and rk's Gate 3 quote-at-locus is the adjacent existing machinery to extend.
n=1 campaign, 13 definitions — real evidence, small sample; the plan includes
measurement to grow it.

### D-b (Lean as last resort): RIGHT AS POLICY, but the trust boundary must be measured, not asserted

Supporting evidence: mip-re's prover ladder went 12/12 with zero false-goal incidents;
verified Lean cost ~$11/kLOC worst-case with 28x cost swings from premise oracles —
kernel verification is affordable but never free, and tiering by stakes is already
rk's design (soft L5 tier vs hard af tier).

The pushback, stated plainly: mip-re's zero-false-goal record was achieved AFTER the
$11 definition-integrity stack had vetted every statement. The Isabelle community's
standing figure — ~95% of user-conjectured statements during development are false —
is why disprove-first is their default. LLM proof reliability GIVEN a true, well-posed
statement is now high (agreed); reliability of the whole chain is not, and the chain
is where campaigns die. Second: for the unattended north star (D-c), the reward signal
must be non-gameable. An LLM verifier is a learned judge — the same object DeepSeek-R1
abandoned PRMs over (reward hacking, no ground truth). Removing both the human AND the
kernel leaves a gameable judge as the only oracle, which a long-horizon RL loop will
find and exploit.

Resolution (proposed): Lamport-notation NL proofs + adversarial NL verification as the
DEFAULT tier; kernel verification demoted from gate to CALIBRATION INSTRUMENT — a
sampled audit (e.g. 1-in-N accepted claims, N tuned by measured false-accept rate)
that keeps the cheap tiers honest and produces the false-accept statistic that
currently does not exist anywhere (no Lean-side analog of Isabelle's 95% figure is
published; measuring it is cheap and novel). Full kernel proof remains mandatory only
for load-bearing/critical-path claims — which rk's critical-path query already
identifies. This is bitter-lesson-aligned: the survey's discriminating principle is
that ground-truth non-gameable signals survive scale; sampling makes the expensive
oracle cheap-to-call in expectation without giving it up.

### D-c (unattended goal-directed research; reward for defs/conjectures is the open problem): FRAMING CONFIRMED BY THE FIELD

The survey independently lands on the same diagnosis: AlphaProof Nexus beat standalone
AlphaProof (9/353 open Erdos problems vs 0 at LARGER per-problem budget) by moving
leverage into the orchestration layer — sketch selection, decomposition, problem
choice. Nobody has a load-bearing computed reward for definitions or conjectures;
interestingness is the field's thin spot, outsourced to humans everywhere it matters.
Bandit allocation over a pool of open conjectures is an UNCLAIMED niche (closest:
arXiv:2506.12721, general reasoning). rk's PRD already contains the right skeleton:
tier-weighted returns, rigor-weighted so low-tier motion cannot launder into return
(PRD ~line 352), decaying optimism + concentration penalty, shadow-then-ABAB rollout.

On "LLMs have good taste": partially supported, with a discipline. Taste exists
(FunSearch/AlphaEvolve/PatternBoost produced genuinely novel constructions; Nexus's
Elo raters worked). But self-reported interestingness is exactly what Ritchie & Hanna
showed to be untrustworthy in AM, and what LLM judges failed at in Herald. Use taste
as a PRIOR (rating candidates for attention), never as the REWARD (what gets banked).
Reward must come from mechanical events: survived falsification, banked proofs,
downstream reuse, goal-distance reduction.

Known failure modes to engineer against, from the literature: conjecturer drift
toward needlessly-complex statements (fix: diversity regularizer over embeddings,
arXiv:2606.01861 — the concentration penalty is rk's planned cousin); distribution
collapse of self-generated curricula; entropy collapse in RLVR loops; goal-shaping
corrupting the policy (fix: potential-based reward shaping, Ng/Harada/Russell 1999 —
F = gamma*Phi(s')-Phi(s) is policy-invariant, so a goal-distance potential is SAFE to
add); no validated metric exists for "distance to a specific open problem" — that
piece is original design work, flagged as such.

### D-d (gate definitions and conjectures hard, mutation/fuzzing ideas): SUPPORTED; the literature hands us the parts

Directly portable mechanisms, each with prior art:
- Disprove-first cascade, cheap-to-expensive (Quickcheck->Nitpick pattern; Isabelle's
  ~95% figure is the justification). Coverage-guided beats naive random decisively
  (FuzzChick vs QuickChick: seconds-to-minutes vs effectively-never on seeded bugs).
- Triviality/novelty filter (LeanConjecturer): reject if existing automation
  dispatches it; ~31% survival rate observed. rk analog: free-closer dispatch = trivial.
- Vacuity: attempt to derive False from hypotheses (DeepSeek filter) + hypothesis
  satisfiability sampling.
- Redundancy: subsumption vs the existing graph (ETP's transitive-closure dedup;
  TxGraffiti's Dalmatian heuristic + touch number — a decade of real conjectures
  produced by exactly this filter).
- Definition sanity instances (Tao's unit-tests-for-definitions, proposed 2026, not
  yet operationalized anywhere — rk can be first): every new definition ships with
  canonical positive AND negative instances, checked mechanically (numerics mirror).
- Mutation testing of definitions AND of the gates themselves (mip-re L4b, designed
  not built; mutation-model-checking's criterion: a spec that no mutant can violate
  is too weak to be load-bearing). A definition whose mutations all pass its own
  sanity instances is under-specified — reject as untestable.
- Value accrual, not value prediction: admission is provisional; standing comes from
  downstream reuse and proof-shortening (LEGO-Prover reuse counts; MDL with the
  single-use-library caution; mathlib-network caveat: centrality measures technical
  utility, not depth).

## 2. Process-heaviness assessment

Verdict: the CAMPAIGN RUNTIME is not process-heavy. A claim passes ~14 step-classes;
all but 3-4 are pure machine checks running in seconds; zero hard-require a human in
code. The heavy process (Tier A reviews, anti-Zeno caps, acceptance reports, HANDOFF
ritual) governs BUILDING rk, and it is exactly the machinery the bitter-lesson audit
says to keep: the gates and red corpus are rk's kernel-equivalent — the non-gameable
ground truth that makes leaving an orchestrator unattended survivable at all. Do not
thin the validity machinery.

What actually prevents the infinite-horizon run is FOUR MISSING FEATURES, not excess
process:
1. rk audit (PRD C8 — overclaim/convention-drift/gate-rot/wandering hunters) is
   entirely unimplemented. It is the designed replacement for per-milestone human
   review; without it, unattended = unaudited.
2. Dead-end states with no automated resolution path: balloon mandatory-review and
   graph conflicts abort/flag and then wait for an actor that never comes.
3. The consensus rigour rung is an honor-system string — an unattended agent can
   self-sign "human consensus". Must become machine-verifiable or be renamed.
4. Work selection is readiness-only; nothing chooses by value or goal-progress. The
   M4 bandit (unstarted; fr F1-F6) is the designed fix, per the PRD's own words:
   "LLM orchestrators exploit by default."

Two honest process smells at the CAMPAIGN level: per-milestone human ritual does not
scale to infinite horizon (convert to periodic automated audit + escalate-on-anomaly);
and "valuable results on the way" has no ledger — nothing accumulates a bankable
record of survived lemmas/definitions with their evidence trail as first-class output.

## 3. Plan (proposed; requires TJO ratification — amends PRD §6 scope and M4)

Phase 1 — Entry gates (new; Tier A, red-corpus-first per L1/L2):
  1.1 Gate C (conjecture admission): vacuity check, triviality-by-automation check,
      subsumption-vs-graph check, falsification budget (coverage-guided numerics,
      cheap->expensive cascade). Survivors carry "survived N falsification trials" as
      first-class provenance, feeding the bandit prior. Rejects are EVENTS with named
      causes (trivial | vacuous | subsumed | falsified), not silence.
  1.2 Gate D (definition admission): mandatory sanity instances (positive + negative
      canonical examples, mechanically checked); mutation self-test (mutants must be
      killed by the instances, else "untestable definition" ERROR); provisional
      status until first downstream use; source-anchored contracts (macro-expanded
      extraction + sha256 pin — the \abc fix; extends Gate 3 quote-at-locus).
  1.3 Port from mip-re: numerics-mirror worker role; blind dual formalization as the
      verification pattern for load-bearing definitions; HAZARDS-checklist artifact
      type; gate-mutant fixtures ("test every gate on a known-bad mutant" — all three
      mip-re gate bugs were found by agents, none by the gate author).

Phase 2 — Reward and allocation (extends planned M4; keeps M4.0 pre-registration):
  2.1 Implement the PRD bandit as designed (tier-weighted, rigor-weighted returns;
      decaying optimism; concentration penalty; shadow mode then ABAB with
      pre-registered kill criteria).
  2.2 Add, from the survey: hindsight banking (a failed attempt that proves something
      banks that something — HER pattern); goal-potential shaping via PBRS over
      graph/embedding distance to the goal statement (policy-invariant by theorem;
      the distance metric itself is original design work — prototype in shadow mode);
      deprioritize-unsolvable (2506.12721; rk-tk04 preflight hard-stop is the
      existing degenerate case).
  2.3 Value ledger: per-definition/lemma reuse counts and proof-shortening deltas,
      feeding both the bandit and a standing "results banked so far" report — the
      mechanical form of "valuable results on the way".
  2.4 LLM taste enters ONLY as prior (Nexus-style pairwise Elo over candidates),
      never as banked reward.

Phase 3 — Autonomy unblocking:
  3.1 Implement rk audit (C8) — the standing substitute for per-milestone human
      review in campaign runtime.
  3.2 Automated resolution paths: mandatory-review routes to a fresh adversarial
      panel (mip-re layer-4 pattern), escalating to TJO only on split verdict; graph
      conflicts quarantine the node and file a bead instead of stalling silently.
  3.3 Calibrated verification tiering (the D-b resolution): sampled kernel/deep
      verification of accepted claims as a measurement instrument; full verification
      mandatory only on critical-path/load-bearing claims. Produces the false-accept
      rate that decides where the Lean boundary actually sits.
  3.4 Consensus rung made machine-verifiable or renamed.

Sequencing note: Phase 1 before Phase 2 — a bandit over an ungated conjecture pool
optimizes slop throughput. Phase 3.3 can start immediately (it is measurement).

## 4. What this does NOT change

D1-D8 stand. No runtime deps, no servers, pure core / thin edges. The entry gates are
pure gate logic + corpus fixtures, exactly rk's existing shape. The bandit stays in
fr per the plan's F-items, with rk consuming its allocations. Anti-Zeno and Tier A
review discipline stay for rk development; the plan only changes what a CAMPAIGN
needs humans for.
