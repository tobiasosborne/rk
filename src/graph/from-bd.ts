// PURITY: pure — no fs/network/clock (L3). registry↔bd join (PRD C5): "registry id IS the bd
// issue key (linker-synced issues) — the one edge with no hazard on record." A `BdEdge` is
// created ONLY for a registry node whose `id` matches a real bd issue's `id` (a linker-synced
// issue is opt-in — most bd issues in a real campaign are unrelated project-management bookkeeping
// with no registry counterpart at all, confirmed empirically against AISM's own `.beads/
// issues.jsonl`: zero of its 173 issue ids match any of its 200 registry ids). A node with no
// matching issue gets no edge and no unresolved-bucket entry — there is nothing declared on the
// registry side (unlike af's `workspace:` field) that says a bd issue SHOULD exist, so "no issue"
// is not a failure mode this edge kind reports on.

import type { BdEdge, RegistryNode } from "./types";

export interface BdSourceRecord {
  id: string;
  status?: string;
}

/** One resolved `BdEdge` per registry node whose `id` matches a real bd issue's `id`, exact
 * string match (the join key, PRD C5). Never produces an unresolved bd edge — see file header. */
export function buildBdEdges(nodes: readonly RegistryNode[], records: readonly BdSourceRecord[]): BdEdge[] {
  const byId = new Map(records.map((r) => [r.id, r]));
  const edges: BdEdge[] = [];
  for (const node of nodes) {
    const issue = byId.get(node.id);
    if (!issue) continue;
    edges.push({ nodeId: node.id, issueId: issue.id, status: issue.status, resolved: true });
  }
  return edges;
}
