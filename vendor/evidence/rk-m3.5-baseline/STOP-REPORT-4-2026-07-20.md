# M3.5 SC4-baseline live session (ATTEMPT 4) — STOPPED at the unseeded-bootstrap deadlock (2026-07-20)

ROLE: durable stop-report banked by the M3.5 baseline operator (attempt 4). TWO live runs were
dispatched this time (lem-weighted-min run A and run B — both directions); both aborted
`stuck-no-progress` after real verifier turns. STOP-1 (verifier-only driver / unseeded workspace),
STOP-2 (single-global-model pin) and STOP-3 (codex model-auth) are all RESOLVED and re-verified
below. This attempt halts at a FOURTH, newly-isolated gap that only a real verifier turn on a bare
conjecture could surface — and it reproduces IDENTICALLY in both cross-vendor directions, so it is
STRUCTURAL, not model-specific.

## Verdict

Attempt 4 cleared every gate STOP-1/2/3 flagged, including in-band model resolution both directions
(run A: verifier=codex `gpt-5.6-sol`, prover=claude `claude-opus-4-8`; run B: the mirror). It then
dispatched real verifier turns on `lem-weighted-min` in BOTH directions and hit the same wall each
time: **the fresh single-conjecture workspace cannot bootstrap a proof.** af marks the bare root
node `verifier_ready: true` (never `prover_ready`), so rk dispatches a VERIFIER first; the verifier
returns `accept` on the bare, true statement (there is no proof body to reject, and the statement
itself is true); rk's cross-vendor gate CORRECTLY refuses to promote an unproven node
(`node.author` is undefined → `identity-unparseable`, prover=unknown → fails closed); the node never
flips to prover-ready; the prover never runs; after 3 no-progress rounds `evaluateStuckGuard` aborts
`stuck-no-progress`. No proof is ever produced → **no SC4 validated-node token denominator exists.**

This is a §7 stop (CLAUDE.md §7 "a PRD/plan conflict or gap discovered mid-WP → surface it, pick
nothing silently"; task brief "a mid-run rk gap is likely a §7 abort — stop, report, never patch
around"). Two runs were enough to prove the gap is structural (both verifier vendors accept the bare
node); lem-mass-split and lem-starvation-completion-obstruction have the IDENTICAL unseeded shape and
would fail identically, so they were NOT dispatched — grinding four more runs into the same wall
(~70k tokens each) would violate spend discipline for zero new signal.

## Root cause: the unseeded-workspace bootstrap deadlocks; the verifier ACCEPTS the bare node

The runbook premise (§1, from IMPLEMENTATION_PLAN.md M3.5): "re-proves ... from fresh workspaces."
That needs a PROVER to produce proof content. On these dirs the prover never runs:

1. **af marks the bare root node verifier-ready, not prover-ready.** `af export --graph json` sets
   `verifier_ready: true` on node 1 (pending / available, zero proof steps). The dry-run split is
   `prover-ready now (0): none` / `verifier-ready now (1): 1`. rk's `selectProverReadyNodes` is
   therefore empty every round; the PROVE half (rk-gn4, `driver-run.ts:156`) is never entered.

2. **rk dispatches the verifier; the verifier returns `accept` on the bare conjecture.** In BOTH
   directions the driver logged `cross-vendor-rejected` — a kind that (`driver-verify-node.ts:75`)
   fires ONLY when `mapped.item.verdict === "accept"`. So both verifiers ACCEPTED, they did not
   challenge. (`min_i n_i <= sum_i p_i n_i` is trivially true; with no proof body in front of it, a
   verifier judging the statement's truth accepts.)

3. **rk's cross-vendor gate correctly fail-closes — there is no prover to compare families.**
   `decideCrossVendor(node.author, verifiedBySeam, loadBearing)` (`cross-vendor.ts:55`) decodes the
   node's recorded prover identity from `node.author`. The node was never proven → `node.author`
   undefined → `proverFamily = undefined` → reason `identity-unparseable` → `satisfied: !loadBearing`
   → load-bearing node fails closed. Log line verbatim: `cross-vendor: identity-unparseable on
   load-bearing node '1' (prover=unknown, verifier=gpt) — fails closed, never conflated with a
   confirmed same-family violation` (run A; run B is the same with `verifier=claude`).

4. **Deadlock.** The accept is discarded (never applied), the node stays `pending/verifier_ready`,
   the next round is identical, and after 3 rounds `evaluateStuckGuard` aborts. The prover half
   that landed (rk-gn4) only fires for `prover_ready` nodes; af never marks the bare node that.

### This contradicts STOP-2's claimed resolution

STOP-2 recorded the unseeded gap as RESOLVED: "an unseeded workspace is no longer a guaranteed
stuck-abort — the verifier's challenge on the bare conjecture now has a prover to address it."
**Empirically the verifier ACCEPTS, it does not challenge** — so the "challenge → flip to prover
job → prover addresses it" chain never starts. STOP-2's resolution was verified only at the
zero-spend level (dry-run readiness split, config resolution); the assumption that the first
verifier turn would CHALLENGE was never exercised against a real model until now, and it is false
for a true bare statement, under BOTH codex/`gpt-5.6-sol` and claude/`claude-opus-4-8`.

### af's two readiness classifiers disagree — and the STATUS one was arguably right

`af status` (`internal/render/status.go`) prints `Prover: 1 nodes awaiting refinement` /
`Verifier: 0 nodes ready for review` for exactly this node — i.e. it says "needs a prover."
`af export --graph json` sets `verifier_ready: true` for the same node. STOP-1 saw the STATUS
signal ("Prover: 1") and correctly diagnosed "unproven pending node is a prover job." STOP-2
switched rk to trust the EXPORT flag (`verifier_ready`) and called STOP-1 resolved. For a bare,
zero-proof node the STATUS heuristic is the load-bearing-correct signal; trusting the export flag
reproduces STOP-1's original misclassification in a form that only surfaces once a real verifier is
dispatched and chooses to accept. The af-side inconsistency is itself a finding (candidate vibefeld
escalation below).

## Both directions, side by side (the structural proof)

| | run A | run B |
|---|---|---|
| prover / verifier | claude `claude-opus-4-8` / codex `gpt-5.6-sol` | codex `gpt-5.6-sol` / claude `claude-opus-4-8` |
| in-band resolution (preflight) | verifier codex→gpt-5.6-sol, prover claude→claude-opus-4-8 ✓ | verifier claude→claude-opus-4-8, prover codex→gpt-5.6-sol ✓ |
| verifier verdict on bare node 1 | `accept` (→ cross-vendor-rejected ×3) | `accept` (→ cross-vendor-rejected ×3) |
| cross-vendor reason | identity-unparseable (prover=unknown, verifier=gpt) | identity-unparseable (prover=unknown, verifier=claude) |
| stop reason | stuck-no-progress (3 rounds, cap 3) | stuck-no-progress (3 rounds, cap 3) |
| applied nodes | 0 (none) | 0 (none) |
| turns | 3 verifier, 0 prover | 3 verifier, 0 prover |
| attributed tokens | 69765 (in 39045 / out 768 / cache_read 29952) | 69501 (in 6 / out 1007 / cache_read 65839 / cache_creation 2649) |
| cache fraction | 0.4341 | 0.9612 |
| wall-clock (driver turns) | ~17s (session-create + 3 turns) | ~17s |
| campaign cap | 500000 (honored; never approached) | 500000 (honored; never approached) |

Aside (not the gap, but banked): the input/cache asymmetry is real — codex-as-verifier (run A)
re-sends ~39k input tokens/campaign at 0.43 cache; claude-as-verifier (run B) rides a 0.96 cache
fraction on resume turns (input=6). Both are ~70k attributed for the same 3 dead rounds.

## Preflight gates that DID pass (so the gap is isolated to the bootstrap)

- `bun test` 1840 pass / 1 skip / 0 fail; `bun run selftest` OK (123/123, purity 99/99 + 24/24,
  all corpus green). `dist/rk` rebuilt from master tip **634dd31** (runbook §13 codex-pin commit).
- Backends: `claude` 2.1.215, `codex` 0.144.6 (ChatGPT-account login, default `gpt-5.6-sol`),
  `af` 0.1.5.
- **STOP-3 RESOLVED — codex model pin.** All six staging configs pin `gpt-5.6-sol` on the codex
  assignment and `claude-opus-4-8` on the claude assignment; both live runs' in-band preflight
  confirmed the exact resolution, both directions. The codex 400/turn.failed of STOP-3 is gone —
  real codex verifier turns executed and billed usage (run A input=39045).
- **STOP-2 RESOLVED — per-assignment model pin (rk-7hi)** expressed the two-model split cleanly.
- **STOP-1 half-RESOLVED — the PROVE dispatch code landed (rk-gn4)** BUT never fires here, because
  af never marks the bare node prover-ready (the deeper half of STOP-1's diagnosis was not closed).
- af features preflight (FU5) passes all three: `features: [readiness-flags, closure-flag,
  node-dependencies]`. Config validation clean 3/3 both directions. Dry-run clean all three.
- The `--max-campaign-tokens 500000` cap was carried on both runs and honored (neither approached
  it — both stuck-aborted at ~70k).

## What must change before a re-run (for TJO to decide — nothing chosen here)

Options, surfaced not selected (§7 "pick nothing silently"):

- **(a) rk should dispatch a PROVER first for a pending node with zero proof content**, regardless
  of af's `verifier_ready` flag — treat "pending + no recorded proof" as prover-ready and seed it
  before any verify turn. This is the seeding path the SC4 "re-prove from fresh workspace" premise
  actually requires, and the direct fix for the deadlock. rk source change (NOT this operator's to
  make); must reconcile rk's readiness read with af's two disagreeing classifiers.
- **(b) Escalate to vibefeld/af**: af's `verifier_ready` classifier marks a zero-proof pending node
  ready-for-review while `af status` says "Prover: 1"; the export flag should either not mark a
  proofless node verifier-ready, or expose a distinct "needs-prover" signal rk can consult. This is
  the af-side root cause and a cross-repo (V-item) escalation per CLAUDE.md Rule 2.
- **(c) Re-scope SC4 to a verify-only denominator**: pre-seed each fresh workspace with the original
  AISM proof content (read-only source) so the verifier has real content to check, and measure
  verifier tokens/calls. Changes what SC4 measures (verification cost, not re-proof cost); needs a
  plan amendment + runbook-premise rewrite (STOP-1 option b, still open).
- **(d) A `rk prove`/seed subcommand** to produce proof content out-of-band before the verify
  driver runs (rk has no prove subcommand today — STOP-1 confirmed).

Recommended: (a)+(b) together are the durable fix (rk must not dispatch a verifier at a proofless
node; af should not call one verifier-ready). (c) is the fast re-scope if a verify-only SC4
denominator is acceptable. Any of them decides what SC4 measures / how it is produced — a TJO call.

## Secondary findings (candidate beads — NOT filed; task confines writes to ../rk-m3.5-baseline)

- **NEW (P1, machinery/protocol gap): unseeded-workspace bootstrap deadlock (the primary finding
  above).** "A fresh single-conjecture af workspace cannot bootstrap a proof under `rk verify
  --live`: af marks the bare root `verifier_ready:true`/not-prover-ready, rk dispatches a verifier,
  the verifier ACCEPTS the bare true statement (verdict=accept), rk's cross-vendor gate correctly
  fail-closes (node.author undefined → identity-unparseable, prover=unknown), the node never flips
  to prover-ready, the prover (rk-gn4) never runs → stuck-no-progress after 3 rounds, 0 applied.
  Reproduced BOTH directions (codex-verifier and opus-verifier) → structural, not model-specific.
  Blocks the M3.5 SC4 baseline (no validated node → no token denominator). Contradicts STOP-2's
  'verifier challenges the bare conjecture' resolution — real verifiers accept it. Fix: prover-first
  on a proofless pending node (rk), and/or af should not mark a zero-proof node verifier-ready."
- **NEW (P2, observability): opaque stuck-abort masks the real cause.** The operator sees
  `stuck-no-progress`; the true cause (verifier accepted a node with no recorded prover → nothing
  to promote) is only visible by reading `.rk/driver-log.jsonl`. A distinct abort reason — e.g.
  "verifier accepted node with no recorded prover; a prover pass is required first" — would fail
  faster and legibly, before three dead rounds.
- **NEW (P2/P3, self-inflicted report parse miss): `rk verify --report` does not recognize the
  `cross-vendor-rejected` log kind that rk's OWN driver writes.** Report prints `[driver-log:N]
  unrecognized 'kind': "cross-vendor-rejected"` and counts those lines as "could not be parsed."
  Honest (never silently dropped), but rk emits a kind its own reader rejects — `report.ts` should
  know `cross-vendor-rejected` (and surface a count) rather than treat it as unparseable noise.

## rk-mq2 / rk-6nv live-fire evidence (task step 7)

- **rk-mq2** (does af accept `batch_id:""` single-item applies?): **STILL NOT resolvable.** No `af
  apply` ever executed — every verdict was rejected pre-apply at the cross-vendor gate, so the
  `{batch_id:"", items:[{...}]}` path (`driver-run.ts`) was never reached live. Same status as
  STOP-2/STOP-3 (code path confirmed by inspection there; live confirmation still pending an actual
  applied verdict). Leave open.
- **rk-6nv** (prove→verify terminates on a real lemma; challenge→prover-flip; refine-author
  recording for cross-vendor parse): **STRONG NEGATIVE live evidence.** For the first time real
  verifier turns ran against a real lemma, and the finding is that **prove→verify does NOT terminate
  /converge on an unseeded workspace — it deadlocks at bootstrap.** `challenge→prover-flip` was NOT
  observed in either direction: the verifier ACCEPTED (never challenged) the bare node, so no flip
  occurred and no prover turn ever ran. `refine-author recording` was never reached. The prove→
  verify machinery exists (STOP-1/2/3 gaps closed) but cannot bootstrap the very first node. Leave
  open, now with concrete live evidence of the failure mechanism.

## Ledger

- Real rk-attributed baseline-campaign tokens: **run A 69765 + run B 69501 = 139266 total**
  (all `lem-weighted-min`), across 6 verifier turns, **0 validated nodes, 0 applied verdicts**. Both
  runs stuck-aborted at ~70k, far under their 500k caps. lem-mass-split and lem-starvation:
  **NOT dispatched** (identical unseeded shape → identical predicted failure; not run per spend
  discipline).
- No SC4 denominator produced (0 validated nodes ⇒ no baseline memo entries — see below).
- AISM (`../almost-idempotent-stochastic-maps`): **untouched — not even read this session**
  (parity was never reached; nothing to compare against). rk repo tree: untouched except `dist/rk`
  rebuild. All writes here in `../rk-m3.5-baseline/` (`STOP-REPORT-4-2026-07-20.md`, `RUN-REPORT-4-
  2026-07-20.md`, `_logs/lem-weighted-min.run-{A,B}.{console.log,driver-log.jsonl,report.txt}`,
  `_pristine/` workspace snapshots). All three `proofs/<id>/` restored to pristine (1 pending node);
  run-A config active in all three.
- No baseline memo written: `parseBaselineMemo` keys entries by validated af node id; zero nodes
  reached validated, so a truthful per-lemma memo has zero entries. Writing a memo with fabricated
  token-per-node rows would misrepresent a run that produced no validated node — not done, per L2.
- Wall-clock: preflight + 2 live runs (~20-30s each incl. session creation) + bookkeeping ≈ a few
  minutes; no long-running proof turn ever executed (both runs dead-ended at the bootstrap).
</content>
</invoke>
