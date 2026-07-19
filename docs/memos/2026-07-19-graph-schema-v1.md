<!-- ROLE: design memo — authored, append-only (never rewritten in place; a follow-up decision
     gets a new dated memo that supersedes this one, per the docs/memos/ convention). UPDATE
     POLICY: authored once at WP landing, amended only by a dated addendum section if the Tier A
     review (below) changes a decision before M2.1 merges. TRIGGER: read before implementing
     M2.2 (store readers) or M2.3 (conflict detection) — both consume this shape without
     changing it; read before any schema_version bump under schemas/graph.v1.json. -->

# M2.1 — Graph JSON schema v1: design memo

Scope: `schemas/graph.v1.json` (versioned JSON Schema) + `src/graph/{types,serialize,validate}.ts`
(TS mirror, canonical serializer, structural validator). Ground truth: `../research-workflows/
PRD.md` §4 C5, `../research-workflows/IMPLEMENTATION_PLAN.md` M2.1, and
`../vibefeld/docs/export-graph-v1.md` (V4, landed the day before this WP — `af export --graph
json`, `schema_version: "1"`). This WP does not read any real repo — M2.2 (store readers) and
M2.3 (conflict detection) are the WPs that populate a `GraphDocument` from AISM/a dogfood repo;
M2.1 only fixes the shape both of them, and every consumer downstream, build against.

## The join-key table (PRD C5, restated against the concrete schema)

| Edge | Join key | Schema location | Known hazard, and how the schema/validator addresses it |
|---|---|---|---|
| registry↔af | contract byte-match, LOCATED VIA the shard's `workspace:` field | `RegistryNode.workspace` (the source field) + `edges.af[].workspace` (the copy an af-edge record carries) | Workspace dir ≠ id after a rename (legal in af — confirmed by export-graph-v1.md's own note that af records no rename-stable identifier). `src/graph/validate.ts`'s `checkAfEdges` cross-checks `edges.af[].workspace === RegistryNode.workspace` byte-for-byte and ERRORs on drift — this is the concrete guard against a producer bug that re-derives the join key from `id` instead of copying the field. The **required rename-hazard fixture** (`lem-halo-collapse`, `test/graph/fixtures.ts`'s `buildRenameHazardDocument`) proves this both ways (correct copy → clean; id-derived → ERROR), mutation-proven red-first (see the WP's commit history: the cross-check was temporarily disabled and the red case confirmed it goes RED, then restored). |
| registry↔bd | registry id | `edges.bd[].nodeId` | None known (PRD C5 says so explicitly) — `BdEdge` is the simplest edge type in the schema, deliberately. |
| registry↔fr | `evidence.artifact` path resolution + `graduates`/oracle ids | `edges.fr[]` (keyed by fr's own `cycle`, NOT by registry id) + `unresolved` (`edge:"fr"`) | Free-text `artifact` values (fr's `Evidence.artifact` is "a resolvable ref: repo-relative path \| registry id \| arXiv/DOI \| Lean lemma", per `../knowledge-frontier/src/types.ts`) — a fr cycle can name a string that resolves to zero registry nodes. `FrEdge.resolutionMethod: "unresolved"` is a first-class, EXPECTED value (M2.2's acceptance bar is a measured resolution rate, not 100%), and `checkUnresolvedBucketCompleteness` requires every such edge to have a companion `unresolved` bucket entry — never silently dropped. |
| registry↔report | shard label/id anchors | `edges.report[]` | Anchors are ids, not contracts (PRD C5) — `ReportEdge.anchor` is untyped free text on purpose; the schema does not attempt to validate anchor syntax, only presence/resolution. |

Conflicts are a fifth, cross-cutting concept, not a fifth edge: `ConflictRecord.edge` names WHICH
of the four edges above a disagreement concerns (e.g. a contract byte-mismatch is an `af`-edge
conflict; a banked-fr-claim-without-oracle-verdict is an `fr`-edge conflict). This WP reserves the
shape only; M2.3 is the WP that actually detects and populates conflicts.

## What is deliberately deferred

- **No store-reading code.** `src/graph/` has no fs/network/clock (L3) — there is no
  `readGraphFromRepo()` function yet. M2.2 builds the impure readers (`argument/**/*.md` shards,
  `af export --graph json` per workspace with a direct-ledger-JSON fallback, fr's `log.jsonl`,
  beads JSONL) that populate a `GraphDocument`; this WP only fixes what they populate INTO.
- **No conflict detection logic.** `ConflictRecord`'s shape is fixed (`kind` deliberately an open
  string, not a closed enum — see "Open questions" below); M2.3 writes the actual comparisons
  (registry-status vs af-epistemic-state, contract byte-mismatch, taint-vs-status, fr
  banked-without-oracle).
- **No render/terminal-view code.** M2.4 (`rk render`) and M2.5 (`rk graph --focus`/critical-path)
  consume a `GraphDocument`; this WP does not touch either.
- **No JSON-Schema-validator library.** `schemas/graph.v1.json` is hand-written and intended for
  external tooling / documentation / a future validator if one is ever wanted — CLAUDE.md L4
  (zero runtime deps) rules out vendoring `ajv` or similar to actually evaluate it at runtime.
  `src/graph/validate.ts` hand-codes the structural invariants the JSON Schema cannot express
  (referential integrity, unresolved-bucket completeness, canonical sort order) — it does NOT
  re-implement general JSON Schema evaluation (required-field/type/enum checking), which is
  covered by the TS type system at construction time for any producer written in TS, and is
  otherwise the schema file's job to document for non-TS consumers.
- **No `balloons` population.** `BalloonCounter` is present and zero-valued on every node from
  this WP on (PRD C9); only M3.6's `rk verify --af` balloon feedback loop ever writes a nonzero
  count or a classification.

## Determinism — how it is proven, not just asserted

`src/graph/serialize.ts`'s `serializeGraphDocument` is the single source of truth for a
`GraphDocument`'s identity bytes: canonicalize (sort every array by its own natural key — nodes
by `id`, af/bd/report edges by `nodeId`, fr edges by `cycle`, `deps`/`routes`/`defs` as sets),
then stringify with object keys sorted recursively, compact, no timestamp field anywhere (the
same stance `../vibefeld`'s af export v1 took, for the same reason: a `generated_at`-style field
is export-time metadata, not content). `test/graph/serialize.test.ts` proves this two ways: a
golden-file round-trip (`test/graph/fixtures/sample.canonical.json`, checked in) and a
determinism property test that reverses AND randomly shuffles (five seeds, plus one full
reversal) every array's element order and every object's key insertion order simultaneously,
asserting byte-identical output every time — plus one negative control (an actual content edit
DOES change the output, proving the test isn't vacuously trivial).

## Open questions for the Tier A reviewer

1. **`ConflictRecord.kind` as an open string vs. a closed enum.** Chosen open (just
   `minLength: 1`) so M2.3 can add a new conflict class without a `schema_version` bump
   (CLAUDE.md rule 10 reserves version bumps for actual SHAPE changes, and a new string literal
   in an open vocabulary is not a shape change). Is this the right call, or should the four
   PRD-named conflict kinds be a closed enum now, with `kind` explicitly documented as
   "closed as of v1, may need a v2 bump if M2.3 needs a class not yet imagined"? The tradeoff is
   schema strictness (closed enum catches a typo'd kind string at the schema-validation
   boundary, if a validator is ever wired up) vs. avoiding a premature version bump for an
   addition everyone already expects (M2.3 is the very next WP).
2. **`FrEdge` keyed by `cycle`, not by registry id or by `(cycle, artifact)`.** fr's own
   `log.jsonl` already treats `cycle` as record identity (`../knowledge-frontier/src/types.ts`'s
   `LogRecord.cycle`, "monotone index, 1-based"). One cycle could in principle name multiple
   candidate artifacts across its lifetime if a record is amended/superseded
   (`LogRecord.supersedes`) — this schema does not yet distinguish "the current fr record for
   this cycle" from "a superseded one." Should `FrEdge` carry a `supersedes`/`superseded_by`
   field explicitly, deferred to M2.2 once the actual resolution logic exists, or should M2.1
   reserve the field now even unpopulated (matching the `balloons` precedent)?
3. **`AfEdge.contractMatch` vs `resolved` as two separate booleans.** The design deliberately
   distinguishes "no af export was found for this workspace at all" (`resolved: false`, →
   `unresolved` bucket) from "an export was found but the contract no longer byte-matches"
   (`resolved: true, contractMatch: false`, → a conflict, M2.3). Is this the right split, or
   should a contract mismatch ALSO count as `resolved: false` (since the join, functionally,
   failed to produce a usable match)? The memo's position: keep them distinct, because the two
   failure modes have different remediations (unresolved → af workspace needs to be created/
   pointed at; mismatch → someone edited the contract or the af root and needs to reconcile) and
   collapsing them would make M2.3's conflict-vs-unresolved distinction impossible to express.
4. **Whether the rename-hazard test belongs under `corpus/graph/` instead of `test/graph/
   fixtures.ts`.** IMPLEMENTATION_PLAN.md M2.1's acceptance bar says "the rename hazard ... is a
   corpus fixture." The existing `corpus/<gate>/<id>/{repo,expected.json}` layout
   (`corpus/README.md`) is purpose-built for the six M0 gates driven through
   `src/corpus/run.ts`'s `Gate` harness (`rk check --selftest`) — there is no `Gate` for "graph"
   yet (M2.2 hasn't landed a store-reading pipeline a fixture repo could exercise), so this WP
   built the fixture as a plain TS document builder (`test/graph/fixtures.ts`'s
   `buildRenameHazardDocument`) instead, exercised directly by `test/graph/validate.test.ts`
   (mutation-proven red-first — see that file's "mutation guard" test and this memo's join-key
   table). Is that the right scoping call, or should `corpus/graph/graph-01/` be created now
   (with `repo/` fixture files + `expected.json`) even though nothing runs it through
   `rk check --selftest` yet, purely to keep the ledger consistent with `corpus/README.md`'s
   existing convention? This memo's position: defer the `corpus/graph/` directory to whichever of
   M2.2/M2.3 first builds a real "repo → GraphDocument" pipeline worth fixturing that way,
   since a fixture with no harness to run it through would be dead weight today.
5. **`RegistryNode` duplicates `Lemma` (src/gates/linker-parse.ts) rather than importing it.**
   Deliberate — `src/graph/` must stay decoupled from `src/gates/` (IMPLEMENTATION_PLAN.md §0
   lists them as siblings, not one depending on the other), and `Lemma` carries linker-specific
   fields/behavior (`owner`, parse-time optionality shaped around Gate 2's own error-recovery,
   e.g. `kind`/`status` being optional to tolerate a partially-broken shard mid-parse) that a
   clean projection type shouldn't inherit. Confirm this boundary is correct: should M2.2's store
   reader (which WILL import `linker-parse.ts`'s `parseRegistry`) be the only place a `Lemma` is
   ever converted to a `RegistryNode`, with the two types never unified?
