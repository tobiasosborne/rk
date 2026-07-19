// PURITY: pure — no fs/network/clock (L3). Shared helpers for the M2.5 terminal-view queries
// (query-focus.ts, query-path.ts, query-blocks.ts, query-taint.ts): node indexing, the AND/OR
// "requirement satisfied" predicate, and a generic reachability closure. Deliberately
// self-contained rather than importing src/gates/linker-graph.ts's `isAvailable`/`checkStatus` —
// src/graph/ stays decoupled from src/gates/ (IMPLEMENTATION_PLAN.md §0: "graph/ PURE: projection
// join, conflict detection, path queries" is its own module, never depending on the gate layer;
// docs/memos/2026-07-19-graph-schema-v1.md made the identical call for `RegistryNode` vs `Lemma`
// — "src/graph must not depend on gate-parser recovery types"). The AISM agreement check
// (docs/memos/2026-07-19-m2.5-path-queries.md) is what proves this reimplementation has not
// drifted from linker-graph.ts's ground truth — a shared import would hide a real drift instead
// of catching one, since a change to linker-graph.ts's semantics would silently retarget these
// queries too rather than surfacing as a disagreement to characterize.

import type { GraphDocument, RegistryNode } from "./types";

export function indexNodes(doc: GraphDocument): Map<string, RegistryNode> {
  return new Map(doc.nodes.map((n) => [n.id, n]));
}

/** Every id this node names as a requirement: the AND-deps plus every OR-route's members,
 * deduplicated. Mirrors src/gates/linker-parse.ts's `allDepIds`, re-derived over `RegistryNode`
 * rather than `Lemma` (the two types are deliberately never unified — see types.ts's doc comment
 * on `RegistryNode`). */
export function requiredIds(n: RegistryNode): string[] {
  return [...new Set([...n.deps, ...n.routes.flat()])];
}

/** The monotone-trust availability predicate (mirrors src/gates/linker-graph.ts's `isAvailable`,
 * Gate 2 Check 8): a dependency counts as satisfied iff its OWN af flag is "validated", or it is a
 * ground-truth leaf (`status === "cited"`) — never proved/consensus/open/obstruction/disproved.
 * Applied directly over a `RegistryNode` (which already carries both fields on one object) rather
 * than the two-map form linker-graph.ts uses over a raw `Lemma[]`. `undefined` (an id absent from
 * the document) is never available — a query degrades honestly rather than treating a broken
 * reference as satisfied. */
export function isNodeAvailable(n: RegistryNode | undefined): boolean {
  if (!n) return false;
  return n.af === "validated" || n.status === "cited";
}

/** Whether `route`'s members are ALL available — a route is a conjunction (PRD C2: "routes (OR);
 * ... any one route suffices" at the outer level, but each route's own members are an AND). */
export function routeSatisfied(route: readonly string[], byId: ReadonlyMap<string, RegistryNode>): boolean {
  return route.every((id) => isNodeAvailable(byId.get(id)));
}

/** Mirrors src/gates/linker-graph.ts's `checkStatus`'s `requirementsMet`: every AND-dep available,
 * AND (no routes declared, OR at least one route fully available). `routes: []` reduces
 * byte-for-byte to "all deps available" (the aism-3ne backward-compat case, types.ts's doc comment
 * on `RegistryNode.routes`). */
export function requirementsMet(n: RegistryNode, byId: ReadonlyMap<string, RegistryNode>): boolean {
  if (!n.deps.every((id) => isNodeAvailable(byId.get(id)))) return false;
  if (n.routes.length > 0 && !n.routes.some((r) => routeSatisfied(r, byId))) return false;
  return true;
}

/** Generic forward-reachability closure: every id reachable from `starts` by repeatedly applying
 * `next` (the immediate neighbors of one id), `starts` themselves included. Cycle-safe (a `seen`
 * guard, never an infinite loop) — deliberately not assuming the acyclicity Gate 2 already
 * enforces (src/gates/linker-graph.ts's `checkAcyclic`): a pure query must degrade safely even
 * over a document no gate has validated yet. */
export function closureFrom(starts: readonly string[], next: (id: string) => readonly string[]): Set<string> {
  const seen = new Set<string>(starts);
  const stack = [...starts];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const n of next(id)) {
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen;
}

/** Reverse index: for every id, the set of node ids that name it as a requirement (a dep or a
 * route member) — its direct dependents. Used by the focus view (query-focus.ts). An id a node
 * names but that resolves to no real node is simply never a key here — referential integrity is
 * src/graph/validate.ts's job, not a query's. */
export function reverseDependents(doc: GraphDocument): Map<string, Set<string>> {
  const rev = new Map<string, Set<string>>();
  for (const node of doc.nodes) {
    for (const req of requiredIds(node)) {
      if (!rev.has(req)) rev.set(req, new Set());
      rev.get(req)!.add(node.id);
    }
  }
  return rev;
}
