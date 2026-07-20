// PURITY: pure — no fs/network/clock (L3). M3.6 dispatch planning core — the `--dry-run` heart:
// turns a workspace's af-export node view into a concrete dispatch plan (which nodes go per-node,
// which batch together, which are excluded and why) WITHOUT spawning a single worker or writing a
// byte. The CLI's default acceptance path (the synthetic balloon run) and every planner test drive
// this; the impure loop (src/drive/driver-run.ts) executes whatever this returns.
//
// READINESS (bottom-up-ready dispatch): each round a node is PROVER-ready (needs proof work),
// VERIFIER-ready (ready for adversarial review), or neither (waiting/terminal). rk reads af's OWN
// authoritative per-node job classification — the `prover_ready`/`verifier_ready` flags emitted by
// `af export --graph json` (../vibefeld/docs/export-graph-v1.md, vibefeld d4493c8), computed by
// af's `internal/jobs` package, the same classifier `af jobs [--ready]` uses. rk NEVER re-derives
// af's job state machine (L5: af's state is truth) and NEVER parses the cruder `af status` summary.
//
// GROUND TRUTH (characterized 2026-07-20, L5 provenance): af has TWO classifiers that disagree.
//   - `internal/jobs/{prover,verifier}.go` (AUTHORITATIVE — drives `af jobs`, now exported as the
//     per-node flags): a fresh childless pending conjecture with a statement and no blocking
//     challenge is a VERIFIER job (breadth-first: the verifier looks first and challenges an
//     unproven claim); a node with an open blocking challenge is a PROVER job;
//     FilterReadyVerifierJobs additionally requires every child cleared (bottom-up-ready).
//   - `internal/render/status.go:167-189` (drives the `af status` "Prover:/Verifier:" summary line
//     the M3.5 preflight operator read): a coarser workflow-only heuristic that calls the SAME fresh
//     conjecture a prover job. This is the classifier that misled the STOP report; it is NOT af's
//     authoritative job state. rk ignores it and reads the exported flags.
// So rk's OLD `pending && !blocked` proxy was coincidentally right that a fresh node is verifier-
// ready, but blind to challenges and to bottom-up child-clearing. The rk-gn4 fix is to read af's
// exported flags (correct for all three) AND to add the missing PROVER dispatch half (driver-run.ts)
// so the verifier's challenge on a bare conjecture is actually addressed instead of stalling.
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
 * `statement`/`childIds` (M3.5-prep, src/drive/driver-live.ts's live prompt assembly) are
 * data-carrying only — no readiness/dispatch DECISION reads them; readiness reads af's own
 * `proverReady`/`verifierReady` flags below. `childIds` (not `deps`): af v1's export carries no separate
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
  /** af's OWN authoritative job classification, read straight off `af export --graph json`'s
   * per-node `prover_ready`/`verifier_ready` flags (../vibefeld/internal/jobs; vibefeld d4493c8).
   * Absent flag (false, or an af predating them) reads as `undefined`/`false` — not ready. rk never
   * re-derives these. */
  proverReady?: boolean;
  verifierReady?: boolean;
  /** rk B2: this node's recorded REFERENCE dependencies (`dependencies[]` in the af export;
   * ../vibefeld/internal/export.FeatureNodeDependencies). The prover's exact declared dependency set
   * — what a verifier judges the node's step AGAINST — not the children-substitution proxy the seam
   * used before af emitted them. Empty/absent for a node with no recorded dependencies. Part of the
   * node's content_hash, so a verdict bound to `contentHash` is invalidated if this set changes. */
  deps?: string[];
  /** rk B3: af's authoritative bottom-up CLOSURE signal (`closed` in the af export;
   * ../vibefeld/internal/export.FeatureClosureFlag). True iff the subtree rooted here is settled —
   * epistemically cleared, not blocked, no open blocking challenge, every descendant closed. The
   * driver reads this on the ROOT to decide convergence: unlike the bare epistemic axis it goes
   * false the instant a blocking challenge lands on an already-validated node. Absent (an af
   * predating the flag, caught by the FU5 features preflight) reads as `false`. */
  closed?: boolean;
}

/** PROVER-ready iff af's exported `prover_ready` flag is set (../vibefeld/internal/jobs.FindProverJobs:
 * not blocked, and pending-with-open-blocking-challenge or draft/needs_refinement). Reads af's
 * recorded classification, never re-derives it. (Parameter named `n`, not the colon-suffixed bare
 * word this repo's purity grep forbids — src/gates/sha256.ts import-guard convention.) */
export function isProverReady(n: AfNodeView): boolean {
  return n.proverReady === true;
}

/** VERIFIER-ready iff af's exported `verifier_ready` flag is set
 * (../vibefeld/internal/jobs.FilterReadyVerifierJobs: a statement, pending, available, no open
 * blocking challenge, AND every child cleared — bottom-up-ready). Reads af's classification. */
export function isVerifierReady(n: AfNodeView): boolean {
  return n.verifierReady === true;
}

/** Every prover-ready node id, sorted (deterministic). */
export function selectProverReadyNodes(nodes: readonly AfNodeView[]): string[] {
  return nodes.filter(isProverReady).map((n) => n.id).sort();
}

/** Every verifier-ready node id, sorted (deterministic). */
export function selectVerifierReadyNodes(nodes: readonly AfNodeView[]): string[] {
  return nodes.filter(isVerifierReady).map((n) => n.id).sort();
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
