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
| registry↔fr | `evidence.artifact` path resolution + `graduates`/oracle ids | `edges.fr[]` (keyed by fr's own `cycle`, NOT by registry id) + `unresolved` (`edge:"fr"`, `sourceCycle` REQUIRED as of the repair wave — blocker 4 below) | Free-text `artifact` values (fr's `Evidence.artifact` is "a resolvable ref: repo-relative path \| registry id \| arXiv/DOI \| Lean lemma", per `../knowledge-frontier/src/types.ts`) — a fr cycle can name a string that resolves to zero registry nodes. `FrEdge.resolutionMethod: "unresolved"` is a first-class, EXPECTED value (M2.2's acceptance bar is a measured resolution rate, not 100%), and `src/graph/validate-fr.ts`'s `checkFrUnresolvedBucket` requires EXACT one-to-one accounting keyed on `(edge, sourceCycle, ref)` — never silently dropped, and never collapsed across two cycles sharing artifact text (the collapse bug the Tier A review caught; see "Review outcomes" below). |
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
- **No FULL conflict detection logic.** `ConflictRecord.kind` is now a CLOSED enum (see "Review
  outcomes" below — this changed from the open-string design originally proposed in "Open
  questions"), and `src/graph/validate-conflicts.ts` recomputes a MINIMAL subset of the four
  kinds (a `status:"proved"` node's af-edge consistency; an fr `outcome:"banked"` edge's
  oracle-verdict freshness) sufficient to make the Tier A review's own fixture pass. M2.3 is
  still the WP that builds the FULL detector against real repo/af/fr data (every status value,
  not just `"proved"`; every conflict-worthy state combination, not just the two triggers this
  WP's repair wave needed).
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

## Review outcomes (2026-07-19 repair wave)

Tier A codex (gpt-5.6-sol) review of commit `335d5e7` returned four MAJOR landing-blockers, all
validity semantics, plus five follow-ups and direct answers to all five open questions above.
ONE repair wave landed all four blockers with red fixtures (CLAUDE.md's anti-Zeno cap); this
section is that repair's record, not a re-review.

**Blocker 1 — af-evidence requirement.** Fixed: `AfEdge` is now a discriminated union on
`workspaceResolved` (`UnresolvedAfEdge` / `ResolvedAfEdge`, `src/graph/types-edges.ts`) —
`ResolvedAfEdge` makes `afSchemaVersion`/`afRootNodeId`/`contractMatch`/`epistemicState`/
`taintState`/`nodeCount` all MANDATORY at the type level. `src/graph/validate-af.ts`'s
`checkAfEdges` additionally enforces at runtime (a document assembled from untyped JSON bypasses
TS entirely) that every `RegistryNode` with `af != "none"` carries EXACTLY ONE af edge — zero is
an ERROR (`"has no edges.af entry"`), two is an ERROR (`"duplicate af edge"`), and an edge on an
`af:"none"` node is also an ERROR (the symmetric direction, added during repair). Red fixture:
`test/graph/fixtures.ts`'s `buildAfEvidenceDocument(false)` — the review's own scenario
(`status:"proved"`, `af:"validated"`, a workspace, zero `edges.af`) — verified in
`test/graph/validate.test.ts`'s "Tier A review blocker 1" describe block; green counterpart
`buildAfEvidenceDocument(true)`. Mutation-proven: the cardinality loop, the af:"none" check, and
the duplicate check were each disabled (`if (false && ...)`) and confirmed their tests go RED,
then restored byte-identical.

**Blocker 2 — contract match targets the af root only.** Fixed: `afNodeId` renamed to
`afRootNodeId`, typed as the string LITERAL `"1"` (`AF_ROOT_NODE_ID`) — af's hierarchical
numbering roots there unconditionally (`../vibefeld/docs/export-graph-v1.md`'s dotted-id scheme:
only `"1"` ever has no `parent_id`), so this is a mechanical proof, not a convention. Red fixture:
`buildAfRootMismatchDocument("1.2")` (an internal-lemma id) — needs one `as unknown as
GraphDocument` cast, documented inline, since a well-typed `ResolvedAfEdge` literally cannot
express a non-"1" `afRootNodeId`; the cast constructs the value anyway to prove
`src/graph/validate-af.ts`'s runtime check independently catches it. Green: `("1")`. Mutation-
proven (the `afRootNodeId !== AF_ROOT_NODE_ID` check disabled, confirmed RED, restored).

**Blocker 3 — conflict recomputation.** Fixed: `ConflictRecord.kind` closed to the four settled
kinds (memo question 1, answered below); `src/graph/validate-conflicts.ts` RECOMPUTES the
conflict set two triggers imply — `status:"proved"` nodes checked against their (now-mandatory)
af edge's `contractMatch`/`epistemicState`/`taintState`, and fr edges with `outcome:"banked"`
checked against `verdict`/`verdictFresh` (the fr shape gained `outcome`/`verdict`/`verdictFresh`/
`supersedes` fields for exactly this) — and ERRORs on a missing, duplicate, or inconsistent
recorded entry, plus an "unsupported" recorded entry backed by no real condition. Red fixture:
`buildProvedConflictDocument([])` — the review's own scenario (`proved` + `pending` epistemic +
`tainted` + `contractMatch:false` + `conflicts:[]`) — expects three missing-conflict ERRORs
(contract-mismatch, status-mismatch, taint-status-mismatch); green counterpart
`buildProvedConflictDocument(provedConflictRecords())`; plus dedicated duplicate/inconsistent/
unsupported/banked-without-oracle red+green pairs. Mutation-proven: `computeExpectedConflicts`
gutted to `return []`, confirmed exactly the seven conflict-dependent tests go RED (no others),
restored byte-identical. Scope stated honestly in `validate-conflicts.ts`'s header: this is the
MINIMAL recomputation the fixture requires, not M2.3's full detector — a documented known
limitation (two banked-without-oracle-eligible fr edges resolving to the same node would
collapse under one identity) is left for M2.3, not silently inherited as if it were solved.

**Blocker 4 — fr unresolved exact accounting.** Fixed: `FrEdge` and `UnresolvedRef` are each
discriminated unions (`resolutionMethod` / `edge`) — `resolvedNodeId` is a compile-time error on
an unresolved `FrEdge`, and `sourceCycle` is compile-time REQUIRED on an `edge:"fr"`
`UnresolvedRef`. `src/graph/validate-fr.ts` additionally runtime-checks (untyped-JSON backstop)
exact one-to-one accounting keyed on `(edge:"fr", sourceCycle, ref:artifact)` — never `(edge,
ref)` alone, which is exactly the collapse bug. Red fixtures: `buildFrCollapseDocument("one")`
(two distinct unresolved cycles, 5 and 9, naming the identical artifact text, only cycle 5's
bucket entry present — cycle 9's silently missing) with green counterpart `("two")`;
`buildFrGhostDocument()` (a resolved fr edge naming `resolvedNodeId:"lem-ghost"`, not a real
node). A third bonus red fixture (resolvedNodeId present on an unresolved edge, via cast) proves
the runtime backstop for the compile-time-forbidden case too. Mutation-proven: the
`resolvedNodeId` referential-integrity + forbidden-on-unresolved checks disabled (confirmed both
their tests RED), then the bucket key narrowed back to `(edge, ref)` (confirmed the collapse-case
test RED, plus expected collateral on tests sharing that fixture), then everything restored
byte-identical.

**Follow-ups folded into this wave (batched, plain fixes per CLAUDE.md's tiering — not
landing-blockers):**
- **(a) Total tie-breakers.** `src/graph/serialize.ts`'s every sort (`af`/`bd`/`fr`/`report`
  edges, `unresolved`, `conflicts`, `nodes`) now falls back to `fullTiebreak` — a comparison over
  the COMPLETE canonicalized JSON text of the two elements — after its own primary key(s), so two
  entries tied on their natural key (e.g. two `bd` edges sharing `nodeId`, or two `conflicts`
  sharing `kind`+`edge`+`nodeId`) still serialize deterministically regardless of input order.
  `test/graph/serialize.test.ts` gained a dedicated describe block with tied-`bd` and
  tied-`conflicts` fixtures proving order-independence plus one negative control.
- **(b) Canonical-order validation scope.** `checkCanonicalNodeOrder` (nodes only) replaced by
  `checkCanonicalForm`, which compares EVERY array in the document (nodes, all four edge arrays,
  `unresolved`, `conflicts`) against `canonicalizeGraphDocument`'s own output — the single source
  of truth for "canonical" can never drift from what the serializer actually produces. Test
  added: an out-of-order `edges.bd` array is now flagged, not just out-of-order `nodes`.
- **(c) Memo answers.** See directly below — question 1 (closed enum, adopted), question 2
  (`supersedes?: number` reserved raw, no `supersededBy` mirror, adopted), question 5 (keep
  `RegistryNode`/`Lemma` separate, M2.2 the total conversion boundary, confirmed as designed —
  no code change needed). Question 3 renamed rather than re-decided (see below). Question 4's
  own answer (keep the unit fixture, no dead `corpus/graph/` directory yet) is unchanged, but
  the review adds: M2.2 must still add a REAL repo-level rename-hazard corpus fixture before
  reader acceptance — tracked, not actioned in this wave (M2.2 has not started).

**Review-follow-ups NOT folded into this wave** (tracked for later WPs, per the coordinator's
explicit scope — this repair wave addressed only blockers 1–4 plus (a)/(b)/(c) above):
content-addressing digest (review follow-up 3, a hash of `serializeGraphDocument`'s bytes stored
OUTSIDE the hashed document — M2.2/M2.4 territory), the af-workspace/proof-provenance drill-down
section C6 will need (review follow-up 4 — M2.4 territory), and the real repo-level rename-hazard
corpus fixture (review follow-up 5 — M2.2's acceptance bar, not M2.1's).

**Memo question 1 — conflict vocabulary: ANSWERED, adopted.** Closed enum
(`CONFLICT_KINDS`/`ConflictKind`, four settled kinds). A new conflict class needs a
`schema_version` bump; typo tolerance was the wrong tradeoff on a validity surface. `kind`'s
schema/type both changed from open string to closed enum.

**Memo question 2 — fr identity and supersession: ANSWERED, adopted.** `cycle` stays record
identity (unchanged). `FrEdgeBase` gained `supersedes?: number` (raw cycle reference, no
`supersededBy` mirror stored — a consumer derives "is this cycle superseded" by scanning for
another edge's `supersedes` pointing at it). Superseded evidence must not be promotion-bearing;
`validate-conflicts.ts`'s banked-without-oracle computation does not yet filter on this (M2.2/
M2.3 territory once real fr data exists to filter), but the field is reserved now, matching the
`balloons` precedent.

**Memo question 3 — `resolved` vs `contractMatch`: ANSWERED, renamed not re-decided.** The
distinction is kept (as the memo argued), but `resolved` is renamed to `workspaceResolved`
throughout (`AfEdge`'s discriminant) — a found workspace with a root contract mismatch is
workspace-resolved storage PLUS `contractMatch:false` and now a MANDATORY conflict record
(blocker 3's recomputation enforces this), never an unresolved-bucket item. This is a naming/
enforcement fix, not a reversal of the memo's original design call.

**Memo question 4 — fixture placement: ANSWERED, confirmed.** Keep the pure unit fixture now; no
dead `corpus/graph/` directory without a reader harness. M2.2 must add the real repo-level rename
fixture before reader acceptance (tracked as a review follow-up, not actioned here).

**Memo question 5 — `RegistryNode` vs `Lemma`: ANSWERED, confirmed.** Keep the interfaces
separate; M2.2 is the explicit, total conversion boundary. No code change was needed — this WP's
original design call stands.

## Addendum (2026-07-19, M2 boundary review repair wave)

The M2 boundary review (scratch: m2-boundary-review.md; single review round per the
anti-Zeno cap) prescribed five semantic corrections to the join/conflict layer, all landed
and mutation-proven (commits dc626d0, 97e58be, 93d00a2, 5f3903c, 70e5391, c4c0f0a):

- Contract matching at the registry↔af boundary is BYTE-exact (`===`), never
  whitespace-normalized — Gate 2's older normalized check is not reused here (blocker 5).
- Oracle-backing requires `verdictFresh === true`; `undefined` (freshness unrecomputable,
  e.g. ledger fallback) is NOT fresh (blocker 6).
- Cycles named in any edge's `supersedes` field are excluded from promotion/conflict
  computation; superseded edges remain visible in `edges.fr` (blocker 7).
- `banked-without-oracle` is ONE node-level existential conflict: qualifying cycles are
  coalesced per resolved node at assembly (identity stays `(kind, edge, nodeId)`, no schema
  bump — review verdict (c); graph v2 may revisit with a cycle-aware identity, bead rk-tns
  closed on this basis).
- fr reader accounting: `totalLogRecords` counts raw nonblank lines; malformed lines are
  carried as structural diagnostics, feeding `BuildDiagnostics.structuralLoss` and the
  `isStructurallyComplete` flag that `rk render`/`rk graph` now refuse to render past
  (blockers 9 and 2).
