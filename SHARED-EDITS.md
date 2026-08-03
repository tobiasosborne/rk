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

---

<!-- ROLE: authored merge aid for the orchestrator — every edit this lane (rk-wkzh, branch
     rk-wkzh-p2-gate3-locus) made to a file another concurrent lane also writes. UPDATE-POLICY:
     write-once by the lane; the orchestrator deletes it after merging. TRIGGER: merging this
     branch alongside any other lane that bumps the corpus fixture counts. -->

# SHARED-EDITS — rk-wkzh (P2, Gate 3 quote-at-locus)

Branch `rk-wkzh-p2-gate3-locus`. Three corpus fixtures added: `refs-09`, `refs-10`, `refs-11`.
**Fixture count 127 → 130.** Another lane is concurrently bumping the same counters; every
numeric edit below is a `+3` on whatever that lane lands, not an absolute claim.

Files touched that are NOT this lane's own: the four below, plus
`test/gates/phase-classification.test.ts` (append-only, two new tests inside the existing
`describe("Gate 3 (refs) structural classification")` block — listed for completeness; no existing
line changed).

---

## 1. `test/corpus.test.ts` — 2 lines, both numeric

**Before** (lines 66, 69):

```
  test("total fixture count matches corpus/README.md's ledger (127)", () => {
    const total = GATE_DIRS.reduce((sum, g) => sum + ALL_FIXTURES[g]!.length, 0);
    expect(total).toBe(127);
```

**After**:

```
  test("total fixture count matches corpus/README.md's ledger (130)", () => {
    const total = GATE_DIRS.reduce((sum, g) => sum + ALL_FIXTURES[g]!.length, 0);
    expect(total).toBe(130);
```

Merge rule: take the other lane's number + 3.

---

## 2. `src/corpus/discovery.ts` — the constant + one changelog paragraph

**Before** (end of the `EXPECTED_FIXTURE_COUNT` doc comment, lines 127-128):

```
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

---

**After** (paragraph inserted before the comment's `*/`; constant bumped):

```
 * `provenance-23`: rows parsed but ZERO joined is a WARN naming which of two causes applies.
 * 130 (+3 over the then-pinned 127): rk-wkzh — `refs-09`, `refs-10`, `refs-11`, Gate 3's P2
 * tightening (docs/memos/2026-08-03-rk-improvement-plan-from-aism.md §P2), the first refs fixtures
 * transcribed from real dated incidents rather than classes: `refs-09` is AISM I2 (quote bytes
 * genuine, recorded locus a DIFFERENT theorem — PASS before this bead, ERROR after; the strict
 * acceptance-shrink case), `refs-10` is I3 (a source naming a refs/ path with no extractable
 * quote rode `skip_noquote` WARN past the fabrication gate; now an ERROR), `refs-11` is I4 (a
 * pdftotext payload with real `\x0c` bytes whose locus is plausible under form-feed-aware line
 * counting and off under `\n`-only counting — PASSes via the either-convention rule). */
export const EXPECTED_FIXTURE_COUNT = 130;
```

Merge rule: keep both lanes' changelog paragraphs (append in landing order), and set the constant
to the other lane's number + 3.

---

## 3. `corpus/README.md` — 5 edits

### 3a. Three ledger rows — pure insertion

Inserted immediately AFTER the `| \`refs-08\` | refs | ... | landed |` row and BEFORE the
`| \`provenance-01\` [PLAN] | ...` row. Rows: `refs-09`, `refs-10`, `refs-11`. No existing line
touched. (Full text in the diff; each row cites P2/rk-wkzh, the AISM incident number, the
`aism_behavior` verdict and its mutation-proof.)

### 3b. Totals line — the `refs` term only

**Before**:

```
Totals: 3 config + 15 defs + 43 argument/linker + 8 refs + 20 provenance + 8 runs +
15 report-shards + 11 freshness = **123 fixtures** across the eight gates named in
```

**After**:

```
Totals: 3 config + 15 defs + 43 argument/linker + 11 refs + 20 provenance + 8 runs +
15 report-shards + 11 freshness = **123 fixtures** across the eight gates named in
```

Note: the `**123 fixtures**` grand total was ALREADY stale before this lane (the true count at
branch point was 127). Left as-is deliberately, per instruction; only the `refs` term is corrected
(8 → 11) and the staleness is called out in the new delta paragraph (3c). If the other lane
repairs the grand total, that repair wins — just keep `11 refs`.

### 3c. Delta paragraph — pure insertion

Inserted immediately BEFORE the paragraph beginning
`` `config-04` (+1 over the then-pinned 123) is rk-45m: ``. Begins
`` `refs-09`, `refs-10`, `refs-11` (+3 over the then-pinned 127) are rk-wkzh / P2 ... `` and ends
with the parenthetical recording that the Totals grand total is stale and that
`EXPECTED_FIXTURE_COUNT` / selftest's `checked corpus:` line are authoritative. No existing line
touched.

### 3d. Validation-results table, `refs` row

**Before**:

```
| refs | 8/8 | 6 | 2 (`refs-07`, whole-quote-match rule; `refs-08`, crash→ERROR — check-refs.py:180 uncaught AttributeError on null external, rk-stricter-intended) | 0 |
```

**After**:

```
| refs | 11/11 | 7 | 4 (`refs-07`, whole-quote-match rule; `refs-08`, crash→ERROR — check-refs.py:180 uncaught AttributeError on null external, rk-stricter-intended; `refs-09`, quote-at-locus enforced — check-refs.py PASSes a right-bytes/wrong-passage citation, rk-stricter-intended; `refs-10`, no-quote escape closed — check-refs.py returns a WARN `skip_noquote`, rk-stricter-intended. `refs-11` is `same`: both exit 0) | 0 |
```

The table's `**total**` row is deliberately NOT changed (it is pinned to the M0 cohort's 92).

### 3e. Scope note — pure insertion

A second parenthetical scope note inserted immediately after the existing
`(Scope note, 2026-07-19: ...)` paragraph, recording that `refs-09`/`refs-10`/`refs-11` are
outside the M0 script-validated cohort on the same footing as the M1-repair-wave fixtures (their
`aism_behavior` is backed by a direct read of `check-refs.py` plus the postmortem's live
observation of I2, not by a fresh harness run). No existing line touched.

---

## 4. `docs/gate-contracts.md` — 8 edits, all in Gate 3 or its shared-conventions feeders

### 4a. Per-repo parameters intro (Shared conventions)

**Before**: `**Per-repo parameters (this WP's scope).** Two config values are explicitly per-repo, not`
`global constants, ported from AISM's hardcoded defaults:`

**After**: `**Per-repo parameters (this WP's scope).** These config values are explicitly per-repo, not`
`global constants — the first two ported from AISM's hardcoded defaults, the third an rk addition:`

Plus a new third bullet documenting `refsLocusToleranceLines` (default 50, verdict-deciding,
explicitly contrasted with the message-only `refsMinRunReportingLength`). Pure insertion after the
report-shard PREFIX/MAX_LINES bullet.

### 4b. Config validation paragraph — numeric field list

**Before**: `(`linkerBrittlenessSoftCap`, `shardsMaxLines`, `refsMinRunReportingLength`), non-empty-string for`

**After**: `(`linkerBrittlenessSoftCap`, `shardsMaxLines`, `refsMinRunReportingLength`,`
`` `refsLocusToleranceLines`), non-empty-string for ``

### 4c. Phase matrix, Gate 3 row (the one line another lane might also touch)

**Before** (non-structural column): `Check 2 (payload existence), Checks 3-4 (normalization + whole-quote match)`

**After**: `Check 2 (payload existence), Checks 3-4 (normalization + whole-quote match), Check 6 (quote at locus), Check 7 (refs locus named, no extractable quote)`

The rationale cell also gains a trailing sentence explaining why checks 6-7 join the
non-structural column. The structural column is unchanged. `src/gates/phase.ts` is NOT touched
(the new findings simply omit `structural`), and the paired classification tests are in
`test/gates/phase-classification.test.ts` per the matrix's own mutation-proof discipline.

### 4d-4h. Gate 3 section — all pure insertions/local edits

- **Inputs**: one new bullet, `Config: refsLocusToleranceLines (default 50)`, after the `MIN_RUN`
  bullet.
- **Checks item 1**, the `skip_noquote` sub-bullet: amended to say WARN applies only when the
  `source` names no refs/ locus, pointing at check 7 for the other case.
- **Checks items 6 and 7**: new, appended after item 5.
- **Divergences**: one new `[rk-stricter-intended]` entry (quote-at-locus + no-quote escape), with
  I2/I3/I4 spelled out and `docs/memos/2026-08-03-aism-postmortem/07-refs-report.md` cited as
  provenance. Inserted before the first `[message-only]` entry. This ADDS a divergence; it does not
  overturn an existing ruling (the survey confirmed Gate 3 carried no "advisory locus, carried
  forward unchanged" ruling to overturn).
- **Corpus fixtures required table**: three new rows appended after `refs-08`.
