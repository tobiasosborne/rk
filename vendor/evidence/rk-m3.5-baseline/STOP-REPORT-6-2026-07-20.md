# M3.5 SC4-baseline live session (ATTEMPT 6) — STOPPED at TWO newly-surfaced downstream gaps: the prover's proof-recording is rejected by af's closed `--justification` enum (run A), and the claude verifier's output fails rk's strict JSON.parse (run B) (2026-07-20)

ROLE: durable stop-report banked by the M3.5 baseline operator (attempt 6). rk HEAD 017428e
(FIX 6 + aaadda1 numeric-target/bind-observability). STOP-1..5 are ALL resolved and re-verified
below — this attempt got the bootstrap MUCH further than any prior one. Two live runs of
`lem-weighted-min` were dispatched (run A codex-verifier/claude-prover, run B claude-verifier/
codex-prover); both aborted `stuck-no-progress` after 3 rounds, but at TWO DIFFERENT, newly-isolated,
role-specific downstream gaps. lem-mass-split and lem-starvation-completion-obstruction were NOT
dispatched (identical bare-root bootstrap shape → identical gaps predicted; grinding 4 more runs into
the same two walls = ~350k tokens for zero new signal, STOP-5 spend precedent).

## Verdict (headline)

**STOP-5's binder gap is genuinely fixed and the bootstrap now advances past it — for the first time
in six attempts, a real verifier challenge BINDS, APPLIES to af, and FLIPS the bare root
prover-ready, and the prover then RUNS.** The `challenge → prover-flip` chain that every prior
attempt failed to complete now completes (run A: `verdict-outcome challenge status=applied exit=0`).
The run dead-ends one step further on, and the two directions fail differently:

- **Run A (verifier=codex, prover=claude):** codex challenges the bare root → BOUND + APPLIED → root
  flips prover-ready → claude prover produces a decomposition → **`af record-proof` rejects it: the
  prover named a child inference justification (`multiplication_by_positive`) that is NOT in af's
  CLOSED 11-value `--justification` enum.** rk passes the model's free-text justification straight to
  af's `inference` field with no enum bridge. Node skipped, no progress, `stuck-no-progress`.
- **Run B (verifier=claude, prover=codex):** every claude verifier turn returns `worker exit 12`
  (schema-invalid output — rk's strict `JSON.parse(rawText)` of claude's `envelope.result` fails).
  No verdict is ever extracted → no challenge → root never flips → codex prover never runs →
  `stuck-no-progress`. Claude-AS-PROVER (run A) returned bare-parseable JSON and worked; claude-AS-
  VERIFIER does not — the failure is verifier-turn-specific and rk persists NOTHING at this stage, so
  the raw claude output is unrecoverable.

Both are §7 stops (CLAUDE.md §7 "a gap discovered mid-WP → surface it, pick nothing silently"; task
brief "Mid-run rk bug = §7 stop, never patch around"). Both touch validity-adjacent paths (what
inference is RECORDED into af; whether a verdict is EXTRACTED at all) → not the operator's to fix;
each needs a decision + Tier-A review (L6). No SC4 denominator was produced (0 validated nodes).

## GAP 6 (run A) — af's closed `--justification` enum rejects the prover's natural math justification

### What happened (driver-log, verbatim)

Run A drove the full bootstrap for the first time. `lem-weighted-min/.rk/driver-log.jsonl`
(banked `_logs/lem-weighted-min.run-A.driver-log.jsonl`), in order:

1. `usage` role=verifier (codex) — input 16468, output 85, cache_read 9984.
2. `verdict-outcome` node 1 `challenge` **status=applied exit=0** — the codex challenge BOUND and
   was APPLIED to af. The bare root flipped prover-ready. (STOP-5's numeric-target + FIX 6 aspect-map
   gaps are both closed: a real cross-vendor challenge now lands.)
3. `usage` role=prover (claude) — input 2, output 420, cache_read 26798, cache_creation 1538.
4. `node-skipped` node 1, reason **verbatim**:
   ```
   af recordProof failed: af record-proof exit 1: child 3: invalid value "multiplication_by_positive" for --justification

   Valid values for --justification:
     modus_ponens
     modus_tollens
     by_definition
     assumption
     local_assume
     local_discharge
     contradiction
     universal_instantiation
     existential_instantiation
     universal_generalization
     existential_generalization
   ```
5. `usage` role=prover (claude, retry) — input 2, output 432, cache_read 28336, cache_creation 766.
6. `node-skipped` node 1 — **byte-identical** reason (`multiplication_by_positive` invalid again).

Then `stuck-no-progress` (3 rounds, cap 3). `verdicts total=1 applied=1` (the challenge),
`bind-failed=0` (the challenge bound cleanly — this is NOT a bind failure), 0 validated nodes.

### Root cause

- af's `record-proof --justification` (per-child `inference`) is a **CLOSED enum of 11 formal-logic
  inference rules** (listed above). It is not free-text.
- rk's `buildRecordProofChildren` (`src/drive/driver-af.ts:212`) maps a prover child's
  `justification` **straight into af's `inference` field with no validation or mapping**:
  `if (c.justification) child.inference = c.justification;`.
- rk's prover prompt (`src/drive/driver-prompts.ts:167-170`) presents justification as **optional
  free-text**: `"justification"?: <inference rule name>` with only three illustrative examples
  (`e.g. modus_ponens, by_definition, contradiction`) — it does NOT state the value is a closed enum,
  does NOT list the 11 legal values, and does NOT forbid domain-specific justifications.
- claude-opus-4-8 therefore emitted the natural mathematical justification for the step (multiplying a
  weighted inequality through by a positive weight): `multiplication_by_positive`. It is a correct
  description of the inference — and af-illegal.

This is the **exact STOP-5 → FIX pattern, one layer over: the model emits a natural value, af
enforces a stricter closed contract, and rk has no bridge.** FIX 6 (017428e) bridged the challenge
`category → aspect` enum on the VERDICT side. There is **no equivalent bridge on the PROVE side** for
justification/inference.

### Why AISM's originals didn't hit this (evidence, not assumption)

AISM's codex provers produced af-legal proofs for these same lemmas (they are all `af: validated`).
Two possibilities, both consistent with af's rule that omitted justification defaults to `assumption`
(`src/drive/driver-plan.ts:129`): AISM's prover prompt either constrained codex to the enum or the
provers omitted `inference` entirely. rk's prompt does neither — it invites a free-text "inference
rule name," which a capable prover fills with a true-but-illegal math justification.

### Reproduction / blast radius

Reproduced 2× within run A (both prover attempts, identical). Structural and rk-side: it fires
whenever a prover emits ANY justification outside af's 11-value enum — which real mathematical
decompositions routinely require (arithmetic, algebraic, monotonicity, positivity steps have no
member in a pure-logic enum). Every lemma's claude-prover direction is exposed.

## GAP 7 (run B) — the claude verifier's output fails rk's strict `JSON.parse` → exit 12, and rk persists nothing

### What happened (driver-log, verbatim)

Run B (`_logs/lem-weighted-min.run-B.driver-log.jsonl`): three claude verifier turns, each:

- `usage` role=verifier (claude) — (turn 1) input 2, output 367, cache_read 26797, cache_creation
  1683; (turn 2) output 431; (turn 3) output 478.
- `node-skipped` node 1, reason **verbatim**: `worker exit 12`

`verdicts total=0` (nothing bound or applied), `bind-failed=0`, 0 prover turns. Because the claude
verifier never produced an extractable verdict, the bare root never flipped, the codex prover was
never dispatched, and after 3 no-progress rounds the run aborted `stuck-no-progress`.

### Root cause

- Exit 12 = "schema-invalid output" (`docs/worker-contract.md:242`): the backend exited 0 but rk
  could not parse/bind a usable JSON document.
- `toDispatchedTurn` (`src/drive/driver-live.ts:88-95`) does a **strict `JSON.parse(rawText)`** on the
  claude backend's `rawText` (= claude CLI `envelope.result`, `src/drive/backend-claude.ts:134`).
  Neither backend extracts an embedded/fenced JSON object; a `result` that is not bare-parseable JSON
  throws → exit 12.
- **Asymmetry that isolates it:** codex writes its final message to a clean `-o` outFile
  (`backend-codex.ts:173`) — in run A the codex VERIFIER's file was bare JSON and bound fine. claude
  returns the CLI's assembled `result` text. claude-AS-PROVER (run A) happened to return bare JSON and
  worked; claude-AS-VERIFIER (run B) returned something `JSON.parse` rejects (prose- or fence-wrapped
  reasoning is the likely shape for the hard-forbid-accept verifier prompt, but see below — it cannot
  be confirmed).
- **Observability sub-gap:** the aaadda1 bind-failed evidence mechanism persists a raw snippet only on
  BIND-stage failures. An exit-12 at the earlier `JSON.parse` stage persists **nothing** — the
  node-skipped reason is the bare string `worker exit 12`, and the claude verifier's actual output is
  **unrecoverable**. Unlike the bind-failed evidence the task brief highlighted, I cannot quote what
  claude returned, because rk threw it away. `_logs/raw-verifier-outputs/` is empty for this reason.

### Reproduction / blast radius

Reproduced 3× within run B (all verifier turns). Not lemma-specific: it concerns the claude
verifier's output SHAPE vs rk's parse strictness, so the claude-verifier direction (run B for every
lemma) is blocked identically regardless of which lemma is run.

## Both runs side by side

| | run A | run B |
|---|---|---|
| prover / verifier | claude claude-opus-4-8 / codex gpt-5.6-sol | codex gpt-5.6-sol / claude claude-opus-4-8 |
| in-band resolution (preflight) | verifier→codex(gpt-5.6-sol), prover→claude(claude-opus-4-8) ✓ | verifier→claude(claude-opus-4-8), prover→codex(gpt-5.6-sol) ✓ |
| verifier challenged bare root? | YES — bound + **applied** (exit 0), root flipped prover-ready | NO — all 3 turns `worker exit 12` (JSON.parse failed) |
| prover ran? | YES — produced decomposition | NO — root never flipped |
| downstream failure | af record-proof exit 1: illegal `--justification` `multiplication_by_positive` | claude verifier output not bare-JSON → exit 12 |
| verdicts total / applied | 1 / 1 (the challenge) | 0 / 0 |
| prover turns / verifier turns | 2 prover / 1 verifier | 0 prover / 3 verifier |
| stop reason | stuck-no-progress (3 rounds, cap 3) | stuck-no-progress (3 rounds, cap 3) |
| validated nodes | 0 | 0 |
| attributed tokens | **84831** (in 16472 / out 937 / cache_read 65118 / cache_creation 2304) | **89870** (in 6 / out 1276 / cache_read 84785 / cache_creation 3803) |
| cache fraction | 0.7762 | 0.9570 |
| wall-clock (session + 3 turns) | ~40s model time (13:11:52→13:12:32) | ~45s |
| campaign cap | 500000 (honored; ~17% used) | 500000 (honored; ~18% used) |

## Preflight gates that DID pass (so the two gaps are isolated downstream)

- `bun test` **1883 pass / 1 skip / 0 fail** (1884 total); `bun run selftest` **OK** (123/123 corpus,
  purity 99/99 + 24/24). `dist/rk` rebuilt from master tip **017428e**.
- Backends: claude 2.1.215, codex-cli 0.144.6 (ChatGPT login, `gpt-5.6-sol`), af reinstalled at
  `~/go/bin/af` (reports build `dev`; the task's FIX-3 single-item no-batch acceptance is confirmed
  live below, not merely from `--help`).
- af `verdicts apply --help` documents the single-document `{schema_version, batch_id, verified_by,
  items[]}` shape and the reviewer≠author rule; run A's applied challenge exercised it live.
- Config validation clean 3/3 both directions; dry-run sane for all three
  (`verifier-ready now (1): 1`, balloon tripwire 1≤40 clear); in-band model resolution correct BOTH
  directions (the §7 pre-dispatch gate — passed).
- STOP-1/2/3/4/5 all stay RESOLVED: features preflight OK, per-assignment model pin resolves in-band,
  vacuous-accept guard never needed to fire (verifier challenged, did not vacuously accept), and the
  numeric-target/aspect-map binder gaps are closed (run A's challenge bound + applied).

## Options surfaced (NOT selected — §7 "pick nothing silently"; all Tier-A / L6)

### For GAP 6 (prover justification vs af enum)
- **(6a) Prompt-side:** enumerate af's 11 legal `--justification` values in the prover prompt, state
  it is a CLOSED enum, forbid free-text. Cheapest. RISK: real math steps have no legal member;
  forcing the closest logical rule mis-records the actual inference (`multiplication_by_positive`
  labelled `by_definition` is FALSE — a provenance/validity corruption, L6).
- **(6b) Mapper-side:** in `buildRecordProofChildren`, DROP a non-enum justification (omit
  `inference`, letting af default to `assumption`, `driver-plan.ts:129`) — af-legal and lossless-of-
  correctness (records "no named rule" rather than a wrong one). Simple, low-risk, honest. Or map a
  known set of math justifications to enum members (semantically risky, same L6 concern as 6a).
- **(6c) af-side (V-item, Rule 2 → vibefeld):** af's `--justification` enum cannot express real
  mathematical inference steps. If decompositions routinely need non-logic justifications (they do),
  the actual defect is af's closed enum — add an `other`/`domain`/free-text justification, or make
  record-proof tolerate an unnamed justification. Owning-repo fix, not rk.
- Recommended surface: **(6b) drop-to-default is the safe interim** (honest, af-legal, no false
  inference recorded), with **(6c)** as the real fix if the baseline is to record faithful inference
  provenance. Do NOT ship (6a)/mapping without deciding whether a coerced logical label is a validity
  lie for these proofs.

### For GAP 7 (claude verifier output → exit 12)
- **(7a) Extraction:** relax `toDispatchedTurn` to EXTRACT a JSON object from claude's `result`
  (strip ```json fences / take the first balanced `{...}`). RISK: picking the "wrong" JSON blob could
  bind a bogus verdict — verdict extraction is a validity semantic; strictness may be intentional. If
  done, it must be a single-unambiguous-object rule, Tier-A reviewed.
- **(7b) Prompt-side:** force the claude verifier to emit BARE JSON only (no prose, no fences) — the
  same posture the prover prompt implicitly relies on. Cheapest; does not touch the parser.
- **(7c) Observability (needed regardless):** persist the raw backend output on an exit-12
  JSON.parse failure exactly as aaadda1 now does on bind failure (node + bounded raw snippet), so the
  operator can SEE what the verifier returned. Without this, GAP 7 cannot be diagnosed from logs —
  the current attempt could not quote the claude output at all.
- Recommended surface: **(7c) is mandatory** (fail legibly), then decide (7a) vs (7b) once the raw
  claude verifier output is actually visible. As-is, we are guessing at the output shape.

## rk-6nv / rk-mq2 live-fire evidence (task step 7)

- **rk-6nv** (prove→verify terminates; challenge→prover-flip; refine-author recorded):
  - `challenge → prover-flip observed LIVE`: **YES, for the first time.** Run A: codex challenge
    `status=applied exit=0`, bare root flipped prover-ready, claude prover dispatched and produced a
    decomposition. The chain STOP-1..5 never completed now completes.
  - `prove → verify terminates`: **NO.** Run A dead-ends at `af record-proof` (GAP 6); run B never
    reaches the prover (GAP 7). No proof body is ever recorded; no node validated.
  - `refine author recorded`: **NOT REACHED** (no proof recorded → no refine event → no
    author/verified_by on a parse to inspect). Note: the run-A workspace ledger was restored to
    pristine per the task's restore mandate before the applied-challenge ledger event could be banked
    — but the driver-log `verdict-outcome applied exit=0` is the durable proof the challenge landed.
- **rk-mq2** (does af accept `batch_id:""` single-item applies?): **NOW CONFIRMED POSITIVE.** Run A's
  codex challenge was a per-node single-item verdict file with empty `batch_id`, and af **applied it**
  (`verdict-outcome status=applied exit=0`) — the first real-cycle confirmation af accepts the rk
  per-node no-batch shape (task FIX 3, live-verified end-to-end). rk-mq2 can be closed.

## Ledger

- rk-attributed baseline tokens: **run A 84831 + run B 89870 = 174701 total** (all `lem-weighted-min`),
  6 turns (1 verifier + 2 prover in A; 3 verifier in B), **0 validated nodes, 1 applied challenge, 0
  recorded proofs.** Both runs aborted at ~85–90k, ~17–18% of their 500k caps.
- lem-mass-split (A+B) and lem-starvation-completion-obstruction (A+B): **NOT dispatched.** Identical
  bare-root bootstrap → run A hits GAP 6 (claude-prover justification), run B hits GAP 7 (claude-
  verifier exit 12), identically. ~350k tokens for zero new signal — not run, per spend discipline
  and the STOP-5 precedent.
- **No baseline memo produced** (0 validated nodes ⇒ no honest token-per-node denominator; writing
  rows for zero validated nodes would misrepresent the run, per L2 — same as STOP-4/5).
- **Verdict-parity NOT reached** (no fresh validated nodes). AISM originals captured read-only for the
  record: lem-weighted-min 8 nodes / 1 challenge_raised + 1 challenge_resolved / root validated;
  lem-mass-split 9 nodes / 1 + 1 / 2 defs; lem-starvation 7 nodes / 0 challenges / 2 defs. Nothing to
  compare against — the one dispatched lemma produced 0 nodes.
- AISM (`../almost-idempotent-stochastic-maps`): **read-only** — only the three originals' ledgers were
  read for parity reference; no write. rk tree: **clean** (HEAD 017428e), untouched except the
  gitignored `dist/rk` rebuild. All writes here in `../rk-m3.5-baseline/`
  (`STOP-REPORT-6-2026-07-20.md`; `_logs/lem-weighted-min.run-{A,B}.{console.log,driver-log.jsonl,
  report.txt}`). All three `proofs/<id>/` restored byte-identical to `_pristine/`; run-A config active
  in all three.
- Wall-clock: preflight + 2 live runs (~40s + ~45s model time) + diagnosis/banking ≈ a few minutes.
  No long prover turn ever completed a proof (run A's prover turns failed fast at record-proof; run B
  never dispatched a prover).

## Candidate beads (NOT filed — task confines writes to ../rk-m3.5-baseline)

- **NEW (P1, validity/interop): rk has no bridge between a prover's justification and af's closed
  `--justification` enum.** claude-opus-4-8 challenged→flipped→proved but `af record-proof` rejected
  `multiplication_by_positive` (not in af's 11 logic-rule enum). rk `buildRecordProofChildren`
  (driver-af.ts:212) passes it through raw; prover prompt (driver-prompts.ts:167-170) invites
  free-text. Blocks the claude-prover direction of the SC4 baseline. Fix options 6a/6b/6c above;
  6b (drop-to-default) is the safe interim, 6c (af enum) the real fix.
- **NEW (P1, interop): claude verifier output fails rk's strict `JSON.parse` → exit 12.** All 3
  claude verifier turns skipped `worker exit 12`; no verdict extracted; codex prover never ran.
  `toDispatchedTurn` (driver-live.ts:92) requires bare-JSON `result`; claude-as-verifier returned
  non-bare-JSON (claude-as-prover returned bare JSON and worked). Blocks the claude-verifier direction
  of the baseline. Fix options 7a/7b above.
- **NEW (P1, observability): exit-12 JSON.parse failures persist NO raw output.** The aaadda1
  bind-failed snippet covers only bind-stage failures. An exit-12 at the earlier JSON.parse stage
  writes only `worker exit 12` — the model output is unrecoverable, so GAP 7 could not be quoted.
  Persist node + bounded raw snippet on exit-12 exactly as bind-failed now does (option 7c).
- **(carried) `stuck-no-progress` still masks the real cause.** Run A (justification rejects) and run B
  (exit 12) both surface only as `stuck-no-progress`; the true cause is visible only in the driver-log
  node-skipped reasons. A stall-cause summary in the abort reason (as bootstrap-vacuous-accepts now
  does) would fail legibly.
