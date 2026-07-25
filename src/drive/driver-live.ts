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
//    in driver-live-dispatch.ts, rk-tbg split) — NOT part of src/drive/driver-prompts.ts's two pure
//    exports (verifier/prover), which is the shape the task brief for this WP actually names.

import { BackendRegistry, type WorkersConfig } from "./backend-registry";
import type { SessionSpec, TurnItem, WorkerBackend } from "./backend-types";
import { createSession as registerSession, emptySessionManagerState, type SessionManagerState } from "./session-manager";
import type { SessionRecord } from "./session";
import type { DispatchModel, Role, Tier } from "./vocab";
import type { WorkerResult, WorkerUsage } from "./worker-result";
import type { DispatchedTurn } from "./driver-run";
import { OUTPUT_SCHEMA_REF } from "./driver-prompts";
import { classifyExtractionFailure, extractSingleJsonObject } from "./parse-diag";
// rk-7hi: model/family resolution now lives in its own pure module (280-line shard cap) —
// re-exported here unchanged so every existing import site (src/cli/verify-live.ts, tests) is
// unaffected by the split.
export { DEFAULT_MODEL_BY_BACKEND, resolveModel, familyForBackend } from "./driver-live-model";
// rk-tbg: the TURN-ASSEMBLY / DISPATCH-WIRING half of this file's original scope (verifier/prover
// item construction, the live dispatchVerify/dispatchProve/dispatchClassification/recordProof
// functions, and the two schema-repair-once functions) now lives in its own module (280-line shard
// cap) — re-exported here unchanged so every existing import site (src/cli/verify-live.ts, tests) is
// unaffected by the split. See driver-live-dispatch.ts's own header for why this is a genuinely
// separate job from the dispatcher CONSTRUCTION this file keeps.
export {
  verifierItemFor,
  liveDispatchVerify,
  REPAIR_MAX_OUTPUT_TOKENS,
  repairVerifierTurnOnce,
  proverItemFor,
  liveDispatchProve,
  repairProverTurnOnce,
  liveRecordProof,
  liveDispatchClassification,
} from "./driver-live-dispatch";

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
