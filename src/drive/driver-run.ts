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

import { encodeVerifierSeam } from "./identity";
import { checkBudget, checkRetryCap, evaluateStuckGuard, evaluateChurnGuard } from "./driver-guardrails";
import { detectBalloon } from "./driver-balloon";
import { handleBalloon } from "./driver-balloon-run";
import { selectProverReadyNodes, selectVerifierReadyNodes, type AfNodeView } from "./driver-plan";
import { childrenFirst, verifyOneNode } from "./driver-verify-node";
import { proveOneNode } from "./driver-prove-node";
import { DEFAULT_DRIVER_CONFIG, type DriverDeps, type DriverRunResult } from "./driver-types";
import type { AfApplyItem } from "./driver-verdict-map";
import type { FilledVerdictFile, VerdictItemOutcome } from "./driver-af";
import type { DriverStopReason } from "./driver-guardrails";

// Re-exported so pre-existing importers keep their `from "./driver-run"` paths after the split.
export { DEFAULT_DRIVER_CONFIG } from "./driver-types";
export type { DriverConfig, DispatchedTurn, DriverDeps, DriverRunResult } from "./driver-types";
export type { ProofContent, ProofChild, RecordProofResult, ProveNodeOutcome } from "./driver-prove-node";
export type { VerifyNodeOutcome } from "./driver-verify-node";


/** The claim's root: af's root is unconditionally id "1" (AF_ROOT_NODE_ID); a synthetic
 * single-subtree fixture may carry only a deeper id, so the root is taken as the shallowest id
 * (fewest dot-components, ties broken lexicographically). */
function findRoot(nodes: readonly AfNodeView[]): AfNodeView | undefined {
  let root: AfNodeView | undefined;
  for (const n of nodes) {
    if (root === undefined) { root = n; continue; }
    const dn = n.id.split(".").length;
    const dr = root.id.split(".").length;
    if (dn < dr || (dn === dr && n.id < root.id)) root = n;
  }
  return root;
}

/** M3 blocker 2 + rk B3: decide whether an EMPTY frontier is a real convergence. An empty frontier
 * (no prover- or verifier-ready node) is NOT proof of success — it also describes a root that is
 * challenged, blocked, claimed, or unproven. Convergence requires the root to be af-`validated` AND
 * af-`closed` (the authoritative bottom-up closure signal, ../vibefeld/internal/export): the bare
 * epistemic axis is unchanged by a blocking challenge landing on an already-validated node, so
 * "validated == converged" would falsely report success (the exact B3 defect). Every non-converged
 * case returns a DISTINCT named stopReason. */
function classifyRootConvergence(nodes: readonly AfNodeView[]): { converged: true } | { converged: false; stopReason: DriverStopReason; detail: string } {
  const root = findRoot(nodes);
  if (root === undefined) return { converged: false, stopReason: "root-unvalidated", detail: "no root node in the workspace" };
  // Workflow state first: a claimed/blocked root is mid-flight or blocked work, never a convergence,
  // regardless of its epistemic axis (rk B3: "reject claimed/blocked roots explicitly").
  if (root.workflowState === "blocked") return { converged: false, stopReason: "root-blocked", detail: `root ${root.id} is workflow-blocked` };
  if (root.workflowState === "claimed") return { converged: false, stopReason: "root-claimed", detail: `root ${root.id} is claimed (work in flight)` };
  if (root.epistemicState !== "validated") return { converged: false, stopReason: "root-unvalidated", detail: `root ${root.id} epistemic state is '${root.epistemicState}', not validated` };
  // Validated: require af's closure flag. A validated-but-not-closed root is challenged (a blocking
  // challenge landed post-validation) or has a descendant that fell out of closed — never converged.
  if (root.closed !== true) return { converged: false, stopReason: "root-not-closed", detail: `root ${root.id} is validated but af does not report it closed — a blocking challenge on the validated root, or an unsettled descendant` };
  return { converged: true };
}

/** rk-jit (STOP-4): a deterministic, node-sorted enumeration of vacuous-accept counts for the abort
 * message — e.g. "node '1' ×3, node '1.2' ×1". Pure. */
function vacuousDetail(vacuousAccepts: ReadonlyMap<string, number>): string {
  return [...vacuousAccepts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([id, n]) => `node '${id}' ×${n}`)
    .join(", ");
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
  // rk-jit (STOP-4): per-node count of accepts discarded as vacuous (a verifier accepted a proofless
  // node — nothing to verify). Non-empty at a stuck abort means the run dead-ended on the bootstrap
  // deadlock, not a generic stall; the abort names the real cause + counts. Never touches convergence.
  const vacuousAccepts = new Map<string, number>();
  let roundsWithoutProgress = 0;
  // rk-cpk (review FU2): churn accounting, distinct from the stuck guard. The stuck guard resets on
  // ANY structural write (a recorded proof), so a prove/challenge chain that grows the tree every
  // round while nothing ever validates never trips it. These counters measure STRUCTURAL WRITES since
  // the last EPISTEMIC advancement (an accept): `proofRecordsByNode` per node, `roundsOfGrowthWithout
  // Advance` the run of growth-only rounds. An accept clears BOTH (genuine progress is never churn).
  const proofRecordsByNode = new Map<string, number>();
  let roundsOfGrowthWithoutAdvance = 0;
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

    const proverReadyIds = selectProverReadyNodes(ws.nodes);
    const verifierReadyIds = selectVerifierReadyNodes(ws.nodes);
    if (proverReadyIds.length === 0 && verifierReadyIds.length === 0) {
      // M3 blocker 2 + rk B3: nothing prover- OR verifier-ready. Converge ONLY when the ROOT is
      // af-validated AND af-closed — otherwise the campaign stalled on a challenged/blocked/claimed/
      // unproven root and aborts with a DISTINCT named reason. Producing proof content alone never
      // converges; a blocking challenge on an already-validated root is NOT convergence (B3).
      const rc = classifyRootConvergence(ws.nodes);
      if (rc.converged) {
        return { status: "converged", message: `root validated and closed; nothing prover- or verifier-ready remains (${appliedNodeIds.length} accept(s) over ${round} round(s))`, appliedNodeIds, outcomes, rounds: round };
      }
      return { status: "aborted", stopReason: rc.stopReason, message: `frontier empty but the claim did not converge: ${rc.detail} (${appliedNodeIds.length} accept(s) over ${round} round(s))`, appliedNodeIds, outcomes, rounds: round };
    }

    const byId = new Map(ws.nodes.map((n) => [n.id, n] as const));
    let progressed = false;
    // rk-cpk: split `progressed` (proof OR accept — drives the stuck guard, unchanged) into its two
    // components for the churn cap. `structuralWrite` = a proof was recorded (the tree grew);
    // `epistemicAdvance` = a node newly reached validated (an af accept applied). Only the latter is
    // real progress; a structural write with no advance is what the churn cap counts.
    let structuralWrite = false;
    let epistemicAdvance = false;

    // PROVE half (rk-gn4): dispatch a PROVER turn over each prover-ready node and record its
    // decomposition into af. A recorded proof IS progress — af re-classifies the node next round and
    // the verifier path takes over. proveOneNode NEVER mints a verdict (driver-prove-node.ts): it
    // calls no apply/bind, and its role + overreach guards discard any verdict a prover smuggles.
    for (const id of proverReadyIds) {
      const node = byId.get(id)!;
      const attemptsSoFar = attempts.get(id) ?? 0;
      if (checkRetryCap(attemptsSoFar, config.nodeRetryCap).exhausted) continue;
      // rk-s9t rule 2: pre-dispatch budget check — a prover turn accrues to the SAME campaign cap
      // and the (cap+1)th token is never requested regardless of role.
      if (deps.budget) {
        const decision = checkBudget(tokensSpent, deps.budget);
        if (!decision.affordable) return { status: "aborted", stopReason: "budget-exhausted", message: decision.reason!, appliedNodeIds, outcomes, rounds: round + 1 };
      }
      const pr = await proveOneNode(deps, node);
      tokensSpent += pr.spentTokens; // accrue whether the proof recorded or the turn was discarded
      if ("recorded" in pr) {
        progressed = true;
        // rk-cpk: a recorded proof is a STRUCTURAL write, not epistemic advancement — count it per
        // node so a spinning prove/refine cycle is caught by the churn cap the stuck guard misses.
        structuralWrite = true;
        proofRecordsByNode.set(id, (proofRecordsByNode.get(id) ?? 0) + 1);
      }
      else {
        attempts.set(id, attemptsSoFar + 1);
        deps.appendLog(JSON.stringify({ kind: "node-skipped", at: deps.now(), node: id, reason: pr.skip }));
      }
    }

    // VERIFY half: dispatch a VERIFIER turn over each verifier-ready node, bind, collect apply items.
    // Unchanged validity path (M3 repair wave — verifier-only, per-node, hash-re-bound).
    const composed: { item: AfApplyItem; contentHash: string }[] = [];
    for (const id of verifierReadyIds) {
      const node = byId.get(id)!;
      const attemptsSoFar = attempts.get(id) ?? 0;
      if (checkRetryCap(attemptsSoFar, config.nodeRetryCap).exhausted) continue;
      if (deps.budget) {
        const decision = checkBudget(tokensSpent, deps.budget);
        if (!decision.affordable) return { status: "aborted", stopReason: "budget-exhausted", message: decision.reason!, appliedNodeIds, outcomes, rounds: round + 1 };
      }
      const r = await verifyOneNode(deps, node, verifiedBySeam);
      tokensSpent += r.spentTokens; // accrue whether the turn applied or was discarded
      if ("item" in r) composed.push({ item: r.item, contentHash: r.contentHash });
      else {
        attempts.set(id, attemptsSoFar + 1);
        // rk-jit (STOP-4): tally a vacuous-accept discard so a stuck abort can name the bootstrap
        // deadlock as its cause instead of the opaque stuck-no-progress.
        if (r.vacuousNode !== undefined) vacuousAccepts.set(r.vacuousNode, (vacuousAccepts.get(r.vacuousNode) ?? 0) + 1);
        deps.appendLog(JSON.stringify({ kind: "node-skipped", at: deps.now(), node: id, reason: r.skip }));
      }
    }

    if (composed.length > 0) {
      // M3 blocker 1: re-read the authoritative af node hashes immediately before apply and discard
      // any verdict whose bound bytes changed between dispatch and apply. A node absent from the
      // re-read (deleted/renamed) counts as a mismatch — fail closed.
      const fresh = deps.reReadContentHashes();
      // M3 blocker 3: pass-1 hard tier is all per-node — each verdict is its OWN non-batch apply
      // (empty batch_id), children-first so a child is recorded before its parent. M3 blocker 2:
      // only an af-recorded ACCEPT is progress; a recorded challenge is never counted.
      const ordered = [...composed].sort((a, b) => childrenFirst(a.item, b.item));
      for (const { item, contentHash } of ordered) {
        const current = fresh.get(item.node);
        if (current === undefined || current !== contentHash) {
          deps.appendLog(JSON.stringify({ kind: "node-skipped", at: deps.now(), node: item.node, reason: `stale verdict discarded: af node content hash changed between dispatch and apply (bound ${contentHash}, current ${current ?? "absent"})` }));
          attempts.set(item.node, (attempts.get(item.node) ?? 0) + 1);
          continue;
        }
        // rk B1: send the bound content hash as `expect_hash` so af RE-checks it (and verifier-ready
        // availability) atomically under its own state read — the kernel guarantee the driver-side
        // re-read above cannot give on its own. Both guards agree here; the af one is authoritative.
        const file: FilledVerdictFile = { schema_version: "1", batch_id: "", verified_by: verifiedBySeam, items: [{ ...item, expect_hash: contentHash }] };
        const report = deps.applyVerdicts(file);
        for (const o of report.items) {
          outcomes.push(o);
          deps.appendLog(JSON.stringify({ kind: "verdict-outcome", at: deps.now(), node: o.node, verdict: o.verdict, status: o.status, exit: report.exit }));
          if (o.status === "applied" && o.verdict === "accept") { appliedNodeIds.push(o.node); progressed = true; epistemicAdvance = true; /* rk-cpk: an accept is the ONLY epistemic advancement — a node newly validated */ }
          else attempts.set(o.node, (attempts.get(o.node) ?? 0) + 1);
        }
      }
    }

    // Progress this round = a recorded proof OR an af-applied accept. No progress → stuck guard.
    if (progressed) roundsWithoutProgress = 0;
    else {
      roundsWithoutProgress++;
      const stuck = evaluateStuckGuard(roundsWithoutProgress, config.maxStuckRounds);
      if (stuck.abort) {
        // rk-jit (STOP-4): if the stall was caused by vacuous accepts on proofless node(s), name the
        // real cause (the bootstrap deadlock) and enumerate the counts — never the opaque
        // stuck-no-progress an operator can only diagnose from the raw log. Convergence untouched.
        if (vacuousAccepts.size > 0) {
          return { status: "aborted", stopReason: "bootstrap-vacuous-accepts", message: `no progress and the verifier accepted proofless node(s) that were discarded as vacuous (${vacuousDetail(vacuousAccepts)}) — a fresh conjecture cannot bootstrap: a PROVER must produce proof content before a verifier has anything to verify. ${stuck.reason!}`, appliedNodeIds, outcomes, rounds: round + 1 };
        }
        return { status: "aborted", stopReason: "stuck-no-progress", message: stuck.reason!, appliedNodeIds, outcomes, rounds: round + 1 };
      }
    }

    // rk-cpk (review FU2): churn cap — abort a run that only GROWS (records proofs) without ever
    // ADVANCING (validating a node). An epistemic advance clears the churn state (genuine progress is
    // never churn); a growth-only round accrues it. This catches the spinning prove/challenge chain
    // that resets the stuck guard every round — earlier than maxRounds/budget, and naming the
    // offending node(s) so an operator sees WHERE it spun. Never converges a run; only aborts sooner.
    if (epistemicAdvance) {
      roundsOfGrowthWithoutAdvance = 0;
      proofRecordsByNode.clear();
    } else if (structuralWrite) {
      roundsOfGrowthWithoutAdvance++;
    }
    const churn = evaluateChurnGuard(proofRecordsByNode, roundsOfGrowthWithoutAdvance, config.nodeChurnCap, config.maxChurnRounds);
    if (churn.abort) {
      deps.appendLog(JSON.stringify({ kind: "churn-cap", at: deps.now(), reason: churn.reason, offenders: churn.offenders }));
      return { status: "aborted", stopReason: "churn-cap", message: churn.reason!, appliedNodeIds, outcomes, rounds: round + 1 };
    }
  }

  // rk-jit (STOP-4): same bootstrap-deadlock naming at the maxRounds fall-through.
  if (vacuousAccepts.size > 0) {
    return { status: "aborted", stopReason: "bootstrap-vacuous-accepts", message: `hit maxRounds (${config.maxRounds}) without convergence; the verifier accepted proofless node(s) that were discarded as vacuous (${vacuousDetail(vacuousAccepts)}) — a PROVER must produce proof content first`, appliedNodeIds, outcomes, rounds: round };
  }
  return { status: "aborted", stopReason: "stuck-no-progress", message: `hit maxRounds (${config.maxRounds}) without convergence`, appliedNodeIds, outcomes, rounds: round };
}
