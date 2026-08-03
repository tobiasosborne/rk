<!-- ROLE: raw postmortem evidence (Opus subagent report, banked verbatim).
     UPDATE-POLICY: frozen historical record; never edit.
     TRIGGER: consulted from docs/memos/2026-08-03-aism-bitter-lesson-snapshot.md -->

# AISM postmortem — self-reported learnings, critically assessed

Scale for calibration (`report/generated/stats/campaign-extract.json`, `body.tex:18-37`): 1,109 commits / 24 active days / 33-day span; 364 registry rows; 169 `af: validated`; 181 af workspaces; 2,491 proof nodes; 15,305 ledger entries; 4,278 fresh model invocations; 107 wave docs; 81 plan docs; 38 numerical run bundles; 46 sketch versions; 6 retractions covering 12 demotions. `op-classical` is **OPEN** at close (`HANDOFF.md:181`).

## Durable (A)

**A1. Reviewer ≠ author, with a *fresh context* per verifier — and the freshness matters more than the model.** `CLAUDE.md` L5 mandates it; the record shows it is the only thing that ever caught a bad certificate. Base rates: 409 challenges raised over 2,491 nodes (16.4%), 402 resolved, 343 node amendments, 7 nodes un-validated post-hoc. At wave level: "~48% of author output corrected, ~15% killed by fresh hostile verifiers — never a rubber stamp." **Why it scales:** checking a fixed claim against fixed premises is asymmetrically cheaper than producing it, and that asymmetry is capability-independent. The campaign's own evidence that *framing diversity* is the active ingredient (`worklog.md:1485-1487`: "the same cite-external-in-statement pattern accepted by one verifier, refused by another") means the mechanism improves with model diversity, not just model strength.

**A2. Mechanical gates a model cannot argue past.** Concrete refusals in the record: `fr log banked` refused a verified landing and was *not worked around* (`worklog.md:2311-2314`); `check-provenance` refused delisting a validated-but-unanchored id; the linker's contract-match gate caught a prover's mid-run root amendment at the banking flip (`worklog.md:1364-1367`); the oracle *and* the linker independently refused the ai-defect contract mismatch. `methodology-assessment.md:28` states the general law: **"Hand-maintained discipline decays; only gated discipline holds."** **Why it scales:** a stronger model is a better arguer, so anything adjudicated by argument degrades with capability; anything adjudicated by byte-comparison does not. This is the single most transferable design constraint for rk.

**A3. Exact-arithmetic certificates as ground truth, independently recomputed by a second party.** Every route-kill in the exploration phase was an exact rational counterexample the orchestrator re-derived from printed matrices alone (the (SI) death certificate, the G5 two-orphan amplifier, the Γ-emptiness refuter, the NSC zero-denominator refuter, the W25 insufficiency certificate 17/17 recomputed). **Why it scales:** a counterexample is O(1) to check, model-independent, and permanent.

**A4. Error-localising decomposition into one-line contracts with explicit domains.** The campaign's single most valuable finding: `docs/LEARNINGS.md:64-91` — the `aism-fudw` af-decomposition "forced every step into a one-line contract with explicit domains, and under that stricter bar a subset of the proved-mod-audit record FAILED hostile review" — 15 rows demoted from proved-mod-audit to uncontracted GAP. A wave-level hostile VALID over a large chain had blessed exactly that material two days earlier. **Why it scales:** it converts one global judgement into N local judgements each with a checkable interface. It multiplies whatever verification capability exists rather than substituting for it.

**A5. Status-as-type with mechanical propagation of demotion.** When M19-S2/S3 were demoted, the linker automatically suspended banked M18 and M20 whose certificates were intact but rested on demoted premises (T0 156→154). "Registry audit: ZERO integrity violations in 151 shards." **Why it scales:** trust is transitive over a DAG; no model reliably tracks a 364-node closure by hand.

**A6. Byte-verbatim provenance against pinned sources (L1).** Caught: "quantitative Baake–Sumner web stability does not exist" (`FINDINGS.md:308-311`); the Luo–Pang ½-exponent attribution collapsing under Assumption 4.1; citation drift Mangasarian–Shiau; "published in Nature" about Kitaev is FALSE. **Why it scales:** reference hallucination is a retrieval failure, not a reasoning failure. **Durable refinement forced by evidence:** quote-*exists-somewhere* is insufficient — `check-refs` passed a quote ~82 lines from its claimed locus, and a fresh verifier accepted the node citing it (`FINDINGS.md:937-957`). The durable rule is *quote-at-claimed-locus*.

**A7. Pre-registered kill criteria and refusal to convert failed searches into emptiness claims.** W20's two pre-registered kills were both unrealized and reported as "NO-KILL", not reinterpreted. The sharpest epistemic rule in the repo: "**never treat a failed search census as support for an emptiness conjecture without a coverage argument**" (`FINDINGS.md:350-355`). **Why it scales:** anti-p-hacking discipline is capability-independent; better search makes the temptation *worse*.

**A8. Mutually blind adversarial pairing, and treating opposite-mandate convergence as evidence.** E2: two mutually blind workers independently proved the same n=2 no-go. W21: the refuter, from the opposite mandate, independently derived the prover's ρ-far inclusion. W25: "the prover's minimal missing cap and the obstructor's violated-fact diagnosis are the same statement from opposite sides." Both sides get better with capability, so the signal strengthens.

**A9. Honest scope statements attached to counters.** `HANDOFF.md:38-47` on the final bank: "this proves **no mathematics absent from `lem-maincb-structural-assembly`**… mathematically the row is *redundant* relative to M28." `worklog.md:2321-2325`: "**T0 = 168, unchanged — no mathematics was proved this session.**" **Why it scales:** at high automation throughput the dominant failure is not wrong proofs but inflated accounting of what was proved.

**A10. The rejection is the deliverable.** `worklog.md:2389-2390`: "The most valuable artifact was the *rejection*: without it the campaign would have spent substantial effort proving a claim about a proof." Design rounds were commissioned with the brief that **finding a gap is a BIG SUCCESS**, armed with a deletion test, and — when a design came back small — re-aimed at *under*-specification. That inversion of the reviewer's incentive is durable.

## Scaffolding (B)

**B1. Node caps / balloon tripwires / brittleness thresholds.** `NODE_SOFT_CAP` moved 12 → 26 and the orchestrator balloon cap 40 → 52, because the original threshold "cried REFACTOR on ~20 perfectly healthy validated trees". A cap is a proxy for "the prover will lose coherence at scale N". No principled value; a stronger model needs a larger N. Median validated tree: 12 nodes; largest 52.

**B2. "Provision the PROOF's vocabulary at seeding time, not the contract's."** Learned twice (M19-S3 session 39, M28 session 41). M28 run 1 ballooned 20>13 with **the root never challenged**; 4 of 6 challenges were missing workspace vocabulary. Pure compensation for a prover that cannot fetch what it needs mid-proof. Tool access to the registry obsoletes it entirely.

**B3. STUCK / BALLOON repair playbooks.** "missing vocabulary ⇒ provision + clean re-seed; transparent repair growth ⇒ scoped cap amendment; converging-but-hit-max-rounds ⇒ resume `--phase verify`". Also "patched trees thrash, clean re-seeds close" — a model is worse at repairing its own broken artifact than at rebuilding it. Model-generation-specific.

**B4. Effort caps.** "codex effort CAPPED at `xhigh` — `ultra` is unstable and spawns subagents indiscriminately." The first full wave at the cap had "deliverable quality on par with the ultra-era waves, zero rework". The highest effort setting was strictly worse — a pure model-version artifact.

**B5. Batched verification as default.** Adopted for cost, not correctness. It demonstrably let a defect through: the `lem-hx-financing-floor` empty-N corner was "missed by the W60 batched verifier AND prover". Cheaper/stronger models make 1:1 affordable again.

**B6. The explicit-binder discipline.** Root cause of six retractions: "the elevating cohorts systematically treated repeated notation and definite descriptions as binder unification across opaque theorem boundaries — same-named anaphora elevated into missing equality premises" (`docs/LEARNINGS.md:152-155`). The elaborate manual binder-audit apparatus is scaffolding; the campaign said so itself: "**Lean would eliminate for free exactly the defect class our verifiers keep catching (real-vs-complex typing, quantifier scoping)**" (`worklog.md:1744-1746`). Durable residue: *an interface must export a typed witness, not a same-named conclusion.*

**B7. Overreach guards, porcelain snapshots, serial-only orchestration.** "all 6 parallel first-attempt runs aborted via the porcelain-snapshot overreach guard; **zero genuine overreach**"; the fr Stop hook's forced log append killed a live run twice. Solved eventually by worktree-per-run — infrastructure, not process.

**B8. The `fr` multi-arm bandit controller.** Declared vestigial by the campaign's own assessment: "40+ consecutive EXPLOIT-B". Final tally: 515 explicit allocation decisions = EXPLOIT ×498, EXPLORE ×14, PIVOT ×3; 7 of 9 arms have zero banked pulls. It was decoration over a human decision.

**B9. Sketch/wave versioning apparatus.** 46 sketch versions, 107 wave docs, `CHANGELOG.md` stale since v31. The remediation plan called it: "Today's v20-v24 = 5 files + 5 pin rounds would have been 1 file + 4 changelog lines."

**B10. Prose obligations inside contracts.** The campaign's own terminal finding: a contract clause asserting its own provenance is undischargeable and invisible until elevation is attempted. The transferable fix is architectural: "**the `deps:` line *is* the 'uses' statement, in the mechanism this repo actually enforces**… nothing checks prose inside a contract string" (`worklog.md:2342-2346`). Move enforcement into the machine-checked edge; delete the prose.

## False lessons (C)

**C1. "A retraction here is a SUCCESS of the rigour machinery, not an embarrassment."** True relative to no machinery, but it is used to avoid pricing the base rate. 12 result-demotions over ~171 banks ≈ **7% of "rigorous" results were later found defective**, and in 4 of 6 retractions the catcher was a *design round at a different granularity*, not the verification cohort that had blessed the object. The honest lesson is stronger and more useful: per-node adversarial verification has a residual defect rate around 5-10% that is *systematic within a framing*, and re-deriving the same object at a different granularity is what finds it.

**C2. "2,386+ hostile jobs, zero route-level refutations."** Near-vacuous as evidence of soundness: the hostile jobs were pointed at *our contract factoring*, essentially never at whether the route works — "every retraction to date was of this repo's own rows." Meanwhile the entire Kernel/(EX) route (sessions 1-22, arm B 113 pulls, ~100 registry rows, waves W1-W72) was abandoned wholesale. "Zero route-level refutations" and "we silently dropped the route" coexist because the adversarial machinery was never aimed at route viability.

**C3. The "tallness binds" convergent structural signal.** Read as deep structure; it is at least as well explained as a *search-capability* limit: W49F states outright "**NO banked instance is in-class**… Every (T1)-domain claim to date is about an EMPTY certified record — refutation is gated behind the never-solved tall-construction problem" (`FINDINGS.md:838-842`). Seven searches that cannot enter a regime are evidence about the searches. The campaign stamped "not an emptiness claim" correctly in the ledger and then let the signal drive ~8 sessions of strategy anyway.

**C4. The budget-epicycle pattern was diagnosed, defended, and repeated.** "Reactive budget-patching confirmed ×3 (D3→R_D^ν, G5→SIGMA, G6→silent rows)"; the pending amendment's defense "is a self-assessment from the same authorial line". The lesson drawn (add deciders) is right; the lesson not drawn is that **a conjecture repaired three times by widening its own budget is a signal the object is wrong, not the constant** — precisely the shape of `conj-nsc`, later refuted outright.

**C5. "Numerical agreement ⇒ theorem" was correctly flagged as a founding error, then re-committed at the roadmap level.** Strategy was repeatedly steered by censuses whose blind spots the audit named: B-lemma data all at δ ∈ {0.233, 0.2498, 1/4} — the domain's extreme boundary, 6 instances, one construction style; Kernel numerics dimension-capped at n ≤ 9 for a dimension-free claim. When the blind spot was finally filled, the picture *inverted*: "B/δ does not vanish at small δ, it rises."

**C6. The T0 counter as a progress metric.** T0 168→169 was achieved by re-scoping a contract clause out and validating "a near-trivial existential repackaging" that the hostile auditor called "mathematically *redundant* relative to M28". The campaign flagged this honestly and *still incremented the counter*. A metric a session can move by contract surgery is not measuring what it claims.

**C7. The literature discovery found on day 3 and used on day 21 — recorded as a lesson nowhere.** The 2026-07-04 sweep found Kitaev arXiv:2405.02434 as tier-1, "poses the noncommutative lift VERBATIM AS OPEN", with "incremental-construction toolkit §§5-9: **read before designing any new (EX) wave**" (`worklog.md:344-347`, `RESEARCH_NOTES.md:65-66`). Route F — the architecture that carried the entire second half — is built on exactly that paper, discovered by fresh strategists on 2026-07-22, at which point the papers were **still not ingested**. The largest single exploration/exploitation failure in the record, and it appears in no FINDINGS or LEARNINGS entry.

**C8. "The anti-gaming design working as designed."** One gate deep. The `fr` evidence records carry a self-reported `verdict` field whose value is `claimed` on **every one of the 512 records that has one** — "a protocol marker, not an adjudication." And the stall-breaker was "structurally defeated": every narrowing wave self-tags `progress`, the string "stalled" appears in 0/106 cycles, and the five-wave wall broke only on a **manual user audit**.

**C9. Later-phase "findings" are largely tooling defects, not insight.** `FINDINGS.md` has 47 dated entries; the dense mathematical ones stop 2026-07-10, and the file's last entry (2026-07-29) is an OCR line-numbering trap. `RESEARCH_NOTES.md` was last content-updated 2026-07-04. The real signal is where the effort went, and it is not recorded as such.

**C10. "Route F is proved-mod-audit COMPLETE" (session 23).** The headline stood for two days, was demoted by a verdict, and went un-retracted for two more. The lesson recorded ("demoted headline needs a LEARNINGS entry in the same commit") is real but far too small. The actual lesson: **a hostile VALID over a coarse-grained object is nearly worthless** — all 15 rows failed the moment they were forced into one-line contracts.

## af tool: where it caught errors vs noise

**Real catches (contract- and typing-level — the high-value class):**
- `lem-hx-financing-floor`: contract quantified over *all reals A*; with N = ∅ the hypothesis is vacuous. Explicit counterexample in af challenge `ch-9388e571` (2×2 identity idempotent: claimed floor 6 vs actual joint mass 2). "the W60 batched verifier and prover **both missed the empty-N corner**".
- F0 typing: contract typed `D: M_n → ℓ∞^n` with real/complex diagonal mismatch — "a defect that had **survived TWO hostile audits** of the F0 design" (`worklog.md:1633-1638`).
- `finite-polyhedron-maximal-simplex-placement`: run 1 ABORTED STUCK on a genuine **contract ambiguity** (collective vs pointwise reading); user ratified the disambiguation.
- M24: the prover's root weakening **rejected as scope drift**; workspace restored to the clean ratified seed.
- M13: **vacuous validation** honestly flagged — banked with a DO-NOT-CONSUME flag, def amended, re-elevated non-vacuously.
- Bottom-up law enforcing itself: "one verifier correctly *blocked* node 1.3 while its children were pending and accepted only after they validated."
- The `η=0` endpoint family caught on three separate rows; cross-node symbol leaks; undischargeable constant chains — "**zero rubber stamps observed**".
- M26 mis-landed contract: **shard and workspace mutually consistent so every gate stayed green** — visible only against the ratified design text. Why `root == ratified text` became a pre-launch law.

**Noise / false positives:**
- Prover-overreach guard: all 6 parallel first-attempt runs aborted, **zero genuine overreach**; the orchestrator's own `fr` log append killed live runs twice.
- Brittleness WARN: ~20 permanent warnings plus 107 permanently-ignored anchor warnings — "permanent noise that will train agents to skim warnings".
- Exit codes conflating "healthy but out of rounds while converging" with task FAILURE.
- Verifier strictness variance across fresh instances of the same model.
- Tool bugs: `af def-add --dry-run` mutating the workspace (0.1.3); `af def-add` silently accepting duplicate names.

**False negatives (the ones that matter):**
- **Six Stage-1 validations retracted, T0 107→105→101.** One had been "**first-pass 10/10 zero challenges**". "**Caught by: the W97 design-audit chain, NOT the runs' own verifier cohorts**" — the elevating cohorts accepted an inference three earlier W93 cohorts had correctly rejected. Recorded law: "per-node verification does not enforce cross-workspace consistency of what 'the same map' means."
- **M25 / M19-S2 / M19-S3, T0 159→156→154.** "the banked certificates do not prove their roots from their registered inputs (the exact-input standard)"; alleged by a design codex, confirmed by an independent audit reading the exports.
- **The corrupted-externals near-miss.** A STUCK run validated 5 nodes citing externals whose content was the wrong passage, and "**a fresh verifier ACCEPTED it anyway**… the certificate rested on wrong evidence." Lesson: "a verifier pass does not audit external CONTENT against `refs/`."

**Aggregate reliability:** 181 workspaces → 171 validated roots. 16.4% of nodes drew a challenge; 13.8% amended. Most-contested tree `conj-extcb`: 24 challenges, 20 rounds, 46 nodes. Job mix 2,979 verifier / 629 prover-initial / 454 prover-fix — **verification is 73% of all invocations**, the empirical basis for "verification is the cost center."

## Exploration/exploitation dynamics

**Paid off.**
- *Bounded prove-or-refute waves on freshly codified conjectures.* Two conjectures killed within hours of codification: "**Cost of each kill: one wave**."
- *Cheap deciders before expensive waves.* Both audit-mandated deciders passed and **changed the picture** (B/δ *rises* as δ→0).
- *The W73 fresh-perspective reset.* 6 summarizers + 3 literature researchers + **4 independent codex strategists**, of which A and C independently converged on Route F. This one session produced the architecture for the entire second half.
- *Exploitation once the target was pre-decomposed.* Session 25: T0 34→53 in one session; 27 validations in one day on 2026-07-30.

**Wasted.**
- *Arm concentration.* "83% of wave-pulls chased one mechanism relabeled A→D→G; arms C/E never ran." EXPLORE = 14 of 515 allocation decisions (2.7%); 7 of 9 arms zero banked pulls.
- *The entire Kernel/(EX) signed-geometry program.* Sessions 1-22, ~100 registry rows, waves W1–W72, arm B 113 pulls — off the critical path at close. Not refuted; superseded.
- *Bookkeeping tax.* "49% of all cycles produced no pull (70% in the latest session)"; 364 of 1,128 controller cycles were orientation/bookkeeping.
- *Seven consecutive tallness-bound refuter searches* funded on a signal indistinguishable from a search limit.
- *46 sketch versions and a CHANGELOG stale for 14 of them.*

**Throughput inflection.** T0 by campaign day: near-stall day 38→52 (34→48 over two weeks of exploration); burst day 52-58 (48→146). The ~5× productivity difference is entirely a function of whether a hostile-audited decomposition already existed. `worklog.md:1732`: "**Binding constraint: codex quota, not mathematics.**"

## Believed-proven-then-fell cases

| # | Object | Status held | Caught by | Cost |
|---|---|---|---|---|
| 1 | `lem-dual-localization` (07-04) | `open` — "the single genuine gap" | arm B wave 1 (opus) + independent read-only codex verifier; contract was a **distance tautology** | framing only |
| 2 | `lem-hx-financing-floor` (07-10) | `proved` (L5), batched hostile VALID-WITH-CORRECTIONS | af fresh per-node verifiers + STUCK tripwire; **prover AND batched verifier missed it** | contract restated |
| 3 | "Route F proved-mod-audit COMPLETE" (07-24) | headline, echoed in fr trail + session summaries | fudw hostile design verdicts forcing one-line contracts + explicit domains | **15 rows → GAP** |
| 4 | Stage-1 control + transport (07-28) | af-VALIDATED; one **first-pass 10/10 zero challenges** | W97 design-audit chain; adjudicator *primed to refute* confirmed per-locus | T0 107→105 |
| 5 | Four more Stage-1 rows (07-28 #2) | af-VALIDATED | comprehensive per-target sweep over all 18 remaining exports; **also certified 14 trees sound** | T0 105→101 |
| 6 | M25, M19-S2, M19-S3 (08-01) | af-VALIDATED T0, banked same day | design-codex allegation → independent hostile audit reading the **exports** | T0 159→156→154 |

Non-retraction catches worth naming: M13's vacuous validation; the M26 mis-landed contract (invisible to every gate); the 5 validations discarded over corrupted externals.

**The pattern:** in **4 of 6 retractions the catcher was a design/audit round operating at a different granularity than the verification cohort that had blessed the object.** Per-node adversarial verification is systematically blind within a fixed framing. The recovery mechanism was always *re-derive at a different granularity*, never *verify harder at the same one*.

## Model weaknesses that drove design

1. **Anaphora and definite descriptions treated as binder unification across opaque theorem boundaries.** Root cause of 6 retractions. Drove the explicit-binder discipline and "the provider must supply the TYPED WITNESS, not merely a same-named conclusion."
2. **Quantifier and domain sloppiness.** The all-reals-A / empty-N hole; collective vs pointwise "every finite fixed set"; 15 K-ledger rows asserting inequalities on domains "stronger than the verified ledger". Drove: every contract carries explicit domains.
3. **Real-vs-complex / typing errors that survive multiple hostile audits.** The campaign's own conclusion: Lean would eliminate this class for free.
4. **Compound contracts thrash to STUCK.** The very first af abort; codified as "elevation contracts = single minimal statements."
5. **Provers invent unregistered inputs and magic constants.** "magic 1/8 / 1/512 thresholds without in-scope derivation"; a prover expanded the root statement and "the oracle AND linker refused the contract mismatch independently."
6. **Provers cannot self-diagnose missing vocabulary.** M28 run 1 ballooned with the **root never challenged**; 4 of 6 challenges were missing vocabulary.
7. **Models never self-report being stuck.** "every narrowing wave self-tags `progress`; the string 'stalled' appears in 0/106 cycles." This drove every mechanical gate in the stack.
8. **Repair-vs-rebuild asymmetry.** "patched trees thrash, clean re-seeds close."
9. **Verifier strictness variance across fresh instances of the same model** — the reason cohort diversity works, and the reason per-node verification isn't closed.
10. **Model/effort observations.** `ultra` unstable → capped at `xhigh` with no quality loss. Role split by model: codex for provers/verifiers/auditors, Opus for prose/report authoring in isolated worktrees, Sonnet for read-only audits, Fable as orchestrator. Reviewer≠author was enforced *across fresh instances of the same model*, not across model families.

## Economics

**The headline economic finding is a negative one.** `body.tex:44`: "**Not recoverable: LLM token consumption**… Neither repository ever logged token counts, context sizes, wall-clock durations, or billing data… Multiplying a job count by a guessed per-job token figure would produce a number with no evidentiary basis, so it is omitted rather than invented." A campaign that instrumented 15,305 ledger entries about proof state instrumented **nothing** about cost. For rk this is the most actionable gap in the entire record.

What *is* recoverable:
- **4,278 delegated adversarial jobs**, each a fresh model invocation. Split: verifier 2,979 / prover-initial 629 / prover-fix 454 → **verification ≈ 73% of spend by job count**.
- **1,109 commits / 24 active days**; 2,491 proof nodes; 862 `def_added`; 181 workspaces; 46 sketch versions; 107 wave docs; 38 run bundles; 30 scripts / 9,453 lines of which 1,893 are validation gates.
- **Cost of a route-kill: one wave.**
- **Cost of a retraction cycle:** session 33 = "banked 1 (retracted same day), retracted 6, re-certified 14… Codex spend this session: ~30 jobs" — net T0 106→101 for ~30 jobs.
- **The binding constraint was never mathematics.** Repeated quota walls: three halts on 2026-07-07 alone; a full stop 07-25→07-29. "Binding constraint: codex quota, not mathematics."
- **Bookkeeping overhead ~49%** of controller cycles produced no pull.
- **Parallelism arrived late.** Worktree-per-run, ≤5 concurrent, ~20 codex workers at peak, serial banking — rolled out 2026-07-30, four days before close. Before that, "orchestrations strictly serial" was a hard law because parallel runs mutually aborted on the porcelain guard.
- **Human cost is load-bearing and unmeasured.** The record shows the user supplying a scanned textbook (OCR'd per-page), acquiring refs via institutional VPN, rage-quitting an agent for presenting fallback work as critical-path, and personally ratifying ~15+ contract decisions and every route decision. This is not an autonomous system; it is a ~4,000-job amplifier around a human adjudicator.
- **Unpriced debt at close:** ~58 of 169 validated results have no paper-track presence, held legal only by the `report/UNWIRED.md` whitelist.
