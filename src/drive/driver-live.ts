// EDGE — the M3.5-prep LIVE dispatch glue: the seam from src/drive/driver-run.ts's INJECTED
// `dispatchVerify`/`dispatchClassification` hooks to the real M3.2/M3.3 machinery (backend
// registry, session manager, real `WorkerBackend.createSession`/`runTurn` calls). src/cli/verify.ts
// is the only caller; every function here is exercised in tests via a FAKE `WorkerBackend` (no
// real subprocess/LLM call anywhere in this file's own test suite — CLAUDE.md L1/L2, the task's
// own constraint).
//
// SCOPE, deliberately narrow and named (rule 11 — surface gaps, never silently absorb):
// 1. ONE session per (role, tier, claimId) — the CORRECT read of docs/worker-contract.md section
//    (a) for this WP's caller (`rk verify --af`, one claim, hard tier, verifier role only): every
//    node in the claim is a TURN on that one session (turn 1 = shared context, turn 2..N = resume).
//    There is no batching/grouping decision to make at this granularity (driver-plan.ts: "pass 1
//    hard-tier planning is all per-node"), so src/drive/scheduler.ts's multi-group batching is not
//    invoked here; what IS reused, never reimplemented, is the model/model/tier isolation +
//    create-once guarantee (src/drive/session-manager.ts) and the pinned WorkerBackend contract
//    (src/drive/backend-types.ts) — nothing in this file re-derives what those already own.
// 2. NO per-turn fallback-CHAIN retry across backends yet: `BackendRegistry.resolve` picks the
//    first REGISTERED backend in the (role,tier) chain once, at dispatcher construction; a runtime
//    failure (exit 13) is reported to the driver loop as a real rejected turn, never silently
//    retried on a fallback backend mid-claim (a fallback would need its OWN session, paying full
//    cost with no cache credit — a real design point, deferred, not swept under this WP).
// 3. (rk-7hi, M3.5 STOP-2 repair, supersedes the original note) `model` per (role, tier) now HAS a
//    config-sourced path: `.rk/config.json`'s `workers.assignments.<role>.<tier>.model`
//    (src/drive/backend-registry.ts's `RoleTierAssignment.model`, `BackendRegistry.modelFor`) wins
//    over `src/cli/verify.ts`'s single global `--model` flag, which wins over
//    `DEFAULT_MODEL_BY_BACKEND` — see `resolveModel` below. This is what makes the prover and the
//    verifier carry two DIFFERENT explicit models in the SAME run (the exact TJO worker-model pin
//    the single global `--model` flag could not express).
// 4. The balloon-classification prompt is a small, ad hoc, inline builder (`buildClassificationPrompt`
//    below) — NOT part of src/drive/driver-prompts.ts's two pure exports (verifier/prover), which
//    is the shape the task brief for this WP actually names.

import { BackendRegistry, type WorkersConfig } from "./backend-registry";
import type { SessionSpec, TurnItem, WorkerBackend } from "./backend-types";
import { createSession as registerSession, emptySessionManagerState, type SessionManagerState } from "./session-manager";
import type { SessionRecord } from "./session";
import type { DispatchModel, Role, Tier } from "./vocab";
import type { WorkerResult, WorkerUsage } from "./worker-result";
import type { DispatchedTurn } from "./driver-run";
import { buildProverRepairTurnPrompt, buildProverTurnPrompt, buildRepairTurnPrompt, buildVerifierTurnPrompt, OUTPUT_SCHEMA_REF, type ProverItemInput, type VerifierDep, type VerifierItemInput } from "./driver-prompts";
import { diagnoseRepairableProverTurn, diagnoseRepairableTurn, mergeProverRepairTurn, mergeRepairTurn } from "./verdict-repair";
import { isProoflessNode, type AfNodeView } from "./driver-plan";
import { classifyExtractionFailure, extractSingleJsonObject } from "./parse-diag";
import { recordProofRefine } from "./driver-af";
import type { ProofContent, RecordProofResult } from "./driver-prove-node";
// rk-7hi: model/family resolution now lives in its own pure module (280-line shard cap) —
// re-exported here unchanged so every existing import site (src/cli/verify-live.ts, tests) is
// unaffected by the split.
export { DEFAULT_MODEL_BY_BACKEND, resolveModel, familyForBackend } from "./driver-live-model";

const ZERO_USAGE: WorkerUsage = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
export const DEFAULT_SESSION_TIMEOUT_MS = 120_000;
export const DEFAULT_TURN_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 8_000;

/** The EXACT `.rk/config.json` shape a live run needs — printed verbatim in the loud error below,
 * never left for a reader to infer from prose. */
export const WORKERS_CONFIG_EXAMPLE = `{
  "workers": {
    "assignments": {
      "verifier": { "hard": { "backend": "claude", "fallbacks": ["codex"] } }
    }
  }
}`;

/** Loud, self-teaching error naming the exact config shape needed (task requirement) -- returned,
 * never thrown, so a caller can decide how to surface it (CLI exit code + message). */
export function describeMissingWorkersConfig(role: Role, tier: Tier): string {
  return (
    `rk verify --live: no worker backend configured for role='${role}' tier='${tier}'. ` +
    `.rk/config.json needs a 'workers.assignments.${role}.${tier}' entry naming a backend, e.g.:\n${WORKERS_CONFIG_EXAMPLE}`
  );
}

/** Builds a `BackendRegistry` wired with the two real M3.2 adapters, keyed by `.rk/config.json`'s
 * validated `workers` field. Callers supply the concrete `WorkerBackend` instances (this module
 * never imports backend-claude.ts/backend-codex.ts itself — same layering discipline
 * backend-registry.ts's own header documents) so a test can hand in fakes instead. */
export function buildRegistry(workers: WorkersConfig, backends: WorkerBackend[]): BackendRegistry<WorkerBackend> {
  return new BackendRegistry<WorkerBackend>(workers, backends);
}

/** Mirrors src/drive/worker-result.ts's `resolveTurn` exit-code + JSON-parse discipline (process
 * exit is authoritative; parsing is only attempted on exit 0) WITHOUT calling `bindVerdicts` a
 * second time here -- driver-run.ts's own `verifyOneNode` is the one place `bindVerdicts` runs
 * against `DispatchState` (docs/worker-contract.md's data-flow section), so this function's only
 * job is turning a `WorkerResult` into the pre-bind `{raw: unknown, exit}` shape `DispatchedTurn`
 * needs. A parse failure on a nominally-successful exit is reported as 12 (schema-invalid), never
 * silently swallowed.
 *
 * GAP 7(a) / rk-d1n: `extractSingleJsonObject` (the CONSERVATIVE single-object ACCEPTANCE rule) and
 * `classifyExtractionFailure`/`stripSingleFence` (DIAGNOSTIC-ONLY) now live in the pure
 * src/drive/parse-diag.ts, re-exported here so every existing import site is unaffected. On a
 * parse/extraction failure this attaches, purely for the `parse-failed` evidence record: the raw
 * text (so the edge can persist it), the `JSON.parse` error message, and the failure-mode class —
 * none of which changes the acceptance verdict (still exit 12, ambiguous still fails). */
export { extractSingleJsonObject, stripSingleFence, classifyExtractionFailure } from "./parse-diag";
export type { ParseFailureClass } from "./parse-diag";

export function toDispatchedTurn(role: Role, result: WorkerResult): DispatchedTurn {
  if (result.exit !== 0) return { raw: undefined, role, exit: result.exit, usage: result.usage };
  if (result.rawText === undefined) return { raw: undefined, role, exit: 12, usage: result.usage };
  const extracted = extractSingleJsonObject(result.rawText);
  if (extracted.ok) return { raw: extracted.value, role, exit: 0, usage: result.usage };
  // GAP 7(b) + rk-d1n: parse/extraction failed — carry the raw text (so the driver edge persists a
  // bounded snippet AND the full raw text), plus the JSON.parse error message and a diagnostic
  // failure-mode class (unterminated vs trailing-content vs …). All three are DIAGNOSTIC ONLY; the
  // acceptance outcome is unchanged (exit 12).
  const diag = classifyExtractionFailure(result.rawText);
  return { raw: undefined, role, exit: 12, usage: result.usage, rawText: result.rawText, parseError: diag.parseError, parseClass: diag.classification };
}

export interface LiveDispatcherOptions {
  registry: BackendRegistry<WorkerBackend>;
  role: Role;
  tier: Tier;
  claimId: string;
  model: string;
  sharedContext: string;
  sessionTimeoutMs?: number;
  turnTimeoutMs?: number;
  maxOutputTokens?: number;
}

export interface LiveRoleTierDispatcher {
  readonly backendName: string;
  /** rk-9zd: the RESOLVED backend instance's OWN registry-declared `modelFamily`
   * (src/drive/backend-types.ts), carried through so a caller building this session's identity seam
   * reads the family off the SAME instance the turns actually dispatch through — instead of
   * re-deriving it from `backendName`, which is what fail-OPEN'd on an unrecognized name. Typed
   * `unknown` deliberately: this is an UNVALIDATED passthrough of whatever the backend declared, and
   * the ONE validator is `familyForBackend` (src/drive/driver-live-model.ts), which fails closed on
   * anything outside vocab.ts's closed `MODEL_FAMILIES`. Typing it `ModelFamily` here would let a
   * hand-rolled/JSON-sourced backend record launder an unchecked string past the compiler. */
  readonly declaredModelFamily: unknown;
  /** Creates (or returns the already-created) session for this dispatcher's (role, tier, claimId)
   * — the ONE real "turn 1" call, sending `sharedContext`. Idempotent: a second call returns the
   * same sessionId without a second backend call. */
  ensureSession(): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }>;
  /** Dispatches one turn. Always resolves to a `DispatchedTurn` (never `undefined`) once a
   * dispatcher has been constructed -- "no backend configured" is reported at construction time
   * (`createLiveDispatcher`'s own `{ok:false}` branch), never rediscovered per-turn. */
  dispatch(itemId: string, turnPrompt: string, opts?: { maxOutputTokens?: number; timeoutMs?: number }): Promise<DispatchedTurn>;
}

export type CreateLiveDispatcherResult = { ok: true; dispatcher: LiveRoleTierDispatcher } | { ok: false; reason: string };

/** Resolves a backend for (role, tier) via the registry and builds the one dispatcher this claim's
 * live loop drives every turn through. Returns `{ok:false}` with the exact-shape error
 * (`describeMissingWorkersConfig`) the instant nothing is configured/registered -- a caller should
 * treat that as a preflight abort, never a per-node silent skip (task requirement). */
export function createLiveDispatcher(opts: LiveDispatcherOptions): CreateLiveDispatcherResult {
  const backend = opts.registry.resolve(opts.role, opts.tier);
  if (!backend) return { ok: false, reason: describeMissingWorkersConfig(opts.role, opts.tier) };

  const dispatchModel: DispatchModel = backend.capabilities.sessionResume ? "session" : "flat";
  let sessionState: SessionManagerState = emptySessionManagerState();
  let sessionId: string | undefined;
  let turnCounter = 0;

  async function ensureSession(): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
    if (sessionId !== undefined) return { ok: true, sessionId };
    const spec: SessionSpec = {
      role: opts.role,
      tier: opts.tier,
      claimId: opts.claimId,
      model: opts.model,
      sharedContext: opts.sharedContext,
      timeoutMs: opts.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS,
    };
    let created: { sessionId: string };
    try {
      created = await backend.createSession(spec);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const record: SessionRecord = {
      backend: backend.name,
      model: opts.model,
      role: opts.role,
      tier: opts.tier,
      claimId: opts.claimId,
      dispatchModel,
      sessionId: created.sessionId,
    };
    const outcome = registerSession(sessionState, record);
    if (!outcome.ok) return { ok: false, error: outcome.issues.map((i) => `${i.path}: ${i.message}`).join("; ") };
    sessionState = outcome.state;
    sessionId = created.sessionId;
    return { ok: true, sessionId };
  }

  return {
    ok: true,
    dispatcher: {
      backendName: backend.name,
      declaredModelFamily: backend.modelFamily,
      ensureSession,
      async dispatch(itemId, turnPrompt, itemOpts) {
        const ensured = await ensureSession();
        if (!ensured.ok) {
          // Session creation itself failed: report as backend-unavailable (13), a real rejected
          // turn the driver log records -- never a silent skip (docs/worker-contract.md's table).
          return { raw: undefined, role: opts.role, exit: 13, usage: ZERO_USAGE };
        }
        turnCounter++;
        const item: TurnItem = {
          itemId,
          turnId: `${opts.claimId}-${itemId}-${turnCounter}`,
          content: turnPrompt,
          outputSchemaRef: OUTPUT_SCHEMA_REF[opts.tier],
          timeoutMs: itemOpts?.timeoutMs ?? opts.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS,
          maxOutputTokens: itemOpts?.maxOutputTokens ?? opts.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        };
        const result = await backend.runTurn(ensured.sessionId, item);
        return toDispatchedTurn(opts.role, result);
      },
    },
  };
}

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

/** Ad hoc, inline balloon-classification prompt (see file header, scope note 4) -- deliberately
 * NOT one of driver-prompts.ts's pure exports. */
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
