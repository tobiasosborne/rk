// EDGE-composed — the PER-ROUND dispatch/apply half of src/drive/driver-run.ts's loop, split out
// to stay under the 280-line shard cap (rk-y83/rk-tbg). Given one round's prover-ready and
// verifier-ready node sets, this module: dispatches a PROVER turn per prover-ready node and records
// any decomposition (driver-prove-node.ts, rk-gn4); dispatches a VERIFIER turn per verifier-ready
// node (driver-verify-node.ts); and, for every collected verdict, re-reads the authoritative af
// content hashes (M3 blocker 1) and applies each surviving verdict children-first (M3 blocker 3).
// It owns NO validity logic of its own — every decision rule (retry cap, budget check, stale-hash
// discard, children-first ordering) is called from its existing pure/impure core, unchanged; this
// module only sequences the round's dispatch and mutates the caller's per-run tallies via the
// passed-in `RoundState` (shared references, not copies). The caller (`runVerifyDriver` in
// driver-run.ts) owns the OUTER loop: querying af, the balloon tripwire, the empty-frontier
// convergence classification, and the cross-round stuck/churn guards — none of that moved here.

import { checkBudget, checkRetryCap } from "./driver-guardrails";
import { childrenFirst, verifyOneNode } from "./driver-verify-node";
import { proveOneNode } from "./driver-prove-node";
import type { AfNodeView } from "./driver-plan";
import type { AfApplyItem } from "./driver-verdict-map";
import type { FilledVerdictFile, VerdictItemOutcome } from "./driver-af";
import type { DriverDeps, DriverRunResult } from "./driver-types";

/** The per-run tallies this module mutates IN PLACE (shared references with the caller's loop, not
 * copied/returned) — `runVerifyDriver` reads them directly after each round for its own stuck/churn
 * bookkeeping and abort messages. */
export interface RoundState {
  readonly attempts: Map<string, number>;
  readonly proofRecordsByNode: Map<string, number>;
  readonly vacuousSinceProgress: Map<string, number>;
  readonly appliedNodeIds: string[];
  readonly outcomes: VerdictItemOutcome[];
}

/** `done: true` means a pre-dispatch budget check failed mid-round; the caller must return `result`
 * immediately (no further rounds), mirroring the inline early-returns this replaced. `done: false`
 * carries the round's new token total and its three progress flags (`progressed` drives the stuck
 * guard; `structuralWrite`/`epistemicAdvance` drive the churn guard — see driver-run.ts). */
export type RoundOutcome =
  | { done: true; result: DriverRunResult }
  | { done: false; tokensSpent: number; progressed: boolean; structuralWrite: boolean; epistemicAdvance: boolean };

/** Runs one round's PROVE half, VERIFY half, and verdict apply.
 * `allNodes` is the round's full af export view (`ws.nodes`); `byId` is the caller's per-round
 * lookup built from it. `nodeRetryCap` is `config.nodeRetryCap`. `noteSkip`/`noteChallengeStall` are
 * the caller's stall-cause tallies — kept in driver-run.ts, which owns the abort messages that read
 * them. */
export async function dispatchRound(
  deps: DriverDeps,
  round: number,
  nodeRetryCap: number,
  proverReadyIds: readonly string[],
  verifierReadyIds: readonly string[],
  allNodes: readonly AfNodeView[],
  byId: ReadonlyMap<string, AfNodeView>,
  verifiedBySeam: string,
  tokensSpentIn: number,
  state: RoundState,
  noteSkip: (reason: string) => void,
  noteChallengeStall: (nodeId: string, category: string | undefined) => void,
): Promise<RoundOutcome> {
  let tokensSpent = tokensSpentIn;
  let progressed = false;
  // rk-cpk: split `progressed` (proof OR accept — drives the stuck guard) into its two components
  // for the churn cap. `structuralWrite` = a proof was recorded (the tree grew); `epistemicAdvance`
  // = a node newly reached validated (an af accept applied). Only the latter is real progress; a
  // structural write with no advance is what the churn cap counts.
  let structuralWrite = false;
  let epistemicAdvance = false;

  // PROVE half (rk-gn4): dispatch a PROVER turn over each prover-ready node and record its
  // decomposition into af. A recorded proof IS progress — af re-classifies the node next round and
  // the verifier path takes over. proveOneNode NEVER mints a verdict (driver-prove-node.ts): it
  // calls no apply/bind, and its role + overreach guards discard any verdict a prover smuggles.
  for (const id of proverReadyIds) {
    const node = byId.get(id)!;
    const attemptsSoFar = state.attempts.get(id) ?? 0;
    if (checkRetryCap(attemptsSoFar, nodeRetryCap).exhausted) continue;
    // rk-s9t rule 2: pre-dispatch budget check — a prover turn accrues to the SAME campaign cap
    // and the (cap+1)th token is never requested regardless of role.
    if (deps.budget) {
      const decision = checkBudget(tokensSpent, deps.budget);
      if (!decision.affordable) {
        return { done: true, result: { status: "aborted", stopReason: "budget-exhausted", message: decision.reason!, appliedNodeIds: state.appliedNodeIds, outcomes: state.outcomes, rounds: round + 1 } };
      }
    }
    // GAP 8: the round's fresh node-id set (parallel to verifyOneNode's `new Set(byId.keys())`
    // below) — buildRecordProofChildren needs it to translate a prover's forward-sibling `depends`
    // into af's `#N` in-batch namespace and to distinguish an existing dependency from one.
    const pr = await proveOneNode(deps, node, new Set(byId.keys()));
    tokensSpent += pr.spentTokens; // accrue whether the proof recorded or the turn was discarded
    if ("recorded" in pr) {
      progressed = true;
      // rk-cpk: a recorded proof is a STRUCTURAL write, not epistemic advancement — count it per
      // node so a spinning prove/refine cycle is caught by the churn cap the stuck guard misses.
      structuralWrite = true;
      state.proofRecordsByNode.set(id, (state.proofRecordsByNode.get(id) ?? 0) + 1);
    } else {
      state.attempts.set(id, attemptsSoFar + 1);
      noteSkip(pr.skip);
      deps.appendLog(JSON.stringify({ kind: "node-skipped", at: deps.now(), node: id, reason: pr.skip }));
    }
  }

  // VERIFY half: dispatch a VERIFIER turn over each verifier-ready node, bind, collect apply items.
  // Unchanged validity path (M3 repair wave — verifier-only, per-node, hash-re-bound).
  const composed: { item: AfApplyItem; contentHash: string }[] = [];
  for (const id of verifierReadyIds) {
    const node = byId.get(id)!;
    const attemptsSoFar = state.attempts.get(id) ?? 0;
    if (checkRetryCap(attemptsSoFar, nodeRetryCap).exhausted) continue;
    if (deps.budget) {
      const decision = checkBudget(tokensSpent, deps.budget);
      if (!decision.affordable) {
        return { done: true, result: { status: "aborted", stopReason: "budget-exhausted", message: decision.reason!, appliedNodeIds: state.appliedNodeIds, outcomes: state.outcomes, rounds: round + 1 } };
      }
    }
    // rk-qxp (FIX 6): the mapper validates a challenge's blamed node id against the proof export —
    // pass the current round's node-id set (byId is built from allNodes each round).
    const r = await verifyOneNode(deps, node, verifiedBySeam, new Set(byId.keys()), allNodes);
    tokensSpent += r.spentTokens; // accrue whether the turn applied or was discarded
    if ("item" in r) composed.push({ item: r.item, contentHash: r.contentHash });
    else {
      state.attempts.set(id, attemptsSoFar + 1);
      // rk-jit (STOP-4): tally a vacuous-accept discard so a stuck abort can name the bootstrap
      // deadlock as its cause instead of the opaque stuck-no-progress. Cleared on progress (caller).
      if (r.vacuousNode !== undefined) state.vacuousSinceProgress.set(r.vacuousNode, (state.vacuousSinceProgress.get(r.vacuousNode) ?? 0) + 1);
      noteSkip(r.skip);
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
        const staleReason = `stale verdict discarded: af node content hash changed between dispatch and apply (bound ${contentHash}, current ${current ?? "absent"})`;
        noteSkip(staleReason);
        deps.appendLog(JSON.stringify({ kind: "node-skipped", at: deps.now(), node: item.node, reason: staleReason }));
        state.attempts.set(item.node, (state.attempts.get(item.node) ?? 0) + 1);
        continue;
      }
      // rk B1: send the bound content hash as `expect_hash` so af RE-checks it (and verifier-ready
      // availability) atomically under its own state read — the kernel guarantee the driver-side
      // re-read above cannot give on its own. Both guards agree here; the af one is authoritative.
      const file: FilledVerdictFile = { schema_version: "1", batch_id: "", verified_by: verifiedBySeam, items: [{ ...item, expect_hash: contentHash }] };
      const report = deps.applyVerdicts(file);
      for (const o of report.items) {
        state.outcomes.push(o);
        deps.appendLog(JSON.stringify({ kind: "verdict-outcome", at: deps.now(), node: o.node, verdict: o.verdict, status: o.status, exit: report.exit }));
        if (o.status === "applied" && o.verdict === "accept") { state.appliedNodeIds.push(o.node); progressed = true; epistemicAdvance = true; /* rk-cpk: an accept is the ONLY epistemic advancement — a node newly validated */ }
        else {
          state.attempts.set(o.node, (state.attempts.get(o.node) ?? 0) + 1);
          // rk-dp1 (RUN-REPORT-9): an APPLIED challenge is NOT progress — it re-blocks the node. The
          // stall classifier previously counted only node-SKIPPED reasons, so run A's dependency-
          // content challenge loop (node '1.7' challenged 3x on the same grounds) never appeared in
          // the stuck abort's dominant-cause line. Count it per-node (with the model's category, kept
          // — unlike a skip class — so the operator sees WHICH node spun) into the same since-progress
          // tally, cleared on any progress in the caller's loop. Message-only: no abort/verdict/
          // convergence semantics.
          if (o.status === "applied" && o.verdict === "challenge") noteChallengeStall(o.node, item.category);
        }
      }
    }
  }

  return { done: false, tokensSpent, progressed, structuralWrite, epistemicAdvance };
}
