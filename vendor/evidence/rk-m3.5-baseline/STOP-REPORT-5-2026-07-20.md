# M3.5 SC4-baseline live session (ATTEMPT 5) — STOPPED at a FIFTH gap: the hard-tier verdict binder rejects a numeric `target` (2026-07-20)

ROLE: durable stop-report banked by the M3.5 baseline operator (attempt 5). TWO live runs were
dispatched (lem-weighted-min run A and run B — both cross-vendor directions); both aborted
`stuck-no-progress` after 3 real verifier turns. STOP-1 (verifier-only driver / unseeded workspace),
STOP-2 (single-global-model pin), STOP-3 (codex model-auth) and STOP-4 (bootstrap vacuous-accept
deadlock) are ALL resolved and re-verified below. This attempt halts at a FIFTH, newly-isolated gap
that only a real verifier turn producing a real *challenge* could surface — and it reproduces
IDENTICALLY across BOTH verifier vendors (codex `gpt-5.6-sol` AND claude `claude-opus-4-8`) and BOTH
directions, so it is STRUCTURAL and rk-side, not model-specific.

## Verdict

Attempt 5 cleared every gate STOP-1/2/3/4 flagged. Crucially, **STOP-4's bootstrap deadlock is
genuinely fixed at the prompt level**: under the new hard-forbid-accept prompt, BOTH verifier
vendors now correctly **CHALLENGE** the bare bootstrap root (naming that no proof body exists and
what must be produced) instead of vacuously accepting it — the exact behaviour STOP-4 said was
missing. But the challenge never lands: **rk's hard-tier verdict binder rejects the challenge because
the model emits the `target` node id as a JSON number (`"target": 1`), while
`src/drive/verdict-raw.ts` requires `target` to be a non-blank STRING.** The bind fails
(`verdict bind failed: must be a non-blank string`), the challenge is discarded, node `1` never
flips prover-ready, the prover never runs, and after 3 no-progress rounds the run aborts
`stuck-no-progress` with 0 applied / 0 validated. No proof is ever produced → **no SC4
validated-node token denominator exists.**

This is a §7 stop (CLAUDE.md §7 "a PRD/plan conflict or gap discovered mid-WP → surface it, pick
nothing silently"; task brief "Mid-run rk bug = §7 stop, never patch around"). The fix touches
verdict binding — a validity semantic (L6) — so it is not the operator's to make; it needs a Tier-A
review. Two runs (both directions) proved the gap structural; lem-mass-split and
lem-starvation-completion-obstruction have the IDENTICAL unseeded bootstrap shape and every verifier
turn on them would emit the same numeric `target` and fail identically, so they were NOT dispatched —
grinding four more runs into the same wall (~70k tokens each) would violate spend discipline for zero
new signal.

## Root cause: verifiers now challenge correctly, but the binder rejects a numeric `target`

The STOP-4 repair (commits 3294c02, eb10d3d, 8315895) added a prompt-side HARD RULE
(`src/drive/driver-prompts.ts` `prooflessVerdictRule`) that forbids accepting a proofless node and
demands the tier's negative verdict — for the hard tier, a `challenge` naming the missing proof. It
works: every one of the 6 verifier turns across both runs returned a well-formed challenge with
`outcome:"challenge"`, `severity:"critical"`, `category:"missing"`, and a substantive `reason`
stating no proof body exists. STOP-4's "verifiers ACCEPT the bare node" is gone.

The new failure is one step downstream, in the binder:

1. **Both models emit `target` as a JSON NUMBER.** The prompt's hard-tier schema hint is
   `"target": <node id at fault>` (`src/drive/driver-prompts.ts` `HARD_VERDICT_INSTRUCTIONS`), with
   no signal that the id must be quoted. af's root node id is `1`, which looks numeric, so both
   models emit `"target": 1`. Observed (banked verbatim, `_logs/raw-verifier-outputs/`):
   - codex `gpt-5.6-sol` (run A): turns 1,2 → `"target":1` (number); turn 3 → `"target":"1"` (string).
   - claude `claude-opus-4-8` (run B): turns 1,2,3 → `"target": 1` (number, all three).
   5 of 6 verifier turns emitted a numeric target.

2. **rk's binder requires a non-blank STRING target and fail-closes on a number.**
   `validateRawHardOutcome` (`src/drive/verdict-raw.ts:108`):
   `if (!("target" in v) || !isNonBlankString(v.target)) issues.push({... "must be a non-blank
   string"})`. `isNonBlankString(1)` is false (it is a number, not a string), so the raw output is
   rejected at the `rawOutput` stage of `bindVerdicts` (`src/drive/bind-verdicts.ts:97-98`).
   `verifyOneNode` returns `skip: "verdict bind failed: must be a non-blank string"`
   (`src/drive/driver-verify-node.ts:64`); the challenge is never mapped, never composed, never
   applied to af.

3. **The node never flips; the prover never runs.** A discarded challenge writes nothing to af, so
   `af export` still marks node `1` `verifier_ready` (never `prover_ready`) next round. `PROVE half`
   (rk-gn4) fires only for prover-ready nodes → the codex/claude prover is never dispatched. Every
   round is identical → `roundsWithoutProgress` climbs → `evaluateStuckGuard` aborts
   `stuck-no-progress` (cap 3, exit 4). `vacuousSinceProgress` is EMPTY (these are bind failures, not
   vacuous accepts), so the abort is correctly `stuck-no-progress`, NOT `bootstrap-vacuous-accepts` —
   STOP-4's guard did not misfire; this is a genuinely different, downstream cause.

### Secondary (under-determined, candidate bead): a well-typed challenge still did not flip the root

codex run-A **turn 3** emitted `"target":"1"` (a valid string). Its usage was logged, but the driver
log shows NO subsequent `node-skipped` (so it did NOT fail bind) AND NO `verdict-outcome` (so no af
apply outcome was recorded), and the af ledger is unchanged (still only `proof_initialized` +
`node_created`; node `1` still `pending/unresolved`). The only code path with that signature is
`composed.length>0` → `applyVerdicts` returning an EMPTY `items` report
(`src/drive/driver-run.ts:242-248`) with a matching content hash. So **even the one well-typed
challenge reached af apply but produced no ledger event and did not flip the root.** One data point;
under-determined. If real, it means fixing the `target`-type gap alone may NOT unblock the bootstrap
— the af-apply/flip path for a `challenge` on a bare *pending* root (target = the node itself) may be
a second obstacle. Worth a dedicated investigation before declaring the bootstrap fixed. (Not
reproducible from run B, whose 3 turns all bind-failed on numeric target before reaching apply.)

## Both directions, side by side (the structural proof)

| | run A | run B |
|---|---|---|
| prover / verifier | claude `claude-opus-4-8` / codex `gpt-5.6-sol` | codex `gpt-5.6-sol` / claude `claude-opus-4-8` |
| in-band resolution (preflight) | verifier codex→gpt-5.6-sol, prover claude→claude-opus-4-8 ✓ | verifier claude→claude-opus-4-8, prover codex→gpt-5.6-sol ✓ |
| verifier behaviour on bare node 1 | `challenge` (correct — obeys hard-forbid prompt) ×3 | `challenge` (correct) ×3 |
| `target` type emitted | number ×2, string ×1 | number ×3 |
| bind outcome | fail ×2 (numeric target), turn 3 bound but af-apply empty | fail ×3 (numeric target) |
| stop reason | stuck-no-progress (3 rounds, cap 3) | stuck-no-progress (3 rounds, cap 3) |
| applied nodes | 0 | 0 |
| prover / verifier turns | 0 prover / 3 verifier | 0 prover / 3 verifier |
| attributed tokens | 69810 (in 39607 / out 251 / cache_read 29952) | 72578 (in 6 / out 1516 / cache_read 67196 / cache_creation 3860) |
| cache fraction | 0.4306 | 0.9456 |
| wall-clock (session-create + 3 turns) | ~27s | ~55s |
| campaign cap | 500000 (honored; never approached) | 500000 (honored; never approached) |

## Preflight gates that DID pass (so the gap is isolated to the binder)

- `bun test` 1864 pass / 1 skip / 0 fail (1865 tests); `bun run selftest` OK (123/123, purity
  99/99 + 24/24, all corpus green). `dist/rk` rebuilt from master tip **8315895** (the STOP-4 repair
  wave: 3294c02, eb10d3d, 8315895).
- Backends: `claude` 2.1.215, `codex` 0.144.6 (ChatGPT-account login, default `gpt-5.6-sol`),
  `af` 0.1.5.
- **STOP-1/2/3 stay RESOLVED**: af export emits `features:[readiness-flags, closure-flag,
  node-dependencies]`; dry-run split truthful (`verifier-ready now (1): 1`); per-assignment model
  pin resolves in-band both directions (run A `verifier/hard -> codex (gpt-5.6-sol)` /
  `prover/hard -> claude (claude-opus-4-8)`; run B the mirror — both confirmed pre-dispatch, the §7
  resolution gate).
- **STOP-4 RESOLVED at the prompt level**: verifiers now CHALLENGE the bare root (never accept). The
  vacuous-accept discard and `bootstrap-vacuous-accepts` abort never needed to fire (no vacuous
  accept occurred). The deadlock STOP-4 named is closed; this attempt failed one step further on.
- Config validation clean 3/3 both directions; dry-run clean all three; `--max-campaign-tokens
  500000` carried and honored on both runs.

## What must change before a re-run (for TJO to decide — nothing chosen here)

Options, surfaced not selected (§7 "pick nothing silently"). All are rk-side and touch verdict
binding (a validity semantic → Tier-A review, L6):

- **(a) Prompt-side: demand a quoted-string `target`.** Change the hard-tier schema hint to
  `"target": "<node id at fault>"` (quoted) plus an explicit "the node id is always a quoted
  string, never a bare number" instruction (`src/drive/driver-prompts.ts` `HARD_VERDICT_INSTRUCTIONS`
  and, for symmetry, the proofless rule's wording). Cheapest, lowest-risk, no parser change. Both
  models already produce a string for deeper ids (`1.2` cannot be a JSON number without loss);
  the fix just makes them quote the root id too.
- **(b) Parser-side: coerce a numeric `target` to its string form.** RISKY and NOT recommended as
  the sole fix: af ids like `1.10` are distinct from `1.1`, but a JSON number `1.10` parses to `1.1`
  — coercion would silently corrupt deep ids. If done at all, restrict to integer targets and pair
  with (a). This is the option most likely to introduce an L6 bug.
- **(c) Investigate the secondary finding first** (well-typed challenge → empty af apply → no flip).
  If a `challenge` on a bare pending root does not flip it prover-ready in af regardless of `target`
  typing, then (a)/(b) alone will not unblock the bootstrap and the fix is larger (rk apply path
  and/or an af-side escalation, V-item per Rule 2). Reproduce it deliberately (feed af a hand-built
  string-target challenge on a fresh root) before choosing (a) vs a bigger change.

Recommended: **(a)** is the direct, low-risk unblock, but **(c) must be checked first** — otherwise a
re-run could clear the bind error only to deadlock one step further on the apply/flip. Both are
Tier-A (verdict binding / validity) → top-tier review before landing.

## Secondary findings (candidate beads — NOT filed; task confines writes to ../rk-m3.5-baseline)

- **NEW (P1, validity/interop gap): hard-tier binder rejects a numeric `target`.** "Under the STOP-4
  proofless-challenge prompt, both codex `gpt-5.6-sol` and claude `claude-opus-4-8` correctly
  challenge the bare bootstrap root but emit `\"target\": 1` (JSON number) for node id `1`.
  `validateRawHardOutcome` (`src/drive/verdict-raw.ts:108`) requires `target` to be a non-blank
  string → `bindVerdicts` rejects it → challenge discarded → root never flips prover-ready → prover
  never runs → `stuck-no-progress` (0 applied). Reproduced BOTH vendors, BOTH directions (5/6 turns
  numeric). Blocks the M3.5 SC4 baseline. Fix: prompt-side quoted-string target (low-risk);
  parser-side numeric coercion is unsafe for deep ids (`1.10` vs `1.1`)."
- **NEW (P1/P2, under-determined): a well-typed `challenge` on a bare pending root produced an empty
  af apply and did not flip the node** (codex run-A turn 3, `target:\"1\"`: bound, reached apply, no
  ledger event, node stayed pending). May be a second bootstrap obstacle independent of the
  target-type gap. One data point — reproduce before trusting.
- **NEW (P2, observability): `stuck-no-progress` masks the real cause again.** As in STOP-4, the
  operator sees only `stuck-no-progress`; the true cause (every challenge bind-failed on a numeric
  target) is visible only in `.rk/driver-log.jsonl` (`node-skipped ... verdict bind failed: must be
  a non-blank string`). A bind-failure round-counter surfaced in the abort reason (e.g.
  "all N verifier turns this stall failed to bind: <first issue>") would fail legibly, as the
  bootstrap-vacuous-accepts reason now does for STOP-4's shape.
- **(carried, P2) `rk verify --report` recognizes the new discard kinds** (`cross-vendor-rejected`,
  `vacuous-accept-discarded`) — confirmed in both run reports (`discards:` line present, both 0
  here). The STOP-4 review's FU4 (parser omits `proof-recorded`/`churn-cap`) is untested this run
  (neither kind was emitted — no proof recorded, no churn).

## rk-mq2 / rk-6nv live-fire evidence (task step 7)

- **rk-mq2** (does af accept `batch_id:""` single-item applies?): **STILL NOT resolvable.** No af
  `apply` ever recorded an outcome. The one bound challenge (codex run-A turn 3) DID send a
  `{batch_id:"", items:[...]}` verdict file to `applyVerdicts`, but af returned an empty `items`
  report and wrote nothing to the ledger — so af's ACCEPTANCE of a `batch_id:""` single-item apply is
  still unconfirmed (and that turn was a challenge, not an accept, and it no-op'd). Leave open.
- **rk-6nv** (prove→verify terminates; challenge→prover-flip; refine-author recording): **NEW,
  sharper evidence.** For the first time, real verifiers produced real CHALLENGES on a real lemma —
  `challenge` is now PRODUCED correctly by both vendors (the STOP-4 prompt fix works, positive
  signal). But the `challenge → prover-flip` chain still does NOT complete: the challenge fails to
  BIND (numeric target), so it is never APPLIED, so the root never flips prover-ready, so the prover
  never runs and prove→verify never terminates. `refine-author recording` was never reached. Net:
  the machinery challenges correctly but cannot land the challenge — one gap short of a working
  bootstrap. Leave open, now with concrete evidence that the block is the binder, not the prompt.

## Ledger

- Real rk-attributed baseline-campaign tokens: **run A 69810 + run B 72578 = 142388 total**
  (all `lem-weighted-min`), across 6 verifier turns, **0 prover turns, 0 validated nodes, 0 applied
  verdicts.** Both runs stuck-aborted at ~70k, far under their 500k caps. lem-mass-split and
  lem-starvation-completion-obstruction: **NOT dispatched** (identical unseeded bootstrap shape →
  identical numeric-target bind failure predicted; not run per spend discipline).
- No SC4 denominator produced (0 validated nodes ⇒ no baseline memo — writing token-per-node rows for
  a run with zero validated nodes would misrepresent it, per L2; not done, same as STOP-4).
- **Verdict-parity NOT reached** (no fresh validated nodes to compare). AISM originals captured
  read-only for the record: lem-weighted-min 8 nodes, root validated/clean, 1 challenge_raised +
  1 challenge_resolved; lem-mass-split 9 nodes, 1 challenge_raised; lem-starvation 7 nodes, 0
  challenges. Nothing to compare a fresh run against — the fresh runs produced no nodes.
- AISM (`../almost-idempotent-stochastic-maps`): **read-only** — the three originals above were read
  for parity reference only; no write. rk repo tree: **clean** (`git status` empty; HEAD 8315895),
  untouched except the `dist/rk` rebuild (gitignored). All writes here in `../rk-m3.5-baseline/`
  (`STOP-REPORT-5-2026-07-20.md`, `_logs/lem-weighted-min.run-{A,B}.{console.log,driver-log.jsonl,
  report.txt}`, `_logs/raw-verifier-outputs/{run-A.codex,run-B.claude}-verifier.*.txt`). All three
  `proofs/<id>/` restored to pristine (verified byte-identical to `_pristine/`); run-A config active
  in all three.
- Wall-clock: preflight + 2 live runs (~27s + ~55s) + diagnosis/banking ≈ a few minutes; no
  long-running proof turn ever executed (both runs dead-ended at the bind step before any prover
  turn).
