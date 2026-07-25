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
//
// rk-y83/rk-tbg shard-cap split: the per-round PROVE-half + VERIFY-half + verdict-apply dispatch
// (previously inlined here) now lives in src/drive/driver-run-round.ts's `dispatchRound`. This file
// keeps the LOOP skeleton only — af query, the balloon tripwire, the empty-frontier convergence
// classification, and the cross-round stuck/churn guardrail bookkeeping — and calls `dispatchRound`
// once per round for the dispatch/apply half. No decision rule moved; only the wiring did.

import { encodeVerifierSeam } from "./identity";
import { evaluateStuckGuard, evaluateChurnGuard } from "./driver-guardrails";
import { detectBalloon } from "./driver-balloon";
import { handleBalloon } from "./driver-balloon-run";
import { selectProverReadyNodes, selectVerifierReadyNodes, type AfNodeView } from "./driver-plan";
import { dispatchRound, type RoundState } from "./driver-run-round";
import { stallReasonClass, appendStallCause, challengeStallClass } from "./driver-stall";
import { DEFAULT_DRIVER_CONFIG, type DriverDeps, type DriverRunResult } from "./driver-types";
import type { VerdictItemOutcome } from "./driver-af";
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
  // rk-jit (STOP-4), corrected by the blocker-review FU2: per-node count of accepts discarded as
  // vacuous SINCE THE LAST PROGRESS. Non-empty at a stuck/maxRounds abort means the run is dead-ended
  // on the bootstrap deadlock RIGHT NOW (a proofless root nobody proved), not that it merely touched
  // one earlier. Cleared on any progress (below) so an early discard followed by genuine progress and
  // a later UNRELATED stall is never mislabeled "bootstrap-vacuous-accepts". The durable cumulative
  // record lives in the driver log (each discard writes a `vacuous-accept-discarded` line, counted by
  // src/drive/report.ts) — this in-memory map only picks the current stall's stop reason. Never
  // touches convergence.
  const vacuousSinceProgress = new Map<string, number>();
  // RUN-REPORT-8 (carried P2): node-skipped reason CLASS → count SINCE THE LAST PROGRESS. Feeds the
  // dominant-cause suffix on a stuck-no-progress abort so the stop names WHY it stalled (e.g.
  // "dominant cause: cross-vendor: identity-unparseable ×3") instead of the opaque bare reason.
  // Message-only; cleared on progress alongside the other since-progress tallies.
  const stallCauses = new Map<string, number>();
  const noteSkip = (reason: string) => { const c = stallReasonClass(reason); stallCauses.set(c, (stallCauses.get(c) ?? 0) + 1); };
  // rk-dp1 (RUN-REPORT-9): companion to noteSkip for an APPLIED challenge (see driver-run-round.ts's
  // dispatchRound, which calls this) — DELIBERATELY keeps the node id (challengeStallClass), unlike
  // stallReasonClass, so a stuck abort names WHICH node spun on a repeated challenge.
  const noteChallengeStall = (nodeId: string, category: string | undefined) => {
    const c = challengeStallClass(nodeId, category);
    stallCauses.set(c, (stallCauses.get(c) ?? 0) + 1);
  };
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
  // The per-round dispatch/apply half (driver-run-round.ts's dispatchRound) mutates these SAME
  // references round over round — not copied, so every tally above stays authoritative for this
  // loop's own stuck/churn bookkeeping below.
  const roundState: RoundState = { attempts, proofRecordsByNode, vacuousSinceProgress, appliedNodeIds, outcomes };

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
    // PROVE half + VERIFY half + apply (rk-gn4/M3 blockers 1/3), split out to driver-run-round.ts
    // (rk-y83/rk-tbg shard-cap split) — byte-for-byte the same dispatch/apply this loop always ran,
    // now returning its progress flags instead of mutating locals directly. `dispatch.done` means a
    // pre-dispatch budget check failed mid-round; return its abort result immediately, same as the
    // inline early-returns this replaced.
    const dispatch = await dispatchRound(deps, round, config.nodeRetryCap, proverReadyIds, verifierReadyIds, ws.nodes, byId, verifiedBySeam, tokensSpent, roundState, noteSkip, noteChallengeStall);
    if (dispatch.done) return dispatch.result;
    tokensSpent = dispatch.tokensSpent;
    // rk-cpk: split `progressed` (proof OR accept — drives the stuck guard, unchanged) into its two
    // components for the churn cap. `structuralWrite` = a proof was recorded (the tree grew);
    // `epistemicAdvance` = a node newly reached validated (an af accept applied). Only the latter is
    // real progress; a structural write with no advance is what the churn cap counts.
    const { progressed, structuralWrite, epistemicAdvance } = dispatch;

    // Progress this round = a recorded proof OR an af-applied accept. No progress → stuck guard.
    // FU2: any progress also clears the vacuous-since-progress tally — a stall AFTER progress is a
    // fresh cause, never the earlier bootstrap discard.
    if (progressed) { roundsWithoutProgress = 0; vacuousSinceProgress.clear(); stallCauses.clear(); }
    else {
      roundsWithoutProgress++;
      const stuck = evaluateStuckGuard(roundsWithoutProgress, config.maxStuckRounds);
      if (stuck.abort) {
        // rk-jit (STOP-4): if the CURRENT stall was caused by vacuous accepts on proofless node(s)
        // since the last progress, name the real cause (the bootstrap deadlock) and enumerate the
        // counts — never the opaque stuck-no-progress an operator can only diagnose from the raw log.
        // Reads the cleared-on-progress view so a later unrelated stall is not mislabeled. Convergence
        // untouched.
        if (vacuousSinceProgress.size > 0) {
          return { status: "aborted", stopReason: "bootstrap-vacuous-accepts", message: `no progress and the verifier accepted proofless node(s) that were discarded as vacuous (${vacuousDetail(vacuousSinceProgress)}) — a fresh conjecture cannot bootstrap: a PROVER must produce proof content before a verifier has anything to verify. ${stuck.reason!}`, appliedNodeIds, outcomes, rounds: round + 1 };
        }
        // RUN-REPORT-8 (P2): name the dominant node-skipped cause so the stop is self-diagnosing.
        return { status: "aborted", stopReason: "stuck-no-progress", message: appendStallCause(stuck.reason!, stallCauses), appliedNodeIds, outcomes, rounds: round + 1 };
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

  // rk-jit (STOP-4): same bootstrap-deadlock naming at the maxRounds fall-through — reading the
  // cleared-on-progress view (FU2), so only a run still dead-ended on vacuous accepts is named it.
  if (vacuousSinceProgress.size > 0) {
    return { status: "aborted", stopReason: "bootstrap-vacuous-accepts", message: `hit maxRounds (${config.maxRounds}) without convergence; the verifier accepted proofless node(s) that were discarded as vacuous (${vacuousDetail(vacuousSinceProgress)}) — a PROVER must produce proof content first`, appliedNodeIds, outcomes, rounds: round };
  }
  return { status: "aborted", stopReason: "stuck-no-progress", message: appendStallCause(`hit maxRounds (${config.maxRounds}) without convergence`, stallCauses), appliedNodeIds, outcomes, rounds: round };
}
