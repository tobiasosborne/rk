// PURITY: pure — no fs/network/clock (L3). M3.6 dispatch planning core — the `--dry-run` heart:
// turns a workspace's af-export node view into a concrete dispatch plan (which nodes go per-node,
// which batch together, which are excluded and why) WITHOUT spawning a single worker or writing a
// byte. The CLI's default acceptance path (the synthetic balloon run) and every planner test drive
// this; the impure loop (src/drive/driver-run.ts) executes whatever this returns.
//
// READINESS (bottom-up-ready dispatch): a node is in exactly one of three states each round —
// PROVER-ready (needs proof work), VERIFIER-ready (has a recorded, fully-built proof to check), or
// waiting/terminal (neither). This split replaces the old `pending && !blocked` proxy, which
// mislabelled a fresh unproven conjecture (pending + available, no proof) as verification-ready and
// so handed a verifier a bare claim to "accept" (bead rk-gn4 / the M3.5 preflight abort).
//
// GROUND TRUTH (characterized 2026-07-20, L5 provenance): af has TWO disagreeing job classifiers.
//   - `internal/jobs/{prover,verifier}.go` (drives `af jobs`): a node with a statement, pending,
//     available, no blocking challenge is a VERIFIER job — this is the permissive classifier that
//     matches rk's OLD buggy proxy (it would call the fresh conjecture verifier-ready).
//   - `internal/render/status.go:167-189` (drives `af status`, the "Prover: N awaiting refinement /
//     Verifier: M ready for review" line the M3.5 operator actually saw): a prover job is
//     `available && epistemic ∈ {draft,pending,needs_refinement}`; a verifier job is
//     `claimed && pending && all-children-validated`.
// The two disagree on a fresh conjecture (status.go: prover; jobs.go: verifier). Per L5 we default to
// the STRICTER validity semantics and mirror status.go's spirit, with one deliberate, recorded
// divergence (triage: rk-stricter-intended): rk's driver ingests via `af verdicts apply` (a batch
// verb) not an interactive `af claim --role verifier`, so `claimed` is NOT the right verifier signal
// for rk. The validity-meaningful signal that a node "has a proof to verify" is that it carries a
// recorded decomposition whose children are ALL epistemically cleared. A childless pending node has
// no proof to check and is prover-ready — never handed to a verifier to rubber-stamp.
//
// All four axes read here (workflow_state, epistemic_state, child_ids presence, children's
// epistemic_state) are recorded fields straight off `af export --graph json`
// (../vibefeld/docs/export-graph-v1.md); nothing reconstructs WHY af set them. If af later exposes a
// first-class per-node readiness flag in the export, these predicates read it instead.

/** af epistemic states a verifier's `af verdicts apply` treats as "no obstacle to the parent" —
 * byte-identical to ../vibefeld/internal/jobs/verifier.go's `AllChildrenCleared` allowlist
 * (validated | admitted | archived). A `refuted` or still-`pending` child is NOT cleared. */
const CLEARED_EPISTEMIC = new Set(["validated", "admitted", "archived"]);

/** af epistemic states that denote "still needs prover work" (../vibefeld/internal/render/status.go
 * :174-176: draft | pending | needs_refinement). */
const PROVER_EPISTEMIC = new Set(["draft", "pending", "needs_refinement"]);
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
 * ../vibefeld/docs/export-graph-v1.md's node shape, built at the edge (src/drive/driver-af.ts).
 * `statement` (M3.5-prep, src/drive/driver-live.ts's live prompt assembly) is data-carrying only —
 * no readiness/dispatch DECISION reads it. `childIds`, by contrast, is now LOAD-BEARING for the
 * readiness split below (isVerifierReady/isProverReady): its presence marks a recorded decomposition,
 * and the children's states decide verifier-readiness. `childIds` (not `deps`): af v1's export carries no separate
 * `dependencies` array for a node (deliberately excluded, export-graph-v1.md's "Fields deliberately
 * not included in v1") — a node's own children ARE what its bottom-up validation depends on
 * (they must already be validated before the parent claim is verifier-ready), so `child_ids` is
 * the faithful available proxy, read raw off the export same as `crux` (bead rk-mnp's precedent),
 * never invented or re-derived. */
export interface AfNodeView {
  id: string;
  epistemicState: string;
  workflowState: string;
  crux: boolean;
  contentHash: string;
  author?: string;
  statement?: string;
  childIds?: string[];
}

/** True iff every direct child of `n` is epistemically cleared (validated/admitted/archived) — i.e.
 * `af verdicts apply` would not block acceptance of `n` on an unproven child. A node with no
 * children returns true vacuously, so callers requiring a real decomposition check `childIds`
 * length separately. `byId` maps every node id in the workspace to its view. */
function allChildrenCleared(n: AfNodeView, byId: ReadonlyMap<string, AfNodeView>): boolean {
  for (const cid of n.childIds ?? []) {
    const child = byId.get(cid);
    if (child === undefined || !CLEARED_EPISTEMIC.has(child.epistemicState)) return false;
  }
  return true;
}

/** VERIFIER-ready: the node has a recorded proof to check and it is fully built underneath — pending,
 * not blocked, carries at least one child (a decomposition), and every child is cleared. A childless
 * pending node is NEVER verifier-ready (it has no proof to verify — the rk-gn4 fix). `byId` supplies
 * the children's recorded states. (Parameter named `n`, not the colon-suffixed bare word this repo's
 * purity grep forbids — src/gates/sha256.ts import-guard convention, same as batch-plan.ts.) */
export function isVerifierReady(n: AfNodeView, byId: ReadonlyMap<string, AfNodeView>): boolean {
  if (n.epistemicState !== "pending" || n.workflowState === "blocked") return false;
  if ((n.childIds ?? []).length === 0) return false;
  return allChildrenCleared(n, byId);
}

/** PROVER-ready: the node still needs proof development — not blocked, and either explicitly
 * awaiting refinement (draft | needs_refinement, regardless of children) or a childless pending node
 * whose proof has not been started. A pending node WITH children is NOT prover-ready: it is either
 * verifier-ready (children all cleared) or waiting on its descendants (bottom-up), never re-proven
 * wholesale. Pure per-node — does not need the workspace map. */
export function isProverReady(n: AfNodeView): boolean {
  if (n.workflowState === "blocked" || !PROVER_EPISTEMIC.has(n.epistemicState)) return false;
  if (n.epistemicState === "draft" || n.epistemicState === "needs_refinement") return true;
  return (n.childIds ?? []).length === 0; // pending: prover-ready only until a decomposition exists
}

/** Every prover-ready node id, sorted (deterministic). */
export function selectProverReadyNodes(nodes: readonly AfNodeView[]): string[] {
  return nodes.filter(isProverReady).map((n) => n.id).sort();
}

/** Every verifier-ready node id, sorted (deterministic). */
export function selectVerifierReadyNodes(nodes: readonly AfNodeView[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  return nodes.filter((n) => isVerifierReady(n, byId)).map((n) => n.id).sort();
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
