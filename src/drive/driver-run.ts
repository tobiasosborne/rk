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
//
// M3.5-prep FLAGGED injection point (this WP, src/drive/driver-live.ts): `dispatchVerify` and
// `dispatchClassification` were synchronous-only, which no real backend call (subprocess spawn,
// M3.2 `WorkerBackend.createSession`/`runTurn`) can honor — those are Promises by their PINNED
// interface (src/drive/backend-types.ts). The MINIMAL fix: both hooks may now ALSO return a
// Promise of their prior result, and `runVerifyDriver`/`verifyOneNode`/`handleBalloon` are marked
// `async` with an `await` at each call site. Every decision RULE (ordering, guardrails, balloon
// routing, retry/stuck caps, af apply) is byte-for-byte unchanged — only the sync/async boundary
// moved. Every injected fake in test/drive/driver-run.test.ts still returns plain values (an
// `await` on a non-Promise resolves on the next microtask, changing nothing observable), so no
// existing test's ASSERTIONS changed, only its `test(...)` callback and call site gained
// `async`/`await` keywords. Callers of `runVerifyDriver` now receive `Promise<DriverRunResult>`.

import { bindVerdicts, type DispatchState } from "./bind-verdicts";
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
  checkBudget,
  checkRetryCap,
  detectProverOverreach,
  evaluateStuckGuard,
  usageTokens,
  type BudgetConfig,
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
  /** Dispatch a verifier turn over one ready node. `undefined` = no worker available (skipped).
   * MAY return a Promise (M3.5-prep, src/drive/driver-live.ts's real backend calls — see the file
   * header's flagged injection-point note); every existing synchronous fake still type-checks. */
  dispatchVerify(node: AfNodeView): DispatchedTurn | undefined | Promise<DispatchedTurn | undefined>;
  /** Dispatch the balloon-classification turn (verifier role, cheap tier) over the offending
   * subtree; returns the already-parsed worker output. MAY return a Promise (same note as
   * `dispatchVerify` above) — typed `unknown` already, so no signature change is needed here. */
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
  /** M3 blocker 1: re-read the authoritative af node content hashes (nodeId -> content_hash) as of
   * NOW, called immediately before an apply. REQUIRED, never optional with a trust-the-query
   * default: binding a verdict to the pre-dispatch hash and applying without re-confirming lets an
   * edit during the model turn (or a stale caller) validate unreviewed bytes. The live edge
   * re-runs `af export` here (src/cli/verify-live.ts); a node missing from the returned map is
   * treated as a mismatch and its verdict discarded (fail closed). */
  reReadContentHashes(): Map<string, string>;
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
  /** rk-s9t (M3 milestone review verdict (c)): the campaign-level token spend guard. OPTIONAL in
   * this pure type so every synthetic/dry test harness runs with no cap (and every pre-existing
   * caller still type-checks), but REQUIRED-FOR-LIVE at the edge — src/cli/verify-live.ts refuses
   * to start a `--live` run without `--max-campaign-tokens`, the exact hole the review named (a
   * real-token run with no ceiling). When set, the loop tracks total tokens spent across EVERY
   * dispatched turn (input+output+cache, applied OR discarded — mirroring l5-dispatch's blocker-8
   * "a rejected turn still spent real tokens" rule) and, before EACH real dispatch, refuses a call
   * it cannot afford, aborting with stopReason "budget-exhausted" rather than truncating mid-call.
   * The counter is plain arithmetic over injected `DispatchedTurn.usage` values, so the core stays
   * pure (no fs/clock/env). */
  budget?: BudgetConfig;
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

/** M3 blocker 2: convergence requires the claim's ROOT to be af-validated. An empty frontier (no
 * verification-ready node) is NOT proof of success — it also describes a claim whose root was
 * challenged, blocked, or left unproven. af's root is unconditionally id "1" (AF_ROOT_NODE_ID); a
 * synthetic single-subtree fixture may carry only a deeper id, so the root is taken as the
 * shallowest id (fewest dot-components, ties broken lexicographically). Returns true iff that node
 * exists and af reports its epistemic state as `validated`. */
function isRootValidated(nodes: readonly AfNodeView[]): boolean {
  let root: AfNodeView | undefined;
  for (const n of nodes) {
    if (root === undefined) { root = n; continue; }
    const dn = n.id.split(".").length;
    const dr = root.id.split(".").length;
    if (dn < dr || (dn === dr && n.id < root.id)) root = n;
  }
  return root !== undefined && root.epistemicState === "validated";
}

async function handleBalloon(deps: DriverDeps, ws: AfWorkspaceView, cap: number, tokensSpent: number): Promise<DriverRunResult> {
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

/** The outcome of one `verifyOneNode` call. `spentTokens` (rk-s9t) is the turn's all-in token cost
 * (0 when no worker was available or the dispatcher reported no usage) — reported on BOTH the apply
 * and the skip branch so the caller adds it to the running campaign total regardless of whether the
 * verdict was ever applied (a rejected/discarded turn spent real tokens too). */
type VerifyNodeOutcome = { spentTokens: number } & ({ item: AfApplyItem; contentHash: string } | { skip: string });

/** Dispatches + binds a single node's verdict, applying the prover-overreach guard. Returns the af
 * item to apply (with the content hash the verdict was bound against, so the caller can re-confirm
 * the authoritative bytes immediately before apply — M3 blocker 1), or a reason it was skipped
 * (never applied); either way carries the turn's `spentTokens` for the campaign budget. */
async function verifyOneNode(deps: DriverDeps, node: AfNodeView, verifiedBySeam: string): Promise<VerifyNodeOutcome> {
  const turn = await deps.dispatchVerify(node);
  if (turn === undefined) return { spentTokens: 0, skip: "no worker available" };
  const spentTokens = turn.usage !== undefined ? usageTokens(turn.usage) : 0;
  // M3.9: log the turn's usage BEFORE any discard check below — tokens are spent on dispatch,
  // independent of whether the resulting verdict is ever applied (src/drive/report.ts reads this
  // "usage" kind; every other kind this loop appends is untouched by this addition).
  if (turn.usage !== undefined) {
    deps.appendLog(JSON.stringify({ kind: "usage", at: deps.now(), contractId: deps.contractId, claimId: deps.claimId, nodeId: node.id, role: turn.role, sessionId: deps.identity.sessionId, usage: turn.usage }));
  }
  const overreach = detectProverOverreach(turn.role, turn.raw);
  if (overreach.discard) {
    deps.appendLog(JSON.stringify({ kind: "prover-overreach", at: deps.now(), node: node.id, reason: overreach.reason }));
    return { spentTokens, skip: `prover overreach: ${overreach.reason}` };
  }
  // M3 blocker 3: this apply path records af ACCEPTANCES, and only a verifier may author one
  // (PRD C9 — provers prove, reviewers review). The overreach guard above deliberately EXEMPTS the
  // reviewer role (a reviewer legitimately emits verdicts in other pipelines), so a reviewer turn
  // would otherwise sail through and mint an af acceptance here. Require the exact `verifier` role;
  // any other role's turn is discarded (logged as a node-skipped by the caller, never applied).
  if (turn.role !== "verifier") {
    return { spentTokens, skip: `role '${turn.role}' cannot mint an af verdict — only 'verifier' authors af acceptances (PRD C9)` };
  }
  if (turn.exit !== 0) return { spentTokens, skip: `worker exit ${turn.exit}` };
  if (node.author !== undefined && node.author === verifiedBySeam) return { spentTokens, skip: "reviewer==author (would be rejected by af)" };
  const state: DispatchState = { itemId: node.id, contentHash: node.contentHash, tier: "hard", claimId: deps.claimId, verifier: deps.identity };
  const bound = bindVerdicts(state, turn.raw);
  if (!bound.ok) return { spentTokens, skip: `verdict bind failed: ${bound.issues.map((i) => i.message).join("; ")}` };
  const mapped = afItemFromVerdictDocument(node.id, bound.document);
  if (!mapped.ok) return { spentTokens, skip: `verdict map failed: ${mapped.reason}` };
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
      return { spentTokens, skip: reason };
    }
  }
  return { spentTokens, item: mapped.item, contentHash: node.contentHash };
}

/** Drives one workspace claim to convergence or a named abort. */
export async function runVerifyDriver(deps: DriverDeps): Promise<DriverRunResult> {
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
  // rk-s9t: running campaign token total, summed across EVERY dispatched turn (applied or
  // discarded). The pre-dispatch checks below (and handleBalloon's) read it; verifyOneNode returns
  // each turn's cost so it accrues here regardless of the turn's outcome.
  let tokensSpent = 0;

  for (; round < config.maxRounds; round++) {
    const q = deps.queryWorkspace();
    if (!q.ok) return { status: "aborted", message: `af query failed: ${q.reason}`, appliedNodeIds, outcomes, rounds: round };
    const ws = q.value;

    const balloon = detectBalloon(ws.nodeCount, config.balloonCap);
    if (balloon.ballooned) {
      const result = await handleBalloon(deps, ws, config.balloonCap, tokensSpent);
      return { ...result, appliedNodeIds, outcomes, rounds: round };
    }

    const readyIds = selectReadyNodes(ws.nodes);
    if (readyIds.length === 0) {
      // M3 blocker 2: an empty frontier only converges when the ROOT is actually validated —
      // otherwise the campaign stalled on a challenged/blocked/unproven root and must abort with a
      // named reason, never report success without an accepted proof of the contract.
      if (isRootValidated(ws.nodes)) {
        return { status: "converged", message: `root validated; no verification-ready node remains (${appliedNodeIds.length} accept(s) over ${round} round(s))`, appliedNodeIds, outcomes, rounds: round };
      }
      return { status: "aborted", stopReason: "root-unvalidated", message: `frontier empty but the root claim is not validated — a recorded challenge, block, or unproven root never converges (${appliedNodeIds.length} accept(s) over ${round} round(s))`, appliedNodeIds, outcomes, rounds: round };
    }

    const byId = new Map(ws.nodes.map((n) => [n.id, n] as const));
    const composed: { item: AfApplyItem; contentHash: string }[] = [];
    for (const id of readyIds) {
      const node = byId.get(id)!;
      const attemptsSoFar = attempts.get(id) ?? 0;
      if (checkRetryCap(attemptsSoFar, config.nodeRetryCap).exhausted) continue;
      // rk-s9t rule 2: pre-dispatch remaining-budget check — BEFORE the real model call, refuse any
      // node whose next turn the campaign budget cannot afford, aborting rather than requesting a
      // token past the cap. Fires per-node so the (cap+1)th token is never requested.
      if (deps.budget) {
        const decision = checkBudget(tokensSpent, deps.budget);
        if (!decision.affordable) {
          return { status: "aborted", stopReason: "budget-exhausted", message: decision.reason!, appliedNodeIds, outcomes, rounds: round + 1 };
        }
      }
      const r = await verifyOneNode(deps, node, verifiedBySeam);
      tokensSpent += r.spentTokens; // accrue whether the turn applied or was discarded
      if ("item" in r) composed.push({ item: r.item, contentHash: r.contentHash });
      else {
        attempts.set(id, attemptsSoFar + 1);
        deps.appendLog(JSON.stringify({ kind: "node-skipped", at: deps.now(), node: id, reason: r.skip }));
      }
    }

    if (composed.length === 0) {
      roundsWithoutProgress++;
      const stuck = evaluateStuckGuard(roundsWithoutProgress, config.maxStuckRounds);
      if (stuck.abort) return { status: "aborted", stopReason: "stuck-no-progress", message: stuck.reason!, appliedNodeIds, outcomes, rounds: round + 1 };
      continue;
    }

    // M3 blocker 1: re-read the authoritative af node hashes immediately before apply and discard
    // any verdict whose bound bytes changed between dispatch and apply (an edit during the model
    // turn, or a stale caller). A node absent from the re-read (deleted/renamed) counts as a
    // mismatch — fail closed, never validate content that can no longer be re-confirmed.
    const fresh = deps.reReadContentHashes();

    // M3 blocker 3: pass-1 hard tier is all per-node (batchEligibleIds empty) — apply each verdict
    // as its OWN non-batch af verdicts-apply file (empty batch_id), in children-first order so a
    // child is recorded before its parent. Only an actual composed batch may share one apply and a
    // real batch_id; a per-node acceptance must never carry batch provenance it did not earn.
    // M3 blocker 2: only an af-recorded ACCEPT is validation progress. A recorded challenge is
    // repair-required (its verdict-outcome log line carries verdict:"challenge"), never counted.
    const ordered = [...composed].sort((a, b) => childrenFirst(a.item, b.item));
    let acceptsThisRound = 0;
    for (const { item, contentHash } of ordered) {
      const current = fresh.get(item.node);
      if (current === undefined || current !== contentHash) {
        deps.appendLog(JSON.stringify({ kind: "node-skipped", at: deps.now(), node: item.node, reason: `stale verdict discarded: af node content hash changed between dispatch and apply (bound ${contentHash}, current ${current ?? "absent"})` }));
        attempts.set(item.node, (attempts.get(item.node) ?? 0) + 1);
        continue;
      }
      const file: FilledVerdictFile = {
        schema_version: "1",
        batch_id: "",
        verified_by: verifiedBySeam,
        items: [item],
      };
      const report = deps.applyVerdicts(file);
      for (const o of report.items) {
        outcomes.push(o);
        deps.appendLog(JSON.stringify({ kind: "verdict-outcome", at: deps.now(), node: o.node, verdict: o.verdict, status: o.status, exit: report.exit }));
        if (o.status === "applied" && o.verdict === "accept") {
          appliedNodeIds.push(o.node);
          acceptsThisRound++;
        } else {
          attempts.set(o.node, (attempts.get(o.node) ?? 0) + 1);
        }
      }
    }

    if (acceptsThisRound > 0) roundsWithoutProgress = 0;
    else {
      roundsWithoutProgress++;
      const stuck = evaluateStuckGuard(roundsWithoutProgress, config.maxStuckRounds);
      if (stuck.abort) return { status: "aborted", stopReason: "stuck-no-progress", message: stuck.reason!, appliedNodeIds, outcomes, rounds: round + 1 };
    }
  }

  return { status: "aborted", stopReason: "stuck-no-progress", message: `hit maxRounds (${config.maxRounds}) without convergence`, appliedNodeIds, outcomes, rounds: round };
}
