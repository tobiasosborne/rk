// PURITY: pure — no fs/network/clock (L3). N1.2 (rk-lmtr, PRD Amendment A1): the GOAL frontier —
// the top-down read of the argument DAG that the payout ledger (src/reward) and the allocator
// (fr) consume. Related to but distinct from query-blocks.ts's critical-path frontier: this
// query walks ALL live routes (competing decompositions are a population, not a single chosen
// path), classifies every document node as attached (reachable from the goal root) or
// unattached (the admission/prospecting boundary — an unattached open node is prospecting-pool
// material, never an obligation), and names dead-ends (a node every one of whose declared
// routes contains a pruned member) as first-class facts for the PRUNE/re-decompose economy.
//
// Traversal semantics, each load-bearing:
// - An AVAILABLE node (query-shared.ts's isNodeAvailable: af-validated or status:cited) is a
//   settled proof: it counts as satisfied and is NOT expanded — its descendants are not
//   obligations through it. (A settled node with genuinely open prerequisites is a status-
//   propagation defect; the linker owns that, not this query.)
// - A PRUNED node (status disproved/obstruction) is dead: not an obligation, not expanded, and
//   any route containing it is dead. A node reached only through dead routes is unreachable
//   progress and simply stays unattached.
// - Everything else reachable is an OBLIGATION: open work the goal actually needs. `actionable`
//   mirrors query-blocks.ts's wavefront sense (own prerequisites met, itself not yet available).

import { closureFrom, indexNodes, isNodeAvailable, requiredIds, requirementsMet } from "./query-shared";
import type { GraphDocument, RegistryNode } from "./types";

export interface Obligation {
  id: string;
  status: RegistryNode["status"];
  kind: RegistryNode["kind"];
  /** Own prerequisites met, itself not available — the allocator's wavefront. */
  actionable: boolean;
  /** Every declared route contains a pruned member (deps-only nodes are never dead-ends this
   * way): the node needs a PRUNE of its own or a fresh decomposition, not more prover effort. */
  deadEnd: boolean;
}

export interface GoalFrontierResult {
  rootId: string;
  /** false iff `rootId` names no node in `doc` — then every list below is empty. */
  found: boolean;
  /** Open work the goal needs, sorted by id. */
  obligations: Obligation[];
  /** Every node reachable from the root through live structure (settled nodes included),
   * sorted. The admission boundary: attached is graph, unattached is pool. */
  attachedIds: string[];
  /** Document nodes NOT reachable from the root, sorted. */
  unattachedIds: string[];
}

function isPruned(n: RegistryNode | undefined): boolean {
  return n?.status === "disproved" || n?.status === "obstruction";
}

/** Route is live iff no member is pruned. Unknown members don't kill a route here —
 * referential integrity is validate.ts's job; a query degrades, never crashes. */
function routeLive(route: readonly string[], byId: ReadonlyMap<string, RegistryNode>): boolean {
  return !route.some((id) => isPruned(byId.get(id)));
}

export function computeGoalFrontier(doc: GraphDocument, rootId: string): GoalFrontierResult {
  const byId = indexNodes(doc);
  if (!byId.has(rootId)) {
    return { rootId, found: false, obligations: [], attachedIds: [], unattachedIds: [] };
  }

  // ATTACHMENT is the wider relation: reachable through DECLARED structure (deps + every route
  // member), regardless of liveness or settledness — a pruned branch and a settled proof's
  // dependencies are part of the goal's record, not prospecting-pool material. OBLIGATIONS walk
  // only live, unsettled structure below.
  const attached = closureFrom([rootId], (id) => {
    const n = byId.get(id);
    return n ? requiredIds(n) : [];
  });

  const visited = new Set<string>();
  const obligations: Obligation[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    const n = byId.get(id);
    if (!n) continue;
    visited.add(id);
    if (isNodeAvailable(n) || isPruned(n)) continue; // settled or dead: never expanded

    const liveRoutes = n.routes.filter((r) => routeLive(r, byId));
    obligations.push({
      id: n.id,
      status: n.status,
      kind: n.kind,
      actionable: requirementsMet(n, byId),
      deadEnd: n.routes.length > 0 && liveRoutes.length === 0,
    });
    for (const dep of n.deps) stack.push(dep);
    for (const route of liveRoutes) for (const member of route) stack.push(member);
  }

  const unattachedIds = doc.nodes
    .map((n) => n.id)
    .filter((id) => !attached.has(id))
    .sort((a, b) => a.localeCompare(b));
  obligations.sort((a, b) => a.id.localeCompare(b.id));
  return {
    rootId,
    found: true,
    obligations,
    attachedIds: [...attached].sort((a, b) => a.localeCompare(b)),
    unattachedIds,
  };
}
