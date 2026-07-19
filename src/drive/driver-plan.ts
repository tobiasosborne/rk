// PURITY: pure — no fs/network/clock (L3). M3.6 dispatch planning core — the `--dry-run` heart:
// turns a workspace's af-export node view into a concrete dispatch plan (which nodes go per-node,
// which batch together, which are excluded and why) WITHOUT spawning a single worker or writing a
// byte. The CLI's default acceptance path (the synthetic balloon run) and every planner test drive
// this; the impure loop (src/drive/driver-run.ts) executes whatever this returns.
//
// READINESS (bottom-up-ready dispatch): af's OWN recorded state axes are the truth — this module
// never re-derives af's state machine (CLAUDE.md / PRD C9: "af's own state machine is the truth").
// A node is verification-ready iff af reports `epistemic_state === "pending"` AND
// `workflow_state !== "blocked"` — two recorded axes read straight off the export
// (../vibefeld/docs/export-graph-v1.md), combined, never a reconstruction of WHY af set them. Honest
// scope note: export v1 carries no explicit "ready" flag, so this two-axis read is the closest
// faithful proxy; if af later exposes a first-class ready flag, this predicate reads it instead.
//
// BATCHING vs PER-NODE (the M3.4-report filtering, applied at THIS edge BEFORE composeBatches): crux
// nodes (read from the raw af export's per-node `crux` flag — bead rk-mnp: rk's graph schema does
// NOT thread crux, so the edge reads it raw) are filtered to PER-NODE dispatch (cross-vendor per-node
// treatment, never batched). `batchEligibleIds` is the caller-supplied routine-tier pool; for the
// hard tier (rk verify --af) that pool is empty by the tier filter — batching is the L5 soft tier's
// job (M3.7) — so pass-1 hard-tier planning is all per-node. The composeBatches seam is nonetheless
// wired and exercised (a non-empty eligible pool composes real batches) so it is a live, tested path,
// not dead scaffolding.

import { composeBatches, type ComposedBatch } from "./batch-composer";
import type { GraphDocument } from "../graph/types";

/** The projected view of one af-export node this planner consumes — a narrow slice of
 * ../vibefeld/docs/export-graph-v1.md's node shape, built at the edge (src/drive/driver-af.ts). */
export interface AfNodeView {
  id: string;
  epistemicState: string;
  workflowState: string;
  crux: boolean;
  contentHash: string;
  author?: string;
}

/** af's OWN readiness axes: pending AND not blocked. Reads the recorded state, never re-derives it.
 * (Parameter named `n`, not the bare word this codebase's purity grep forbids as a colon-suffixed
 * token — src/gates/sha256.ts import-guard convention, same as batch-plan.ts.) */
export function isVerificationReady(n: AfNodeView): boolean {
  return n.epistemicState === "pending" && n.workflowState !== "blocked";
}

/** Every verification-ready node id, sorted (deterministic). */
export function selectReadyNodes(nodes: readonly AfNodeView[]): string[] {
  return nodes.filter(isVerificationReady).map((n) => n.id).sort();
}

export type DispatchExclusionReason = "critical-path" | "unknown-node";

export interface DispatchExclusion {
  id: string;
  reason: DispatchExclusionReason;
}

export interface DispatchPlan {
  /** Nodes dispatched one verifier turn at a time: crux nodes, critical-path nodes, and (hard tier)
   * every ready node, since none is batch-eligible. Sorted. */
  perNode: string[];
  /** Nodes dispatched as composed batches (routine tier, independent siblings). Empty for a hard-tier
   * plan whose `batchEligibleIds` is empty. */
  batches: ComposedBatch[];
  /** Reported, NEVER dispatched: a `batchEligibleIds` member naming no real graph node
   * (unknown-node). Surfaced, never silently dropped (CLAUDE.md L2). */
  unknown: string[];
}

export interface PlanInput {
  readyNodeIds: readonly string[];
  cruxIds?: readonly string[];
  /** The routine-tier batch-eligible pool (subset of `readyNodeIds`, already tier-filtered). Empty
   * for the hard tier. Any crux id here is still forced per-node — crux always outranks batching. */
  batchEligibleIds?: readonly string[];
  /** Supplied only when a batch-eligible pool exists: the graph the batch composer computes
   * independence + critical-path exclusion over, and its north star. */
  graph?: { doc: GraphDocument; northStarId: string };
  cap?: number;
}

/** Builds the dispatch plan. Deterministic: same inputs → same plan (crux filtering + composeBatches
 * are both order-independent). */
export function planDispatch(input: PlanInput): DispatchPlan {
  const crux = new Set(input.cruxIds ?? []);
  const eligible = (input.batchEligibleIds ?? []).filter((id) => !crux.has(id));
  const eligibleSet = new Set(eligible);

  // Everything ready that is not going into batching (crux + non-eligible) dispatches per-node.
  const perNode = new Set<string>();
  for (const id of input.readyNodeIds) if (!eligibleSet.has(id)) perNode.add(id);

  const batches: ComposedBatch[] = [];
  const unknown: string[] = [];

  if (eligible.length > 0 && input.graph) {
    const result = composeBatches(input.graph.doc, eligible, input.graph.northStarId, { cap: input.cap });
    batches.push(...result.batches);
    for (const ex of result.excluded) {
      if (ex.reason === "unknown-node") unknown.push(ex.id);
      else perNode.add(ex.id); // critical-path → per-node dispatch
    }
  } else {
    // No graph or no eligible pool: everything eligible falls back to per-node.
    for (const id of eligible) perNode.add(id);
  }

  return { perNode: [...perNode].sort(), batches, unknown: unknown.sort() };
}

/** Human-readable dry-run lines for the CLI. Pure — the CLI's `out.log` sink prints them. */
export function planSummaryLines(plan: DispatchPlan, cruxIds: readonly string[] = []): string[] {
  const cruxSet = new Set(cruxIds);
  const lines: string[] = [];
  lines.push(`per-node dispatch (${plan.perNode.length}): ${plan.perNode.length === 0 ? "none" : plan.perNode.map((id) => (cruxSet.has(id) ? `${id} [crux]` : id)).join(", ")}`);
  lines.push(`batches (${plan.batches.length}):`);
  if (plan.batches.length === 0) lines.push("  none");
  else for (const b of plan.batches) lines.push(`  ${b.batchId}: ${b.members.join(", ")} (score ${b.score})`);
  if (plan.unknown.length > 0) lines.push(`unknown (reported, not dispatched): ${plan.unknown.join(", ")}`);
  return lines;
}
