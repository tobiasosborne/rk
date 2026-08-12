# M3.5 SC4-baseline live session (ATTEMPT 7) — BREAKTHROUGH (GAP 6 + GAP 7 both fixed, first validated nodes, first partial SC4 denominator) + ONE newly-surfaced downstream gap (GAP 8: codex prover's forward-sibling `depends` uses absolute node ids, af requires `#N`) (2026-07-20)

ROLE: durable stop-report banked by the M3.5 baseline operator (attempt 7). rk HEAD 634e90e
(GAP 6 fix rk-r5b + GAP 7 fix rk-2cm), vibefeld bb90541, af 0.1.5 (free-text `inference`).
STOP-1..7 history: attempt 7 is the furthest any attempt has reached. For the FIRST time a full
prove→verify cycle ran end to end, af recorded a decomposition, children were verified bottom-up,
and rk validated real nodes cross-vendor with author/verified_by both recorded. Only lem-weighted-min
was dispatched (run A + run B); mass-split and starvation were NOT dispatched (gating condition not
met + GAP 8 structurally blocks every codex-prover direction — see Ledger).

## Verdict (headline)

**GAP 6 and GAP 7 are both genuinely fixed and confirmed live.** For the first time in seven attempts:
- **GAP 6 fixed (af free-text `inference`):** the claude prover's natural math justifications
  (`finite_nonempty_set_attains_minimum`, `algebraic_manipulation_using_sum_i_p_i_eq_1`,
  `multiplication_by_positive`) were ACCEPTED by `af record-proof` and recorded verbatim. `proof-recorded`
  fired 5× in run A. No `--justification`/`--inference` enum rejection anywhere.
- **GAP 7 fixed (claude-verifier JSON extraction):** run B's claude verifier CHALLENGED the bare root,
  `status=applied exit=0` — no `worker exit 12`, no parse failure. The claude-as-verifier direction now
  binds. `discards: ... parse-failed=0` in both runs.

Both directions dead-ended, differently, one step past where attempt 6 died:

- **Run A (prover=claude, verifier=codex):** ran the FULL cycle — root challenged → flipped prover-ready
  → claude decomposed into 6 children → codex verified them bottom-up (accepted 1.1, 1.5; challenged
  1.2, 1.3, 1.4, 1.6) → claude re-proved the 4 challenged children → tree reached 26 nodes → **campaign
  token budget exhausted (502914 ≥ 500000 cap) before the root could validate.** 2 leaf nodes VALIDATED
  (1.1, 1.5). §7 budget-exhausted abort (a guardrail firing, NOT an rk bug).
- **Run B (prover=codex, verifier=claude):** claude verifier challenged the root (GAP 7 fixed) → root
  flipped prover-ready → **codex prover's decomposition rejected 2× by `af record-proof`: `child 2:
  dependency node 1.1 does not exist`.** The codex prover wrote a forward sibling dependency as the
  anticipated ABSOLUTE node id (`1.1`) instead of af's required `#N` in-batch relative index (`#0`).
  0 nodes validated → `stuck-no-progress` (3 rounds).

Run A's budget-exhaust is a reportable §7 abort; Run B's `depends` rejection is **GAP 8**, a
newly-isolated rk gap (validity-adjacent: how a proof's dependency DAG is recorded into af) → not the
operator's to fix (L6, §7 "pick nothing silently").

## GAP 8 (run B) — the prover prompt says `depends` takes "node ids"; af requires `#N` for forward in-batch siblings; rk has no bridge

### What happened (driver-log, verbatim)

Run B (`_logs/lem-weighted-min.run-B.driver-log.jsonl`), in order:

1. `usage` role=verifier (claude) — input 2, output 599, cache_read 20906, cache_creation 1831.
2. `verdict-outcome` node 1 `challenge` **status=applied exit=0** — the claude challenge BOUND and was
   APPLIED. Root flipped prover-ready. (GAP 7 closed: claude-as-verifier now binds.)
3. `usage` role=prover (codex) — input 13065, output 608, cache_read 9984.
4. `node-skipped` node 1, reason **verbatim**:
   ```
   af recordProof failed: af record-proof exit 1: child 2: dependency node 1.1 does not exist
   ```
5. `usage` role=prover (codex, retry) — input 13065, output 483, cache_read 9984.
6. `node-skipped` node 1 — **byte-identical** reason.

Then `stuck-no-progress` (3 rounds, cap 3). `verdicts total=1 applied=1` (the claude challenge),
`bind-failed=0 parse-failed=0`, 0 validated nodes, 70527 attributed tokens, 3 turns.

### Root cause

- `af record-proof` creates all children in ONE atomic batch; the children have NO node ids yet at
  record time. A forward dependency on a sibling must use af's `#N` relative index (`af record-proof 1
  -o prover-1 --children '[{"statement":"Step A"},{"statement":"Uses A","depends":["#0"]}]'` — `#0` = the
  first child in THIS batch), or an already-existing node id. An anticipated absolute id like `1.1` does
  not exist yet → rejected.
- rk's prover prompt (`src/drive/driver-prompts.ts:170,177`) tells provers `depends` is `[<node id>, ...]`
  — *"optional 'depends' lists the **node ids** it relies on. Order the children so each one only relies
  on earlier children or the dependencies above."* It never mentions the `#N` in-batch convention and
  never forbids naming a not-yet-created sibling by its anticipated id.
- rk's `buildRecordProofChildren` (`src/drive/driver-af.ts:213`) passes `depends` through RAW:
  `if (c.depends && c.depends.length > 0) child.depends = c.depends;` — no absolute-id→`#N` translation.
  The doc comment at driver-af.ts:206 even names the convention ("af resolves a `#N` entry to the N-th
  earlier child in this batch, or an existing node id") but nothing enforces it on the prover output.
- gpt-5.6-sol, following the prompt literally, computed that child 1 becomes node 1.1 and wrote
  `"depends": ["1.1"]` on child 2 — a correct dependency, expressed in the wrong namespace, af-illegal.

**This is the exact STOP-6/GAP-6 pattern one layer over again: the model emits a natural value (absolute
sibling id), af enforces a stricter contract (`#N` in-batch), and rk has no bridge.** GAP 6 was fixed on
the af side (accept free-text `inference`); the equivalent fix here is rk-side (prompt + mapper) or
af-side (accept absolute forward ids).

### Why run A (claude prover) didn't hit it

The claude prover's 26 children were all recorded successfully (`proof-recorded` 5×, 26 node_created in
the ledger). It either omitted `depends` or used af-legal refs on its children — so run A never exercised
the forward-absolute-id path. The gap is prover-output-shape-specific: it fires whenever a prover names a
forward in-batch sibling by absolute id, which a literal reading of the current prompt invites.

### Observability sub-gap (carried, same family as GAP 7's)

rk persists a raw snippet only on bind-failed / parse-failed stages (rk-2cm). An `af record-proof exit 1`
failure logs ONLY the af error string — the raw codex prover JSON is not banked. Here the af error message
is itself diagnostic (`child 2: dependency node 1.1 does not exist`), so GAP 8 IS quotable; but the raw
prover `depends` array cannot be inspected directly. `_logs/raw-verifier-outputs/` holds only prior-attempt
files.

## Run A over-decomposition finding (SC4-adjacent, not a bug)

The claude-opus-4-8 prover decomposes **~3× more granularly than AISM's original codex prover**:

| | AISM original | run A fresh (claude prover) |
|---|---|---|
| node_created | 8 | 26 |
| node_validated | 8 | 2 (leaves 1.1, 1.5; root NOT validated) |
| challenge_raised / resolved | 1 / 1 | 5 / 5 |
| root disposition | validated/clean | pending (budget-exhausted before validation) |

Root → 6 children; each of the 4 challenged children → 4–6 grandchildren (26 nodes). At **~23–49k
attributed tokens per node** under the CURRENT un-batched per-node protocol (each verifier turn re-reads
~13k input; cache fraction only 0.5705 because per-node turns share little context), the bushy tree
exhausts the 500k cap in 21 turns before the root can validate. This is exactly the SC4 signal M3.5 exists
to measure: the current per-node protocol is expensive, and a granular prover makes it more so. It is a
§7 budget-exhausted abort to REPORT (runbook §10(B): "not a number to quietly raise"), not an rk defect.

## Both runs side by side

| | run A | run B |
|---|---|---|
| prover / verifier | claude claude-opus-4-8 / codex gpt-5.6-sol | codex gpt-5.6-sol / claude claude-opus-4-8 |
| in-band resolution (preflight) | verifier→codex(gpt-5.6-sol), prover→claude(claude-opus-4-8) ✓ | verifier→claude(claude-opus-4-8), prover→codex(gpt-5.6-sol) ✓ |
| verifier challenged bare root? | YES — applied exit 0 | YES — applied exit 0 (**GAP 7 fixed**) |
| prover ran + recorded a proof? | YES — 5 proof-recorded, 26 nodes (**GAP 6 fixed**) | ran, but 0 recorded — af rejected `depends` (**GAP 8**) |
| downstream failure | budget exhausted (502914 ≥ 500000) before root validated | af record-proof `child 2: dependency node 1.1 does not exist` ×2 |
| verdicts total / applied | 7 / 7 | 1 / 1 |
| prover turns / verifier turns | 5 prover / 16 verifier (21 total) | 2 prover / 1 verifier (3 total) |
| stop reason | budget-exhausted (§7 abort) | stuck-no-progress (3 rounds; true cause GAP 8) |
| **validated nodes** | **2 (1.1, 1.5)** | 0 |
| attributed tokens | **502914** (in 209044 / out 5167 / cache_read 283985 / cache_creation 4718) | **70527** (in 26132 / out 1690 / cache_read 40874 / cache_creation 1831) |
| cache fraction | 0.5705 | 0.5938 |
| wall-clock (model time) | ~3m32s (13:51:38→13:55:10) | ~28s (13:57:34→13:58:02) |
| campaign cap | 500000 (honored, hit exactly) | 500000 (honored; ~14% used) |

## Verdict-parity (§6) — lem-weighted-min

| lemma | orig nodes | fresh nodes | orig root status/taint | fresh root status/taint | orig challenges | fresh challenges | parity verdict |
|---|---|---|---|---|---|---|---|
| lem-weighted-min run A | 8 | 26 | validated/clean | pending/unresolved (budget-exhausted) | 1 raised / 1 resolved | 5 raised / 5 resolved | **NO PARITY** — root not validated; 3× bushier, 5× challenge rate |
| lem-weighted-min run B | 8 | 1 | validated/clean | pending/unresolved (never decomposed) | 1 / 1 | 1 raised / 0 resolved | **NO PARITY** — 0 validated, GAP 8 blocked decomposition |

Reviewer≠author confirmed on the 2 validated nodes (run A): author `claude|claude|claude-opus-4-8|
claim-lem-weighted-min-prover`, verified_by `gpt|codex|gpt-5.6-sol|flat-224b9c67-...` — cross-vendor,
recorded in the af ledger.

## rk-6nv live-fire evidence (task step 7)

- **prove→verify cycle terminates for a node:** YES for leaf nodes 1.1, 1.5 (run A) — challenged → proved
  → verified → VALIDATED. First time rk has validated a real node live. Full-tree termination (root
  validated) NOT reached (budget-exhausted).
- **refine/record-proof author recorded in the af ledger:** YES. Node 1.1 / 1.5 carry
  `author: claude|claude|claude-opus-4-8|claim-lem-weighted-min-prover` and their `node_validated` events
  carry `verified_by: gpt|codex|gpt-5.6-sol|flat-224b9c67-...`. The cross-vendor prove→verify pair is
  fully attributed in af; reviewer≠author holds by construction and is visible in the ledger.
- **free-text inference recorded (GAP 6):** node 1.5's `inference` = `algebraic_manipulation_using_sum_i_
  p_i_eq_1`, node 1.1's = `finite_nonempty_set_attains_minimum` — both free-text, accepted by af 0.1.5.
- rk-6nv can be advanced to "cross-vendor prove→verify validated live, author + verified_by recorded";
  the remaining open piece is a full-tree convergence (root validated), blocked by budget/GAP 8, not by
  rk-6nv's own mechanism.

## Baseline memo (task step 4, §8/§10(C)) — FIRST real (partial) SC4 denominator

`memos/lem-weighted-min.run-A.baseline.json` (schemaVersion 2, claimId-keyed, ONLY genuinely validated
nodes):

```json
{
  "schemaVersion": 2,
  "entries": [
    {"claimId": "claim-lem-weighted-min", "lemma": "1.1", "tokens": 23500, "calls": 1},
    {"claimId": "claim-lem-weighted-min", "lemma": "1.5", "tokens": 25636, "calls": 1}
  ]
}
```

Validated live: `rk verify --report --baseline memos/lem-weighted-min.run-A.baseline.json --root
lem-weighted-min` parsed the schemaVersion-2 doc and joined both nodes on (claimId, nodeId) →
`claim-lem-weighted-min/1.1: baseline=23500tok/1call ... ratio=1.00x`, `.../1.5: baseline=25636tok/1call
... ratio=1.00x` (self-comparison). This is the first token-per-validated-node denominator rk has ever
produced. It is PARTIAL (2 leaf nodes of an unconverged tree) — not a whole-lemma denominator, and it must
not be presented as one.

## Ledger

- rk-attributed baseline tokens: **run A 502914 + run B 70527 = 573441 total** (all lem-weighted-min),
  24 turns (16 verifier + 5 prover in A; 1 verifier + 2 prover in B), **2 validated nodes, 8 applied
  verdicts (run A 7 = 1 root challenge + 6 child verdicts [2 accept, 4 challenge]; run B 1 root
  challenge), 5 recorded proofs.**
- **mass-split (A+B) and starvation (A+B): NOT dispatched.** Task step 2 gates proceeding on
  "lem-weighted-min completes BOTH directions with validated nodes" — NOT met (run B validated 0; run A
  budget-exhausted without a validated root). GAP 8 structurally blocks every codex-prover (run B)
  direction at root decomposition; run A's claude over-decomposition would recur on the 9-node/7-node
  lemmas. 4 more runs = ~1M+ tokens into the same two walls for predictable signal → not run, per spend
  discipline (500k/lemma authorization) + the STOP-5/6 precedent.
- **Verdict-parity: NO PARITY** either direction (root never validated). AISM originals (read-only
  reference): lem-weighted-min 8 nodes / 8 validated / 1+1 challenges / root validated; lem-mass-split
  9 / 9 / 1+1 / 2 defs; lem-starvation 7 / 7 / 0 challenges / 2 defs / 1 qed.
- AISM (`../almost-idempotent-stochastic-maps`): **read-only** (three originals' export/ledger read for
  parity reference only; git tree clean). rk tree: **clean** (HEAD 634e90e), untouched except the
  gitignored `dist/rk` rebuild. All writes in `../rk-m3.5-baseline/` (this report; `_logs/lem-weighted-min.
  run-{A,B}.*`; `_logs/run-{A,B}-ledgers/`; `memos/lem-weighted-min.run-A.baseline.json`). lem-weighted-min
  `proofs/` restored byte-identical to `_pristine/`; run-A config active in all three lemma dirs.
- Wall-clock: preflight + 2 live runs (~3m32s + ~28s model time) + banking/restore ≈ a few minutes.

## Candidate beads (NOT filed — task confines writes to ../rk-m3.5-baseline)

- **NEW (P1, validity/interop): GAP 8 — rk has no bridge between a prover's forward sibling `depends` and
  af's `#N` in-batch relative index.** codex gpt-5.6-sol wrote `"depends": ["1.1"]` (anticipated absolute
  id); af rejected `child 2: dependency node 1.1 does not exist`. Prompt (driver-prompts.ts:170,177) says
  `depends` = "node ids" with no `#N` convention; buildRecordProofChildren (driver-af.ts:213) passes it
  raw. Blocks the codex-prover direction of the SC4 baseline. Fix options: (8a) prompt-side — instruct
  provers to reference forward in-batch siblings by `#N` (0-based batch index), citing the af convention;
  (8b) mapper-side — in buildRecordProofChildren, translate a `depends` entry that matches an anticipated
  in-batch child id (parent.id + "." + (k+1)) to `#k`; (8c) af-side (vibefeld) — make record-proof accept a
  forward absolute child id and resolve it in-batch. 8a+8b together (instruct AND translate defensively) is
  the robust surface; validity-adjacent (proof dependency DAG) → Tier-A review before landing.
- **NEW (P2, observability): `af record-proof exit 1` failures persist no raw prover output.** Same family
  as GAP 7's observability sub-gap (rk-2cm covers only bind/parse stages). The af error string is
  diagnostic here, but the raw `depends` array is not banked. Persist node + bounded raw-prover snippet on
  a record-proof failure, mirroring rk-2cm.
- **NEW (P2, cost/SC4): the current un-batched per-node protocol is ~23–49k tokens/validated-node** on the
  simplest lemma, cache fraction ~0.57; a granular claude-opus prover (26 nodes vs AISM's 8) exhausts a
  500k campaign cap before a root validates. This is the SC4 baseline signal, not a bug — but it means a
  clean whole-lemma denominator needs either a leaner prover, a larger cap (spend decision, not operator),
  or the batching/caching M3.9 measures against. Revisit the 500k cap guess with these numbers.
- **(carried, now weaker) `stuck-no-progress` masks the real cause.** Run B surfaces only as
  `stuck-no-progress`; the true cause (GAP 8 depends rejection) is visible only in the node-skipped reason.
  A stall-cause summary in the abort reason would fail more legibly. (Run A's budget-exhausted abort DOES
  name its cause — good.)

## Preflight gates that DID pass

- `bun test` **1901 pass / 1 skip / 0 fail** (1902 total); `bun run selftest` **OK** (123/123 corpus,
  purity 99/99 + 24/24). `dist/rk` rebuilt from master tip **634e90e**.
- Backends: claude 2.1.215, codex-cli 0.144.6 (gpt-5.6-sol), af 0.1.5 (`--children` `inference` is now a
  free-text derivation label — GAP 6 fix confirmed from `--help` and exercised live).
- Config validation clean 3/3 both directions; dry-run sane for all three (1 node, verifier-ready);
  workspaces byte-identical to `_pristine/`; in-band model resolution correct BOTH directions (the §7
  pre-dispatch gate — passed and printed in each run's preflight).
- STOP-1..7 fixes all hold: features preflight OK, per-assignment model pin resolves in-band, challenge
  binds + applies both directions, GAP 6 (af enum) and GAP 7 (claude verifier parse) both closed and
  confirmed live.
