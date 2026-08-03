<!-- ROLE: raw postmortem evidence (Opus subagent report, banked verbatim).
     UPDATE-POLICY: frozen historical record; never edit.
     TRIGGER: consulted from docs/memos/2026-08-03-aism-bitter-lesson-snapshot.md -->

# AISM postmortem — planning-evolution agent report (banked verbatim)

Read-only postmortem complete. All findings below cite files under `/home/tobiasosborne/Projects/almost-idempotent-stochastic-maps/` (paths abbreviated to repo-relative after the first mention).

---

## Correction to the brief

The brief says "THIRTY-ONE top-down proof-sketch versions (v1 2026-07-04 → v31 2026-07-24)". As of today there are **46**, v1 `docs/plans/2026-07-04-top-down-proof-sketch.md` → v46 `docs/plans/2026-08-03-top-down-proof-sketch-v46.md`. v31 was the state on 2026-07-24; fifteen more landed in the following ten days. The brief's snapshot predates the entire af-elevation execution phase, which is where the planning layer's behaviour changed most. I extended coverage accordingly.

## Planning trajectory timeline

**Phase 0 — lettered wave families (2026-07-02 → 07-04).** Before any sketch existed, execution was already running: `docs/waves/` opens with lettered families A1–A12, B1–B4, D1–D6, F1–F2, G1–G13 (`docs/waves/2026-07-02-A1-ex-chart-scoping.md` … `2026-07-04-G13-review.md`). Planning was retrofitted onto a live front, not the reverse.

**Phase 1 — the full sketch, then immediate delta-ification (v1–v7, 07-04 → 07-06).** v1 (166 lines) is a complete Lamport-style structured proof outline with a per-step status tag vocabulary (`[rigorous]/[reviewed]/[mod-audit]/[OPEN]`) and an explicit four-item open ledger (v1:154-160). It grows to 306 lines by v6, then collapses to 211 at v7. From **v8 onward the sketches are deltas, not maps**: v8:11 "## UNCHANGED from v13"-style headers appear, and 36 of the 46 files contain an `UNCHANGED from` clause. v46:3-8 still says "UNCHANGED from v45". There is no materialised current map anywhere in the repo — reconstructing it requires chaining ~20 files.

**Phase 2 — the churn peak (v8–v25, 07-07 → 07-10).** Nine versions on 07-07 alone (v8–v16), six on 07-10 (v20–v25). File sizes collapse to 23–84 lines (v24 is 23 lines, v22 is 36). v24 in full is: "Everything unchanged; one lemma af-validated; count 28 → 29." Each was a separate file requiring a pin bump in four places.

**Phase 3 — remediation and slowdown (07-10 → 07-22).** `docs/plans/2026-07-10-project-remediation-plan.md` item 17 diagnoses the churn by name and prescribes two-tier versioning. Cadence drops hard: v26 07-14, v27 07-16, then a **six-day gap with no sketch at all** (07-16 → 07-23) spanning W71/W72 and the reset.

**Phase 4 — reset and route switch (07-22 → 07-24).** `2026-07-22-strategy-reset-w73.md` introduces Route F; v28 (241 lines, the longest since v6) absorbs it; v29–v31 land in one day as Route F goes from audit to `proved-mod-audit` complete to factored.

**Phase 5 — execution-phase sketches (07-25 → 08-03, v32–v46).** Sketch titles become status counters: "T0 165 → 168" (v44), "T0 168 → 169" (v46). Sizes stabilise at 88–120 lines. Planning artifacts diversify away from the sketch series: a risk register (`2026-07-26-critical-path-risk-register.md`), a ratification package (`2026-07-27-W78-ratification-package.md`), and **22 per-front `*-design/` and `*-artifacts/` directories** inside `docs/plans/`.

**What kept being replanned.** The trunk `op-classical ⇐ op-exposed-hull ⇐ HLC ⇐ Kernel/(EX)` was stable from v1 to v27 — nine full weeks — and every version churned *below* it, on the decomposition of one open lemma. The `06-wave-history.md` ledger (`2026-07-22-W73-artifacts/stateofplay/06-wave-history.md:31-35`) shows why: 18 waves, "single dominant wall = tallness, hit independently ≥7 times", "18 waves of adversarial search never found a counterexample (always BLOCKED, never REFUTED)". The replanning was real work — each version banked a genuine reduction — but it was **descent into a subtree that never bottomed out**, and the sketch series is the record of that descent, not of strategic indecision.

**Cheap and healthy, or churn?** Both, separably. The *content* was cheap and healthy: sketches were disposable views over a ledger (`argument/` registry) that was itself the ground truth, and status discipline held (`2026-07-10-methodology-assessment.md:16-18`: "Registry audit: ZERO integrity violations in 151 shards"). The *mechanism* was churn: v20–v25 cost six files and six pin-bump rounds to record four one-line facts, and the remediation plan itself computes the waste (item 17: "Today's v20-v24 = 5 files + 5 pin rounds would have been 1 file + 4 changelog lines").

## The 2026-07-10 methodology crisis

It was not a crisis of results — it was a **user-mandated audit at a moment of health**. `2026-07-10-project-remediation-plan.md:13-26` opens with what the audit found healthy: all 29 af-validated shards consistent, 15/15 spot-checked shards carrying prover + separate hostile verifier provenance, zero proved-on-numerics.

**What it concluded.** Five parallel read-only audits produced two documents. The assessment (`2026-07-10-methodology-assessment.md`) has one cross-cutting finding, stated as the general law: *"Hand-maintained discipline decays; only gated discipline holds"* (line 28). Its six weaknesses each got a decided remedy. Two are structurally important:

- **AND-only dependency semantics cannot express proof strategy** (assessment line 29). The DAG could not declare "either route A or route B closes this node", so the live 29-node surface was formally disconnected from the goal. Remedy: disjunctive `routes:` in the linker.
- **The reduction the project rests on lived in prose** (remediation item 12): "`conj-ex` — nominally THE frontier — is an isolated singleton; ~20 open conjectures and ~130 of 151 shards are NOT ancestors of `op-classical`; the reduction the whole project rests on lives in sketch prose, unverifiable by the linker."

**Did it change behaviour? Yes, measurably, on every axis I could check.**

1. *Mechanisation shipped.* Every prescribed script exists today: `scripts/gen-current-pointer.py` (item 16), `scripts/codex-dispatch.sh` (18), `scripts/build-workspace.sh` (19), `scripts/register-oracle.py` (20), `report/UNWIRED.md` (9), and the CRITICAL item 5 red-green test — `scripts/tests/test_check_provenance.py` — alongside `test_check_refs.py`, `test_check_defs.py`, `test_register_oracle.py`.
2. *The prose reduction became DAG edges.* `docs/plans/CHANGELOG.md:118-127`: op-classical's directed ancestor closure went **12 → 41** prerequisites, reachable open conjectures **1 → 11**, with the explicit note "No mathematical content changed — this is codification of the map the sketch already asserted in prose."
3. *Version churn dropped.* v1–v25 = 25 files in 7 days. v26–v46 = 21 files in 24 days, gated at session close. `CURRENT.md` is now generated (`CURRENT.md:1` "GENERATED by scripts/gen-current-pointer.py — do not hand-edit") and pin-sprawl is gone.
4. *Batched verification became the default* (assessment finding 5), and the wave record shows it running at scale immediately: W63 "ALL TEN routine nodes VALID... zero corrections" (`CHANGELOG.md`, W63 entry).

The one thing the remediation did **not** fix is the thing it named: the honest ledger still lives partly in prose. The 2026-07-26 retraction (below) and v46's contract re-scope both turn on prose-vs-enforced-edge confusion, sixteen days and thirty days later respectively.

## The W73 reset & af-elevation pivot

**Trigger.** Not a failure — a *plateau*. Per `06-wave-history.md:31-35`: seven consecutive tallness binds, 18 waves, no counterexample and no proof; and item 2, "LOCAL ledgers are repeatedly free; the wall appears exactly when local financing must become globally/rank-uniformly synchronized... THE load-bearing open pattern". Item 4 is the sharpest self-diagnosis in the corpus: "RDSE and LDHR-48 are the FIRST places the accreted bank is insufficient as-is". The tool had run out of moves inside its own architecture.

**Mechanism of the reset.** `2026-07-22-strategy-reset-w73.md:9-14` — a user-mandated fresh-perspective session: 6 repo-state summarizers + 3 literature researchers (sonnet) building an input pack (`W73-artifacts/stateofplay/00-brief.md` … `08-lit-adjacent-stability.md`), then **4 independent codex strategists working in parallel without seeing each other's work** (A clean-slate, B synchronization, C literature-transfer, D kernel-absorption).

**The pivotal finding is convergence-as-evidence** (reset §1b, lines 31-40): "Strategists A and C, working independently, converged on the **same new architecture**" (Route F), and "Strategists B, D (and A's second architecture) converged on the **same missing in-repo theorem shape**" (Route X). Two independent samples agreeing was treated as the signal to reprioritise — and the reset was explicitly honest that this was not proof (§7: "No step of Route F is verified; F1 is an unaudited literature import").

**Before/after.** Before: one architecture (signed geometry — charts, exposed hulls, hidden vertices), attacked by decomposition waves that BLOCK. After: Route F bypasses the entire apparatus (v28:27-29 "Everything in v27 and before attacks op-classical through the signed picture... **Route F bypasses that entire apparatus**"), the signed trunk is PARKED (`2026-07-24-af-elevation-campaign.md:61`), and the mode of work switches from *finding a mechanism* to *re-establishing a literature theorem to L0 rigour*.

**Adversarial formalisation was promoted in two distinct steps.**
- *Step 1 (W73b, 07-22):* a hostile audit against the byte-verified source found Kitaev's printed proof of Thm 12.3 **INVALID as printed** while its statement was VALID (v28:83 "Q1 VALID · Q2 VALID-WITH-CORRECTIONS · Q3 INVALID · Q4 VALID · Q5 VALID"). Adversarial reading was aimed *at the literature*, not just at own work.
- *Step 2 (W74–, 07-24):* `2026-07-24-af-elevation-campaign.md` makes the af-oracle the campaign's whole objective. Its rule 3 is the pivot in one sentence: "The Kitaev-derived material CANNOT enter as `cited` (its printed proof is invalid; our chain is a repair) — **everything is re-proved inside af, leaves first**."

**The pivot's immediate cost, and its vindication.** `docs/LEARNINGS.md:64-90` — the af-decomposition forced every step into a one-line contract with explicit domains, and under that stricter bar **15 rows of the "proved-mod-audit COMPLETE" chain failed hostile review and were stripped to GAP reservations**. The verbatim lesson (LEARNINGS:86-90): "later agents kept repeating both 'complete mod-audit' and 'genuine open mathematics remains' without reconciling them. THE LESSON: a status-bearing HEADLINE demoted by a later verdict must get a LEARNINGS entry in the same commit as the demotion (Rule 9 applies to claims, not just files)."

**Outcome.** T0 (af-validated) went 34 (v30) → **169** (v46) in ten days, with six retractions on the way (`LEARNINGS.md:93,127`; v37 title "first retraction: inversion-derivative pair demoted, T0 105"; v38 "the binder sweep: T0 101"). `op-classical` remains **OPEN** (v46:116). The elevation campaign bought rigour, not the theorem.

## Waves as an execution unit

**Operationally, a wave is a dispatch-and-adjudicate unit with reviewer ≠ author.** `docs/waves/2026-07-09-W53-binding-constraint-lemmaization.md` is the canonical shape, and it has five parts:
1. **Node** — the sketch step it targets (W53:3 "sketch v16's opening move").
2. **Design** — worker count, roles, isolation (W53:4-9 "four fresh-codex provers (isolated workspaces...) + one Opus strategist + **four SEPARATE fresh hostile codex verifiers, one per prover**"), plus a bd bead id.
3. **Verdicts, verbatim first lines** (W53:12-36) — quoted, never paraphrased.
4. **Banked / NOT banked** (W53:38-57) — including explicit negative space.
5. **Effect on the map** (W53:68-79) — the edge that feeds the next sketch version.

**Did wave discipline improve outcomes? Yes, and there is a number.** `2026-07-10-methodology-assessment.md:16-18`: across W54–W59, "~48% of author output corrected, ~15% killed by fresh hostile verifiers — never a rubber stamp; two whole architecture attempts killed, the kills converging on a real theorem". `06-wave-history.md:33`: "Hostile verification catches real defects at a steady rate (4–5 across 18 waves), always upstream of codification." And at campaign scale, `2026-07-26-critical-path-risk-register.md:74-75`: "2,386+ hostile jobs, zero route-level refutations; every retraction to date was of this repo's own rows."

**Wave granularity drifted enormously.** W1–W52 ≈ one proof question. W53–W72 ≈ one decomposition + batched verification. W73+ ≈ a design→audit→repair cycle: the S1-ENDGAME wave alone ran **five design rounds and five hostile audits** across 07-29/07-30 (`git log docs/plans/`: "design v1 landed" → "audit v1: VERDICT REDESIGN" → v2 → "REDESIGN" → v3 → "REDESIGN, converging" → v4 → "REDESIGN (2 plumbing fatals)" → v5 → "VERDICT LAND"). Late waves W78–W135 are single-row contract repairs.

**The wave record was abandoned mid-campaign.** `docs/waves/` has 107 entries; the last new artifact directory is `2026-07-16-W70-artifacts`, and the last commit touching the directory at all is 2026-07-24 (W72). Wave numbering continued to **W135** (2026-08-03), but W73+ artifacts live in `docs/plans/*-design/` and `*-artifacts/` (22 directories) and in commit messages. The directory named `waves` stopped being the wave record and nothing renamed it.

## Plan↔execution impedance mismatches

1. **Version-numbered immutable files as the citation substrate.** Every sketch file has exactly one commit (checked across all 46; five have 2–7 from same-day fixups). This is deliberate: v1:4-5 "Kept intact because banked artifacts cite v1 line numbers (e.g. the DC4 gap table)". The cost is that **retracted claims are frozen and permanently citable**: `2026-07-24-top-down-proof-sketch-v31.md:5-7` still declares "Route F is proved-mod-audit COMPLETE" in its ROLE header — a headline retracted two days later (`LEARNINGS.md:64`). Content-addressed citation (shard id + hash, which the repo already has for shards) would have removed the need for the frozen-file convention entirely.

2. **Prose reductions the linker cannot check.** Remediation item 12, quoted above: ~130 of 151 shards were not ancestors of the goal. This recurs at the very end of the campaign in inverted form — v46:36-43 records that a *contract* asserted its own provenance ("the assembly **uses** the corrected squared COL-HILB estimate…") and was undischargeable, with the resolution being: "The `deps:` line *is* the 'uses' statement, expressed in the mechanism this repo actually enforces. The linker checks dependency edges on every gate run; **nothing checks prose inside a contract string**." Same defect class, thirty days apart, at two altitudes.

3. **Stale claims propagating across artifacts unreconciled.** `LEARNINGS.md:86-88` — the headline/verdict contradiction survived multiple agents and multiple sessions. Also `2026-07-10-project-remediation-plan.md:30-31`, Phase 0 item 1: two live self-contradictions inside HANDOFF.md itself ("(sketch v20)" vs v24; "af-validated 28" vs 29).

4. **The delta chain has no materialisation.** To know the current strategy you read v46 → v45 → … → v28 → v27 → … Each says "everything not restated here is unchanged". `CURRENT.md` points only at the newest *delta*. No tool renders the composed map.

5. **CHANGELOG.md is a partially-adopted second channel with no single reading order.** 738 lines mixing reverse-chronological deltas at the top (v33 delta, then v33, then v32 delta, then v32) with a "## Retrofit entries (v20–v24, backfilled 2026-07-10)" block (line 69) and then chronological entries from 07-10 onward. Two-tier versioning was adopted; a consistent ordering was not.

6. **Plans referencing decisions that had already moved.** `2026-07-30-top-down-proof-sketch-v41.md:11-13`: "P0 was already discharged (the four defs were ratified+locked 2026-07-27, W79 D2; the aism-dm8n HARD STOP was **stale**)." A bead-tracked hard stop outlived its own resolution by three days — exactly the failure the assessment's finding 6 predicted ("bd clock-staleness misses content-staleness").

7. **Voided plans left in place.** `2026-07-26-critical-path-risk-register.md:5-7` supersedes the W74/XE decider dispatch "voided by the user same day" — the superseded plan is not marked in its own file; only the superseding one knows.

## Durable (A)

- **Reviewer ≠ author, enforced structurally.** Every wave dispatches provers and *separate fresh* hostile verifiers (`W53:4-9`; `af-elevation-campaign.md:11-13` "Claude ONLY orchestrates... never judges"). Durable because a stronger model improves the prover *and* the verifier; what the separation buys is independence, which capability alone never supplies. The empirical rates (48% corrected, 15% killed) are the argument: these are not errors a bigger context window fixes.
- **Status as a type, with mechanical propagation.** The L0/L5/`proved-mod-audit`/`stated` ladder plus a linker that suspends downstream rows automatically (`LEARNINGS.md:183-193` — M18/M20 auto-suspended when M19-S2/S3 were demoted, "they re-flip mechanically once those re-validate"). Durable: as models produce more claims per hour, the value of a machine-checked claim-status calculus grows superlinearly.
- **Edges over prose, as a first principle.** v46:36-43. This is the single most transferable line in the corpus and it generalises past mathematics: *put the assertion in the mechanism that is actually enforced, and delete the prose duplicate.* Stronger models write more convincing prose; that makes unenforced prose more dangerous, not less.
- **Cheap exact deciders before expensive proof attempts.** W63/W66/W71 decider batches, all BLOCKED, run at L3 (evidence-only, no status change) before any creative wave (`CHANGELOG.md` W66 entry: "ALL BLOCKED... Non-proof green light for the creative queue"). Durable: cost asymmetry between refutation-search and proof-search is a property of the problem, not the model.
- **The retraction ledger.** `docs/LEARNINGS.md` — "the graveyard of RETRACTED claims... A retraction here is a SUCCESS of" the machinery (line 2-4). Durable: stronger models still err, and the artifact's cost is near-zero while its value is calibration data.
- **Independent parallel sampling with convergence as evidence.** W73's four blind strategists (reset §1b). Durable and cheap to strengthen — more independent samples from a better model is strictly better evidence.
- **Risk-ranked de-risking with explicit kill-scenarios.** `critical-path-risk-register.md:80-99` prices each front by "probability the front hides a route-killing defect × how much of the route it takes down" and names the specific kill-scenarios to test. Its §"Risk calibration" (lines 61-78) — distinguishing truth risk from transcription risk from cost risk — is model-independent decision hygiene.

## Scaffolding (B)

- **The externalised top-down sketch itself.** Needed because no agent holds 364 registry rows plus a 46-version strategy history in context. The `UNCHANGED from vN` delta convention exists *specifically* so a rewrite fits in a context window — v46 restates four map changes and inherits the rest by reference. A model that could hold and re-derive the whole map would emit the composed view on demand and never need the chain.
- **The W73 state-of-play pack** (`W73-artifacts/stateofplay/00-brief.md` … `08-*`): nine hand-built summaries produced by six summarizer agents purely to fit the repo into four strategists' context windows. This is hand-rolled retrieval.
- **The af brittleness envelope.** `af-elevation-campaign.md:22-27`: trees past "~12 nodes / depth 3" must be factored first; "compound contracts thrash to STUCK". These are constants of the current prover, not of mathematics. `aism-fudw` — an entire three-round adversarial *design* wave (v31:19-29) — existed only to chop proofs small enough for the prover.
- **Batched hostile verification.** Adopted as default because "Verification is the cost center; strict 1:1 serial verify is slow" (assessment finding 5). An economics workaround; cheaper inference dissolves it.
- **Multi-round design→audit→repair with version-suffixed design files** (S1-ENDGAME v1–v5, MAIN-STRUCTURE v1–v5, FUDW v1–v4.1). Scaffolding for first-pass non-convergence. Note the ratio: the whole campaign spent 19 codex jobs on 2026-07-27 alone (`W78-ratification-package.md:24-26`) to reach "landable".
- **Two-tier versioning + generated `CURRENT.md` pointer.** A fix for pin-sprawl, which is itself a symptom of documents-as-database. Durable *principle* (single source of truth, generated pointers); scaffolding *implementation*.
- **"Each wave targets exactly one `<.>` step"** (v1:164). Horizon-limiting decomposition for agents that lose coherence over long tasks.

## Anti-patterns (C)

- **Version-file-per-fact.** v20–v25: six files, 23–84 lines, six pin-bump rounds, on one day, to record four one-line status changes. Diagnosed contemporaneously by the project itself (remediation item 17). The anti-pattern is not "many versions" — it is *coupling a fact to a file to a pin*.
- **Immutable version files as citation targets.** Freezes retracted claims in permanently-citable form (v31's "proved-mod-audit COMPLETE" header vs `LEARNINGS.md:64`). The stated reason — "banked artifacts cite v1 line numbers" — is a symptom of citing *by file:line into mutable prose* rather than by stable id.
- **A second, partially-adopted changelog channel.** `CHANGELOG.md` has retrofit entries backfilled after the fact and mixed ordering; it never fully replaced the numbered files it was meant to replace (v20–v46 all still got files).
- **Abandoning a named record directory without renaming it.** `docs/waves/` frozen at W70/W72 while waves ran to W135 in `docs/plans/*-design/`. A future reader who greps `docs/waves/` for the campaign's execution record gets half of it and no warning.
- **Status-bearing headlines with no demotion protocol.** The 2026-07-26 retraction's own lesson (`LEARNINGS.md:86-90`) is that the demotion and the LEARNINGS entry must land in the same commit; they did not, and multiple agents propagated a contradiction for two days.
- **Prose that duplicates an enforced edge.** The `lem-thmainext-conditional` method clause (v46:12-22) cost a full design round, a hostile audit REJECTION, a re-scope, a user ratification, and a second design round — to delete a sentence whose content the `deps:` line already carried. The generalisable rule the campaign extracted (v46:84-90) is the anti-pattern's own antidote: "check whether any consumer depends on the narrative clause; if none does, re-scope it to `provenance:`".
- **Bead/plan staleness surviving its own resolution** (v41:11-13, the stale `aism-dm8n` HARD STOP). Clock-staleness detection was in place; content-staleness detection was a "session-close habit" (assessment finding 6, remedy column: "Standing rule") — i.e. hand-maintained, and it decayed, exactly as the assessment's own cross-cutting law predicts.
