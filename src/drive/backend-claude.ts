// EDGE — subprocess (`claude -p`). M3.2's claude adapter: session-capable per docs/worker-
// contract.md section (a) — `createSession` opens a REAL session (no `--no-session-persistence`)
// and sends `sharedContext` once; `runTurn` resumes it (`--resume <id>`) with only the new item's
// content, per the M3.0 caching-spike's Recommendation 1 (docs/memos/2026-07-19-m3.0-caching-
// spike.md). `--exclude-dynamic-system-prompt-sections` is a FIXED flag on every invocation
// (Recommendation 4 — never toggled per-call). Follows the injectable-spawn edge pattern
// (src/drive/backend-spawn.ts / src/cli/phase.ts precedent) so tests never touch a real binary.
//
// Exit-code discipline (docs/worker-contract.md's table) is produced HERE, not left for a later
// wrapper: a timed-out call is reported as 10; a nonzero process exit or the CLI's own
// `is_error:true` (an API-level failure — bad model, rate limit, etc. — the live-fire spike found
// this reports process exit 1) is reported as 13 ("backend unavailable" — this call produced no
// usable response, never surfaced as a silent success); a turn whose `output` usage meets or
// exceeds the item's own `maxOutputTokens` is reported as 11 (budget-exceeded) — see this WP's
// live-fire memo for why this is a POST-HOC heuristic, not real enforcement (`claude -p` has no
// per-turn output-token cap flag, only `--max-budget-usd`, a dollar figure this WP's pinned
// `TurnItem` does not carry).

import type { SessionSpec, TurnItem, WorkerBackend } from "./backend-types";
import { defaultSpawn, type SpawnFn } from "./backend-spawn";
import type { WorkerResult, WorkerUsage } from "./worker-result";

const CLAUDE_BIN = "claude";
const ZERO_USAGE: WorkerUsage = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };

interface ClaudeEnvelope {
  result?: string;
  session_id?: string;
  is_error?: boolean;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

/** Parses `claude -p --output-format json`'s single-result envelope. Returns `undefined` on
 * anything that is not a JSON object — a garbage/truncated stdout is a distinct failure from a
 * well-formed envelope reporting `is_error:true`, but both end up mapped to exit 13 by the callers
 * below (docs/worker-contract.md: "any other nonzero code ... is treated as 13"). */
function parseEnvelope(stdout: string): ClaudeEnvelope | undefined {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed as ClaudeEnvelope;
  } catch {
    // fallthrough — undefined signals "no usable envelope" to the caller.
  }
  return undefined;
}

function usageFrom(envelope: ClaudeEnvelope | undefined): WorkerUsage {
  const u = envelope?.usage;
  return {
    input: u?.input_tokens ?? 0,
    output: u?.output_tokens ?? 0,
    cache_read: u?.cache_read_input_tokens ?? 0,
    cache_creation: u?.cache_creation_input_tokens ?? 0,
  };
}

function budgetExceeded(item: TurnItem, usage: WorkerUsage): boolean {
  return Number.isFinite(item.maxOutputTokens) && item.maxOutputTokens > 0 && usage.output >= item.maxOutputTokens;
}

// rk-s9t (M3 milestone review verdict (c)) — provider-enforced campaign budget, deliberately NOT
// wired: the campaign-level cap the driver enforces (src/cli/verify-live.ts's --max-campaign-tokens,
// checked pre-dispatch in src/drive/driver-run.ts) is a TOKEN figure. The only budget flag `claude
// -p` actually accepts is `--max-budget-usd` (a DOLLAR figure — confirmed by the M3.2 live-fire
// spike; there is no per-invocation token-cap flag). Passing the remaining budget through would mean
// converting remaining tokens → dollars, which needs a per-model price table this codebase does not
// (and per CLAUDE.md L4/the "do not invent provider flags" brief, must not) hardcode. So the spawn
// below carries NO budget flag; the honest, provider-independent enforcement is driver-side rules
// 1+2 (a required campaign cap + a pre-dispatch remaining-budget check that spends nothing it cannot
// afford). The per-TURN output ceiling is the separate, already-modelled exit-11 heuristic above.

export interface ClaudeBackendDeps {
  spawn?: SpawnFn;
  binary?: string;
  cwd?: string;
}

export class ClaudeBackend implements WorkerBackend {
  readonly name = "claude";
  readonly modelFamily = "claude" as const;
  readonly capabilities = { sessionResume: true };

  private readonly spawn: SpawnFn;
  private readonly binary: string;
  private readonly cwd: string;
  /** sessionId -> the model it was created with (docs/worker-contract.md: a resumed turn must use
   * the SAME model, never re-derived) — `TurnItem` carries no `model` field, so the adapter is the
   * one place this gets remembered. In-memory only: a process restart loses it, a known
   * limitation of this WP's scope (see the live-fire memo). */
  private readonly models = new Map<string, string>();

  constructor(deps: ClaudeBackendDeps = {}) {
    this.spawn = deps.spawn ?? defaultSpawn;
    this.binary = deps.binary ?? CLAUDE_BIN;
    this.cwd = deps.cwd ?? ".";
  }

  async createSession(spec: SessionSpec): Promise<{ sessionId: string }> {
    const args = ["-p", spec.sharedContext, "--model", spec.model, "--output-format", "json", "--exclude-dynamic-system-prompt-sections"];
    const outcome = await this.spawn(this.binary, args, { cwd: this.cwd, timeoutMs: spec.timeoutMs });
    if (outcome.timedOut) {
      throw new Error(`claude backend: session creation timed out after ${spec.timeoutMs}ms (claim '${spec.claimId}')`);
    }
    const envelope = parseEnvelope(outcome.stdout);
    if (outcome.exitCode !== 0 || !envelope || envelope.is_error || !envelope.session_id) {
      const detail = outcome.stderr.trim() || envelope?.result || `exit ${outcome.exitCode}`;
      throw new Error(`claude backend: session creation failed for claim '${spec.claimId}' — ${detail}`);
    }
    this.models.set(envelope.session_id, spec.model);
    return { sessionId: envelope.session_id };
  }

  async runTurn(sessionId: string, item: TurnItem): Promise<WorkerResult> {
    const model = this.models.get(sessionId);
    if (model === undefined) {
      // This adapter INSTANCE never saw `sessionId` created (a driver bug, or in-memory state lost
      // across a process restart) — 13 ("backend unavailable") is the honest classification: this
      // adapter cannot service the request, not a schema or budget problem.
      return { exit: 13, usage: ZERO_USAGE, dispatchModel: "session" };
    }
    const args = ["-p", item.content, "--resume", sessionId, "--model", model, "--output-format", "json", "--exclude-dynamic-system-prompt-sections"];
    const outcome = await this.spawn(this.binary, args, { cwd: this.cwd, timeoutMs: item.timeoutMs });
    if (outcome.timedOut) return { exit: 10, usage: ZERO_USAGE, dispatchModel: "session" };

    const envelope = parseEnvelope(outcome.stdout);
    const usage = usageFrom(envelope);
    if (outcome.exitCode !== 0 || !envelope || envelope.is_error) return { exit: 13, usage, dispatchModel: "session" };
    if (budgetExceeded(item, usage)) return { exit: 11, usage, dispatchModel: "session" };
    return { exit: 0, usage, rawText: envelope.result ?? "", dispatchModel: "session" };
  }
}
