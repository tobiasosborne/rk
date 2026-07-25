// rk-tbg (shard-cap split, 386 -> two files): the TURN-ASSEMBLY / DISPATCH-WIRING half of
// src/drive/driver-live.ts's M3.5-prep live dispatch glue -- everything that builds a role's item
// input and turns a `LiveRoleTierDispatcher` (constructed by driver-live.ts's `createLiveDispatcher`)
// into the actual `dispatchVerify`/`dispatchProve`/`dispatchClassification`/`recordProof` functions a
// `DriverDeps` needs. driver-live.ts keeps the OTHER half -- resolving a backend and constructing the
// one dispatcher a claim's live loop drives every turn through -- and re-exports every name below
// unchanged, so src/cli/verify-live.ts and every existing test needed zero edits.
//
// This is a genuinely separate job from construction: "what backend, what session" (driver-live.ts)
// vs "what prompt, what repair, what result shape does THIS role's turn produce" (here). Every
// function below is exercised in tests via a FAKE `WorkerBackend` (no real subprocess/LLM call
// anywhere) -- CLAUDE.md L1/L2, the original task's own constraint, unchanged by this split.
//
// rk-i19 word-ban note (mechanically enforced, unaffected by this split): every message
// src/drive/prover-raw.ts can emit is prover-prompt bytes echoed verbatim by `buildProverRepairTurnPrompt`
// (src/drive/driver-prompts.ts), so it is held to the SAME verdict-vocabulary word ban as
// `buildProverTurnPrompt` -- both builders still live together in driver-prompts.ts (see that file's
// own split note), and this file only ever CALLS them, never re-derives or duplicates the ban.

import type { Tier } from "./vocab";
import type { DispatchedTurn } from "./driver-run";
import { buildProverRepairTurnPrompt, buildProverTurnPrompt, buildRepairTurnPrompt, buildVerifierTurnPrompt, type ProverItemInput, type VerifierDep, type VerifierItemInput } from "./driver-prompts";
import { diagnoseRepairableProverTurn, diagnoseRepairableTurn, mergeProverRepairTurn, mergeRepairTurn } from "./verdict-repair";
import { isProoflessNode, type AfNodeView } from "./driver-plan";
import { recordProofRefine } from "./driver-af";
import type { ProofContent, RecordProofResult } from "./driver-prove-node";
import type { LiveRoleTierDispatcher } from "./driver-live";

/** Builds the verifier item input for one af node. rk B2: the verifier judges the node against its
 * exact RECORDED dependencies (`node.deps`, af's `dependencies[]`), not the children-substitution
 * proxy the seam used before af emitted them — so acceptance certifies the graph the prover actually
 * produced. Those deps are part of the node's content_hash, which the driver re-reads and sends as
 * `expect_hash`, so a verdict is invalidated if they change. `statement` falls back to a
 * self-teaching placeholder (never a crash) if the export never carried one. */
export function verifierItemFor(node: AfNodeView, tier: Tier, allNodes: readonly AfNodeView[]): VerifierItemInput {
  // GAP 10 (RUN-REPORT-9): resolve each declared dependency id to its statement + epistemic state so
  // the verifier is shown the CONTENT it is judging the node's step against — not just the id (which
  // it correctly refused to certify against, stalling `1.7` forever in run A).
  const byId = new Map(allNodes.map((n) => [n.id, n] as const));
  const deps: VerifierDep[] = (node.deps ?? []).map((depId) => {
    const dep = byId.get(depId);
    if (dep === undefined) {
      // A declared dependency absent from the export is an item-construction FAILURE, never a silent
      // omission — a silent omission is EXACTLY the bug this fixes (the verifier judging a step against
      // content it cannot see). Fail loudly so the missing-dependency invariant is impossible to miss.
      throw new Error(
        `verifierItemFor: node '${node.id}' declares dependency '${depId}' but no such node is present in the af export (${allNodes.length} node(s)) — cannot assemble the verifier's dependency context. This is an export/graph invariant violation, not a recoverable skip.`,
      );
    }
    return {
      id: depId,
      statement: dep.statement ?? `(no statement recorded by af export for node ${depId})`,
      epistemicState: dep.epistemicState,
    };
  });
  return {
    nodeId: node.id,
    statement: node.statement ?? `(no statement recorded by af export for node ${node.id})`,
    deps,
    tier,
    // rk-jit (STOP-4): computed on the REAL node (its actual statement/children/deps), not the
    // placeholder-filled item — the prompt's HARD-RULE branch and driver-verify-node.ts's discard
    // read the SAME predicate so they never disagree about whether a node is bare.
    proofless: isProoflessNode(node),
  };
}

/** The one live `dispatchVerify` a `DriverDeps` needs: dispatches `node` as a turn on `dispatcher`,
 * building its prompt via src/drive/driver-prompts.ts. GAP 10: `allNodes` (the current round's full
 * export view) is threaded so `verifierItemFor` can resolve `node`'s declared dependencies to their
 * content — the driver hands its per-round node set at the call site (src/drive/driver-run.ts). */
export function liveDispatchVerify(dispatcher: LiveRoleTierDispatcher, tier: Tier) {
  return async (node: AfNodeView, allNodes: readonly AfNodeView[]): Promise<DispatchedTurn> => {
    const first = await dispatcher.dispatch(node.id, buildVerifierTurnPrompt(verifierItemFor(node, tier, allNodes)));
    return repairVerifierTurnOnce(dispatcher, tier, node.id, first);
  };
}

/** rk-xxp (GAP 11): the output budget for a repair turn. A repair reply re-emits ONE small verdict
 * object with the assessment unchanged — it needs a fraction of a first-pass turn's room, and a tight
 * cap is itself a mitigation for the runaway free-text field that co-occurs with these failures. */
export const REPAIR_MAX_OUTPUT_TOKENS = 1_500;

/** Dispatches AT MOST ONE schema-repair reprompt on the SAME session for a verifier turn whose output
 * failed raw-shape validation or single-object extraction (src/drive/verdict-repair.ts's
 * `diagnoseRepairableTurn` decides; `buildRepairTurnPrompt` echoes the concrete issues).
 *
 * "At most one, ever" is STRUCTURAL, not a counter this function could get wrong: it calls
 * `dispatcher.dispatch` directly — never `liveDispatchVerify` and never itself — so there is no code
 * path from a repair turn back into another repair. A repair reply that also fails is folded by
 * `mergeRepairTurn` into the ORIGINAL failure representation, which is a normal terminal outcome
 * (`parse-failed` / bind failure, exactly as before this feature existed).
 *
 * The repair reuses the claim's existing session by construction (the dispatcher owns exactly one),
 * so the worker still has its own rejected reply in context — which is what makes "fix only the
 * shape, keep your assessment" a meaningful instruction. The item id is suffixed so the turn is
 * distinguishable in a backend's own logs; `turnId` is separately unique per turn already.
 *
 * NO extra trust anywhere: the repaired body re-enters the identical downstream pipeline
 * (bindVerdicts, hash re-confirmation, cross-vendor gate) with nothing relaxed. */
export async function repairVerifierTurnOnce(dispatcher: LiveRoleTierDispatcher, tier: Tier, itemId: string, first: DispatchedTurn): Promise<DispatchedTurn> {
  const need = diagnoseRepairableTurn(tier, first);
  if (!need.needed) return first;
  const repair = await dispatcher.dispatch(`${itemId}#repair`, buildRepairTurnPrompt(tier, need.issues), { maxOutputTokens: REPAIR_MAX_OUTPUT_TOKENS });
  return mergeRepairTurn(tier, first, repair, need.issues);
}

/** Builds the prover item input for one af node — the node's RECORDED dependencies (`node.deps`, rk
 * B2) are what the prover "may assume already established", the same self-teaching statement
 * fallback as `verifierItemFor` (rk-gn4). */
export function proverItemFor(node: AfNodeView): ProverItemInput {
  return {
    nodeId: node.id,
    statement: node.statement ?? `(no statement recorded by af export for node ${node.id})`,
    deps: node.deps ?? [],
  };
}

/** The one live `dispatchProve` a `DriverDeps` needs (rk-gn4): dispatches `node` as a PROVER turn on
 * a prover-role dispatcher, building its decomposition prompt via src/drive/driver-prompts.ts. The
 * dispatcher's `role` is "prover", so `DispatchedTurn.role` is "prover" and driver-prove-node.ts's
 * role guard passes; a verifier dispatcher handed here would be refused there (never records). */
export function liveDispatchProve(dispatcher: LiveRoleTierDispatcher) {
  return async (node: AfNodeView): Promise<DispatchedTurn> => {
    const first = await dispatcher.dispatch(node.id, buildProverTurnPrompt(proverItemFor(node)));
    return repairProverTurnOnce(dispatcher, node.id, first);
  };
}

/** rk-i19: the prover's `repairVerifierTurnOnce`. Dispatches AT MOST ONE schema-repair reprompt on the
 * SAME session when a prover turn's output failed prover-body validation (src/drive/prover-raw.ts) or
 * single-object extraction — the same two failure modes the verifier side covers, because gating on
 * shape alone would not have fired on the incident this whole mechanism exists for (its banked records
 * are `parse-failed`, not shape failures).
 *
 * "At most one, ever" is STRUCTURAL, identically to the verifier path: this function calls
 * `dispatcher.dispatch` directly — never `liveDispatchProve`, never itself — so no code path leads from
 * a repair turn into another repair. A repair reply that also fails is folded by `mergeProverRepairTurn`
 * into the ORIGINAL failure representation, which is a normal terminal outcome.
 *
 * TWO deliberate differences from the verifier path, both named in `diagnoseRepairableProverTurn`'s and
 * the tests' own comments:
 * 1. An OVERREACHING body is never repaired — `detectProverOverreach`'s discard-and-log must survive
 *    intact rather than be silently reshaped into a recordable proof.
 * 2. NO tight `maxOutputTokens` override. `REPAIR_MAX_OUTPUT_TOKENS` (1,500) fits one small verdict
 *    object; a prover repair must restate the WHOLE decomposition, and capping it there would truncate
 *    the reply mid-object — manufacturing exactly the second failure the repair exists to prevent. The
 *    repair turn therefore gets the same per-turn room the first prover turn had.
 *
 * NO extra trust anywhere: a repaired decomposition re-enters the identical downstream pipeline —
 * `driver-prove-node.ts`'s role guard, `detectProverOverreach`, `extractProofContent`,
 * `buildRecordProofChildren`'s fail-closed dependency translation, and af's own `record-proof`
 * role/`--expect-hash` CAS — with nothing relaxed and no field ever copied to satisfy another. */
export async function repairProverTurnOnce(dispatcher: LiveRoleTierDispatcher, itemId: string, first: DispatchedTurn): Promise<DispatchedTurn> {
  const need = diagnoseRepairableProverTurn(first);
  if (!need.needed) return first;
  const repair = await dispatcher.dispatch(`${itemId}#repair`, buildProverRepairTurnPrompt(need.issues));
  return mergeProverRepairTurn(first, repair, need.issues);
}

/** The one live `recordProof` a `DriverDeps` needs (rk-gn4 + B1 + FU3): records the prover's
 * decomposition into af via the atomic `af record-proof` verb (src/drive/driver-af.ts's
 * `recordProofRefine`). rk B1: the node's content hash AT DISPATCH is threaded as `--expect-hash`,
 * so af refuses a proof generated for bytes that changed mid-turn (mirroring the verifier apply's
 * hash re-bind) — a stale-role/stale-hash rejection surfaces as a discard, not a partial write.
 * `owner` is the prover's identity seam; `absWorkspace` the resolved proof dir. */
export function liveRecordProof(absWorkspace: string, owner: string, afCommand?: readonly string[]) {
  return (node: AfNodeView, proof: ProofContent, knownIds: ReadonlySet<string>): RecordProofResult =>
    recordProofRefine(absWorkspace, node.id, owner, proof, knownIds, node.contentHash, afCommand);
}

/** Ad hoc, inline balloon-classification prompt (see driver-live.ts's file header, scope note 4) --
 * deliberately NOT one of driver-prompts.ts's pure exports. */
function buildClassificationPrompt(subtree: readonly string[]): string {
  return [
    "## Balloon classification",
    "",
    `The following node ids are part of a subtree that exceeded the driver's per-contract node cap (${subtree.length} nodes): ${subtree.join(", ")}.`,
    "",
    'Classify why this subtree ballooned. Respond with EXACTLY one JSON object: {"classification": "missing-fact" | "dag-dep" | "genuine-gap", "rationale": <string>}.',
  ].join("\n");
}

/** The one live `dispatchClassification` a `DriverDeps` needs. Returns `undefined` on ANY failure
 * (dispatch rejected, unparseable) -- src/drive/driver-balloon.ts's `parseClassificationReview`
 * already treats that as "classification failed," routing to the existing, safe
 * balloon-unclassified path; this function never needs its own separate failure handling. */
export function liveDispatchClassification(dispatcher: LiveRoleTierDispatcher) {
  return async (subtree: string[]): Promise<unknown> => {
    const turn = await dispatcher.dispatch(`balloon-${subtree.join("-")}`, buildClassificationPrompt(subtree));
    return turn.exit === 0 ? turn.raw : undefined;
  };
}
