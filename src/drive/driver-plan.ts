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
  /** rk-jit repair (STOP-4, blocker 1): af's node `type` (../vibefeld/internal/schema/nodetype.go —
   * `claim | local_assume | local_discharge | case | qed`; af has NO distinct axiom/global-assumption
   * node type). Threaded (already a real v1 export field, ../vibefeld/internal/export/graph.go:48) so
   * `isProoflessNode` can pin the BOOTSTRAP ROOT shape exactly — a fresh `af init` conjecture is
   * `id:"1", type:"claim"`, whereas a legitimate terminal-assumption LEAF (af tutorial
   * docs/tutorial-sqrt2.md, AISM node 1.1.1) is also `type:"claim", inference:"assumption"` and must
   * NOT be discarded. Absent/non-string in the export → undefined. Data-carrying only; no readiness
   * decision reads it. */
  type?: string;
  childIds?: string[];
  /** rk-jit (STOP-4): the af `inference` field — the rule justifying this node's own step
   * (../vibefeld/internal/schema/inference.go). Data-carrying only (no readiness decision reads it);
   * used by `isProoflessNode` to tell a DERIVED leaf (e.g. `modus_ponens`, `by_definition`) from a
   * bare un-proven claim. NOTE af DEFAULTS an empty inference to `"assumption"` ("global hypothesis",
   * record_proof.go:114) for both a fresh `af init` root AND any prover child that omitted its
   * justification — so `""`/`"assumption"` both read as "no recorded proof body" there. Absent/
   * non-string in the export → undefined. */
  inference?: string;
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

/** rk-jit (STOP-4), NARROWED to the bootstrap ROOT by the blocker-1 repair (docs/reviews/
 * 2026-07-20-vacuous-accept-guard-codex.md): the ONE genuinely un-bootstrappable shape af marks
 * `verifier_ready` — a FRESH `af init` root conjecture (`id:"1", type:"claim"`, no recorded proof
 * body: no children, no cited dependencies, inference empty or the "assumption" default). There is a
 * claim to make but NOTHING a verifier could check for validity, so an `accept` on it is vacuous (the
 * statement's own truth is not a proof), and until a PROVER decomposes it nothing can ever flip it
 * prover-ready — the STOP-REPORT-4 deadlock.
 *
 * WHY ROOT-ONLY (blocker 1). af has NO distinct axiom/global-assumption node type
 * (../vibefeld/internal/schema/nodetype.go: claim | local_assume | local_discharge | case | qed), and
 * a LEGITIMATE terminal-assumption leaf is exactly `type:"claim", inference:"assumption"`, childless,
 * dependency-free — the af tutorial accepts one (../vibefeld/docs/tutorial-sqrt2.md:271-282) and the
 * real AISM leaf `1.1.1` was VALIDATED with that shape. The earlier predicate (statement + no
 * children + no deps + bare inference, ANY id) would have discarded those accepts forever: their
 * parents would never become bottom-up-ready and a valid proof could never close. af defaults an
 * un-justified node's inference to `"assumption"` for BOTH a fresh root AND any prover child that
 * omitted its justification (../vibefeld/cmd/af/record_proof.go:109), so the inference value alone can
 * NOT distinguish them — only the fresh-root shape (`id:"1", type:"claim"`, bare) is unambiguous, and
 * every genuine terminal assumption leaf is left for the verifier to judge on its merits (af's
 * designed epistemics). The prompt-side hard-forbid (driver-prompts.ts) uses this same predicate, so
 * it too now fires ONLY on the bootstrap root. The discard built on this (driver-verify-node.ts)
 * stays strictly fail-closed (discards more, never accepts more).
 *
 * A node with no statement at all is out of scope (the bootstrap case always has a statement; a
 * statementless root is a different, malformed shape this predicate leaves alone). */
export function isProoflessNode(n: AfNodeView): boolean {
  const hasStatement = typeof n.statement === "string" && n.statement.trim().length > 0;
  const inference = typeof n.inference === "string" ? n.inference.trim() : "";
  const bareInference = inference === "" || inference === "assumption";
  return (
    n.id === "1" &&
    n.type === "claim" &&
    hasStatement &&
    bareInference &&
    (n.childIds ?? []).length === 0 &&
    (n.deps ?? []).length === 0
  );
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
