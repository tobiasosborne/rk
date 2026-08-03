// PURITY: pure — no fs/network/clock (L3). Shared TS types mirroring `schemas/graph.v1.json` —
// rk's unified projection graph document (PRD C5, IMPLEMENTATION_PLAN.md M2.1). The registry
// (argument/**/*.md shards, src/gates/linker-parse.ts's `Lemma`) is the spine, defined here;
// `edges.{af,bd,fr,report}` (the four PER-EDGE joins from the PRD C5 table — there is no
// universal join key, do not invent one, CLAUDE.md §5), `unresolved` (the first-class bucket
// every edge kind reports into when a lookup fails to resolve, never a silent drop, CLAUDE.md
// L2), and `conflicts` (the first-class defect record, closed to four settled kinds) live in
// ./types-edges.ts, re-exported below so callers keep ONE import surface ("./types") — split out
// only to stay clear of CLAUDE.md's 280-line shard cap, same pattern src/gates/linker-graph.ts
// uses for linker-workspace.ts.
//
// Determinism (docs/memos/2026-07-19-graph-schema-v1.md + schemas/graph.v1.json
// "Determinism"): two GraphDocuments describing the same projected state serialize to the SAME
// bytes via src/graph/serialize.ts — sorted object keys, nodes sorted by id, every edge array
// sorted by its own natural key PLUS a full-value tie-breaker (Tier A review follow-up 1), no
// timestamp field anywhere in this file. af's own v1 export
// (../vibefeld/docs/export-graph-v1.md) took the same stance on timestamps; rk's graph document
// follows the same discipline for the same reason — a round-trip test must see byte-identical
// output across two exports of unchanged state.

export {
  AF_EPISTEMIC_STATES, AF_ROOT_NODE_ID, AF_TAINT_STATES, CONFLICT_KINDS,
} from "./types-edges";
export type {
  AfEdge, AfEpistemicState, AfTaintState, BdEdge, ConflictKind, ConflictRecord, FrEdge,
  GraphEdges, ReportEdge, ResolvedAfEdge, ResolvedFrEdge, RetractionEdge, RetractionHashDomain,
  UnresolvedAfEdge, UnresolvedFrEdge, UnresolvedFrRef, UnresolvedOtherRef, UnresolvedRef,
} from "./types-edges";

import type { GraphEdges, UnresolvedRef, ConflictRecord } from "./types-edges";

/** Bumped "1" -> "2" by rk-0ehr / P1 (CLAUDE.md rule 10 — a schema change is a compat event): the
 * closed `conflictKind` enum gains `retraction-vs-status`, `ConflictRecord.edge` and the
 * `unresolved` bucket's `edge` gain `"retraction"`, and `edges` gains a fifth array. The file name
 * `schemas/graph.v1.json` is deliberately unchanged — its `$id`/filename track the schema FAMILY,
 * the `schema_version` const inside tracks the version — flagged for the Tier A review in this
 * branch's SHARED-EDITS.md rather than resolved unilaterally. */
export const GRAPH_SCHEMA_VERSION = "2";

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
 * af's own richer `epistemic_state`/`taint_state` axes carried on `AfEdge` (./types-edges.ts). */
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
 * it does not invent a parallel registry model. Kept deliberately SEPARATE from `Lemma` (never
 * unified) — Tier A review, memo question 5: `Lemma` carries linker-specific parse-recovery
 * shape (fields optional to tolerate a partially-broken shard mid-parse); `src/graph` must not
 * depend on gate-parser recovery types. M2.2's store reader is the ONE place a `Lemma` is ever
 * converted to a `RegistryNode`. */
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
   * — see the rename-hazard fixture in test/graph/ and `AfEdge` (./types-edges.ts). */
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

/** The top-level unified projection graph document — `schemas/graph.v1.json`'s runtime mirror.
 * Read-only, deterministic, stateless (PRD C5 / D1). Producers canonicalize + serialize via
 * src/graph/serialize.ts; src/graph/validate.ts checks structural invariants the JSON Schema
 * itself cannot express (referential integrity, unresolved-bucket exact accounting, conflict
 * recomputation, canonical form). */
export interface GraphDocument {
  schema_version: typeof GRAPH_SCHEMA_VERSION;
  nodes: RegistryNode[];
  edges: GraphEdges;
  unresolved: UnresolvedRef[];
  conflicts: ConflictRecord[];
}
