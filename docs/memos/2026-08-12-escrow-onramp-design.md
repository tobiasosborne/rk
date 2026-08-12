<!-- ROLE: design memo for rk-cz1h (escrow/REDUCE on-ramp). AUTHORED. UPDATE POLICY:
     append-only after commit; supersede by a dated successor memo, never by edit.
     TRIGGER: read before implementing any reduce/escrow bead; §4 names the prereg
     appends the recommendation requires, which are TJO-gated. -->

# Escrow/REDUCE on-ramp — design memo (rk-cz1h, 2026-08-12)

Bead: rk-cz1h, P2, "zero reduce events across 6 windows, 3 campaigns — conditional-step
review too expensive to enter." Wave 2 of `docs/memos/2026-08-10-remediation-plan.md`.
Everything in §3–§4 that changes a credit figure is Tier A (L6) and is written for the
codex gpt-5.6-sol xhigh reviewer. Nothing here is implemented; this memo is the design.

## 1. Current mechanics, characterized

### 1.1 What a REDUCE costs and pays, end to end

Pre-registration (`docs/memos/2026-08-08-prereg-autonomy-v1.md:29-34`): REDUCE(O -> O1..Ok)
has value `V = max(0, H_pred(O) - Σ H_pred(Oi))`, paid 25% "on verification of the
conditional implication", 75% escrowed, vesting pro-rata as each Oi CLOSEs, expiring after
E = 12 allocation rounds with no CLOSE/PRUNE among the children.

The implementation:

| step | site | requirement |
| --- | --- | --- |
| valuation inputs | `src/reward/engine.ts:62-65`, `:19-22` | a `predict` event for the parent **and every child** must precede the reduce in the log; `hPred` is the running mean of `expectedTokens` over predictions seen so far |
| missing prediction | `engine.ts:105-109`; `src/gates/reward.ts:25-32`, `:71-79` | `reduce-unpredicted` diagnostic -> `[reward-reduce-unpredicted]` **ERROR**, structural, non-phase-demotable |
| referential integrity | `gates/reward.ts:42`; `docs/gate-contracts.md:2491-2494` | obligation and every child must resolve to a real `argument/` shard |
| valuation | `engine.ts:110-112` | `V = max(0, hParent - Σ hChildren)`; upfront `0.25 * V` credited to the **obligation** |
| escrow | `engine.ts:113-123` | `0.75 * V`, split pro-rata by child `H_pred`, expiry clock starts at the grant round |
| vesting | `engine.ts:147-157` | a child's share vests only on a `close` event processed **after** the grant seq — the fold never back-vests on children already closed (load-bearing and currently undocumented; see §3.4 attack A5) |
| expiry | `engine.ts:80-92`; `types.ts:26-28` | 12 inactive rounds voids the remainder; deliberately *not* a gate finding (`gate-contracts.md:2489-2490`) |
| record shape | `schemas/reward-ledger.v1.json:55-65` | `{schemaVersion, type:"reduce", obligation, children}` — four fields, `additionalProperties:false` |

### 1.2 Four separable causes of reduces=0

**C1 — no producer exists.** `planRewardSync` (`src/cli/reward-sync.ts:99-166`) emits
exactly three event kinds: `close`, `prune`, `round`. It never emits `reduce`, and no
subcommand does (`rk reward` = report | sync | attest, `src/cli/reward.ts:27-29`). Nor does
any tool emit `predict`. Every reduce and predict event that exists anywhere was appended
to JSONL by hand. This is precisely the rk-tlwb failure class, stated in
`src/reward/provenance-record.ts:9-14`: *a check whose artifact no tool produces is a check
every honest campaign fails*. Here it is worse — the artifact is not a check input but the
payout event itself.

**C2 — the verification artifact is undefined.** The prereg pays 25% "on verification of
the conditional implication"; `src/reward/types.ts:44-47` says "the verification record
itself lives with the claim (af); this event is appended only after that check — the engine
trusts the log, the gates guard what may enter it." No gate guards it. Gate 8 has no check
that a `reduce` is backed by anything (`gate-contracts.md:2464-2611` — checks 1-5 cover
malformed lines, fold faults, referential integrity, close tiers, demotion; reduce backing
appears nowhere). So a campaign that wanted to enter escrow could not learn what artifact to
produce, and rk would have accepted a bare unbacked line if it had. The bead's phrase "too
expensive to enter" is generous: the entry is not expensive, it is **unspecified**.

**C3 — the arithmetic pays ~0 for honest decompositions.** `H_pred(x) = log2(1 + E/T0)` with
`T0 = 100k` and `E` from the bucket bridge (`types.ts:35`) is bounded:

- most expensive possible obligation (`p250k = p1m = 0`, E = 2.00M): `H_pred = 4.392`
- cheapest possible obligation (`p250k = p1m = 1`, E = 125k): `H_pred = 1.170`

Since every child contributes at least 1.170, `V ≤ 4.392 - 1.170k`. Therefore:

> **Under the pre-registered value function, every decomposition into k ≥ 4 children pays
> exactly zero, for every possible prediction assignment.** k = 3 caps at 0.882; k = 2 caps
> at 2.052, and only if the parent is predicted hopeless while all children are predicted
> certain-to-close-within-250k — a self-contradictory pair that the Brier record punishes.

The cause is that `H` is concave with `H(0) = 0` and hence subadditive, so
`Σ H(E_i) ≥ H(Σ E_i)`; the gap is a per-split "concavity tax". Two equal children at
E = 650k each cost 2.006 bits of tax against a total budget of 4.392 bits.

Realistic honest case: parent `p250k=.05, p1m=.20` (E = 1.70M, H = 4.170), two children
`p250k=.75, p1m=.95` (E = 319k, H = 2.066 each) -> V = 0.038, upfront **0.009**. Compare
CLOSE payouts at tier `proved`: 100k tokens pays 1.000, 300k pays 2.000, 1M pays 3.459.
The best-case honest two-child reduce upfront is ~0.5% of one modest close.

**C4 — the escrow horizon exceeds the campaign horizon.** Observed window length: campaign A
window 5 ran "4 rounds of 12" (`../rk-bench/paper-A/analyst-notes.md:704`); campaign C
window 1 ran "12 budgeted rounds restructured to 5"
(`docs/memos/2026-08-09-campaign-C-analyst-notes.md:174`). E = 12 inactive rounds is
2-3 whole windows. The escrow's 75% is therefore not realizable inside the window in which
the decomposition work is done, and a window is the orchestrator's decision horizon.

## 2. Evidence

### 2.1 The six-window record

- Campaign A windows 1-5, campaign B, campaign C window 1: `reduces = 0`.
  Window-1 triage item 7 (`../rk-bench/paper-A/analyst-notes.md:142-144`): "reduces=0 is the
  protocol working (plans don't pay) but also shows the conditional-step review flow needs a
  cheaper on-ramp or windows will under-use escrow entirely."
- Window-5 close (`analyst-notes.md:728-730`): "reduces=0 for 5 straight windows — escrow/
  decomposition machinery has never been exercised, now a standing fact about the design,
  not an oversight."
- Campaign C stage 4 graded **HALF** (`campaign-C-analyst-notes.md:177-182`): route wiring
  and dependency edges fired for the first time in any campaign — 6 `op-` routes, deps
  `op-{membership,hilbert} -> prop-macaulay-access`, critical path 8 — "But verified
  reduce/escrow events: ZERO — and the cause is now known, not agent reluctance."
- Campaign C's ledger was absent entirely (`.rk/reward-ledger.jsonl` does not exist), root
  cause the template §G miss (rk-6cmx/rk-oeal), so campaign C is evidence about *routes
  without a ledger*, not about a ledger that declined to bank.

### 2.2 The counterfactual on campaign A's real structure

Campaign A is the only repo with a populated ledger:
`{predict: 34, close: 12, prune: 3, round: 6}`, reduce: 0. So the predictions the reduce
mechanism needs **did exist** — 33 distinct obligations carry one (thm-mg-lower-bound
carries two). Missing predictions were not the blocker there.

Scoring every `deps:` structure in `rk-campaign-A/argument/*.md` against those 33
predictions (23 shards declare deps):

- **10 of 23** would have raised `[reward-reduce-unpredicted]` — at least one child has no
  prediction. Under Gate 8 these are structural ERRORs, so an honest campaign appending them
  would have broken its own gate.
- **13 of 23** are scorable. Of those, **3 have V > 0 — and all three are k = 1**
  (`thm-improved-ub` V = 2.302, `thm-query-lb-profile` V = 2.118,
  `lem-magnus-expanded-one-norm` V = 0.254). k = 1 is the *reformulation* shape that the
  prereg's own kill criterion names as laundering (`prereg §5:80`, "reformulation-close
  paying nonzero").
- **Every k ≥ 2 decomposition campaign A actually built scores V = 0.**

Two further facts fall out of the same scan and matter for §3:

- Predictions are **node-local and never coherence-checked**. Campaign A predicts
  `lem-l2-additive-eps` at H = 3.426 while its three children sum to E giving H = 4.504 —
  the parent is predicted cheaper than its own parts. Any value function built on the
  *difference* of independently-elicited predictions inherits that incoherence as noise. 7 of
  the 13 scorable cases are incoherent in this direction.
- The value semantics is "predicted work saved". Honest research decompositions do not save
  predicted work; they convert *no route* into *a route with named obligations*. The current
  formula measures the thing decomposition does not do.

So: reduces=0 is over-determined. Even had a producer existed (C1) and the artifact been
defined (C2), campaign A's own structure would have produced 10 gate errors, 10 zero-value
reduces, and 3 payouts on exactly the shape the prereg calls laundering.

## 3. Design options

All three assume the same non-negotiables: zero credit at creation (A1); append-only ledger;
new event shape = schema-versioned compat event (rule 10); no weakening of what full REDUCE
payout requires.

### Option 1 — Producers only (no payout math touched)

**Flow.** `rk reward predict <obligation> --p250k --p1m --estimator` appends a `predict`,
refusing when the ledger already holds a `close`/`prune`/`reduce` touching that obligation
(the "before the first attempt" rule, currently unenforced anywhere). `rk reward sync` gains
a reduce proposal pass: for each registry node with non-empty `deps:` (and, when present,
each `routes:` disjunct, `src/graph/types.ts:107-109`), propose
`{type:"reduce", obligation, children}`, and **withhold with a printed reason** whenever a
child lacks a prediction — byte-for-byte the pattern already used for unpredicted prunes
(`reward-sync.ts:143-155`). Nothing auto-appends: reduces are proposed in `--dry-run` and
require an explicit opt-in flag, because a reduce is a claim about an implication, not a
registry fact.

**Payout schedule.** Unchanged: 25% upfront, 75% escrow.
**Schema delta.** None. **Review weight.** Unchanged.
**Farming attack.** Author k junk child shards, wire them as `deps:`, predict them cheap,
collect 25% of V. Fails on arithmetic: junk children still cost ≥ 1.170 each, so k ≥ 4 pays
0 identically and k = 2 pays a maximum of 0.513 upfront only under a prediction pair the
Brier record scores as a lie; and the junk shards are visible in `rk graph`, the Gini
wandering threshold (prereg §4), and the registry gates.
**Interaction with `rk reward attest`.** None.
**Verdict.** Necessary substrate; insufficient alone. On campaign A's structure it converts
"reduces = 0" into "reduces = 13, credit ≈ 0, plus 10 gate errors". Its real product is
*measurement*: the first empirical distribution of V on live decompositions.

### Option 2 — Probe-record reduce, discounted upfront (the bead's literal suggestion)

**Flow.** `reduce` gains `scrutiny: "probe" | "reviewed"` and `recordRef`. A probe-scrutiny
reduce is backed by a cheap reduction record: one independent seat, one turn, content-bound
to the parent and every child shard's bytes, stating the implication and its falsifiers.
A reviewed-scrutiny reduce is backed by the full adversarial conditional-step review record.

**Payout schedule.** Probe pays `0.05 * V` immediately and escrows nothing; a later
`reviewed` event carrying `upgradesSeq` pays `0.20 * V_frozen` and grants the 75% escrow.
Total over the chain is exactly the pre-registered 25% + 75%.

**Schema delta.** reward-ledger `schemaVersion: "3"`; `reduce` requires `scrutiny` and
`recordRef`, optional `upgradesSeq`. Legacy v1/v2 reduces read as `scrutiny:"reviewed"` —
a clause with zero live instances, since no reduce line exists in any repo (the compat event
is free, exactly once, now).

**Review weight.** Probe seat replaces the full seat for the *first* 5% only.

**Farming attack.** Mass-produce probe records over shallow decompositions at 0.05·V each,
never seeking review. Best realistic case V ≈ 1.0 -> 0.05 credit per fabricated subtree of
≥ 3 shards plus one cross-vendor seat turn; one honest 300k-token close pays 2.000. Farming
is dominated by working by a factor of ~40. **But** the defense is arithmetic that C3 already
makes moot: 5% of ~0 is ~0. Option 2 is an on-ramp onto a road that pays nothing.

**Verdict.** Rejected as primary. It is a real cost reduction attached to the wrong quantity;
it also spends the one free compat event on a number (5%) we would want to re-register after
measurement.

### Option 3 — Deferred-review escrow (recommended)

The insight the cost analysis yields: a conditional-step review is expensive **because it is
demanded at the wrong time**. Reviewing "if O1..Ok then O" before any Oi is proved is
speculative work on a route that will probably die. Reviewing it after the children have
closed is cheap, informative, and certain to matter. The on-ramp should therefore make
*entry* free and *defer the review to when it pays*, not discount the review.

**Flow.**
1. `rk reward attest reduce --obligation O --children O1..Ok --author <seam> --scrutiny probe`
   writes `.rk/reduction-<O>.json`: a reduction record binding `sha256` of the parent shard
   and of every child shard, the author's canonical identity seam, `role`, the stated
   implication, and its falsifiers. One seat, one turn.
2. `rk reward sync` proposes the matching `reduce` event, withholding (never inventing) when
   a prediction is missing, when the record is absent, stale, self-authored, or out of the
   `.rk/` text-record boundary.
3. Children are worked and CLOSE normally. Each close moves that child's escrow share from
   *unvested* to **accrued** — **no credit is paid**.
4. When the campaign wants the money, an independent adversarial seat produces the full
   conditional-step review record and `rk reward attest reduce --scrutiny reviewed` writes
   it; a `reduce` event with `scrutiny:"reviewed"` and `upgradesSeq` pointing at the probe
   event pays the pre-registered `0.25 * V_frozen` upfront **and** releases the accrued
   shares. Escrow continues to vest normally from then on.
5. Escrow expiry (12 rounds, unchanged) voids unvested **and accrued-but-unreleased** shares
   together. A probe that never gets reviewed pays exactly zero, forever.

**Payout schedule.** Identical to the pre-registration in every total. The only change is
*when the ledger allows the probe to open the escrow* — the credit still requires both the
verified child closes and the full conditional-step review. Nothing is discounted; the
sequencing constraint is relaxed.

**Schema delta.** reward-ledger `schemaVersion: "3"`:

```
reduce: { schemaVersion:"3", type:"reduce", obligation, children[],
          scrutiny:"probe"|"reviewed", recordRef, upgradesSeq?:integer }
```
plus a new record family `schemas/reduction-record.v1.json` (see §3.3). `PayoutResult.totals`
gains `reduceProbes` / `reduceReviewed`; `EscrowState` gains `accrued`.

**Review weight.** The probe seat is new and cheap; the full seat is unchanged in what it
must establish. "Reduced review weight" is realized as *deferred*, not *weaker*.

#### 3.1 Two rejected sub-variants, and why

- **(a) probe grants a payable 0.75·V escrow, review unlocks only the 0.25 upfront.**
  Simpler fold, but a false implication that a probe missed would pay out 0.75·V as soon as
  the children close — the children being true says nothing about the implication. This
  *is* a weakening of payout-on-verification and is refused.
- **(b) probe pays 0.05·V now (Option 2's schedule) on top of the deferred escrow.**
  Reintroduces the pre-verification payment A1 forbids in spirit and buys ~0.002 credit at
  measured V. Refused, and kept as a named fallback only if §5's live-fire shows probes are
  still not filed (see §4.3).

#### 3.2 Valuation inputs must be coherent (the §2.2 noise finding)

V is computed from `H_pred`, a running mean over independently-elicited node-local
predictions (`engine.ts:62-65`). On real data those predictions are frequently incoherent
(parent predicted cheaper than its own children, 7/13 cases). Rule:

> A reduce is valued from existing predictions only when they are **coherent**:
> `E_pred(O) ≥ Σ E_pred(Oi)`. Otherwise `V := 0` with an explicit diagnostic
> (`reduce-incoherent-prediction`, a *reported outcome*, not a gate fault — like
> `escrow-expired`).

Under coherence, `Σ H(E_i) ≥ H(Σ E_i)` means the pre-registered formula charges the
concavity tax against a difference that is by construction non-negative in E-space; that is
the whole of C3. Whether to repair the formula (`V = max(0, H(E_p) - H(Σ E_i))`, the
"predicted overhead saved" reading) is **deliberately deferred to measurement** — see §4.2.
On campaign A's structure the repaired formula moves exactly one k ≥ 2 case off zero
(`lem-interaction-picture-ub`, V = 0.122, upfront 0.031), which is not evidence enough to
re-register a pre-registered number.

#### 3.3 Interaction with the provenance-record / attest machinery

The reduction record **rides the attest machinery but is a sibling family, not a v2 of
`provenance-record`**:

- Reuse verbatim: the canonical-seam predicate and its whitespace refusal
  (`provenance-record.ts:95-115`), the `.rk/<name>.json` placement rule and its R9 lesson
  (`provenance-record.ts:226-241`), the claim-id charset (`:54`), the content-binding
  staleness rule (`pma-backing.ts:160-166`, rk-io5l), `additionalProperties:false`, and the
  refuse-never-repair stance (`provenance-record.ts:16-21`).
- Do **not** extend `provenance-record.v1.json`: it is `additionalProperties:false`, its path
  is derived from a single `claimId`, its `role` set is deliberately closed, and its consumer
  is Gate 8 check 4b. Adding k children there is a compat event on a schema the campaigns
  have only just started using, and widens check 4b's blast radius for no benefit.
- New fields the reduction record needs and the provenance record cannot express:
  `children[]`, `childrenSha256[]` (same length, same order, same 64-hex rule), `scrutiny`,
  `implication` (non-blank), `falsifiers` (non-empty; the probe discipline from rk-70ok —
  probe debt, margins, negative controls — supplies the shape for free), and `proposedBy`
  (the seam that authored the decomposition).
- **Content binding covers k+1 shards.** The conditional implication is a statement about the
  parent statement *and* every child statement; if any child shard is rewritten the
  attestation is stale and must not back. This is the direct port of rk-io5l's rule, and it
  is what stops "attest, then edit the children into something trivial".
- **Independence** follows the R3 rule already settled for check 4b
  (`gate-contracts.md:2528-2533`): equality of `(modelFamily, backend, model)` after case
  normalization refuses backing regardless of `sessionId`. Here the comparison is
  record `author` vs `proposedBy`, and additionally vs the parent shard's recoverable
  `prover:`/af author seam where one exists. Same recorded-and-checkable, unauthenticated
  stance: a lie must be written down explicitly in a committed file.
- The canonical-seam predicate is currently duplicated on purpose between producer and
  consumer, guarded by an anti-drift matrix test (`provenance-record.ts:95-101`). A **third**
  copy is not acceptable: extract it to a shared pure module and point all three at it,
  keeping the matrix test. Tier C refactor, but it must land with this work.

#### 3.4 Farming attacks on Option 3

| # | attack | why it fails |
| --- | --- | --- |
| A1 | File probe reduces at scale, never review; harvest escrow when children close | Probe pays **zero**, always. Accrued shares are unreleasable without an independent full review record, and void with the escrow at 12 inactive rounds. The farm's yield is 0 by construction, not by threshold. |
| A2 | Probe, then upgrade with a captured/self-authored review | The reviewed record must decode as a canonical seam differing from `proposedBy` on at least one of (modelFamily, backend, model), and from the parent's recoverable prover seam. Self-authored, anonymous, wrong-role, and same-model-different-session records are already the refused classes (corpus reward-08/09/20). |
| A3 | Inflate `H_pred(O)` by appending more `predict` events after the probe, then upgrade | **V is frozen at the chain's grant seq** and recorded in chain state; the upgrade pays `0.25 * V_frozen` and escrows `0.75 * V_frozen`. Post-hoc prediction inflation changes nothing. (This exposure exists today for prunes as well and should be filed separately.) |
| A4 | Double-pay by appending probe, then a bare `reviewed` reduce with the same children instead of an upgrade | The fold dedupes on `(obligation, sorted child set)`: a second reduce on a live chain **must** carry `upgradesSeq`; without it the event is `reduce-duplicate-chain`, an ERROR, and pays nothing. `upgradesSeq` is guarded exactly as `demote.targetCloseSeq` is — the target must be an earlier probe reduce of the same chain, or the event fails closed (`gate-contracts.md:2572-2583` is the pattern and the lesson). |
| A5 | Take k already-closed nodes, attest a bogus reduce from an unrelated open obligation, upgrade, collect | The fold **never back-vests**: escrow vests only on closes processed after the grant (`engine.ts:147-157`). Already-closed children can never vest, so the chain yields only the 0.25 upfront — and under Option 3 that upfront requires the full independent review of an implication whose children are inspectable and false. The no-back-vest property is load-bearing and must be written into the contract and property-tested; it is currently implicit. |
| A6 | k = 1 "reduce": restate O as an easier O1 and collect | k = 1 is the reformulation-laundering shape (prereg §5:80) and is the *only* shape that scores V > 0 on real data (§2.2). Rule: **k = 1 reduces are not probe-eligible**; they require a full conditional-step review at full weight from the start. Additionally refuse any reduce whose child set contains the obligation, or a child whose shard sha256 equals the parent's. |
| A7 | Split one child into two halves to inflate payout | Under the pre-registered formula splitting strictly *lowers* V (each split adds ≥ 1.170); under the §4.2 candidate repair V depends only on `Σ E_i` and is split-invariant. Both directions are safe; a property test pins it. |
| A8 | Cyclic reduce chains (A -> {B,C}, B -> {A,D}) cross-crediting escrow | Arithmetically impossible: `V_A > 0` requires `E_A > E_B + E_C ≥ E_B`, `V_B > 0` requires `E_B > E_A + E_D ≥ E_A`. No cycle can have all-positive V under either formula. Property-testable as a theorem. |
| A9 | Rubber-stamp review, cheap because the children are already known true | Structural mitigation: rk accounts **per artifact**, not per worker (`types.ts:88-89`) — the reviewer's balance gains nothing from the reduce, which credits the obligation. Procedural: extend prereg §3 calibration sampling (1-in-10, always on critical path) explicitly to reduction records. Residual risk is real and is named in §6. |
| A10 | Attest, then rewrite the children into easier statements | `childrenSha256` staleness, checked against current bytes at gate time and again at upgrade. Red fixture required. |

#### 3.5 The gap Option 3 creates and must close

Today a reduce's 25% upfront is **irreversible**: the prereg voids the escrow when a
decomposition is superseded or pruned (`prereg §1:32-34`) but says nothing about clawing back
the upfront, and there is no `demote` analogue for reduces. Making entry cheap raises the
value of that gap. Option 3 therefore ships with **reduce demotion**: an append-only
compensation event targeting a reduce chain by `(seq, obligation)`, reversing every credit
the chain minted (upfront + released accrued + vested shares), on the exact rk-4317 pattern
including the identity-agreement guard and the never-legal check. Without it, the on-ramp is
a one-way valve.

## 4. Recommendation

**Adopt Option 3, sequenced in two beads, with the value function deferred to measurement.**

### 4.1 Bead 1 (no pre-registered number changes; Tier B except where noted)

`rk reward predict` with the before-first-attempt guard; `rk reward attest reduce` +
`schemas/reduction-record.v1.json` + `src/reward/reduction-record.ts`; `rk reward sync`
reduce proposal with fail-closed withholding; the shared-seam-predicate extraction. Gate 8
gains check 6, `[reward-reduce-unbacked]` / `[reward-reduce-stale-record]` /
`[reward-reduce-self-authored]` — **that check is Tier A** (it is a gate pass/fail rule),
as is the schema v3 compat event (rule 10). The payout fold is untouched in this bead
except for the coherence clause (§3.2), which pays *less*, never more.

### 4.2 Bead 2 (Tier A; requires the §4.4 appends)

The scrutiny staging, accrued-share fold state, `upgradesSeq` chain rules, V freezing, and
reduce demotion.

**Pre-registered decision rule for the value function, fixed now, before the data:** if,
over the next two campaign windows, **≥ 2/3 of gate-passing reduces with coherent
predictions compute V = 0**, then `V = max(0, H(E_parent) - H(Σ E_child))` is adopted by
dated append under §7(a) as a mechanic the live record proved unexercisable. Otherwise the
pre-registered formula stands unchanged. Registering the threshold before the measurement is
the point; §2.2's counterfactual is explicitly *not* sufficient evidence, because no reduce
event has ever reached the fold and the producer gap alone explains reduces = 0.

### 4.3 Fallback, also pre-registered now

If after two windows with bead 1 + bead 2 landed the campaigns file **zero probe reduces**,
the diagnosis "entry cost" is falsified and the cause is incentive timing; the registered
fallback is sub-variant (b) of §3.1 — a 0.05·V probe payment — proposed at the N5.2
postmortem, not before.

### 4.4 Frozen vs amendable

**Stays frozen, untouched by this design:** the 25/75 split; `E = 12` expiry rounds; the
tier weights; `T0 = 100k`; the prediction bucket bridge; `PRUNE_RATE`, `REUSE_RATE`,
`COMPRESS_RATE`; the value formula itself (pending §4.2's rule); prereg §5's kill criteria,
including "escrow vesting on a frozen subtree" as a laundering class.

**Dated appends the recommendation requires** (append, never edit, per the memo's own header
and §7):

1. **To §1's REDUCE clause** — "verification of the conditional implication" is refined into
   two named artifacts: a probe reduction record (opens the escrow, releases nothing) and a
   full conditional-step review record (pays the 25% and releases accrued shares). No
   pre-registered number changes; k = 1 reduces are not probe-eligible.
2. **To §1/§2's interaction** — the coherence precondition `E_pred(O) ≥ Σ E_pred(Oi)`; an
   incoherent reduce is valued 0 and says so.
3. **To §1** — reduce demotion: the upfront and released credit are reversible by an
   append-only compensation event on the rk-4317 pattern.
4. **To §3** — calibration sampling covers reduction records.
5. **Conditionally, to §1** — the value function, only if §4.2's threshold fires.

Appends 1-4 change no pre-registered number and are refinements of clauses the prereg left
underdefined; append 5 is a number change and rests on §7(a). Whether §7(a)'s "mechanics that
S0 proves broken" reaches appends 1-4 at all is a TJO question (§6.1) — the conservative
reading is that they do not need §7 because they add no number, and the memo should be
ratified on that basis rather than on a strained S0 claim.

## 5. Acceptance criteria for the implementation beads

**Red corpus (`corpus/reward/`, continuing from reward-25; `corpus/README.md` is the ledger,
and `test/corpus.test.ts` carries a second hardcoded fixture count that must move with it):**

| fixture | case | expected |
| --- | --- | --- |
| reward-26 | reduce with no reduction record | ERROR `[reward-reduce-unbacked]` |
| reward-27 | reduction record authored by `proposedBy`'s model triple | ERROR (independence) |
| reward-28 | record naming stale child bytes (child shard rewritten after attest) | ERROR (staleness) |
| reward-29 | probe-scrutiny reduce with k = 1 | ERROR (probe-ineligible shape) |
| reward-30 | probe reduce whose child then CLOSEs, no review ever | PASS; balance credit from the chain **exactly 0**; escrow shows accrued > 0, released 0 |
| reward-31 | probe -> reviewed upgrade, all children closed | PASS; chain total exactly `0.25*V + 0.75*V`, hand-computed in the fixture script |
| reward-32 | second reduce on the same child set without `upgradesSeq` | ERROR `[reward-reduce-duplicate-chain]`, pays nothing |
| reward-33 | `upgradesSeq` targeting a different obligation/child set | ERROR, pays nothing |
| reward-34 | child set containing the obligation itself | ERROR |
| reward-35 | reduce grant after its children already closed | PASS with zero vesting (no back-vest), escrow expires |
| reward-36 | incoherent predictions (parent cheaper than children) | PASS, V = 0, diagnostic reported, not a fault |
| reward-37 | valid reduce demotion | PASS; balances return exactly to pre-chain values |
| reward-38 | out-of-`.rk/` reduction record | ERROR naming the placement constraint (R9 pattern) |
| reward-39 | golden multi-chain pass | PASS, payouts match the hand-computed fixture script |

**Property tests (`test/reward/`):**

1. **No-mint.** For every permutation and duplication of a chain's events, total credit
   attributable to that chain ≤ `V_frozen`. Escrow granted at most once per
   `(obligation, child set)`.
2. **Nothing before review.** In any ledger containing no `scrutiny:"reviewed"` event for a
   chain, that chain contributes exactly 0 to every balance.
3. **Freeze.** Appending arbitrary further `predict` events after a probe never changes any
   credit the chain later pays.
4. **No back-vest.** A close preceding its escrow's grant never vests.
5. **Split invariance / monotonicity.** Splitting a child never increases V (both formulas).
6. **Acyclicity theorem.** No cyclic reduce chain has all-positive V.
7. **Demotion conservation.** Reduce demotion returns all balances to their pre-chain values
   within 1e-12, and never creates negative credit on repeat.
8. **Determinism/purity.** `src/reward/*` stays fs/clock/env-free (selftest grep, L3).

**Live-fire (part of the definition of done; fixtures alone never close a WP).** Campaign C
window 2, on a repo whose constitution has been backfilled with §G:

- round-0 chore: `rk reward predict` on the north-star obligations **before** the first
  attempt, then `rk reward sync --dry-run`;
- the 6 existing `op-` routes and the `op-{membership,hilbert} -> prop-macaulay-access`
  edges surface as reduce candidates, each either proposed or **withheld with a printed
  reason** — no silent skips (L2);
- at least one probe reduction record written by `rk reward attest reduce` from a real
  independent seat, its `childrenSha256` verified against the shards on disk;
- at least one probe reduce banked, `rk check` clean, `rk reward report` showing the chain's
  credit as **0** with a non-zero accrued escrow;
- window close records the measured V distribution over all gate-passing reduces — the input
  to §4.2's decision rule — in the analyst notes;
- stage 4 of the rk-4305 pipeline scorecard regrades from HALF.

## 6. Open questions

### 6.1 Requiring a TJO ruling

1. **Amendment legitimacy.** Do §4.4's appends 1-4 (no number changes, refinements of an
   underdefined clause) need a §7 re-registration point at all, or may they land as dated
   appends on the strength of adding no number? And does §7(a) extend to "a mechanic six
   windows proved unexercisable" for append 5, or must the value function wait for N5.2?
   *Blocking bead 2; not blocking bead 1.*
2. **Is k = 1 ever legitimate?** The recommendation refuses probe scrutiny for k = 1 and
   requires full review. The alternative — refusing k = 1 reduces entirely — would forbid a
   real research move (strengthening to a tractable equivalent), but k = 1 is the only shape
   that pays on real data and it is the registered laundering shape. TJO call.
3. **What is an independent seat for a reduction record?** This is remediation-plan TJO queue
   item 3 (the window-5 same-family waiver: standing policy or per-campaign ruling?). The
   answer sets whether a probe seat can be same-family, which decides whether the on-ramp is
   actually cheap in a single-vendor window.
4. **Residual A9 risk.** A review commissioned after the children have closed is cheaper *and*
   more prone to rubber-stamping. The mitigation offered is calibration sampling plus the
   per-artifact accounting structure. Is that acceptable, or must the review record predate
   the first child close (which restores the cost problem)?

### 6.2 Settleable by the implementation

- Sibling record family vs a `kind` discriminator inside a v2 provenance record —
  recommended: sibling family (§3.3).
- `scrutiny` as a field on `reduce` (schema v3) vs a separate event type — recommended:
  field, because the upgrade must reference the probe by seq and one escrow code path is
  easier to prove than two.
- Whether `rk reward sync` proposes reduces from `deps:` only, or also from each `routes:`
  disjunct; and whether proposals require an explicit flag (recommended: yes).
- Exact wording of withhold lines, and whether the coherence diagnostic is reported by
  `rk reward report` only or also by `rk check` as a WARN.
- Where the shared canonical-seam predicate lives (`src/drive/identity.ts` is the natural
  home) and how the anti-drift matrix test is re-pointed.

### 6.3 Filed separately, discovered by this analysis

- `predict` events are unbounded and unordered relative to first attempt: no gate enforces
  the "appended BEFORE the first attempt" rule, and `hPred` is a running mean, so prune
  payouts are inflatable after the fact by appending predictions. Same class as A3 but
  outside this bead's scope; file it.
- The no-back-vest property (A5) is load-bearing, undocumented, and untested. It should be
  written into `docs/gate-contracts.md` Gate 8 and property-tested even if bead 2 slips.
