<!-- ROLE: authored merge aid for branch `rk-0ehr-p1-retraction` — every edit this branch made to a
     file another concurrent lane also edits, with exact before/after, so the orchestrator can
     resolve the cross-lane merge without re-deriving intent from the diff.
     UPDATE-POLICY: authored; superseded the moment this branch lands. DELETE ON MERGE.
     TRIGGER: read before merging this branch, and before the Tier A review of rk-0ehr. -->

# SHARED-EDITS — branch `rk-0ehr-p1-retraction` (bead rk-0ehr, plan §P1)

Another lane is concurrently bumping the same fixture counts on its own branch. This file lists
**every** edit this branch made to a shared file. Everything else on this branch is new files or
files only this bead touched.

Base: `ccf6865`. Commits: `991b110` (ledger), `714177a` (Gate 2), `a699d43` (graph v2).

---

## 1. `test/corpus.test.ts` — fixture count, MERGE CONFLICT EXPECTED

One hunk, both the test name and the assertion.

**Before**
```ts
  test("total fixture count matches corpus/README.md's ledger (127)", () => {
    const total = GATE_DIRS.reduce((sum, g) => sum + ALL_FIXTURES[g]!.length, 0);
    expect(total).toBe(127);
  });
```

**After**
```ts
  test("total fixture count matches corpus/README.md's ledger (128)", () => {
    const total = GATE_DIRS.reduce((sum, g) => sum + ALL_FIXTURES[g]!.length, 0);
    expect(total).toBe(128);
  });
```

**Merge rule.** This branch adds exactly **one** gate fixture (`corpus/linker/linker-44`). If the
other lane adds N, the merged number is `127 + 1 + N`. Take the arithmetic, not either side's
literal. `corpus/graph/conflict-retraction-vs-status` does **not** count — `corpus/graph/` is
outside `GATE_DIRS` and runs under its own bun-test harness (corpus/README.md's "Graph fixtures"
section says so explicitly).

## 2. `src/corpus/discovery.ts` — `EXPECTED_FIXTURE_COUNT`, MERGE CONFLICT EXPECTED

**Before** (end of the running changelog comment, then the constant)
```ts
 * `provenance-23`: rows parsed but ZERO joined is a WARN naming which of two causes applies. */
export const EXPECTED_FIXTURE_COUNT = 127;
```

**After** — one new changelog paragraph appended inside the same block comment, then the constant:
```ts
 * `provenance-23`: rows parsed but ZERO joined is a WARN naming which of two causes applies.
 * 128 (+1 over the then-pinned 127): rk-0ehr / P1 (retraction as a first-class event, ratified
 * plan docs/memos/2026-08-03-rk-improvement-plan-from-aism.md §P1) — `linker-44`, THE INCIDENT
 * FIXTURE: AISM 2026-07-28's two retracted-but-still-green proofs, transcribed with their real
 * ids from docs/memos/2026-08-03-aism-postmortem/03-datamodel.md "Drift & inconsistency found"
 * item 1. One shard exercises the `af-canonical` domain (Gate 2 Check 8: a retracted shard's own
 * `af: validated` claim is an ERROR, and it leaves the available set for every dependent), the
 * other the `l5-shard-bytes` domain (Check 14: a live retraction overrides a FRESH `VALID`
 * verdict — the half no hash comparison could catch, because the bytes never changed). See
 * docs/gate-contracts.md Gate 2's new Check 16. */
export const EXPECTED_FIXTURE_COUNT = 128;
```

**Merge rule.** Keep BOTH lanes' changelog paragraphs (they are append-only prose, order by
resulting count), and set the constant to the same arithmetic total as §1. The two numbers must
match or `bun run selftest` fails loudly — which is the point of pinning them twice.

## 3. `corpus/README.md` — three additions, all append-shaped

a. **A `linker-44` row**, inserted in the fixture table immediately BEFORE the `| `refs-01` [PLAN]`
   row (i.e. at the end of the linker block). Self-contained single table row; no other row touched.

b. **A `graph/conflict-retraction-vs-status` row** in the separate "Graph fixtures (M2.2/M2.3)"
   table, inserted immediately BEFORE the `| `graph/conflict-fr-superseded`` row.

c. **A totals-delta paragraph**, inserted immediately BEFORE the existing `config-04` paragraph:

```
`linker-44` (+1 over the then-pinned 127) is rk-0ehr / P1 (retraction as a first-class event):
the AISM 2026-07-28 incident fixture — see its own row above and `docs/gate-contracts.md`
Gate 2's new Check 16. NOTE: the "Totals" line immediately above was already stale before this
bead (it reads 123 while `src/corpus/discovery.ts`'s `EXPECTED_FIXTURE_COUNT` and
`test/corpus.test.ts` were at 127); this bead bumps the pinned count 127 -> 128 and records its
own delta here, deliberately without back-filling the four earlier undocumented additions —
that reconciliation is its own bookkeeping item, not this bead's to smuggle in.
```

**Merge rule.** All three are pure insertions at distinct anchors; take both lanes' rows and both
lanes' delta paragraphs. **The `Totals:` line itself was NOT touched by this branch** — it read
123 before this bead and still does, which is stale by four (see the note above). It is left for a
dedicated bookkeeping item so this branch's diff stays reviewable; flagging it here so the
orchestrator does not read the staleness as this lane's damage.

## 4. `docs/gate-contracts.md` — three delimited edits, all Gate 2

a. **Phase-matrix row** (the `**Gate 2 — argument/linker**` row, ~line 261), non-structural column
   only:
   - before: `..., Check 13 (critical-path provenance, M3.8), Check 14 (L5 promotion, M3.8) | id/parse/cycle/...`
   - after:  `..., Check 13 (critical-path provenance, M3.8), Check 14 (L5 promotion, M3.8), Check 16 (retraction, rk-0ehr) | id/parse/cycle/...`

b. **Check 8 amendment** — a new sub-bullet appended to the existing numbered item 8 ("Status
   propagation"), directly after its closing sentence "…a validated result can never rest on a
   non-rigorous dep." Nine lines, opening `- **Retraction withdraws availability** (rk-0ehr / P1,
   src/gates/linker-status.ts …)`. Nothing above it is modified.

c. **Check 16, a whole new numbered item** — inserted between the end of item 15 (which ends
   "…Fixture: `linker-43`.") and the paragraph beginning "Not part of the pass/fail contract,".
   ~35 lines: what a retraction is (with the AISM citation), liveness as a hash binding, the two
   domains and which check each feeds, the af-canonical KNOWN LIMITATION, store-integrity
   poisoning, the coverage line, and `aism_behavior: differs`.

d. **A `linker-44` row** in Gate 2's own fixture table, immediately after the `linker-43` row.

**Merge rule.** (a) is a one-line edit inside a shared table row — if the other lane also adds a
check to that row, keep both, comma-separated, in check-number order. (b)/(c)/(d) are insertions at
anchors no other check owns.

## 5. `schemas/graph.v1.json` — the v2 bump (CLAUDE.md rule 10 compat event)

Six edits, all additive except the version const:

| where | before | after |
|---|---|---|
| `properties.schema_version.const` | `"1"` | `"2"` (+ a description paragraph explaining the bump) |
| `properties.edges.required` | `["af","bd","fr","report"]` | `["af","bd","fr","report","retraction"]` |
| `properties.edges.properties` | 4 arrays | + `retraction` (`$ref: #/$defs/retractionEdge`) |
| `$defs.unresolvedRefOther.properties.edge.enum` | `["af","bd","report"]` | `+ "retraction"` |
| `$defs.conflictKind.enum` | 4 kinds | `+ "retraction-vs-status"` |
| `$defs.conflictRecord.properties.edge.enum` | `["af","bd","fr","report"]` | `+ "retraction"` |

Plus a new `$defs.retractionEdge` (inserted immediately before `$defs.conflictKind`) and two
top-level description sentences updated from "four settled kinds" to "five settled kinds".

**FLAGGED FOR THE TIER A REVIEW — filename vs internal version.** The file is still named
`graph.v1.json` and its `$id` is still `https://rk.tools/schemas/graph.v1.json`, while the
`schema_version` const inside is now `"2"`. This branch read the `.v1` in the filename as naming
the schema FAMILY (the way `verdict.v1.json`/`generated.v1.json` do) and the const as naming the
version, and did **not** rename — a rename would touch every prose citation of the path across
`docs/`, `corpus/`, and the two immutable review records under `docs/reviews/`, which is a
decision for the reviewer, not for an implementer mid-bead. The alternatives are (i) keep as-is and
say so in the schema prose (what this branch did — the description now states the convention
explicitly), (ii) rename to `graph.v2.json` and leave a `v1` stub, (iii) rename and update every
citation. **Not resolved unilaterally; please rule.**

TS mirrors of the same bump: `src/graph/types.ts`'s `GRAPH_SCHEMA_VERSION` and
`test/graph/types.test.ts`'s assertion (both `"1"` -> `"2"`), and
`src/gates/linker-crossvendor.ts:60`, which hardcoded `schema_version: "1"` and now imports the
constant instead.

## 6. `src/graph/types-edges.ts` — the shared contract other components consume (Tier A)

Five edits:

1. New type-only import at the top (no runtime coupling from graph -> drive):
   ```ts
   import type { RetractionHashDomain } from "../drive/retraction-record";
   export type { RetractionHashDomain };
   ```
2. New `export interface RetractionEdge { nodeId, ordinal, contentHash, hashDomain, retractedBy,
   reason, resolved, live, currentHashObserved }`, inserted after `ReportEdge`, fully doc-commented.
3. `UnresolvedOtherRef.edge`: `"af" | "bd" | "report"` -> `"af" | "bd" | "report" | "retraction"`.
4. `CONFLICT_KINDS`: 4 entries -> 5 (`+ "retraction-vs-status"`), with the doc comment rewritten
   from "The four closed conflict kinds" to explain that the extension came with the mandated
   version bump.
5. `ConflictRecord.edge`: `+ "retraction"`; `GraphEdges`: `+ retraction: RetractionEdge[]`
   (**required**, not optional — see the merge rule below).

**Merge rule / blast radius.** `GraphEdges.retraction` being REQUIRED is deliberate: an optional
field would let a producer silently omit the array and make every retraction invisible, which is
the failure mode this bead exists to close. The cost is that every literal constructing a
`GraphEdges` needed `retraction: []` added. This branch updated **all 29 sites** across `src/` and
`test/` (mechanically: every `report: []` in a `GraphEdges` literal, plus `test/graph/fixtures.ts`'s
11 multi-line builders and `test/graph/query-focus.test.ts`'s optional-edges helper). If the other
lane adds a new `GraphEdges` literal, it needs `retraction: []` too — bun does not typecheck, so
the symptom is a runtime `TypeError: undefined is not an object (evaluating 'doc.edges.retraction')`
from `computeTaintTrace`/`canonicalizeGraphDocument`, not a compile error. **Grep after merging:**
`grep -rn "edges: {" src/ test/ --include=*.ts` and confirm each literal has a `retraction` key.

Two stored-document fixtures also had to move to v2 (both regenerated, not hand-edited):
`corpus/render/rigour-ladder/graph.json` (`schema_version` -> `"2"`, `edges.retraction: []`) and
`test/graph/fixtures/sample.canonical.json` (regenerated from `buildSampleDocument()` through the
real serializer).

---

## Files this branch OWNS (no merge risk expected)

New: `src/drive/retraction-{record,store,store-io}.ts`, `src/gates/linker-retraction.ts`,
`src/gates/linker-status.ts`, `src/graph/from-retraction.ts`, `src/store/retraction-load.ts`,
`schemas/retraction.v1.json`, `corpus/linker/linker-44/**`,
`corpus/graph/conflict-retraction-vs-status/**`, and six new test files.

Modified but bead-specific: `src/drive/{bind-verdicts,l5-promote}.ts`,
`src/gates/{linker,linker-l5,linker-graph,linker-crossvendor}.ts`,
`src/graph/{assemble,serialize,validate,validate-conflicts,query-taint}.ts`,
`src/store/build-graph.ts`, plus the test files those changed behaviours own.

**One structural move worth calling out:** Check 8 (`checkStatus`/`isAvailable`) moved out of
`src/gates/linker-graph.ts` into the new `src/gates/linker-status.ts` — `linker-graph.ts` hit
289 lines against the 280 cap once retraction semantics landed in it. Both symbols are
**re-exported from `linker-graph.ts`**, so every existing import site is unchanged; a lane that
edits `checkStatus` will find it moved, not deleted.
