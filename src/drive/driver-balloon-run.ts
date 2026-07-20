// EDGE-composed — the balloon-tripwire handling split out of src/drive/driver-run.ts (shard-cap
// cut). When a workspace's node count exceeds the per-contract cap, the driver classifies the
// offending subtree, routes it (bd provisioning/factoring task OR mandatory review), persists the
// durable balloon counter to the registry shard (M3 blocker 7 — on EVERY balloon, before routing),
// and ABORTS with the balloon-abort reason AUGMENTING the signal (PRD C9). All side effects are the
// injected DriverDeps hooks; this module composes the pure balloon cores (driver-balloon.ts) and the
// shard-marking core (driver-frontmatter.ts) and does the wiring/ordering only.

import { checkBudget } from "./driver-guardrails";
import {
  balloonBdTask,
  balloonLogLine,
  buildBalloonEvent,
  parseClassificationReview,
  routingMarksShard,
} from "./driver-balloon";
import { applyBalloonMark } from "./driver-frontmatter";
import type { AfWorkspaceView } from "./driver-af";
import type { DriverDeps, DriverRunResult } from "./driver-types";

export async function handleBalloon(deps: DriverDeps, ws: AfWorkspaceView, cap: number, tokensSpent: number): Promise<DriverRunResult> {
  const subtree = deps.offendingSubtree ?? ws.nodes.map((n) => n.id);
  // rk-s9t rule 2: the balloon-classification turn is itself a real model call — refuse it too when
  // the campaign budget cannot afford it (fail closed; budget precedence over the balloon dispatch).
  if (deps.budget) {
    const decision = checkBudget(tokensSpent, deps.budget);
    if (!decision.affordable) {
      return { status: "aborted", stopReason: "budget-exhausted", message: `budget-exhausted before balloon classification: ${decision.reason}`, appliedNodeIds: [], outcomes: [], rounds: 0 };
    }
  }
  const parsed = parseClassificationReview(await deps.dispatchClassification([...subtree].sort()));
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

  // M3 blocker 7: persist the classified balloon's counter to the registry shard on EVERY balloon,
  // BEFORE routing — not only on the mandatory-review routings. A first missing-fact/dag-dep
  // balloon that only filed a bd task left the durable counter at 0, so the very next balloon on
  // the same contract stayed "first" indefinitely and never escalated to mandatory-review. The
  // persisted counter (count + classification history) is the durable state routeBalloon reads via
  // `priorBalloonCount` on the next run (src/cli/verify-live.ts reads it back off this frontmatter).
  const shard = deps.readShard();
  if (shard === undefined) {
    deps.appendLog(JSON.stringify({ kind: "balloon-mark-skipped", at: deps.now(), contractId: deps.contractId, reason: "registry shard not found — cannot persist balloon counter (repeat-detection will not be durable)" }));
  } else {
    const counter = { count: deps.priorBalloonCount + 1, classifications: [...deps.priorClassifications, event.classification] };
    const marked = applyBalloonMark(shard, counter);
    if (marked.ok) deps.writeShard(marked.content);
    else deps.appendLog(JSON.stringify({ kind: "balloon-mark-skipped", at: deps.now(), contractId: deps.contractId, reason: marked.reason }));
  }

  // Routing-specific side effect: a bd-routed balloon (missing-fact/dag-dep) ALSO files a
  // provisioning/factoring task. mandatory-review (genuine-gap or repeat) needs nothing beyond the
  // durable counter above — the persisted count/classification IS the mandatory-review flag.
  if (!routingMarksShard(event.routing)) {
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
