// PURITY: pure — no fs/network/clock (L3). Edge types for `GraphDocument` (src/graph/types.ts),
// split out to stay clear of CLAUDE.md's 280-line shard cap — re-exported from types.ts so
// callers keep ONE import surface ("./types"), the same pattern src/gates/linker-graph.ts uses
// for linker-workspace.ts. Ground truth: PRD C5's per-edge join-key table, plus the M2.1 Tier A
// review's four landing-blocker repairs (2026-07-19) — see docs/memos/2026-07-19-graph-schema-
// v1.md's "review outcomes" section for the full rationale behind each discriminated union here.

interface AfEdgeBase {
  nodeId: string;
  /** Copied from the owning node's own `workspace:` field — MUST be byte-identical to it
   * (src/graph/validate.ts's rename-hazard cross-check). */
  workspace: string;
}

/** No af export was found for `workspace` at all. MUST carry a companion entry in the top-level
 * `unresolved` array (edge:"af", nodeId, ref:workspace) — never a silent drop (PRD C5). Carries
 * NONE of the resolved-only fields (enforced by the union — see `ResolvedAfEdge`). */
export interface UnresolvedAfEdge extends AfEdgeBase {
  workspaceResolved: false;
}

/** The af hierarchical node id that is UNCONDITIONALLY the root of any af export
 * (../vibefeld/docs/export-graph-v1.md's Node table: ids are dotted, `1`/`1.2`/`1.2.3`...; only
 * `1` ever has no `parent_id`). Tier A review blocker 2: contract byte-match must target the
 * root's `statement` ONLY, never an internal lemma or `workspace.conjecture` — encoding the
 * literal here lets src/graph/validate.ts (and schemas/graph.v1.json's `const`) catch an
 * internal-node match mechanically, with no need to carry af's whole node tree into this
 * summary edge. */
export const AF_ROOT_NODE_ID = "1";

export const AF_EPISTEMIC_STATES = [
  "pending", "validated", "admitted", "refuted", "archived", "needs_refinement", "draft",
] as const;
export type AfEpistemicState = (typeof AF_EPISTEMIC_STATES)[number];

export const AF_TAINT_STATES = ["clean", "self_admitted", "tainted", "unresolved"] as const;
export type AfTaintState = (typeof AF_TAINT_STATES)[number];

/** An af export WAS found for `workspace`. Every field here is MANDATORY the moment
 * `workspaceResolved` is true (Tier A review blocker 1: "resolved workspace requires af schema
 * version, root-node identity, contract-match verdict, enumerated epistemic/taint states, and
 * node count" — a renderer must never be able to paint a "resolved" edge with missing evidence). */
export interface ResolvedAfEdge extends AfEdgeBase {
  workspaceResolved: true;
  /** The af export document's own `schema_version` (../vibefeld/docs/export-graph-v1.md),
   * echoed for traceability — NOT this document's `schema_version`. */
  afSchemaVersion: string;
  /** MUST equal `AF_ROOT_NODE_ID` ("1") — af's hierarchical numbering roots there
   * unconditionally, so this field's presence is a mechanical proof the byte-match target was
   * the export's actual root, never a descendant lemma and never `workspace.conjecture` (Tier A
   * review blocker 2). A value other than "1" is not "some other legitimate root" — af has
   * exactly one root and it is always id "1" by construction of the hierarchical scheme. */
  afRootNodeId: typeof AF_ROOT_NODE_ID;
  /** Byte-match verdict between the registry `contract` and the root node's `statement`.
   * MANDATORY (not optional) once `workspaceResolved` — "resolved storage, mismatched contract"
   * is a real, representable state (Tier A review blocker 3, memo answer 3: rename `resolved` to
   * `workspaceResolved`; a found workspace with a root mismatch is workspace-resolved storage
   * PLUS `contractMatch:false` and a MANDATORY conflict record, never an unresolved-bucket
   * item). */
  contractMatch: boolean;
  epistemicState: AfEpistemicState;
  taintState: AfTaintState;
  /** af export's `validation.total_nodes` for this workspace. */
  nodeCount: number;
}

/** registry↔af: contract byte-match, LOCATED VIA the shard's `workspace:` field (never the
 * registry id — see `RegistryNode.workspace`), targeting ONLY the af export's root node
 * (`AF_ROOT_NODE_ID`), never `workspace.conjecture` and never a descendant. Every `RegistryNode`
 * with `af != "none"` MUST have EXACTLY ONE `AfEdge` naming it (src/graph/validate.ts's
 * af-evidence requirement, Tier A review blocker 1) — a proved/validated node with zero af
 * evidence is a validation ERROR, not a silently-accepted gap. */
export type AfEdge = UnresolvedAfEdge | ResolvedAfEdge;

/** registry↔bd: registry id IS the bd issue key (linker-synced issues) — the one edge with no
 * hazard on record (PRD C5). */
export interface BdEdge {
  nodeId: string;
  issueId?: string;
  status?: string;
  resolved: boolean;
}

interface FrEdgeBase {
  cycle: number;
  artifact: string;
  oracleId?: string;
  /** fr's own outcome for this cycle (open vocabulary, mirrors
   * ../knowledge-frontier/src/types.ts's `Outcome`) — needed to compute the
   * "banked-without-oracle" conflict class (Tier A review blocker 3). Absent iff the M2.2 reader
   * has not yet threaded fr's outcome through (a legitimate day-1 gap, not a violation on its
   * own — only an `outcome === "banked"` value drives the conflict computation). */
  outcome?: string;
  /** fr's own `evidence.verdict` for this cycle, when evidence is present (mirrors
   * ../knowledge-frontier's `Verdictish`: "claimed" | "audited" | "banked"). */
  verdict?: string;
  /** Whether `verdict` is still FRESH (non-stale) at projection time — fr's own hash-bound
   * verdict staleness check (`oracle.ts`'s `isStale`), resolved by the M2.2 reader. `undefined`
   * when `verdict` is absent. */
  verdictFresh?: boolean;
  /** cycle of a prior fr record this one supersedes (mirrors
   * ../knowledge-frontier/src/types.ts's `LogRecord.supersedes` — raw, no `supersededBy` mirror
   * stored here; a consumer derives "is this cycle superseded" by scanning for another edge's
   * `supersedes` pointing at it, per the Tier A review's memo answer 2). Superseded evidence is
   * never promotion-bearing (banked-without-oracle computation ignores a superseded cycle). */
  supersedes?: number;
}

/** No candidate registry node resolved for this fr cycle's artifact string AT ALL. MUST carry a
 * companion `unresolved` bucket entry keyed on `(edge:"fr", sourceCycle:cycle, ref:artifact)` —
 * Tier A review blocker 4: two distinct unresolved cycles naming the same artifact text are two
 * DISTINCT bucket entries, never collapsed into one. */
export interface UnresolvedFrEdge extends FrEdgeBase {
  resolutionMethod: "unresolved";
}

/** A candidate registry node WAS resolved for this fr cycle. `resolvedNodeId` is MANDATORY here
 * (never present on `UnresolvedFrEdge` — the union enforces this) and MUST reference a real node
 * in this document (src/graph/validate.ts referential-integrity check). */
export interface ResolvedFrEdge extends FrEdgeBase {
  resolutionMethod: "path" | "graduates" | "oracle";
  resolvedNodeId: string;
}

/** registry↔fr: `evidence.artifact` path resolution + `graduates`/oracle ids (PRD C5). Keyed by
 * fr's own `cycle` (fr's log.jsonl identity — see ../knowledge-frontier/src/types.ts's
 * `LogRecord`), NOT by registry id: one fr cycle resolves to zero or one registry node, and that
 * resolution is itself the fact being recorded. Free-text `artifact` values are the hazard the
 * PRD names explicitly; `resolutionMethod: "unresolved"` is expected to be common on a real
 * campaign's early history, not a bug (M2.2's acceptance bar measures the resolution rate, it
 * does not assume 100%). */
export type FrEdge = UnresolvedFrEdge | ResolvedFrEdge;

/** registry↔report: shard label/id anchors, as check-provenance.py's own anchor resolution does
 * today (PRD C5) — anchors are ids, not contracts. */
export interface ReportEdge {
  nodeId: string;
  anchor: string;
  resolved: boolean;
}

interface UnresolvedRefBase {
  /** The raw reference text that failed to resolve — a workspace path (af), a registry id
   * (bd), a free-text artifact string (fr), or an anchor (report). */
  ref: string;
  reason: string;
  /** The registry node this unresolved lookup was attempted FROM, when known (absent for an fr
   * cycle whose artifact string named no candidate node at all). */
  nodeId?: string;
}

/** fr's unresolved bucket entries MUST carry `sourceCycle` (Tier A review blocker 4) — it is the
 * only field that lets two unresolved cycles naming the identical artifact text stay two
 * distinct entries instead of collapsing into one. */
export interface UnresolvedFrRef extends UnresolvedRefBase {
  edge: "fr";
  sourceCycle: number;
}

export interface UnresolvedOtherRef extends UnresolvedRefBase {
  edge: "af" | "bd" | "report";
}

/** The first-class unresolved-reference bucket (PRD C5: "expect a real unresolved-reference
 * bucket, surfaced as its own view, never silently dropped"). Every edge kind's failed lookups
 * land here; src/graph/validate.ts cross-checks EXACT one-to-one accounting against each edge
 * array's own resolution flag — af/bd/report keyed by `(edge, nodeId)` (an edge names exactly
 * one node), fr keyed by `(edge, sourceCycle, ref)` (a cycle may repeat an artifact string
 * another cycle also failed to resolve; the two attempts stay distinct rows). */
export type UnresolvedRef = UnresolvedFrRef | UnresolvedOtherRef;

/** The four closed conflict kinds, settled by the Tier A review (memo question 1: a closed enum,
 * not an open string — "typo tolerance is the wrong tradeoff on a validity surface"; a new
 * conflict class needs a `schema_version` bump, not a silent vocabulary extension). */
export const CONFLICT_KINDS = [
  "status-mismatch", "contract-mismatch", "taint-status-mismatch", "banked-without-oracle",
] as const;
export type ConflictKind = (typeof CONFLICT_KINDS)[number];

/** A first-class conflict — registry-status vs af-epistemic-state disagreement
 * (`status-mismatch`), contract byte-mismatch (`contract-mismatch`), taint vs status
 * inconsistency (`taint-status-mismatch`), fr banked-claim without a fresh oracle verdict
 * (`banked-without-oracle`). src/graph/validate.ts RECOMPUTES the set of conflicts these four
 * classes imply from the raw node/edge data and ERRORs on a missing, duplicate, or inconsistent
 * recorded entry — a conflict-class document invariant, not a reserved-for-later shape (Tier A
 * review blocker 3). Conflicts render as first-class defects and are NEVER auto-resolved
 * (PRD C5). */
export interface ConflictRecord {
  kind: ConflictKind;
  edge: "af" | "bd" | "fr" | "report";
  nodeId?: string;
  registryValue?: string;
  otherValue?: string;
  message: string;
}

export interface GraphEdges {
  af: AfEdge[];
  bd: BdEdge[];
  fr: FrEdge[];
  report: ReportEdge[];
}
