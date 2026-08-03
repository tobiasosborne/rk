<!-- ROLE: raw postmortem evidence (Opus subagent report, banked verbatim).
     UPDATE-POLICY: frozen historical record; never edit.
     TRIGGER: consulted from docs/memos/2026-08-03-aism-bitter-lesson-snapshot.md -->

# AISM postmortem — exploration runs agent report (banked verbatim)

## Run inventory sample

38 bundles under `runs/`, dated 2026-07-02 → 2026-07-16. All 38 READMEs read; 20-run sample table (abridged here to key rows):

- `2026-07-02-web-regime-hunt` — exact idempotent in dangerous web regime? NO in ~48k instances; **fed back**: `obs-height-collapse` now proved/af:validated; forced a FINDINGS correction.
- `2026-07-02-sigma-cap-refuter` — ε=0 cap FALSE as written; fed `lem-halo-collapse` (proved/af:validated).
- `2026-07-04-cross-pivot-kill-test` — fed wave 12, then its extrapolation refuted by G12 same day (README addendum lines 57-63).
- `2026-07-04-small-delta-b-sweep` — B/δ RISES to 0.771; killed the "sub-δ" belief (artifact of δ≈cap sampling); forced K≥0.771 into `conj-b-restricted`.
- `2026-07-05-gamma-emptiness-refuter` — **REFUTED `conj-gamma-emptiness`** (status: disproved, bundle named as death certificate). **Re-ran it now: exit 0, verdict byte-identical.**
- `2026-07-05-nsc-zero-denominator-refuter` — **REFUTED `conj-nsc`** (disproved).
- `2026-07-06-w20-g-zoo-measurement` — killed a whole method ("further zoo measurement is DEAD").
- `2026-07-06-w25-step4-decider` — E2 fact-list INSUFFICIENT, exact 3×3 no-go certificate; forced codification of `conj-min-a-w4`.
- `2026-07-10-w57/w58-starvation-completion` — INFEASIBLE with exact Farkas certificates → `lem-starvation-completion-obstruction` proved/af:validated.
- `2026-07-10-w62-i-horn-refuter` — BLOCKED (3rd consecutive tallness bind). **Documented re-run command fails** (`search.py:619` looks for certificates.json beside the script; re-home patch moved it to data/).
- `2026-07-16-w71-poti0-zero-overlap-decider` — BLOCKED; **7th consecutive tallness bind**; last run of the campaign.

Aggregate verdicts over 38: 3 REFUTED, 2 INFEASIBLE-certificate, 1 INSUFFICIENT, 8 BLOCKED, 5 PARTIAL, 4 NOT-REFUTED, 2 UNDECIDED, 1 REGIME-EMPTY, rest descriptive.

## Hit rate & what made winners win

**Discipline stats:** 38/38 have README with all four gated fields (`check-runs.py:32` enforces hypothesis|command|finding|next + invariant marker + INDEX row); 38/38 in INDEX.md — mechanically enforced, zero orphans. 31/38 declare independent orchestrator recomputation. 0/38 have figures/ despite runs/README.md prescribing one.

**Local hit rate ≈ 13/38 (34%)**: 2 killed conjectures outright (the only two `disproved` shards in a 364-shard registry, both citing their bundle as death certificate); 5 seeded shards that reached proved (3 af:validated); 6 more overturned a stated belief or killed a method.

**Strategic hit rate ≈ 0/38.** The live campaign goal (op-classical via Route F) depends on NONE of it. All 7 run-seeded shards are in `report/UNWIRED.md`; none in the paper. Only 2 of 5 run-seeded proved lemmas have any dependent, both themselves unwired.

**The repeatable winning shape** — every winner has all four; no loser has all four:
1. A falsifiable question in the title with a named registry id and kill criterion (7 bundles use explicit pre-registration language).
2. Exact arithmetic (`fractions.Fraction`, stdlib-only from 07-04 onward) — answer is a certificate, not a p-value. One instance killed `conj-gamma-emptiness` after a 352-candidate census had "supported" it.
3. Independent recomputation by a different author from the printed data alone (31/38) — reviewer ≠ author applied to numerics.
4. Calibration hard-asserts against banked witnesses before searching (`door-ratio-census`: 3 calibrations, 19 asserts) — turns a search into an instrument.

**Losers**: question was "measure X" not "kill X" (w16b UNDECIDED because its certificate JSON stored derived quantities not the L,B matrices — no independent recheck possible).

**Diminishing returns self-reported but never acted on:** seven consecutive refuter batches (07-10→07-16) returned the same answer (tallness binds); counted in every title ("the SEVENTH consecutive tallness bind"), never used as a stop rule.

## Numerics↔formal impedance mismatches

1. **Dominant failure mode: a failed search read as emptiness evidence.** G11's 0/352 census → codified `conj-gamma-emptiness` → refuted same session by wave 15. `FINDINGS.md:352-354`: "never treat a failed search census as support for an emptiness conjecture without a coverage argument." Same shape ×3 (cross-pivot, small-delta-b). Fix was propagated as a prose stamp ("NEVER an emptiness claim", 15/38 READMEs) — discipline, not a gate.
2. **Numeric evidence has no rung above "quarantined".** `argument.py:53-61`: `numerical` ∈ NONRIGOROUS_STATUS; only af:validated/cited deps count. Correct and load-bearing — but two exact certified facts sit permanently at `status: numerical` with no path up. An exact certificate over ℚ IS a theorem about itself; the ladder has no rung for "verified instance fact" vs "float sweep".
3. **Correction traffic flows one way.** LEARNINGS.md offers "numerical refutation" as a Caught-by option — never fires. The two conjecture kills numerics delivered were never logged in LEARNINGS. The two ledgers don't talk.
4. **Exploration stopped without a decision.** Last bundle 07-16; campaign ran 21 more sessions producing 169 af-validated results, none consuming a run. No artifact records "exploration is closed"; it just stops.

## Provenance linkage assessment

- Run → claim is prose in an unvalidated `provenance:` field; `argument.py` never reads it. Only 11/364 shards mention a runs/ path.
- INDEX.md covers 38/38 but its row schema has **no claim-id column** — the machine-checked link is bundle→index-row-exists; the semantic link is prose both directions.
- FINDINGS.md stops citing runs after 2026-07-06 (11 citations, file edited through 07-29); the last 22 bundles reachable only through wave prose.

## What died

- **Prompts**: 13 READMEs cite "the prompt in the session scratchpad" — gone; the adversarial brief is unrecoverable for a third of the campaign. Fixed from 07-10: BRIEF.md in-bundle, sha256'd (9 bundles).
- **Near-loss of code**: 4 scripts "recovered verbatim from /tmp scratch before expiry".
- **The scientific-stack era**: 6 early bundles need numpy/scipy/gurobipy — all broken/absent now; the 67k-instance inherited record unrunnable except its stdlib check_invariant.py; one dead absolute path to a prior machine.
- **One silently broken re-run command** (w62) — `check-runs.py` verifies the command *string exists*, never that it *runs*.
- **Bundle is not the unit of reproduction — the repo is**: 8 bundles `sys.path.insert` into web-regime-hunt's scripts via `parents[3]`; copy one out and it dies (reproduced both failure and success).
- **The CSV schema** (`data/SCHEMA.md`) superseded after 07-05, never retired; 0 bundles ever emitted a figure.

**Reproducibility bottom line:** re-ran 6 bundles 3-4 weeks later: 5 passed byte-identically; 1 failed on the path defect. The exact-rational stdlib-only self-asserting design from 07-04 onward genuinely survives.

## Durable (A)

- **A1. Cheap mechanical refutation over exact arithmetic is ground truth.** One certified ℚ instance killed a conjecture a census had supported. Stronger models conjecture faster and more confidently; wrong-conjecture cost rises with model strength, refuter cost doesn't. Single most transferable thing on the exploration side.
- **A2. The rigour ladder made mechanical** — no rigorous result can rest on a number. More persuasive numerics ⇒ barrier more valuable.
- **A3. Independent recomputation by a second author from printed data alone** (31/38) — catches the failure mode that scales WITH model strength: a plausible pipeline computing the wrong quantity.
- **A4. Calibration hard-asserts before any search** — makes silent pipeline drift impossible.
- **A5. Exact certificates as output format** (rational strings + sha256) — re-verifiable by any future agent with no access to the producing code.
- **A6. Honest-scope as a required README field** — both burns were anticipated by the scope note; forcing it gets more valuable as models get more fluent at over-generalizing.

## Scaffolding (B)

- **B1. Four-field README gate** — checks substrings, can't tell a real hypothesis from a topic. Exists because models otherwise write narrative.
- **B2. "NEVER an emptiness claim" stamp** — sticky note, not mechanism.
- **B3. Orchestrator re-home patch** — the manual step that broke w62; a model writing to a declared output contract removes both step and defect.
- **B4. Mutually-blind prover/refuter pairs** — productive (blind convergence carried real evidential weight) but exists to defeat self-agreement; also converged on the same wall seven times.
- **B5. The wave-doc layer** (107 files vs 38 runs) — narrative bridge because neither end holds the reasoning.

## Anti-patterns (C)

- **C1. Provenance as prose in an unchecked field.** For rk: the experiment→claim join must be a machine-checked edge with a direction and a verb (`refutes`, `supports`, `calibrates`), not a sentence.
- **C2. A gate that checks a command string rather than executing it.** Green must mean the artifact re-ran.
- **C3. Cross-bundle imports via parents[3] path arithmetic** — vendor the library or version it as a first-class artifact.
- **C4. Prompts/briefs outside the bundle** — keep the W61 fix (BRIEF.md in-bundle, sha256'd).
- **C5. No stop rule on a repeating negative** — a repeated identical verdict across independent searches should close the lane, not be a badge.
- **C6. Prescribing artifacts nobody produces** (figures/, CSV schema) — dead spec teaches agents the spec is advisory.
- **C7. A numeric-evidence rung with no exit** — "proved-exact-instance" deserves its own rung.
- **C8. Exploration and formalisation on separate calendars with no handshake** — exploration never noticed its routes had been abandoned for Route F; 98 of 169 af-validated results unwired too, so systemic.
