<!-- ROLE: authored synthesis memo — what of AISM survives the Bitter Lesson, as design
     input for rk. UPDATE-POLICY: authored; superseded by a dated successor memo, never
     edited in place beyond typo fixes. TRIGGER: read when making rk design decisions
     about validity semantics, orchestration, schema, or multiplayer; evidence appendix
     in docs/memos/2026-08-03-aism-postmortem/ (7 reports, file:line citations). -->

# AISM through the Bitter Lesson: 2026-08-03 snapshot

AISM (`../almost-idempotent-stochastic-maps`) is the live prototype of an
exploration/exploitation formalisation campaign, now concluding. It is NOT an rk
consumer and NOT a golden master (L5); it is 33 days of incident data. Seven Opus
subagents scoured the whole repo (governance, self-reported learnings, proof data
model, exploration runs, tooling, planning evolution, refs/report). Raw reports with
file:line evidence: `2026-08-03-aism-postmortem/01..07`. This memo is the synthesis:
what will still *enhance* stronger models, what dissolves, what rk must not replicate.

Campaign scale, for calibration: 1,109 commits / 24 active days; 364 registry results;
169 af-validated; 2,491 proof nodes; 4,278 fresh model invocations (73% verifier);
6 retraction events covering 12 demotions; goal (`op-classical`) still OPEN at close.

## 1. Verdict on the core hypothesis (adversarial formalisation)

The hypothesis — af/Lamport-style adversarial formalisation always improves
transformer output — is **supported, with a sharpened shape**:

- Hostile fresh-context verification corrected ~48% of author output and killed ~15%
  across W54–W59; 409 challenges over 2,491 nodes (16.4%); zero rubber stamps observed.
  The af-elevation pivot forced every step into a one-line contract with explicit
  domains, and **15 rows of a hostile-VALIDATED "proved-mod-audit COMPLETE" chain
  failed and were stripped to GAP** under that stricter bar. Real catch classes:
  quantifier holes (all-reals-A/empty-N), typing (real vs complex, survived TWO prior
  hostile audits), vacuous validation, scope drift, magic constants.
- **But: ~7% of af-validated results (12 demotions / ~171 banks) were later found
  defective, and in 4 of 6 retraction events the catcher was a design/audit round at
  a DIFFERENT granularity — never the verification cohort that blessed the object.**
  One retracted proof had validated first-pass 10/10 with zero challenges. Per-node
  adversarial verification is systematically blind within a fixed framing (the binder/
  anaphora class: "same-named anaphora elevated into missing equality premises").
- What actually held the record together was the **mechanical layer**: byte-verbatim
  quote gates, contract-match (registry contract ≡ af root, three independent checks),
  status propagation with automatic demotion cascade, hash-bound auto-staling
  verdicts. AISM's own distilled law: **"Hand-maintained discipline decays; only gated
  discipline holds."** Model-judgment layers over coarse objects ("hostile VALID over
  a large chain") were, in the campaign's own evidence, nearly worthless.

So the durable form of the hypothesis is three-part, and each part scales WITH model
capability rather than being obsoleted by it:

1. **Decorrelation, not judgment.** Reviewer ≠ author with fresh contexts works
   because checking a fixed claim is asymmetrically cheaper than producing it, and
   because a single model's blind spots are correlated across its own re-reads at ANY
   capability level. Verifier strictness variance across fresh instances of the same
   model is a feature — cohort diversity is the active ingredient.
2. **Granularity/framing diversity finds what adversarialism at one grain misses.**
   The recovery mechanism was always "re-derive at a different granularity", never
   "verify harder at the same one". rk's design should treat multi-granularity
   re-derivation as a first-class verification mode, not an emergency measure.
3. **Mechanical gates are the floor everything rests on.** A stronger model is a
   better arguer; anything adjudicated by argument degrades with capability, anything
   adjudicated by byte comparison does not.

## 2. Survives the Bitter Lesson (gets MORE valuable as models strengthen)

Consolidated across all seven territories; each has an argument for why it scales,
not just that it worked.

1. **Mechanical gates over argument.** Every zero-drift surface in AISM is a gate;
   every drift is an ungated duplicate. The cleanest natural experiment: the enforced
   contract-match join drifted **0/181**; the unenforced seed-time copy of the same
   string drifted **6/181 (3.3%)** (03-datamodel).
2. **Edges over prose.** "Prose in a contract enforces nothing; a dep edge is checked
   every gate run." The same defect class (assertion living in prose no linker reads)
   bit AISM at two altitudes 30 days apart, and stronger models write more convincing
   prose — making unenforced prose MORE dangerous, not less. (06-planning, 02-learnings B10)
3. **Status-as-type with mechanical demotion cascade.** The linker auto-suspending
   banked dependents of demoted premises is what made retraction cheap instead of
   catastrophic — the single highest-leverage mechanism in the repo. Value grows
   superlinearly with claims/hour. (01-governance)
4. **Byte-verbatim provenance with "an unverifiable pass is a FAIL".** Fabricated
   citations get harder to catch by reading and stay equally easy to catch by string
   match. Refinement learned at cost: quote-exists-*somewhere* is insufficient — the
   durable rule is **quote-at-claimed-locus** (a wrong-attribution citation is still
   green in AISM today). (07-refs I2)
5. **Hash-bound, auto-staling verdicts** (fr): verdict pinned to
   claim_hash + oracle_digest + inputs_hash. Freshness-by-construction beats
   freshness-by-discipline at any model strength. Missing half: revocation (see §4).
6. **Reviewer ≠ author as structure; orchestrator constitutionally barred from
   judging.** Plus the verifier incentive inversion ("finding a counterexample is a
   BIG SUCCESS") and the deletion test for decorative content. (01, 02)
7. **Cheap mechanical refutation before expensive proof.** One certified exact-ℚ
   instance killed a conjecture that a 352-candidate census had "supported". Refuter
   cost is flat while wrong-conjecture cost rises with model confidence. The winning
   run shape is fully characterized and repeatable: falsifiable question with named
   target + kill criterion pre-registered; exact arithmetic (certificate, not
   p-value); independent recomputation from printed data alone; calibration
   hard-asserts against banked witnesses before searching. (04-runs)
8. **Independent blind sampling with convergence as evidence.** Four blind
   strategists → two independently converge on Route F → that convergence, treated
   explicitly as evidence-not-proof, redirected the whole campaign productively.
   Also: 6/6 mandated-diverse provers dying at the same inequality = strong evidence
   the residual is one lemma. More independent samples from a better model is
   strictly better evidence. (06, 05)
9. **The retraction ledger + dead-route certificates.** Negative results as permanent
   search-space pruning, each with the catching mechanism named. Near-zero cost,
   calibration data forever. (01, 02)
10. **Generated-vs-authored with byte-compare freshness gates; every number in a
    document is a query.** AISM discovered this three times (defs, dag, stats layers)
    and still shipped a stale hand-typed count in the final PDF. (07 F4/I8)
11. **Explicit whitelists for known-incomplete state** (`UNWIRED.md`): silence is
    where drift hides; unlisted-and-unanchored = hard ERROR turns omission into a
    reviewable act. (03, 07)
12. **Honest scope statements attached to every result and counter** ("T0 = 168,
    unchanged — no mathematics was proved this session"). At high automation
    throughput the dominant failure is inflated accounting, not wrong proofs. (02 A9)
13. **Provenance-laundering barriers at repo boundaries**: the ingest re-tag table —
    every inherited status mapped down, nothing up, per-claim, mechanical. Composing
    agent-produced corpora makes this a permanent hazard. (05)
14. **Interface obligations (the one place the schema should get RICHER).** Both
    silent-retraction classes came from a child contract under-specifying what it
    exported. A contract needs an explicit *exports* clause the parent's citation is
    checked against — typed witnesses, not same-named conclusions. This is the
    schema-level answer to the binder/anaphora failure class, and the campaign's own
    conclusion was that Lean-style typing eliminates the class "for free". (03, 02 B6)

## 3. Scaffolding (dissolves as models strengthen — do not enshrine in rk's core)

- **Node caps / balloon thresholds / effort tiers / repair playbooks** — calibration
  constants of the 2026 prover generation (NODE_SOFT_CAP moved 12→26→52-observed;
  "ultra unstable"; "patched trees thrash, clean re-seeds close"). Keep the *tripwire
  pattern* (abort + forced classification: missing-fact | DAG-dep | genuine-gap);
  externalize every number to config. rk already does this shape via config; keep it
  that way.
- **Vocabulary pre-provisioning, context packs, read-order gates, HANDOFF rewrites,
  per-turn re-priming** — all context-window compensation. Necessary today; none of
  it belongs in the data model.
- **Batched verification** — a pure economics compromise that demonstrably let a
  defect through (the empty-N corner missed by batched verifier AND prover); reverts
  to 1:1 as verifier cost falls. Price it as a dial, not a doctrine.
- **Prompt scaffolds with flag-by-flag command recitation** — the hostility *framing*
  survives as role definition; the recitation ages out.
- **OCR/pdftotext text extraction as quoting substrate** — retired by models reading
  page images directly; but the *manifest* (hash + reconstruction recipe + fidelity
  class) survives, because it is ground truth, not compensation.
- **Delta-chain planning documents** ("UNCHANGED from vN" × 36 files, no materialised
  current map) — exists so a rewrite fits a context window. The durable core is
  plans-as-disposable-views-over-a-ledger; the mechanism (version-file-per-fact) was
  diagnosed as waste by AISM itself.

## 4. Do-not-replicate (anti-patterns, with receipts)

1. **Retraction expressible only in prose.** AISM's worst live defect: two retracted
   proofs still read "validated" in export.md, ledger, AND oracle verdict — only the
   hand-edited registry shard knows. No gate checks that direction. **rk: retraction
   must be a first-class event; verdicts must be revocable; no renderer may emit
   "validated" while a retraction record exists.** This is the single highest-value
   schema decision in the whole postmortem. (03)
2. **Stored-but-derivable fields.** `af:` (hand-flipped, wrong 2/181), `workspace:`
   (derivable, dangling ×22), `meta.json = {"version":"1.0"}` ×181. Store facts,
   compute statuses; gate "every derived field equals its recomputation". "Mechanical
   flip" in a runbook is the tell: if it is mechanical, compute it. (03)
3. **Per-layer gates without cross-layer gates.** Every intra-layer surface in AISM
   is clean; every defect that survived lives BETWEEN layers (registry↔workspace,
   externals↔deps, workspace-defs↔definitions/). Mutually-consistent-but-wrong kept
   all gates green. rk's selftest should include cross-layer joins explicitly. (03, 01)
4. **Multiple id namespaces / suffix conventions.** `lem-x` vs `lem-x-CONTRACT` vs
   free-text def names (11/46 dangling) vs date-suffixed amendment ids. A name in
   three shapes is a join key in none. One namespace, versioned in place
   (`def-x@3` + supersedes edge, dependents pin versions). (03)
5. **Permanent non-actionable warnings.** 15 REFACTOR warnings on every healthy gate
   run; "permanent noise that will train agents to skim warnings" — named in
   feedback, never fixed. rk: a warning is either actionable or acknowledged-and-
   silenced via a tracked `accepted: <issue>` annotation; no third state. (05)
6. **Gates that check a string exists rather than executing it.** A run bundle's
   documented re-run command has been broken since banking day; every gate run since
   was green. Green must mean "it re-ran". (04 C2)
7. **Provenance as prose in an unchecked field.** Nothing reads `provenance:`;
   FINDINGS stopped citing runs halfway through the campaign; the experiment→claim
   link decayed exactly as predicted. **The join must be a typed edge with a verb
   (`refutes` | `supports` | `calibrates`) checked by the linker.** (04 C1)
8. **No stop rule on repeated negatives.** Seven consecutive "tallness binds"
   verdicts — counted in every title, never triggering anything. Models never
   self-report being stuck ("stalled" appears in 0/106 cycles; the circuit-breaker
   was structurally defeated by self-tagged `progress`). Stop rules must be
   mechanical counters over typed verdicts, not self-assessment. (04 C5, 01)
9. **Discarding the outcome of the most expensive operation.** `challenge_resolved`
   records no outcome (repaired vs dismissed indistinguishable, 402 events);
   `verified_by` null on 24% of validations. Type the lifecycle. (03)
10. **Zero cost instrumentation.** 15,305 ledger entries about proof state; NOT ONE
    token count, duration, or billing figure — the campaign's final report had to
    decline to estimate its own cost. The binding constraint the whole time was
    quota, never mathematics, and verification was 73% of all invocations. rk already
    tracks campaign tokens in live runs — extend that to a per-assignment cost ledger
    as a first-class projection, because verifier economics is the design center of
    the whole system. (02)
11. **Exploration and formalisation on separate calendars with no handshake.**
    Exploration never learned its routes were abandoned; ~0% of run output is on the
    final critical path; the tier-1 paper found on day 3 was not read until day 21
    (the single largest waste in the record, recorded as a lesson nowhere).
    Literature/experiment ingestion must join the frontier graph, not sit beside it.
    (04 C8, 02 C7)
12. **Manual N-step banking chains.** Nine manual steps × ~169 executions; the one
    scripted+gated step is the one that caught an error. Every mechanical sequence
    the runbook says to "follow verbatim" is an unwritten command. (05)
13. **A metric a session can move by contract surgery** (T0 incremented by validating
    an admittedly-redundant repackaging). Progress metrics need an independence
    property: a counter increment must require new mathematics, or carry the scope
    annotation visibly. (02 C6)

## 5. Design directives for rk (ranked by expected value)

1. **Retraction as event + verdict revocation + render veto** (§4.1). Check rk's
   three-cause STALE covers the case where the *artifact is unchanged* but a human or
   audit demotes it — staleness triggered by input hashes cannot see an out-of-band
   demotion.
2. **Cross-layer consistency gates in selftest** (§4.3): store↔graph↔render joins,
   both directions, coverage-reported.
3. **Derived ≡ recomputed as a standing gate**; eliminate every hand-flipped field in
   rk schemas (§4.2).
4. **Exports/interface clause in the node contract schema** (§2.14) — the highest-
   leverage *addition*; everything else in this memo is subtraction or enforcement.
5. **Typed experiment→claim edges with verbs** (§4.7) — this is rk's D-item-adjacent
   frontier: runs/numerics as first-class graph citizens with `refutes/supports/
   calibrates` edges, plus the C7 lesson: an exact-instance certificate deserves its
   own status rung distinct from float evidence.
6. **Mechanical stop rules** (§4.8): repeated-identical-verdict counters close a
   lane; budget tripwires with forced classification.
7. **Cost ledger as projection** (§4.10): per-assignment tokens/wall-clock/exit
   status, rendered next to validity state. Design assumption: verification is ~3/4
   of spend; optimizations aim there.
8. **Multi-granularity verification mode** (§1): a scheduled re-derivation pass at a
   different decomposition grain over banked results, priced as the mechanism that
   catches the residual ~5-10% per-node verification misses.
9. **Challenge lifecycle typing** (§4.9): outcome enum + non-nullable verified_by.
10. **Citation as 5-tuple** `{source-id, anchor, locus, quote-segments[], source-hash}`
    with locus enforced, not advisory (07). rk's refs layer should never accept a
    freeform string as a citation.

## 6. Multiplayer (for the separate workstream)

AISM was single-writer everywhere and paid for it late (parallel af arrived 4 days
before close). The evidence points at a specific shape for rk-multiplayer:

- **Path-scoped lane ownership, not global-state guards.** Every AISM concurrency
  failure was a guard keyed on whole-repo state (porcelain snapshot) treating a
  concurrent writer as an attack; the fix each time was serializing people. Declared
  per-lane write scopes make the guard composable. (This matches rk's existing
  parallel-lane memory: path-scoped per-lane commits already proved out.)
- **What merged cleanly, mechanically:** append-only logs and one-object-per-file
  shards with slug ids (zero collisions). What collided: sequential numeric ids and
  shared wiring files (include lists, catalogs, check-all). Design rule: slug ids
  everywhere; generate wiring files from the shards so "the wiring file" is never
  hand-merged.
- **Generate the merge protocol.** AISM's most sophisticated multi-agent artifact is
  a hand-written MERGE-NOTES.md (conflict-risk table per file, resolution rules).
  rk should emit this from lane declarations.
- **The natural unit is the role, not the session**: orchestrator / prover /
  verifier / auditor / transcription-checker with "roles never mix" — already a
  multiplayer topology. Humans slot in as two designed things: the *ratification
  point* (batched decision packages that quote no content, anti-drift, nothing lands
  without sign-off) and the *escalation target* for stop conditions.
- **Untracked-but-load-bearing state is the multi-human failure mode** (refs
  payloads, staging logs, scratchpads — each needed a manual snapshot-to-tracked
  rescue). rk rule: any state a second player would need is either in the repo or
  reconstructible from a committed recipe; the recipe is gated (a gate that verifies
  reconstruction still works).
- **Read-only fan-out is free concurrency** — verify-against-primary-shards
  instructions, verbatim worker answers, orchestrator-attributed synthesis. Cheap to
  support first.

## 7. Honest caveats

- These are 7 subagent reports over a 650 MB repo; per project rule ("do NOT take a
  subagent's finding at face value"), any single file:line claim should be spot-
  checked before it drives an irreversible design decision. The convergence across
  independent territories (e.g. edges-over-prose surfacing in 5 of 7 reports;
  retraction-invisibility in 3) is the reliable signal.
- AISM did not reach its mathematical goal. The machinery verdict (rigour machinery
  worked; strategy layer mostly didn't) is therefore about *trust production*, not
  about *theorem production* — rk should be honest that it industrializes the former
  and only scaffolds the latter.
- The strategy/bandit layer is where Sutton bites hardest: AISM's hand-crafted
  exploration policy was vestigial (EXPLOIT ×498 / EXPLORE ×14 / PIVOT ×3, human
  deciding throughout). rk's M4 bandit experiment should be designed with this prior:
  the winning pattern in the record is *human route choice + mechanical deciders +
  independent blind sampling at reset points*, not an automated allocator.
