<!-- ROLE: reference — survey of automated proof search SOTA, mid-2026. AUTHORED (not
     generated). UPDATE POLICY: append corrections only; a fresh survey gets a new memo.
     TRIGGER: read before M4.0 pre-registration and any bandit/exploration design work. -->

# Automated proof search, state of the art (survey, 2026-08-08)

Provenance: five parallel Sonnet web-survey lanes (AlphaProof lineage; company
landscape; RL exploration mechanics; slop failure modes; bitter-lesson audit),
synthesized by the orchestrator, 2026-08-08. Every claim below carried a source URL in
the lane reports; the key ones are inlined. Evidence-quality caveats at the end.

## 1. Correction on the "AlphaProof paper"

arXiv 2605.22763 is NOT AlphaProof. It is "AlphaProof Nexus" (DeepMind, 2026): a
Gemini-agent orchestration layer that calls the original AlphaProof as a black-box
subroutine. AlphaProof itself is Hubert et al., Nature 651:607 (2025), paywalled; best
secondary source is julian.ac/blog/2025/11/13/alphaproof-paper/.

## 2. The single most decision-relevant result

AlphaProof Nexus solved 9/353 open Erdos problems plus 44/492 OEIS conjectures at
~$100-500 per solved problem. Standalone AlphaProof, given ~64 TPU-hours per problem
(a LARGER budget than Nexus gives it), solved ZERO of the same problems (Nexus paper,
Supplementary B.3). Nexus runs AlphaProof only in cheap low-compute tree-search mode
(~400 MCTS simulations, ~$60/call) and deliberately skips the expensive test-time RL
that won IMO 2024 silver. Inference (flagged as inference, not stated by DeepMind):
test-time RL was IMO-specific engineering, not a scaling recipe; at the research
frontier the leverage moved UP the stack into the agent/orchestration layer — which
sketch, which decomposition, which problem is worth attempting at all.

## 3. AlphaProof mechanics (for the record)

- AlphaZero-style MCTS over Lean tactic states with AND/OR nodes: a tactic splitting a
  goal into subgoals creates a product node whose value is that of the WORST branch;
  proven children are pruned permanently.
- Reward strictly binary (kernel accepts / does not). No intrinsic or novelty reward.
- Curriculum is budget scheduling, not hand-designed difficulty: small searches first,
  ramp search budget per problem as competence grows, drop disproven formalizations.
- Training data: ~1M informal problems x ~80 stochastic formalizations each (~80M
  statements). Mistranslated formalizations are deliberately KEPT — still valid RL
  signal if well-formed. Encoder-decoder transformer, policy + value heads (3B params
  per secondary sources; 30B in one other source — unresolved).
- Test-time RL: generate millions of variants of the target, train on the solvable
  ones, attack the target. Up to 3 days/problem at IMO 2024.
- Formalization, not proving, was the human-gated bottleneck: IMO 2024 statements were
  hand-formalized; P5 took experts over a day to formalize, then zero prover progress.
- IMO 2025 gold was Gemini Deep Think (natural language), NOT AlphaProof — commonly
  misattributed.

## 4. Landscape (mid-2026)

- Harmonic (Achim/Tenev; $1.45B val): Aristotle — Lean proof search + informal lemma
  generator + geometry solver; IMO 2025 gold, 5/6 formally verified (arXiv:2510.01346).
  Positioning: verified output as the product ("cannot be wrong the way an LLM is").
- Math Inc (Jesse Han, ex-Morph): Gauss autoformalization agent — strong PNT challenge
  (Tao/Kontorovich) done in 3 weeks / ~25k lines Lean via thousands of concurrent
  12-hour agents with human scaffolding; ~200k lines for sphere packing. Han: "no
  single human is really familiar with this artifact."
- Axiom (Carina Hong, ~$64M seed, ex-FAIR team incl. Charton): the explicit
  conjecture-prove self-play bet; AxiomProver multi-agent ensemble; claims several
  opened/closed problems, none peer-reviewed as of survey date.
- Morph Labs (Szegedy as chief scientist): "verified superintelligence" program;
  Trinity autoformalization system.
- Open models: DeepSeek-Prover-V2 671B (88.9% miniF2F; subgoal-decomposition cold
  start, GRPO binary reward — arXiv:2504.21801); Kimina-Prover 72B (80.7% miniF2F,
  pass@8192, NO value function / MCTS / PRM — arXiv:2504.11354); Goedel-Prover-V2 32B
  (88-90% miniF2F, beats the 671B at 20x smaller — arXiv:2508.03613); Seed-Prover
  (ByteDance; iterative refinement + Lean feedback beats one-shot long-CoT;
  arXiv:2507.23726).
- OpenAI internal "Astra" (Aug 2026): 10 new results with Lean certificates at ~$2k
  total token cost, incl. a Connes-conjecture disproof; none peer-reviewed.
- Benchmarks: miniF2F is saturated AND was partly mis-formalized (see 6); MathArena
  ArXivLean keeps everyone under 20% including Aristotle.

## 5. Exploration vs exploitation: three working patterns, one open niche

- Pattern A, curriculum-as-exploration (AlphaProof): binary reward + search-budget
  ramping + variant generation. No exploration bonus anywhere.
- Pattern B, self-play at the provability frontier: Minimo (arXiv:2407.00695) and STP
  (arXiv:2502.00212) train a conjecturer to emit statements "barely provable by the
  current prover" — automatic difficulty matching. STP: 2x LeanWorkbook baseline.
  Theory (arXiv:2606.01861): if the theorem graph is well-connected, a
  diversity-regularized random-walk conjecturer grows the proved set EXPONENTIALLY;
  known pathology — conjecturers drift toward needlessly complex statements; fix —
  explicit diversity regularizer over embeddings. GAR (arXiv:2510.11769) does the
  adversarial version.
- Pattern C, agent-over-prover (Nexus): population of proof sketches, Elo-style
  pairwise raters (Plackett-Luce), P-UCB selection (c=0.2), prover as cheap subroutine.
- Hindsight relabeling (HER for provers, arXiv:2112.10664): failed attempts that
  incidentally prove something become signal for that something. Cheap, underused.
- Entropy collapse is the recognized exploration killer in RLVR training; fixes
  (Clip-Cov/KL-Cov, high-entropy forking-token updates) transfer from general RL.
- OPEN NICHE: no paper applies bandit/UCB compute allocation natively across a pool of
  open conjectures. Closest: arXiv:2506.12721 (general LLM reasoning; learns to
  deprioritize unsolvable instances, +11% abs on MATH-500) and Seed-Prover's
  budget-dependent refinement. rk's M4 bandit is unclaimed territory.

## 6. Slop control: what works is mechanical and verifier-grounded

- LeanConjecturer (arXiv:2506.22005) three-stage filter: type-check; reject if
  `exact?` closes it against the library (known); reject if `aesop` proves it
  (trivial). ~31% of 12,289 candidates survived. Canonical anti-slop stack: novelty =
  "existing automation cannot dispatch it."
- DeepSeek vacuity filter: try to prove False from the hypotheses; success = vacuous
  statement, discard before RL. sorry/admit hard-zeroed.
- Tao's Equational Theories Project (22,028,942 implications / 4,694 laws): dedup was
  GRAPH-THEORETIC — prove a small core, derive the rest by transitive closure. No
  semantic similarity matching. Structure did the work.
- What does NOT work: LLM-judge faithfulness checking. Herald incident: 97% claimed
  autoformalization accuracy via back-translation + LLM judge; 67% on human audit
  (arXiv:2410.10878 + arXiv:2507.04719). miniF2F v1->v2 audit (arXiv:2511.03108):
  published pass rates partly measured vacuous/mis-formalized statements — definition
  gaming happened at benchmark scale, upstream of any prover.
- Interestingness scoring is the thin spot: Mahalanobis-from-famous-conjectures
  (arXiv:2606.14804) and FERMAT's evolved measures (arXiv:2511.14778) exist; nothing
  is load-bearing in any frontier system. Where it matters, humans are the oracle
  (Formal Conjectures repo; Harmonic x AIM eval set).

## 7. Progress theatre: consensus practice

Humans own STATEMENTS, machines own PROOFS. Tao: attach "unit tests" to subtle
definitions to catch misformalization; "odorless proofs" = valid, kernel-checked,
explanation-free output (Tao & Klowden, arXiv:2603.26524). The kernel certifies
formal-follows-from-formal, never that the formalization means what the informal claim
meant — every credible pipeline puts its scarce human attention (or definition unit
tests) at exactly that seam. Institutional analogs: mathlib summarily closes
unsupervised AI PRs; curl killed its bug bounty at ~5% valid AI submissions.

## 8. Bitter-lesson audit

DIED (subsumed by scale): hand-engineered premise selection; dedicated retriever
modules (ReProver-style — capability moved into weights); learned PRMs (DeepSeek-R1
"unsuccessful attempts": reward hacking, retraining cost, no ground truth);
token-level MCTS for open-ended CoT.

SURVIVED and amplified:
1. The verifier — the one non-gameable oracle. Universal, no exceptions.
2. Fast verification infra — Kimina Lean Server, 100 proofs/sec; verification
   throughput gates RL iteration rate; value GROWS as generation gets faster.
3. Curriculum / problem-generation pipelines (autoformalization-as-data-engine) —
   load-bearing at DeepMind, DeepSeek, Numina alike.
4. Contamination control — importance grows with model scale.
5. Search — did not die; it MIGRATES UP THE STACK (tactic search -> sketch/variant/
   problem selection). Kernel-verdict-per-step as dense non-gameable reward
   (arXiv:2606.20068) is the PRM benefit without the PRM liability.

Discriminating principle (stated near-identically by R1 authors and the kernel-reward
paper): infra survives scale iff it supplies a ground-truth, non-gameable,
cheap-to-call signal, or manufactures training/eval data the model cannot make for
itself. Infra dies iff its job is to compensate for a weak base model. Third category:
human-AI formalization harnesses (Gauss) are generic long-horizon agentic scaffolding
(plan/edit/compile/retry/checkpoint) and ride the coding-agent scaling wave for free.

## 9. Evidence-quality caveats

- AlphaProof internals triangulated via secondary sources (Nature paywall).
- Parameter count 3B vs 30B unresolved.
- miniF2F v1 ">50% misaligned" figure is search-summary-sourced; verify against
  arXiv:2511.03108 primary text before citing.
- Axiom's post-seed raise: single-sourced rumor. Axiom "ex-Mistral/DeepMind" hires:
  not confirmed (team is ex-FAIR). Math Inc x FLT: likely conflation (FLT is
  Buzzard's separately funded project).
- No Buzzard "slop" commentary found for 2025-26; his load-bearing claim is different:
  the research-math bottleneck is MISSING FORMALIZED DEFINITIONS (no prover knows what
  a Tate-Shafarevich group is), which neither retrieval nor scale over existing
  mathlib fixes.
