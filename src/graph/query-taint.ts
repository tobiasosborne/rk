// PURITY: pure — no fs/network/clock (L3). M2.5: campaign-wide taint trace (PRD C5) — propagates
// af's own three-axis taint state (`AF_TAINT_STATES`, ./types-edges.ts) across the WHOLE registry
// dependency closure, not just within one af workspace's internal proof tree (which `edges.af[]`
// only summarizes at the workspace ROOT — see types-edges.ts's `ResolvedAfEdge` doc comment; rk's
// graph document never carries af's internal per-node tree).
//
// Ground truth for the combination rule: ../vibefeld's own `af taint-trace`
// (cmd/af/taint_trace.go's `taintReason`; docs/concepts.md "Taint States" — "Taint is computed,
// not directly set ... in order: 1) pending -> unresolved, 2) any ancestor unresolved ->
// unresolved, 3) admitted -> self_admitted, 4) any ancestor tainted/self_admitted -> tainted,
// 5) otherwise clean"). This module re-derives the SAME priority order over the REGISTRY graph:
// af's "ancestor" (closer to the proof root — "what this node depends on already being
// established") is this graph's "requirement" (a node's deps + route members): X depends on Y
// means Y is X's foundation, exactly the role af's own "ancestor" plays for one workspace's
// internal tree. docs/concepts.md: "Descendants of tainted/self_admitted nodes inherit taint" —
// the registry-level analogue is "a node inherits taint from any requirement it names."
//
// Conservative over-inclusion (same stance as query-path.ts): every OR-route member contributes
// taint, not only whichever route is currently satisfied — an unexercised route can carry the
// same taint unnoticed until the day it IS exercised.
//
// A node with `af: "none"` (no af workspace at all) contributes no OWN taint signal (it is not
// under af verification) but still PROPAGATES any taint reachable through its own deps/routes —
// campaign-wide taint is about the whole registry closure, not only the af-tracked subset.

import { requiredIds } from "./query-shared";
import type { AfEdge, AfTaintState, GraphDocument, RegistryNode } from "./types";

export interface TaintEntry {
  id: string;
  taint: AfTaintState;
  /** true iff this node is itself a taint SOURCE — its own state caused the taint, not a
   * propagated one — mirrors af's own taint-trace `is_source` field. */
  isSource: boolean;
  reason: string;
}

function ownAfEdge(id: string, afEdges: readonly AfEdge[]): AfEdge | undefined {
  return afEdges.find((e) => e.nodeId === id);
}

/** The node's OWN (pre-propagation) taint contribution, read directly off its resolved af edge.
 * `undefined` when the node has no taint opinion of its own (`af: "none"`) — an af flag other
 * than "none" but with no resolved workspace is treated as "unresolved" (mirrors af's own rule 1:
 * a not-yet-verifiable node cannot be called clean). */
function ownTaint(n: RegistryNode, afEdges: readonly AfEdge[]): { taint: AfTaintState; reason: string } | undefined {
  if (n.af === "none") return undefined;
  const edge = ownAfEdge(n.id, afEdges);
  if (!edge || !edge.workspaceResolved) {
    return { taint: "unresolved", reason: "af workspace not resolved" };
  }
  return { taint: edge.taintState, reason: `own af taint: ${edge.taintState} (workspace ${edge.workspace})` };
}

/** Computes every node's taint state in one pass, memoized (a node's requirements are resolved
 * before the node itself, depth-first). Cycle-safe: a cycle is Gate 2's job to reject
 * (`checkAcyclic`), not this query's to assume — an in-progress id revisited mid-recursion
 * degrades to `unresolved` (conservative: never silently reports "clean" over an unproven
 * document shape). */
export function computeTaintTrace(doc: GraphDocument): Map<string, TaintEntry> {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const memo = new Map<string, TaintEntry>();
  const inProgress = new Set<string>();

  function resolve(id: string): TaintEntry {
    const cached = memo.get(id);
    if (cached) return cached;
    if (inProgress.has(id)) {
      const entry: TaintEntry = { id, taint: "unresolved", reason: "cycle detected in requirement graph", isSource: true };
      memo.set(id, entry);
      return entry;
    }
    inProgress.add(id);

    const node = byId.get(id);
    if (!node) {
      const entry: TaintEntry = {
        id, taint: "unresolved", reason: "unknown id (referential integrity is validate.ts's job)", isSource: true,
      };
      memo.set(id, entry);
      inProgress.delete(id);
      return entry;
    }

    const own = ownTaint(node, doc.edges.af);
    const reqs = requiredIds(node).map(resolve);

    let entry: TaintEntry;
    if (own?.taint === "unresolved") {
      entry = { id, taint: "unresolved", reason: own.reason, isSource: true };
    } else if (reqs.some((r) => r.taint === "unresolved")) {
      const src = reqs.find((r) => r.taint === "unresolved")!;
      entry = { id, taint: "unresolved", reason: `requires ${src.id}, which is unresolved`, isSource: false };
    } else if (own?.taint === "self_admitted" || own?.taint === "tainted") {
      entry = { id, taint: own.taint, reason: own.reason, isSource: true };
    } else if (reqs.some((r) => r.taint === "tainted" || r.taint === "self_admitted")) {
      const src = reqs.find((r) => r.taint === "tainted" || r.taint === "self_admitted")!;
      entry = { id, taint: "tainted", reason: `requires ${src.id}, which is ${src.taint}`, isSource: false };
    } else {
      entry = { id, taint: "clean", reason: own ? own.reason : "no af workspace and no tainted requirement", isSource: false };
    }
    memo.set(id, entry);
    inProgress.delete(id);
    return entry;
  }

  for (const node of doc.nodes) resolve(node.id);
  return memo;
}

/** Campaign-wide summary: every node whose computed taint is not clean, sorted by id — the
 * "campaign-wide taint trace" terminal view (PRD C5). */
export function taintedNodes(trace: ReadonlyMap<string, TaintEntry>): TaintEntry[] {
  return [...trace.values()].filter((e) => e.taint !== "clean").sort((a, b) => a.id.localeCompare(b.id));
}
