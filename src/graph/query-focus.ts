// PURITY: pure — no fs/network/clock (L3). M2.5 focus view (PRD C5): one node's neighborhood —
// its own deps/routes (each annotated with per-route satisfaction), direct dependents (reverse
// edges), and every af/bd/fr/report edge + conflict naming it. This is the pure core behind
// `rk graph --focus <id>`.

import { isNodeAvailable, requirementsMet, reverseDependents, routeSatisfied } from "./query-shared";
import type {
  AfEdge, BdEdge, ConflictRecord, FrEdge, GraphDocument, RegistryNode, ReportEdge, ResolvedFrEdge,
} from "./types";

export interface DepStatus {
  id: string;
  /** `undefined` iff `id` names no node in this document (referential integrity is
   * src/graph/validate.ts's job — a focus view degrades honestly rather than crashing). */
  status: RegistryNode["status"] | undefined;
  af: RegistryNode["af"] | undefined;
  available: boolean;
  unresolved: boolean;
}

export interface RouteStatus {
  members: DepStatus[];
  satisfied: boolean;
}

export interface FocusView {
  id: string;
  found: boolean;
  node?: RegistryNode;
  deps: DepStatus[];
  routes: RouteStatus[];
  /** This node's OWN requirements met (query-shared.ts's `requirementsMet`) — no routes means
   * "all deps"; routes present means "also at least one route". */
  requirementsMet: boolean;
  /** This node's OWN availability per the monotone-trust rule (af:validated or status:cited) —
   * what a DEPENDENT of this node would see when checking its own requirements. */
  available: boolean;
  /** Direct dependents: node ids naming this one as a dep or route member. */
  dependents: string[];
  afEdge?: AfEdge;
  bdEdge?: BdEdge;
  frEdges: FrEdge[];
  reportEdges: ReportEdge[];
  conflicts: ConflictRecord[];
}

function depStatus(id: string, byId: ReadonlyMap<string, RegistryNode>): DepStatus {
  const n = byId.get(id);
  return { id, status: n?.status, af: n?.af, available: isNodeAvailable(n), unresolved: n === undefined };
}

function isResolvedFrEdgeFor(id: string): (e: FrEdge) => e is ResolvedFrEdge {
  return (e): e is ResolvedFrEdge => e.resolutionMethod !== "unresolved" && e.resolvedNodeId === id;
}

export function computeFocusView(doc: GraphDocument, id: string): FocusView {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const node = byId.get(id);
  if (!node) {
    return {
      id, found: false, deps: [], routes: [], requirementsMet: false, available: false,
      dependents: [], frEdges: [], reportEdges: [], conflicts: [],
    };
  }

  const dependents = [...(reverseDependents(doc).get(id) ?? new Set<string>())].sort();

  return {
    id,
    found: true,
    node,
    deps: node.deps.map((d) => depStatus(d, byId)),
    routes: node.routes.map((r) => ({
      members: r.map((m) => depStatus(m, byId)),
      satisfied: routeSatisfied(r, byId),
    })),
    requirementsMet: requirementsMet(node, byId),
    available: isNodeAvailable(node),
    dependents,
    afEdge: doc.edges.af.find((e) => e.nodeId === id),
    bdEdge: doc.edges.bd.find((e) => e.nodeId === id),
    frEdges: doc.edges.fr.filter(isResolvedFrEdgeFor(id)),
    reportEdges: doc.edges.report.filter((e) => e.nodeId === id),
    conflicts: doc.conflicts.filter((c) => c.nodeId === id),
  };
}
