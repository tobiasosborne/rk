<!-- ROLE: Tier A review record (L6). UPDATE-POLICY: frozen once landed; never edited.
     TRIGGER: cited by HANDOFF and by the M3-close acceptance report. -->

# Tier A review — P1+P2 validity wave (rk-0ehr + rk-wkzh)

**Reviewer**: Fable, in-session, with explicit TJO permission ("dont use codex subagent",
in-chat 2026-08-03) — the L6 amendment's escape hatch, rk-xfzg precedent.
**Authors**: two Opus implementation lanes (reviewer ≠ author holds).
**Scope**: branch `rk-p1p2-validity-wave` vs master (89 files, +4410/−159): retraction as
a first-class event (ratified plan §P1) and Gate 3 quote-at-locus + no-quote-escape
closure (§P2). Ratification: docs/memos/2026-08-03-rk-improvement-plan-from-aism.md.

## Method

Hostile read of every validity-bearing surface, full file or full diff:
`src/drive/retraction-{record,store,store-io}.ts`, `l5-promote.ts`, `bind-verdicts.ts`;
`src/gates/linker-{retraction,status,l5,graph}.ts`, `linker.ts` wiring, `refs.ts`,
`refs-locus.ts`, `config.ts`; `src/graph/{query-taint,validate-conflicts,types-edges,
types}.ts`; `src/store/retraction-load.ts`; `schemas/graph.v1.json`,
`schemas/retraction.v1.json`; gate-contracts phase matrix and Check 16/6/7 prose.
Mechanical verification performed independently of the lanes' own reports: full
`bun test` (2509 pass / 0 fail) + `bun run selftest` (corpus 131/131, purity, compat)
+ `--compile` re-run by the orchestrator on the merged branch; zero pre-existing
`expected.json` modified on either lane (strict-shrink verified by diff, not assertion);
both lanes' perturbation logs (6 + 9 perturbations, each RED then reverted) include the
two properties I care most about: P2's no-rescue proof (locus check injected into the
failed-match branch turns 9 tests red) and P1's fail-open flip (retraction-load liveness
default reversed turns 2 tests red).

## Findings — landing-blockers (BLOCKER/MAJOR on validity semantics)

**None.** The wave lands.

Load-bearing properties verified by direct reading:
- `liveRetractionFor` enforces item+domain+hash triple-match with highest-ordinal-among-
  binding selection; the documented divergence from `latestVerdictFor` is correct (a
  verdict is superseded by later verdicts; a retraction stands until the bytes move).
- Hash domains are never cross-compared: `promotionQuery` filters `l5-shard-bytes` only;
  `checkStatus` consumes the `af-canonical` view only; both sites carry the prohibition
  in prose AND in the lookup's domain parameter.
- Fail-closed everywhere the data is unobservable or corrupt: af-canonical liveness
  (no current hash exists — `currentHashObserved: false`, never a claimed match),
  unhashable l5 items, corrupt ledger (poisons the whole store, zero live reads, one
  ERROR per problem, and poisons L5 promotion confirmation).
- The render veto is structural, not conditional: a live retraction on a resolved node
  emits an unconditional `retraction-vs-status` conflict (a pure function of
  `edges.retraction`), and `effectivePresentation`'s existing conflict path forces
  defect presentation at all 5 call sites — no status list to drift, styling.ts
  untouched at 270/280 lines.
- Propagation rides `computeTaintTrace`'s existing cascade (retraction as an own-taint
  source), covering `af: none` nodes deliberately; conflict and taint agree on which
  record is operative (both highest-ordinal live).
- Gate 3: Check 6 runs strictly inside the whole-quote-match PASS branch (can only
  shrink acceptance); Check 7 fires exactly on `refsLocus !== null`; line arithmetic on
  raw text only; dual-convention (\n vs \n+\x0c) overlap with tolerance handles I4
  without a giant window; `refsMinRunReportingLength` remains message-only.
- Schema discipline: graph v2 bump covers all four surfaces (edges array, conflictKind,
  ConflictRecord.edge, unresolved edge), CLOSED-enum stance preserved, fixtures present.

## Rulings

1. **Schema filename**: `schemas/graph.v1.json` keeps its name; `$id`/filename track the
   schema FAMILY, the `schema_version` const tracks the revision (as the lane documented
   in the schema description). A physical `.v2.json` rename would churn frozen review
   records for zero semantic gain. Ratified as the standing convention.
2. **Phase classification**: Checks 16 (retraction) and 6-7 (locus/no-quote) join the
   non-structural column — consistent with Checks 8/14 and 2-4, whose subject matter
   they extend. The truthful-rendering veto is phase-independent (the graph pipeline has
   no phase demotion), so a retracted item renders as defective in BOTH phases; only the
   gate exit severity relaxes during exploration. Correct stance.
3. **SHARED-EDITS.md** (lane merge scaffolding) is deleted at landing; the schema
   description's pointer to it is redirected to this record. Prose-only change,
   reviewer-sanctioned.

## Findings — follow-ups (beads, batched per the anti-Zeno rule)

1. **No retraction-withdrawal record** (P2-priority): a mistaken retraction cannot be
   withdrawn while the bytes are unchanged — for `l5-shard-bytes` an edit releases it
   (acceptable), but an `af-canonical` retraction is permanent until rk-iejw lands the
   observable hash. Conservative direction (false block, never false validity), but a
   typed `retraction-withdrawn` record should exist before first production use in
   anger. → bead.
2. **Check 6's defensive PASS on unlocatable-after-match** (P3): if `wholeQuoteMatch`
   and `normalizeWithOffsets` ever diverge, the locus check silently vacuates
   (occurrences empty ⇒ PASS). Today pinned by a 500-sample fuzz test; the stricter
   semantics (ERROR on internal inconsistency, since the match is KNOWN to have
   succeeded) is worth considering. → bead.
3. Pre-existing, already filed: rk-iejw (af hash), rk-sp3n (corpus README totals),
   rk-ifrf (REFS_LOCUS_RE trailing punctuation).

## Verdict

**CLEAN — zero landing-blockers.** Both beads' semantics match the ratified plan
exactly; the acceptance set strictly shrinks; every new trust surface fails closed.
Land `rk-p1p2-validity-wave` on master; follow-ups to beads; residuals join the M3
batched review's scope list.
