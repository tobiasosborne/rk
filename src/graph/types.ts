// PURITY: pure — no fs/network/clock (L3). Shared TS types mirroring `schemas/graph.v1.json` —
// rk's unified projection graph document (PRD C5, IMPLEMENTATION_PLAN.md M2.1). The registry
// (argument/**/*.md shards, src/gates/linker-parse.ts's `Lemma`) is the spine; `edges.{af,bd,fr,
// report}` are the four PER-EDGE joins from the PRD C5 table — there is no universal join key,
// do not invent one (CLAUDE.md §5). `unresolved` is the first-class bucket every edge kind
// reports into when a lookup fails to resolve (never a silent drop, CLAUDE.md L2); `conflicts`
// is the first-class defect record M2.3 populates — this WP (M2.1) only reserves the shape.
//
// Determinism (docs/memos/2026-07-19-graph-schema-v1.md + schemas/graph.v1.json
// "Determinism"): two GraphDocuments describing the same projected state serialize to the SAME
// bytes via src/graph/serialize.ts — sorted object keys, nodes sorted by id, every edge array
// sorted by its own natural key, no timestamp field anywhere in this file. af's own v1 export
// (../vibefeld/docs/export-graph-v1.md) took the same stance: a `generated_at`-style field is
// export-time metadata, not content, and is deliberately absent from identity-bearing structure.
// rk's graph document follows the same discipline for the same reason — a round-trip test must
// see byte-identical output across two exports of unchanged state.

export const GRAPH_SCHEMA_VERSION = "1";

// ---------------------------------------------------------------------------------------
// The registry spine
// ---------------------------------------------------------------------------------------

/** Layer-1 result kinds — mirrors src/gates/linker-parse.ts's `KINDS` set exactly (one
 * registry, one enum, never two competing lists to drift apart). */
export const REGISTRY_KINDS = [
  "lemma", "proposition", "theorem", "corollary", "open-problem", "obstruction",
] as const;
export type RegistryKind = (typeof REGISTRY_KINDS)[number];

/** The rigour ladder (PRD §5), minus the Lean rung (D5) — mirrors linker-parse.ts's
 * `MATH_STATUS` set. */
export const RIGOUR_STATUSES = [
  "cited", "proved", "consensus", "proved-mod-audit", "stated", "conjecture", "heuristic",
  "numerical", "open", "obstruction", "disproved",
] as const;
export type RigourStatus = (typeof RIGOUR_STATUSES)[number];

/** The registry's own af flag (frontmatter `af:` field) — a coarse tri-state, distinct from
 * af's own richer `epistemic_state`/`taint_state` axes carried on `AfEdge` below. */
export const AF_FLAGS = ["none", "seeded", "validated"] as const;
export type AfFlag = (typeof AF_FLAGS)[number];

/** PRD C9 / M3.6 (`rk verify --af`) balloon-event classifications. */
export const BALLOON_CLASSIFICATIONS = ["missing-fact", "dag-dep", "genuine-gap"] as const;
export type BalloonClassification = (typeof BALLOON_CLASSIFICATIONS)[number];

/** Reserved counter (PRD C9 / M3.6 balloon feedback loop): present and zero-valued from M2.1 on,
 * populated only once M3.6 lands. Never absent on a `RegistryNode` — a reader should never need
 * an `undefined` check just to answer "has this contract ever ballooned." */
export interface BalloonCounter {
  count: number;
  classifications: BalloonClassification[];
}

/** One registry shard (argument/**\/*.md), the graph's spine node. Mirrors
 * src/gates/linker-parse.ts's `Lemma` field-for-field where a field already exists there — the
 * graph projection layer is read-only over the SAME ground truth (PRD D1: "no shared ledger"),
 * it does not invent a parallel registry model. */
export interface RegistryNode {
  id: string;
  kind: RegistryKind;
  /** repo-relative path to this shard's own file (e.g. "argument/lemmas/lem-x.md" or
   * "argument/lem-x.md", the dogfood-1 root-level shape) — never a join key itself; `id` and
   * `workspace` are. */
  path: string;
  status?: RigourStatus;
  contract: string;
  owner?: string;
  /** THE join key into af (registry↔af edge, PRD C5): the shard's raw `workspace:` frontmatter
   * value, e.g. "proofs/lem-x". Absent iff the shard never declared one (linker check 10 flags
   * that as an orphan when `af != "none"`). Deliberately NOT assumed equal to `id` — af
   * workspace directories can be renamed independently of the registry id
   * (../vibefeld/docs/export-graph-v1.md's `workspace.id` note: af records no rename-stable
   * identifier of its own). A consumer keys off THIS field, never off `id` or any derived guess
   * — see the rename-hazard fixture in test/graph/ and `AfEdge` below. */
  workspace?: string;
  af: AfFlag;
  /** AND-edges: registry ids this node unconditionally depends on. Semantically a SET (dep
   * order carries no meaning — src/graph/serialize.ts canonicalizes by sorting it). */
  deps: string[];
  /** OR-groups: each inner array is one route (AND, conjunction of its members); the outer
   * array is the disjunction (any one route suffices). `[]` when the shard declares no routes
   * (aism-3ne backward-compat: byte-identical to a deps-only shard). Both levels are sets. */
  routes: string[][];
  /** Layer-0 definitions/*.md ids this node cites. */
  defs: string[];
  balloons: BalloonCounter;
}

// ---------------------------------------------------------------------------------------
// Edges — PRD C5's per-edge join-key table. No universal join key; each edge keys differently.
// ---------------------------------------------------------------------------------------

/** registry↔af: contract byte-match, LOCATED VIA the shard's `workspace:` field (never the
 * registry id — see `RegistryNode.workspace`). `workspace` is copied here from the owning node
 * for join-locality (a consumer filtering `edges.af` never has to re-join against `nodes` just
 * to learn which directory it means) — src/graph/validate.ts cross-checks the copy never drifts
 * from the node's own field. Contract byte-match target is af's `nodes[].statement`, NEVER
 * `workspace.conjecture` (../vibefeld/docs/export-graph-v1.md: the conjecture field can go
 * stale post-init; the root statement is amendable and is the live truth). */
export interface AfEdge {
  nodeId: string;
  workspace: string;
  /** true iff an af export was found for `workspace` AND its contract byte-matched some node's
   * `statement` in that export. false must always carry a companion `unresolved` bucket entry
   * (edge:"af", ref:workspace) — never a silent drop (PRD C5). */
  resolved: boolean;
  /** Which af node's `statement` matched, when resolved (usually "1", the root — af nodes are
   * hierarchical, so a match need not be the root). */
  afNodeId?: string;
  /** Explicit byte-match verdict, independent of `resolved`: a workspace can resolve (an export
   * was found) while its statement no longer matches — that is a CONFLICT (M2.3), not an
   * unresolved reference; the two failure shapes are deliberately distinguishable. */
  contractMatch?: boolean;
  epistemicState?: string;
  taintState?: string;
  /** af export's `validation.total_nodes` for this workspace, when resolved. */
  nodeCount?: number;
  /** The af export document's own `schema_version` (../vibefeld/docs/export-graph-v1.md),
   * echoed for traceability — NOT this document's `schema_version`. */
  afSchemaVersion?: string;
}

/** registry↔bd: registry id IS the bd issue key (linker-synced issues) — the one edge with no
 * hazard on record (PRD C5). */
export interface BdEdge {
  nodeId: string;
  issueId?: string;
  status?: string;
  resolved: boolean;
}

/** registry↔fr: `evidence.artifact` path resolution + `graduates`/oracle ids (PRD C5). Keyed by
 * fr's own `cycle` (fr's log.jsonl identity — see ../knowledge-frontier/src/types.ts's
 * `LogRecord`), NOT by registry id: one fr cycle resolves to zero or one registry node, and that
 * resolution is itself the fact being recorded. Free-text `artifact` values are the hazard the
 * PRD names explicitly; `resolutionMethod: "unresolved"` is expected to be common on a real
 * campaign's early history, not a bug (M2.2's acceptance bar measures the resolution rate, it
 * does not assume 100%). */
export interface FrEdge {
  cycle: number;
  artifact: string;
  resolvedNodeId?: string;
  resolutionMethod: "path" | "graduates" | "oracle" | "unresolved";
  oracleId?: string;
}

/** registry↔report: shard label/id anchors, as check-provenance.py's own anchor resolution does
 * today (PRD C5) — anchors are ids, not contracts. */
export interface ReportEdge {
  nodeId: string;
  anchor: string;
  resolved: boolean;
}

/** The first-class unresolved-reference bucket (PRD C5: "expect a real unresolved-reference
 * bucket, surfaced as its own view, never silently dropped"). Every edge kind's failed lookups
 * land here; `(edge, ref)` is the key src/graph/validate.ts cross-checks for completeness
 * against each edge array's own `resolved`/`resolutionMethod` flag. */
export interface UnresolvedRef {
  edge: "af" | "bd" | "fr" | "report";
  /** The raw reference text that failed to resolve — a workspace path (af), a registry id
   * (bd), a free-text artifact string (fr), or an anchor (report). */
  ref: string;
  reason: string;
  /** The registry node this unresolved lookup was attempted FROM, when known (absent for an fr
   * cycle whose artifact string named no candidate node at all). */
  nodeId?: string;
  /** fr's own cycle number, when `edge === "fr"` — lets a consumer jump straight to the log
   * record without re-deriving it from `ref`. */
  sourceCycle?: number;
}

/** A first-class conflict — registry-status vs af-epistemic-state disagreement, contract
 * byte-mismatch, taint vs status inconsistency, fr banked-claim without oracle verdict (PRD C5).
 * M2.3 populates these; this WP (M2.1) only reserves the shape. `kind` is deliberately an open
 * string, not a closed enum: a new M2.3 conflict class must never force a schema_version bump
 * (CLAUDE.md rule 10 reserves version bumps for actual shape changes) — see the design memo's
 * open questions for the reviewer. Conflicts render as first-class defects and are NEVER
 * auto-resolved (PRD C5). */
export interface ConflictRecord {
  /** Open vocabulary; known values as of M2.1 (populated starting M2.3): "status-mismatch",
   * "contract-mismatch", "taint-status-mismatch", "banked-without-oracle". */
  kind: string;
  edge: "af" | "bd" | "fr" | "report";
  nodeId?: string;
  registryValue?: string;
  otherValue?: string;
  message: string;
}

// ---------------------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------------------

export interface GraphEdges {
  af: AfEdge[];
  bd: BdEdge[];
  fr: FrEdge[];
  report: ReportEdge[];
}

/** The top-level unified projection graph document — `schemas/graph.v1.json`'s runtime mirror.
 * Read-only, deterministic, stateless (PRD C5 / D1). Producers canonicalize + serialize via
 * src/graph/serialize.ts; src/graph/validate.ts checks structural invariants the JSON Schema
 * itself cannot express (referential integrity, unresolved-bucket completeness, canonical
 * order). */
export interface GraphDocument {
  schema_version: typeof GRAPH_SCHEMA_VERSION;
  nodes: RegistryNode[];
  edges: GraphEdges;
  unresolved: UnresolvedRef[];
  conflicts: ConflictRecord[];
}
