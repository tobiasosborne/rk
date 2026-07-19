// PURITY: pure — no fs/network/clock (L3). The M3.1 repair wave's landing-blocker-7 fix: ONE
// normalized envelope for "what a backend process produced this turn," and the buffered
// apply-or-discard pipeline docs/worker-contract.md's data-flow section now specifies. Before this
// module, the contract doc's prose response shape (`{verdicts, usage, exit}`) and
// `schemas/verdict.v1.json`'s actual top-level shape (`{schema_version, verifier, verdicts}`) were
// two different things wearing the same name — this module IS the envelope that wraps the
// verdict document rather than being confused with it: `WorkerResult` is the process-level
// wrapper (authoritative `exit` code + `usage` + the raw text the process printed);
// `VerdictDocument` (src/drive/verdict-schema.ts) is what's INSIDE it once every check passes.
//
// The authoritative signal for success/failure is the PROCESS EXIT CODE, not anything inside the
// parsed body (review blocker 7's explicit ruling: "whether the authoritative exit is the process
// code or wrapper result" — resolved here as the process code). A nonzero exit short-circuits
// before any parsing is attempted, even if `rawText` happens to look well-formed (a backend that
// prints a plausible-looking verdict and THEN crashes must not have that verdict applied).

import { bindVerdicts, type DispatchState } from "./bind-verdicts";
import type { VerdictDocument } from "./verdict-schema";
import type { DispatchModel } from "./vocab";

export interface WorkerUsage {
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
}

/** The complete outcome of one backend process invocation for one turn — captured by the edge
 * code that actually spawns the backend (M3.2: src/drive/backend-{claude,codex}.ts), then handed
 * to the pure `resolveTurn` below. `rawText` is `undefined` when the process produced nothing
 * usable (killed, crashed before printing, true process-level timeout) — that is itself a
 * rejection, never treated as "exit 0, empty success." `dispatchModel` (M3.2, additive/optional —
 * every M3.1 call site that predates this field still type-checks) records how THIS turn was
 * actually dispatched (`"session"` = a resumed/continued call, `"flat"` = a from-scratch call that
 * resent shared context) — a backend-registry fact (src/drive/backend-registry.ts), set by the
 * adapter itself from its own `capabilities.sessionResume`, NEVER inferred from worker output. */
export interface WorkerResult {
  exit: number;
  usage: WorkerUsage;
  rawText?: string;
  dispatchModel?: DispatchModel;
}

export type TurnFailureStage = "processExit" | "parse" | "binding";

export interface TurnFailureIssue {
  path: string;
  message: string;
}

export type TurnOutcome =
  | { status: "applied"; document: VerdictDocument; usage: WorkerUsage }
  | { status: "rejected"; stage: TurnFailureStage; issues: TurnFailureIssue[]; usage: WorkerUsage };

/** Buffers a complete turn and applies it only after EVERY check passes, in order: (1) the
 * process's own exit code was 0 (docs/worker-contract.md's exit-code table — a nonzero exit is
 * always a rejection, regardless of what `rawText` contains); (2) `rawText` exists and parses as
 * JSON; (3) `bindVerdicts` accepts the parsed body against `dispatchState` (raw-shape validation +
 * driver-owned-field injection + document validation, src/drive/bind-verdicts.ts). On ANY failure,
 * `verdicts` from this call are discarded entirely — nothing is ever partially applied. The
 * caller (a future driver loop, out of this WP's scope) is responsible for the two invariants
 * this function does not itself track: previously-committed turns for the same claim are
 * untouched by a later turn's rejection, and a rejected/never-attempted item is reported
 * explicitly (never silently dropped) — both are documented norms in
 * docs/worker-contract.md's data-flow section, consistent with this contract's exit-code table
 * (`schema-invalid`, not a silent success) and PRD C5's "never silently dropped" ethos applied to
 * this domain. */
export function resolveTurn(dispatchState: DispatchState, result: WorkerResult): TurnOutcome {
  if (result.exit !== 0) {
    return {
      status: "rejected",
      stage: "processExit",
      issues: [{ path: "$.exit", message: `process exited ${result.exit} (nonzero) — see docs/worker-contract.md's exit-code table; nothing from this call is applied` }],
      usage: result.usage,
    };
  }

  if (result.rawText === undefined) {
    return {
      status: "rejected",
      stage: "parse",
      issues: [{ path: "$.rawText", message: "exit 0 but no output was produced — a success exit must carry a parseable body (schema-invalid, not an empty success)" }],
      usage: result.usage,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.rawText);
  } catch (e) {
    return {
      status: "rejected",
      stage: "parse",
      issues: [{ path: "$", message: `output is not valid JSON: ${e instanceof Error ? e.message : String(e)}` }],
      usage: result.usage,
    };
  }

  const bound = bindVerdicts(dispatchState, parsed);
  if (!bound.ok) {
    return {
      status: "rejected",
      stage: "binding",
      issues: bound.issues.map((i) => ({ path: i.path, message: `[${i.stage}] ${i.message}` })),
      usage: result.usage,
    };
  }

  return { status: "applied", document: bound.document, usage: result.usage };
}
