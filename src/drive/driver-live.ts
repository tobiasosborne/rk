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
import { buildProverTurnPrompt, buildVerifierTurnPrompt, OUTPUT_SCHEMA_REF, type ProverItemInput, type VerifierItemInput } from "./driver-prompts";
import { isProoflessNode, type AfNodeView } from "./driver-plan";
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
 * silently swallowed. */
/** GAP 7(a): a CONSERVATIVE, encoding-layer-only extraction of the single JSON object a turn is
 * required to be. It strips at most ONE surrounding markdown code fence (```json … ``` or ``` … ```)
 * plus surrounding whitespace, then requires the ENTIRE remainder to `JSON.parse` to exactly one
 * JSON OBJECT. Anything else fails: prose around JSON, multiple concatenated objects, a bare array or
 * primitive, or "no object" (JSON.parse itself rejects trailing content and multiple values). This
 * is DELIBERATELY not a scan-for-first-brace or embedded-object extraction — picking the "wrong"
 * `{...}` out of a mixed blob risks binding a bogus verdict, and verdict extraction is a validity
 * semantic; the only tolerance added here is a fenced-but-otherwise-clean object, the one shape a
 * model reliably emits despite the "bare JSON" instruction. Ambiguous output still fails (loudly, and
 * persisted by the edge — see DispatchedTurn.rawText). */
export function extractSingleJsonObject(rawText: string): { ok: true; value: Record<string, unknown> } | { ok: false } {
  const candidate = stripSingleFence(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return { ok: false };
  }
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return { ok: true, value: parsed as Record<string, unknown> };
  return { ok: false };
}

/** Removes at most one surrounding ```-fence from `s` (after trimming). A fence is recognized only
 * when the opening line is a bare ``` optionally followed by a simple language tag (e.g. ```json)
 * and a matching closing ``` exists — otherwise the input is returned trimmed but unchanged, so a
 * value that merely CONTAINS backticks is never mangled. */
function stripSingleFence(s: string): string {
  const t = s.trim();
  if (!t.startsWith("```")) return t;
  const firstNl = t.indexOf("\n");
  if (firstNl === -1) return t;
  const tag = t.slice(3, firstNl).trim();
  if (tag !== "" && !/^[A-Za-z0-9_-]+$/.test(tag)) return t; // opening line carried more than a language tag — not a clean fence
  const closeIdx = t.lastIndexOf("```");
  if (closeIdx <= firstNl) return t; // no closing fence after the opening line
  return t.slice(firstNl + 1, closeIdx).trim();
}

export function toDispatchedTurn(role: Role, result: WorkerResult): DispatchedTurn {
  if (result.exit !== 0) return { raw: undefined, role, exit: result.exit, usage: result.usage };
  if (result.rawText === undefined) return { raw: undefined, role, exit: 12, usage: result.usage };
  const extracted = extractSingleJsonObject(result.rawText);
  if (extracted.ok) return { raw: extracted.value, role, exit: 0, usage: result.usage };
  // GAP 7(b): parse/extraction failed — carry the raw text so the driver edge persists a bounded
  // `parse-failed` snippet (previously discarded; the node-skipped reason was the bare "worker exit 12").
  return { raw: undefined, role, exit: 12, usage: result.usage, rawText: result.rawText };
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
export function verifierItemFor(node: AfNodeView, tier: Tier): VerifierItemInput {
  return {
    nodeId: node.id,
    statement: node.statement ?? `(no statement recorded by af export for node ${node.id})`,
    deps: node.deps ?? [],
    tier,
    // rk-jit (STOP-4): computed on the REAL node (its actual statement/children/deps), not the
    // placeholder-filled item — the prompt's HARD-RULE branch and driver-verify-node.ts's discard
    // read the SAME predicate so they never disagree about whether a node is bare.
    proofless: isProoflessNode(node),
  };
}

/** The one live `dispatchVerify` a `DriverDeps` needs: dispatches `node` as a turn on `dispatcher`,
 * building its prompt via src/drive/driver-prompts.ts. */
export function liveDispatchVerify(dispatcher: LiveRoleTierDispatcher, tier: Tier) {
  return (node: AfNodeView): Promise<DispatchedTurn> =>
    dispatcher.dispatch(node.id, buildVerifierTurnPrompt(verifierItemFor(node, tier)));
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
  return (node: AfNodeView): Promise<DispatchedTurn> =>
    dispatcher.dispatch(node.id, buildProverTurnPrompt(proverItemFor(node)));
}

/** The one live `recordProof` a `DriverDeps` needs (rk-gn4 + B1 + FU3): records the prover's
 * decomposition into af via the atomic `af record-proof` verb (src/drive/driver-af.ts's
 * `recordProofRefine`). rk B1: the node's content hash AT DISPATCH is threaded as `--expect-hash`,
 * so af refuses a proof generated for bytes that changed mid-turn (mirroring the verifier apply's
 * hash re-bind) — a stale-role/stale-hash rejection surfaces as a discard, not a partial write.
 * `owner` is the prover's identity seam; `absWorkspace` the resolved proof dir. */
export function liveRecordProof(absWorkspace: string, owner: string, afCommand?: readonly string[]) {
  return (node: AfNodeView, proof: ProofContent): RecordProofResult =>
    recordProofRefine(absWorkspace, node.id, owner, proof, node.contentHash, afCommand);
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
