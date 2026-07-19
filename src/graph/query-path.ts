// PURITY: pure — no fs/network/clock (L3). M2.5 (IMPLEMENTATION_PLAN.md): the critical-path
// query — "every node on the path to the north-star contract" (PRD C2/C5) — is a HARD dependency
// of M3.4's batch-composer critical-path exclusion rule ("nodes on the path to the north star
// always get per-node, cross-vendor treatment", PRD §4 C3). This module's API is designed for
// that consumer: `computeCriticalPath` is meant to be called ONCE per composer run, its
// `nodeIds` turned into a `Set` by the caller for O(1) membership checks against every batch
// candidate.
//
// CHOSEN SEMANTICS (read before changing): a node is on the critical path to north star S iff it
// IS S, or it is named — directly or transitively — as an AND-dep OR an OR-route member of some
// node already on the path. BOTH branches of every OR-route count, not only whichever route
// currently happens to be satisfied.
//
// Why: this is the deliberately CONSERVATIVE, OVER-INCLUSIVE reading PRD C2 requires — the
// critical-path provenance check runs "continuously ... because path membership changes when
// edges are added, not only at verdict-apply time." A route that is unsatisfied TODAY can become
// the satisfied route tomorrow with no signal to the batch composer other than re-running this
// query; treating an unsatisfied route's members as "not yet on the path" would let M3.4 batch a
// node that becomes load-bearing the moment its route wins, with no re-check in between. The two
// failure directions are NOT symmetric: falsely EXCLUDING a node that turns out load-bearing lets
// it be verified in a batch, which is exactly the validity-barrier violation C3's guardrail
// exists to prevent; falsely INCLUDING a node that turns out never load-bearing only costs one
// batching opportunity (a node gets per-node treatment it strictly didn't need). Given that
// asymmetry, this module always resolves ambiguity toward inclusion — a node is excluded ONLY
// when it is not reachable via ANY combination of deps/route edges from the north star at all.

import { closureFrom, requiredIds } from "./query-shared";
import type { GraphDocument } from "./types";

export interface CriticalPathResult {
  northStarId: string;
  /** false iff `northStarId` names no node in `doc` — never throws on a bad/unset north star,
   * matching every other rk query's "absent input is a legitimate, loudly reported state"
   * convention. */
  found: boolean;
  /** Every node id on the critical path, INCLUDING the north star itself, sorted. Empty iff
   * `!found`. M3.4: build `new Set(result.nodeIds)` once per composer run rather than scanning
   * this array per candidate. */
  nodeIds: string[];
}

export function computeCriticalPath(doc: GraphDocument, northStarId: string): CriticalPathResult {
  const found = doc.nodes.some((n) => n.id === northStarId);
  if (!found) return { northStarId, found: false, nodeIds: [] };

  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const next = (id: string): readonly string[] => {
    const node = byId.get(id);
    return node ? requiredIds(node) : [];
  };
  // Traversal walks through phantom ids too (a dep/route member naming no real node) so nothing
  // reachable THROUGH one is lost, but the reported set only ever names real document nodes —
  // an unresolved reference is `doc.unresolved`'s job to surface, not this query's to invent a
  // node for.
  const nodeIds = [...closureFrom([northStarId], next)].filter((id) => byId.has(id)).sort();
  return { northStarId, found: true, nodeIds };
}
