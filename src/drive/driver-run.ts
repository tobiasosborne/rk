// EDGE — the M3.6 hard-tier driver orchestrator for ONE af workspace claim. Every side effect (af
// query/apply, worker dispatch, bd create, shard read/write, log append, clock) is an INJECTED
// dependency, so the whole loop — including the balloon feedback path — runs deterministically in a
// test with fake workers and no real LLM/af call (the plan's synthetic acceptance). This module owns
// NO validity logic of its own: it composes the pure cores (driver-guardrails, driver-balloon,
// driver-plan, driver-verdict-map) and the bind-verdicts pipeline, and does the wiring/ordering.
//
// Loop shape (bottom-up-ready, bounded): query af → balloon tripwire? (if so: classify → route →
// mark/task → log → ABORT, the signal AUGMENTING the abort per PRD C9) → else dispatch a verifier
// per ready node → bind → map → apply file (children-first) → ingest outcomes → guardrails (stuck,
// retry) → re-query. Converges when no node is verification-ready, or aborts with a NAMED reason.
//
// SCOPE (pass 1, rule 11): the verification cycle (verifier dispatch → af verdicts apply) and the
// full balloon loop are complete here. Prover/seeding dispatch (producing the proofs a verifier then
// judges) is NOT driven here — the prover-overreach guard is wired at the dispatch boundary so a
// prover turn that smuggles a verdict is discarded, but seeding a fresh workspace is a separate WP
// (see the WP report's deferred-split list). Batching over hard-tier nodes is likewise deferred:
// every hard-tier node gets per-node cross-vendor treatment (the correct default), so pass-1
// `batchEligibleIds` is empty.
//
// M3.9 flagged driver-file addition: `verifyOneNode` now appends one `{kind:"usage",...}` line per
// dispatched turn (when the dispatcher supplies `DispatchedTurn.usage`) — the ONE new record kind
// this WP adds to this log; every existing kind/shape below is untouched. src/drive/report.ts is
// the pure reader of the full log, including this new kind.

import { bindVerdicts, type DispatchState } from "./bind-verdicts";
import { deriveBatchId } from "./batch-composer";
import { encodeVerifierSeam, type VerifierIdentity } from "./identity";
// M3.8 (EDIT flagged for the M3 boundary review — this file's decision layer is L6 validity
// semantics): the apply-time half of the cross-vendor rule (PRD C9), wired into `verifyOneNode`
// below. `decideCrossVendor` is pure (src/drive/cross-vendor.ts); this is the ONE call site that
// gates an ACCEPT item before it is ever added to `items[]` (hence before a verdict file is ever
// written) on a load-bearing (critical-path) node whose recorded author and the dispatching
// verifier's identity are same-family or unparseable.
import { crossVendorRejectionMessage, decideCrossVendor } from "./cross-vendor";
import {
  DEFAULT_MAX_STUCK_ROUNDS,
  DEFAULT_NODE_RETRY_CAP,
  checkRetryCap,
  detectProverOverreach,
  evaluateStuckGuard,
  type DriverStopReason,
} from "./driver-guardrails";
import {
  DEFAULT_BALLOON_NODE_CAP,
  balloonBdTask,
  balloonLogLine,
  buildBalloonEvent,
  detectBalloon,
  parseClassificationReview,
  routingMarksShard,
  type BalloonEvent,
} from "./driver-balloon";
import { applyBalloonMark } from "./driver-frontmatter";
import { selectReadyNodes, type AfNodeView } from "./driver-plan";
import { afItemFromVerdictDocument, type AfApplyItem } from "./driver-verdict-map";
import type { AfWorkspaceView, ApplyReport, FilledVerdictFile, VerdictItemOutcome } from "./driver-af";
import type { AfParseResult } from "./driver-af";
import type { BalloonClassification } from "../graph/types";
import type { Role } from "./vocab";
import type { WorkerUsage } from "./worker-result";

export interface DriverConfig {
  balloonCap: number;
  maxStuckRounds: number;
  nodeRetryCap: number;
  maxRounds: number;
}

export const DEFAULT_DRIVER_CONFIG: DriverConfig = {
  balloonCap: DEFAULT_BALLOON_NODE_CAP,
  maxStuckRounds: DEFAULT_MAX_STUCK_ROUNDS,
  nodeRetryCap: DEFAULT_NODE_RETRY_CAP,
  maxRounds: 50,
};

/** One dispatched verifier turn's already-parsed result (the injected dispatcher owns the spawn +
 * JSON parse). `raw` is shape (a) worker output; `role` and `exit` mirror the worker contract.
 * `usage` (M3.9, additive/optional so every pre-existing test harness still type-checks) is the
 * turn's token accounting, if the dispatcher captured it — logged verbatim to `.rk/driver-log.jsonl`
 * as a `"usage"` record (src/drive/report.ts's data source) regardless of the turn's eventual
 * outcome: tokens are spent whether or not the verdict that came back was ever applied. */
export interface DispatchedTurn {
  raw: unknown;
  role: Role;
  exit: number;
  usage?: WorkerUsage;
}

export interface DriverDeps {
  contractId: string;
  claimId: string;
  identity: VerifierIdentity;
  /** Query af for the workspace's current node state (af's state machine is truth). */
  queryWorkspace(): AfParseResult<AfWorkspaceView>;
  /** Dispatch a verifier turn over one ready node. `undefined` = no worker available (skipped). */
  dispatchVerify(node: AfNodeView): DispatchedTurn | undefined;
  /** Dispatch the balloon-classification turn (verifier role, cheap tier) over the offending
   * subtree; returns the already-parsed worker output. */
  dispatchClassification(subtree: string[]): unknown;
  applyVerdicts(file: FilledVerdictFile): ApplyReport;
  /** M3.8 (PRD C9 cross-vendor rule, apply-time half): true iff `nodeId` is load-bearing — on the
   * path to the north-star contract (PRD C2's critical-path query, `src/graph/query-path.ts`'s
   * `computeCriticalPath`, computed by the CLI wiring over the loaded GraphDocument + configured
   * north star). REQUIRED, not optional with a silent default: a caller with no graph/north-star
   * available must decide explicitly — the strict, validity-preserving choice is `() => true`
   * (treat every node as load-bearing, requiring cross-vendor, when critical-path membership is
   * unknown); `() => false` is available for a repo that has deliberately opted out (constitution-
   * configurable per PRD C9, "default on"). Never silently guessed inside this module. */
  isLoadBearing(nodeId: string): boolean;
  /** Registry shard bytes for `contractId`, or undefined if not found (mandatory-review then logs a
   * loud skip instead of marking). */
  readShard(): string | undefined;
  writeShard(content: string): void;
  /** File a bd task; returns false when bd is absent (skip loudly, never silently). */
  createBdTask(task: { title: string; description: string }): boolean;
  appendLog(line: string): void;
  /** ISO timestamp — the edge owns the clock (L3). */
  now(): string;
  priorBalloonCount: number;
  priorClassifications: BalloonClassification[];
  /** Offending subtree for a balloon (default: all node ids). */
  offendingSubtree?: string[];
  config?: Partial<DriverConfig>;
}

export interface DriverRunResult {
  status: "converged" | "aborted";
  stopReason?: DriverStopReason;
  message: string;
  appliedNodeIds: string[];
  outcomes: VerdictItemOutcome[];
  balloon?: BalloonEvent;
  rounds: number;
}

/** children-before-parent ordering for a per-file `items` array: deeper hierarchical ids
 * ("1.2.3") sort before their ancestors ("1.2"), so an accept's children always appear earlier
 * (../vibefeld/docs/verdicts-apply.md order-dependence). Ties broken lexicographically. */
function childrenFirst(a: AfApplyItem, b: AfApplyItem): number {
  const da = a.node.split(".").length;
  const db = b.node.split(".").length;
  if (da !== db) return db - da;
  return a.node < b.node ? -1 : a.node > b.node ? 1 : 0;
}

function handleBalloon(deps: DriverDeps, ws: AfWorkspaceView, cap: number): DriverRunResult {
  const subtree = deps.offendingSubtree ?? ws.nodes.map((n) => n.id);
  const parsed = parseClassificationReview(deps.dispatchClassification([...subtree].sort()));
  if (!parsed.ok) {
    // Classification failed — still abort (the tripwire fired), but say so loudly; no mark/task on
    // an unclassified balloon (never guess a class).
    const msg = `balloon on ${deps.contractId} (${ws.nodeCount} > ${cap}) but classification failed: ${parsed.reason}`;
    deps.appendLog(JSON.stringify({ kind: "balloon-unclassified", at: deps.now(), contractId: deps.contractId, nodeCount: ws.nodeCount, cap, reason: parsed.reason }));
    return { status: "aborted", stopReason: "balloon-abort", message: msg, appliedNodeIds: [], outcomes: [], rounds: 0 };
  }
  const event = buildBalloonEvent({
    contractId: deps.contractId,
    nodeCount: ws.nodeCount,
    cap,
    review: parsed.review,
    offendingSubtree: subtree,
    priorBalloonCount: deps.priorBalloonCount,
  });
  deps.appendLog(balloonLogLine(event, deps.now()));

  if (routingMarksShard(event.routing)) {
    const shard = deps.readShard();
    if (shard === undefined) {
      deps.appendLog(JSON.stringify({ kind: "balloon-mark-skipped", at: deps.now(), contractId: deps.contractId, reason: "registry shard not found — cannot write mandatory-review mark" }));
    } else {
      const counter = { count: deps.priorBalloonCount + 1, classifications: [...deps.priorClassifications, event.classification] };
      const marked = applyBalloonMark(shard, counter);
      if (marked.ok) deps.writeShard(marked.content);
      else deps.appendLog(JSON.stringify({ kind: "balloon-mark-skipped", at: deps.now(), contractId: deps.contractId, reason: marked.reason }));
    }
  } else {
    const filed = deps.createBdTask(balloonBdTask(event));
    if (!filed) deps.appendLog(JSON.stringify({ kind: "balloon-bd-skipped", at: deps.now(), contractId: deps.contractId, reason: "bd unavailable — task NOT filed; resolve manually", task: balloonBdTask(event).title }));
  }

  return {
    status: "aborted",
    stopReason: "balloon-abort",
    message: `balloon on ${deps.contractId}: ${ws.nodeCount} > ${cap} nodes, classified ${event.classification} → ${event.routing}`,
    appliedNodeIds: [],
    outcomes: [],
    balloon: event,
    rounds: 0,
  };
}

/** Dispatches + binds a single node's verdict, applying the prover-overreach guard. Returns the af
 * item to apply, or a reason it was skipped (never applied). */
function verifyOneNode(deps: DriverDeps, node: AfNodeView, verifiedBySeam: string): { item: AfApplyItem } | { skip: string } {
  const turn = deps.dispatchVerify(node);
  if (turn === undefined) return { skip: "no worker available" };
  // M3.9: log the turn's usage BEFORE any discard check below — tokens are spent on dispatch,
  // independent of whether the resulting verdict is ever applied (src/drive/report.ts reads this
  // "usage" kind; every other kind this loop appends is untouched by this addition).
  if (turn.usage !== undefined) {
    deps.appendLog(JSON.stringify({ kind: "usage", at: deps.now(), contractId: deps.contractId, claimId: deps.claimId, nodeId: node.id, role: turn.role, sessionId: deps.identity.sessionId, usage: turn.usage }));
  }
  const overreach = detectProverOverreach(turn.role, turn.raw);
  if (overreach.discard) {
    deps.appendLog(JSON.stringify({ kind: "prover-overreach", at: deps.now(), node: node.id, reason: overreach.reason }));
    return { skip: `prover overreach: ${overreach.reason}` };
  }
  if (turn.exit !== 0) return { skip: `worker exit ${turn.exit}` };
  if (node.author !== undefined && node.author === verifiedBySeam) return { skip: "reviewer==author (would be rejected by af)" };
  const state: DispatchState = { itemId: node.id, contentHash: node.contentHash, tier: "hard", claimId: deps.claimId, verifier: deps.identity };
  const bound = bindVerdicts(state, turn.raw);
  if (!bound.ok) return { skip: `verdict bind failed: ${bound.issues.map((i) => i.message).join("; ")}` };
  const mapped = afItemFromVerdictDocument(node.id, bound.document);
  if (!mapped.ok) return { skip: `verdict map failed: ${mapped.reason}` };
  // M3.8: the cross-vendor rule only gates PROMOTION — a challenge never accepts the node this
  // turn regardless (driver-verdict-map.ts's own invariant), so there is nothing to promote and
  // nothing to gate. Checked here, per-item, BEFORE `mapped.item` is ever returned into the
  // caller's `items[]` array — i.e. strictly before a verdict file naming this item is composed
  // or written (runVerifyDriver's `applyVerdicts` call sees only items that already cleared this).
  if (mapped.item.verdict === "accept") {
    const decision = decideCrossVendor(node.author, verifiedBySeam, deps.isLoadBearing(node.id));
    if (!decision.satisfied) {
      const reason = crossVendorRejectionMessage(node.id, decision);
      deps.appendLog(JSON.stringify({ kind: "cross-vendor-rejected", at: deps.now(), node: node.id, reason: decision.reason }));
      return { skip: reason };
    }
  }
  return { item: mapped.item };
}

/** Drives one workspace claim to convergence or a named abort. */
export function runVerifyDriver(deps: DriverDeps): DriverRunResult {
  const config = { ...DEFAULT_DRIVER_CONFIG, ...deps.config };
  const seamResult = encodeVerifierSeam(deps.identity);
  if (!seamResult.ok) {
    return { status: "aborted", message: `verifier identity is not encodable: ${seamResult.reason}`, appliedNodeIds: [], outcomes: [], rounds: 0 };
  }
  const verifiedBySeam = seamResult.value;

  const appliedNodeIds: string[] = [];
  const outcomes: VerdictItemOutcome[] = [];
  const attempts = new Map<string, number>();
  let roundsWithoutProgress = 0;
  let round = 0;

  for (; round < config.maxRounds; round++) {
    const q = deps.queryWorkspace();
    if (!q.ok) return { status: "aborted", message: `af query failed: ${q.reason}`, appliedNodeIds, outcomes, rounds: round };
    const ws = q.value;

    const balloon = detectBalloon(ws.nodeCount, config.balloonCap);
    if (balloon.ballooned) {
      const result = handleBalloon(deps, ws, config.balloonCap);
      return { ...result, appliedNodeIds, outcomes, rounds: round };
    }

    const readyIds = selectReadyNodes(ws.nodes);
    if (readyIds.length === 0) {
      return { status: "converged", message: `no verification-ready node remains (${appliedNodeIds.length} applied over ${round} round(s))`, appliedNodeIds, outcomes, rounds: round };
    }

    const byId = new Map(ws.nodes.map((n) => [n.id, n] as const));
    const items: AfApplyItem[] = [];
    for (const id of readyIds) {
      const node = byId.get(id)!;
      const attemptsSoFar = attempts.get(id) ?? 0;
      if (checkRetryCap(attemptsSoFar, config.nodeRetryCap).exhausted) continue;
      const r = verifyOneNode(deps, node, verifiedBySeam);
      if ("item" in r) items.push(r.item);
      else {
        attempts.set(id, attemptsSoFar + 1);
        deps.appendLog(JSON.stringify({ kind: "node-skipped", at: deps.now(), node: id, reason: r.skip }));
      }
    }

    if (items.length === 0) {
      roundsWithoutProgress++;
      const stuck = evaluateStuckGuard(roundsWithoutProgress, config.maxStuckRounds);
      if (stuck.abort) return { status: "aborted", stopReason: "stuck-no-progress", message: stuck.reason!, appliedNodeIds, outcomes, rounds: round + 1 };
      continue;
    }

    const ordered = [...items].sort(childrenFirst);
    const memberIds = ordered.map((i) => i.node);
    const file: FilledVerdictFile = {
      schema_version: "1",
      batch_id: deriveBatchId(deps.contractId, memberIds),
      verified_by: verifiedBySeam,
      items: ordered,
    };
    const report = deps.applyVerdicts(file);
    for (const o of report.items) {
      outcomes.push(o);
      deps.appendLog(JSON.stringify({ kind: "verdict-outcome", at: deps.now(), node: o.node, verdict: o.verdict, status: o.status, exit: report.exit }));
      if (o.status === "applied") appliedNodeIds.push(o.node);
      else attempts.set(o.node, (attempts.get(o.node) ?? 0) + 1);
    }

    if (report.applied > 0) roundsWithoutProgress = 0;
    else {
      roundsWithoutProgress++;
      const stuck = evaluateStuckGuard(roundsWithoutProgress, config.maxStuckRounds);
      if (stuck.abort) return { status: "aborted", stopReason: "stuck-no-progress", message: stuck.reason!, appliedNodeIds, outcomes, rounds: round + 1 };
    }
  }

  return { status: "aborted", stopReason: "stuck-no-progress", message: `hit maxRounds (${config.maxRounds}) without convergence`, appliedNodeIds, outcomes, rounds: round };
}
