<!-- ROLE: authored PROPOSAL — improvement plan for rk derived from the AISM
     bitter-lesson snapshot. Nothing here is adopted until TJO ratifies; adopted items
     move into ../research-workflows/IMPLEMENTATION_PLAN.md (sequencing authority) and
     bd. UPDATE-POLICY: authored; edited only to record ratification outcomes, then
     frozen. TRIGGER: TJO ratification session; then M3-close/M4/M5 planning.
     EVIDENCE: docs/memos/2026-08-03-aism-bitter-lesson-snapshot.md + appendix. -->

# Proposal: rk improvements from the AISM postmortem

Each item states: current rk state (verified against gate-contracts.md, schemas/,
IMPLEMENTATION_PLAN.md at commit 5a2ebd5), the gap, the concrete change, size, review
tier, and where it lands in the milestone sequence. Items marked **[TJO]** need a
decision before any work starts. Nothing below touches the M3-close review scope —
the anti-Zeno rule holds; these are post-M3 work packages.

## Already covered — no action (verified, for the record)

- **Cross-layer registry↔af disagreement** (AISM's headline defect: retracted shard,
  workspace still validated): `graph.v1` conflict kind "registry-status vs
  af-epistemic-state disagreement", recomputed by `src/graph/validate.ts`, ERROR on
  missing/duplicate/inconsistent records. Covered — *for edit-visible states* (see P1).
- **Hash-bound verdicts, stale-on-edit, correction-requires-reverification**:
  `verdict.v1` pinned hash domains; `correctionRequiresReVerificationBeforePromotion`.
- **Balloon tripwire with forced classification + structured routing**: M3.6 (built).
- **Token accounting per-node/per-campaign**: M3.9 + live `--max-campaign-tokens`.
  AISM's zero-instrumentation failure is already answered.
- **Bandit skepticism**: M4.0 pre-registration + shadow mode + ABAB is already
  designed around exactly the prior the postmortem confirms (human route choice beat
  the allocator; EXPLOIT ×498 / EXPLORE ×14).
- **No-silent-skip / coverage reporting / unresolved buckets / UNWIRED-style
  whitelists**: L2 + graph.v1 `unresolved` + Gate 4.

## P1 — Retraction as a first-class event (the one big gap)

**Current.** Zero retraction vocabulary in rk (`grep -r retract` over src/, schemas/,
gate-contracts.md: no hits). All staleness is *edit-triggered* (hash mismatch). The
graph's four conflict kinds detect disagreement between layers, but an out-of-band
demotion — audit or human demotes a result whose artifact bytes are unchanged — has
no representation. This is exactly the state AISM died in: two retracted proofs still
render "validated" in three of four layers because retraction existed only as
hand-edited prose.

**Change.**
1. `retraction.v1` record: append-only, in the M3.7 verdict store's format —
   `{itemId, contentHash, retractedBy, reason, supersedesVerdictHash?, ts}`.
2. Linker: a retraction record present for (itemId, contentHash) overrides any fresh
   VALID — status demotes, propagation cascades exactly as an INVALID would.
3. Render veto: no renderer may emit validated/proved for an item with a live
   retraction (truthful-rendering surface).
4. `graph.v1 → v2`: fifth conflict kind "retraction-vs-status" — schema bump per
   rule 10 (conflict kinds are CLOSED; extension = version bump + fixture).
5. Red corpus: fixture reproducing the AISM incident (retraction recorded, export
   and verdict still green) — a real dated incident per L2, appendix 03 §Drift-1.

**Size** M. **Tier A** (status propagation + truthful rendering = L6, no exceptions).
**When**: first validity WP after M3 close; before M4, because M4's fr work consumes
verdict semantics. **Depends on**: M3.7 verdict store (planned, not yet built) —
design them together so the store's append-only format carries both record types.

## P2 — Gate 3 tightening: quote-at-locus + close the no-quote escape

**Current.** Gate 3 is the check-refs port: quote must appear *somewhere in the
file*; `locus` is advisory; an external with no `refs/` locus or no quoted run is
legal input classified `skip_noquote`. The postmortem turned both known-limitations
into **real dated incidents**: AISM I2 (wrong-attribution citation, bytes right,
locus wrong, permanently green) and I3 (five newest citations silently exempt via
freeform-string drift, `skip_noquote` WARN).

**Change.**
1. When a locus is present, the matched run must fall *within the claimed locus*
   (tolerance window for off-by-header noise, form-feed-aware line counting — AISM
   I4 documents the `\x0c` ambiguity).
2. `skip_noquote` on an external whose `source` names a `refs/` path ⇒ ERROR, not
   skip ("green must never mean we couldn't parse").
3. Red corpus: fixtures transcribed from I2/I3/I4 (real incidents; upgrades Gate 3's
   corpus from class-driven to incident-driven per L2).

**Size** S. **Tier A** (gate pass/fail rules change; acceptance set strictly
shrinks — same shape as rk-xfzg). **When**: same wave as P1. Note this *overturns
part of a recorded ruling* (Gate 3 divergence table says "carried forward
unchanged") — the triage entry gets updated with the new incident citations as the
justification, which is exactly what L5's triage ledger is for.

## P3 — Runs become graph citizens: typed evidence edges + executed re-runs

**Current.** `graph.v1` has af/bd/fr/report edges — no runs edges. Gate 5 is
substring-search over README prose; the re-run command is never executed (ruling #5
carried this deliberately). AISM outcome: run→claim linkage decayed to prose, 0% of
exploration output reached the critical path, one bundle's documented command has
been broken-but-green since banking day.

**Change** (lands in M4 — exploration is its natural milestone):
1. Structured run manifest (frontmatter or `run.json`): `{claims: [{id, verb:
   refutes|supports|calibrates}], command, invariant}` — Gate 5 checks structure,
   graph v2 gains a runs edge kind with the verb, unresolved claim ids land in the
   bucket like every other edge.
2. `rk run verify <bundle>`: executes the declared command under rule-13 bounds
   (timeout + RLIMIT), asserts the declared invariant. Not on the pre-commit path
   (cost); scheduled like `rk audit`, and a bundle whose command fails is a finding.
3. **[TJO]** Evidence-class refinement: AISM's `numerical` rung had no exit —
   exact-certificate instance facts (a ℚ-certified counterexample IS a theorem about
   itself) sat unpromotable forever. Options: (a) new rung between numerical and
   proved; (b) an `evidence-class: exact-certificate | float-sweep` annotation with
   no ladder change. (b) is cheaper and doesn't touch the ladder; recommend (b).
   Either way this is rigour-ladder-adjacent ⇒ Tier A and TJO sign-off first.

**Size** M total (1: S, 2: S-M, 3: S). **Tier** A for 3, B for 1-2 (corpus-
constrained). **When**: M4, alongside fr work — the fr F-items and this share the
"exploration must handshake with the frontier" theme.

## P4 — Mechanical stop rules at lane level

**Current.** Per-run guards exist (stuck, churn caps, balloon). Missing: the
cross-run counter — AISM ran seven consecutive identical negative verdicts
("tallness binds"), counted them in titles, and no mechanism ever fired; the
stall-breaker was structurally defeated because models self-tag `progress` (0/106
cycles said "stalled").

**Change.** Fold into M4.4 (the F4 `fr audit` instrument, which already measures
no-pull rate and concentration): add a repeated-residual counter — N consecutive
same-residual negative outcomes on a lane ⇒ board recommendation LANE-CLOSE
(recommendation + logged deviation, same pattern as the bandit's `policy_rec`).
Counter input is the typed verdict/residual record, never self-assessment.

**Size** S (extends an already-planned WP). **Tier** B. **When**: M4.4.

## P5 — Multi-granularity re-derivation lens in `rk audit`

**Current.** M5.1's audit lenses: overclaim, convention-drift, gate-rot, wandering.
The postmortem's sharpest verification finding is missing: per-node adversarial
verification carries a ~5-10% residual defect rate *systematic within a framing*;
4 of 6 AISM retractions were caught only by re-derivation at a different granularity.

**Change.** Add a `regrain` lens to M5.1: select banked validated results (weighted
by critical-path membership — M2.5's query), commission an independent
re-decomposition at a coarser/finer grain, diff the two interface sets; mismatches
file as bd findings. Runs on the audit schedule, priced per run. **[TJO]** budget
envelope per audit cycle.

**Size** M. **Tier** B (findings route through normal review; the lens itself
doesn't change validity semantics). **When**: M5.1.

## P6 — Cross-repo V-items (file in ../vibefeld, do not absorb — rule 2)

The three af-side changes the postmortem motivates. Each is a proposal for the
vibefeld plan, sized there:

- **V: contract `exports:` clause.** Both AISM silent-retraction classes came from a
  child contract under-specifying what it exported ("anaphora elevated into missing
  equality premises"). An optional typed exports list on a node contract, with the
  verifier instructed to check the parent cites only exported witnesses. The one
  place the schema should get *richer*. **[TJO]** — scope and whether af or rk-side
  prompt discipline carries it initially.
- **V: challenge-resolution outcome enum.** af's `challenge_resolved` records no
  outcome (repaired vs dismissed indistinguishable across 402 AISM events);
  `verified_by` nullable (24% null). rk's V1 provenance work already threads
  verifier identity; this completes the lifecycle.
- **V: typed citation fields on externals.** Replace the freeform
  `refs/...:lines VERBATIM: "..."` convention with fields
  `{sourceId, anchor, locus, quoteSegments[]}` — the AISM I3 escape was pure
  freeform-string drift. rk's Gate 3 (P2) meets it halfway from the checking side.

## P7 — Multiplayer design memo (separate workstream, per TJO directive)

One WP, design-only, no code: a memo proposing rk-multiplayer primitives from the
postmortem's §6 evidence — path-scoped lane ownership declarations (generalizing the
proven parallel-lane pattern already in rk memory), generated merge protocols from
lane declarations, slug-id-only rule (rk already complies), role-as-unit topology,
human ratification packages as a first-class artifact (batched decisions, no quoted
content, nothing lands unsigned), and the tracked-or-reconstructible rule for any
state a second player needs (with a gate that verifies reconstruction). **[TJO]**
whether this becomes an M6 or folds into M5. **Size** S (memo only).

## Sequencing summary

| Phase | Items | Gate |
|---|---|---|
| M3 close (unchanged) | — nothing added; anti-Zeno holds | existing plan |
| Post-M3 validity wave | P1 (retraction), P2 (Gate 3) | one Tier A review covering both |
| M4 (exploration) | P3 (runs edges + rk run verify), P4 (lane stop rules); P3.3 needs TJO first | existing M4 review cadence |
| M5 | P5 (regrain lens) into M5.1 | Tier B |
| Cross-repo, anytime | P6 V-items filed in vibefeld | vibefeld's plan |
| Separate | P7 multiplayer memo | TJO ratification |

**TJO decisions needed before work starts:** (1) ratify this plan into
IMPLEMENTATION_PLAN.md; (2) P3.3 evidence-class mechanism (recommend annotation, not
new rung); (3) P5 regrain budget; (4) P6 exports-clause scope; (5) P7 M6-vs-M5
placement. Everything else is sized, tiered, and sequenced above.

**Corpus dividend (free, immediate):** the postmortem supplies real dated incidents
for fixtures rk's contracts currently mark "no incident on record": Gate 3 (I2/I3/I4),
Gate 5 (broken-but-green re-run command), retraction-invisibility (P1), ghost
workspaces (161 invisible skeletons — check whether the graph's unresolved bucket
already catches an af-skeleton-without-registry-content case; if not, fixture it).
Seeding these is Tier C work and can start any time without ratification.
