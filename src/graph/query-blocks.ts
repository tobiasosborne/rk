// PURITY: pure — no fs/network/clock (L3). M2.5: "what blocks the north star" (PRD C5) — the
// FRONTIER of not-yet-satisfied nodes on the critical path (query-path.ts) that gate it, each with
// a structured reason. "Frontier" is used in the same wavefront sense fr's own vocabulary does: a
// node whose OWN prerequisites (every AND-dep, plus at least one OR-route when routes are
// declared) are already satisfied, but whose OWN status/af flag is not yet "available"
// (query-shared.ts's `isNodeAvailable`) — i.e. it is actionable RIGHT NOW. Path nodes whose own
// prerequisites are NOT yet satisfied are reported separately (`blocked`) so a reader sees the
// whole gating structure, not only the immediate frontier.

import { isNodeAvailable, requirementsMet } from "./query-shared";
import { computeCriticalPath } from "./query-path";
import type { GraphDocument, RegistryNode } from "./types";

export interface BlockerEntry {
  id: string;
  status: RegistryNode["status"];
  af: RegistryNode["af"];
  /** Human-readable reasons this node is not yet available — always non-empty. */
  reasons: string[];
}

export interface WhatBlocksResult {
  northStarId: string;
  /** false iff `northStarId` names no node in `doc`. */
  found: boolean;
  /** Total node count on the critical path (query-path.ts), north star included. */
  pathSize: number;
  /** Path nodes already available — reported alongside the blocking counts for an honest
   * "N/total" summary, never just the blocking half. */
  satisfiedCount: number;
  /** Actionable now: own prerequisites met, own status/af not yet available. */
  frontier: BlockerEntry[];
  /** On the path, not available, AND own prerequisites not yet met either — blocked, but not the
   * next actionable step. */
  blocked: BlockerEntry[];
}

function reasonsFor(n: RegistryNode, byId: ReadonlyMap<string, RegistryNode>): string[] {
  const reasons: string[] = [];
  if (n.af !== "validated" && n.status !== "cited") {
    reasons.push(
      `status is ${n.status ? `'${n.status}'` : "unset"}, af is '${n.af}' -- needs af:validated or status:cited`,
    );
  }
  const unmetDeps = n.deps.filter((d) => !isNodeAvailable(byId.get(d)));
  if (unmetDeps.length > 0) reasons.push(`unmet dep(s): ${unmetDeps.join(", ")}`);
  if (n.routes.length > 0 && !n.routes.some((r) => r.every((id) => isNodeAvailable(byId.get(id))))) {
    reasons.push(`no route fully satisfied (${n.routes.length} route(s) declared)`);
  }
  return reasons;
}

export function computeWhatBlocks(doc: GraphDocument, northStarId: string): WhatBlocksResult {
  const path = computeCriticalPath(doc, northStarId);
  if (!path.found) {
    return { northStarId, found: false, pathSize: 0, satisfiedCount: 0, frontier: [], blocked: [] };
  }

  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const frontier: BlockerEntry[] = [];
  const blocked: BlockerEntry[] = [];
  let satisfiedCount = 0;

  for (const id of path.nodeIds) {
    const node = byId.get(id);
    if (!node) continue; // referential integrity is validate.ts's job; a query degrades, never crashes
    if (isNodeAvailable(node)) {
      satisfiedCount++;
      continue;
    }
    const entry: BlockerEntry = { id, status: node.status, af: node.af, reasons: reasonsFor(node, byId) };
    if (requirementsMet(node, byId)) frontier.push(entry);
    else blocked.push(entry);
  }

  frontier.sort((a, b) => a.id.localeCompare(b.id));
  blocked.sort((a, b) => a.id.localeCompare(b.id));
  return { northStarId, found: true, pathSize: path.nodeIds.length, satisfiedCount, frontier, blocked };
}
