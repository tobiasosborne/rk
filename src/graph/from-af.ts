// PURITY: pure — no fs/network/clock (L3). registry↔af join (PRD C5): builds `AfEdge[]` + the
// af portion of the `unresolved` bucket from a `RegistryNode[]` and the raw `AfSourceRecord[]`
// src/store/af-load.ts collected (one attempted record per DISTINCT `workspace:` value named by
// some node with `af != "none"`). Keys EXCLUSIVELY on the node's own `workspace` field — never on
// `id` — per the rename-hazard discipline (bead rk-57t / rk-bsj, docs/memos/2026-07-19-graph-
// schema-v1.md): af records no rename-stable workspace id of its own, so the shard's declared
// `workspace:` is the only legitimate join key, copied byte-for-byte onto the edge.
//
// Every `RegistryNode` with `af != "none"` gets EXACTLY ONE edge (resolved or unresolved) —
// src/graph/validate-af.ts's af-evidence requirement (Tier A review blocker 1) is enforced HERE
// at construction time, not just checked afterward: a node with no matching `AfSourceRecord`, no
// declared `workspace`, or a record that failed to resolve all become an `UnresolvedAfEdge` plus a
// companion bucket entry — never a silently-missing edge.

import { AF_EPISTEMIC_STATES, AF_ROOT_NODE_ID, AF_TAINT_STATES } from "./types";
import type { AfEdge, RegistryNode, UnresolvedOtherRef } from "./types";

/** One workspace's af data, as src/store/af-load.ts collected it — either a real `af export
 * --graph json` document's root-node facts, a reduced-fidelity direct-ledger reconstruction
 * (`degraded: true`), or an explicit "not found" report. `workspace` is the repo-relative
 * `proofs/<name>` path this record answers for — the SAME string a node's own `workspace:` field
 * carries, copied without transformation. */
export interface AfSourceRecord {
  workspace: string;
  found: boolean;
  reason?: string;
  degraded?: boolean;
  schemaVersion?: string;
  rootNodeId?: string;
  rootStatement?: string;
  epistemicState?: string;
  taintState?: string;
  nodeCount?: number;
}

function unresolved(nodeId: string, workspace: string, reason: string): UnresolvedOtherRef {
  return { edge: "af", nodeId, ref: workspace, reason };
}

/** Builds the af edge + (when unresolved) bucket entry for one node, given the record collected
 * for its declared workspace (`undefined` when no record was even attempted — e.g. the node
 * declares no `workspace:` field at all, so there is nothing to look up). */
function buildOne(regNode: RegistryNode, record: AfSourceRecord | undefined): { edge: AfEdge; ref?: UnresolvedOtherRef } {
  const workspace = regNode.workspace ?? "";
  if (regNode.workspace === undefined) {
    const edge: AfEdge = { nodeId: regNode.id, workspace, workspaceResolved: false };
    return { edge, ref: unresolved(regNode.id, workspace, "node declares af != \"none\" but no workspace: field") };
  }
  if (record === undefined || !record.found) {
    const edge: AfEdge = { nodeId: regNode.id, workspace, workspaceResolved: false };
    const reason = record?.reason ?? `no af export found for workspace '${workspace}'`;
    return { edge, ref: unresolved(regNode.id, workspace, reason) };
  }

  const schemaVersion = record.schemaVersion ?? "";
  const rootOk = record.rootNodeId === AF_ROOT_NODE_ID;
  const epistemicState = (AF_EPISTEMIC_STATES as readonly string[]).includes(record.epistemicState ?? "")
    ? (record.epistemicState as (typeof AF_EPISTEMIC_STATES)[number])
    : undefined;
  const taintState = (AF_TAINT_STATES as readonly string[]).includes(record.taintState ?? "")
    ? (record.taintState as (typeof AF_TAINT_STATES)[number])
    : undefined;

  if (!rootOk || epistemicState === undefined || taintState === undefined || typeof record.nodeCount !== "number") {
    // The export was found but did not yield a well-formed root/state — cannot honestly claim
    // "resolved" (validate-af.ts's resolved-shape invariants would reject a partial record
    // anyway). Report unresolved with the specific reason rather than fabricating a state.
    const edge: AfEdge = { nodeId: regNode.id, workspace, workspaceResolved: false };
    const reason = !rootOk
      ? `af export root node id '${record.rootNodeId ?? ""}' != '${AF_ROOT_NODE_ID}'`
      : "af export returned an incomplete/unrecognized root-node state";
    return { edge, ref: unresolved(regNode.id, workspace, reason) };
  }

  const edge: AfEdge = {
    nodeId: regNode.id,
    workspace,
    workspaceResolved: true,
    afSchemaVersion: schemaVersion,
    afRootNodeId: AF_ROOT_NODE_ID,
    // M2-boundary-review blocker 5 (2026-07-19): graph v1 ratified a BYTE-match verdict at this
    // join boundary — exact string equality, no whitespace normalization. Gate 2's OWN contract
    // check (src/gates/*) may normalize for its own purposes; this projection boundary must not
    // reuse that older, looser check, or a whitespace-only difference silently suppresses the
    // mandatory contract-mismatch conflict.
    contractMatch: regNode.contract === (record.rootStatement ?? ""),
    epistemicState,
    taintState,
    nodeCount: record.nodeCount,
  };
  return { edge };
}

/** Builds every af edge (TOTAL over nodes with `af != "none"`) plus the af unresolved bucket.
 * `records` is looked up by `workspace` string, never by node `id` — the rename-hazard
 * discipline this whole module exists to enforce. */
export function buildAfEdges(
  nodes: readonly RegistryNode[],
  records: readonly AfSourceRecord[],
): { edges: AfEdge[]; unresolved: UnresolvedOtherRef[] } {
  const byWorkspace = new Map(records.map((r) => [r.workspace, r]));
  const edges: AfEdge[] = [];
  const refs: UnresolvedOtherRef[] = [];
  for (const node of nodes) {
    if (node.af === "none") continue;
    const record = node.workspace !== undefined ? byWorkspace.get(node.workspace) : undefined;
    const { edge, ref } = buildOne(node, record);
    edges.push(edge);
    if (ref) refs.push(ref);
  }
  return { edges, unresolved: refs };
}
