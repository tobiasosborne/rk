// EDGE — subprocess (`codex exec`) + a transient temp file for `-o`/`--output-last-message`
// capture. M3.2's codex adapter: `dispatchModel:"flat"` per the M3.1 Tier A review's Q1 ruling
// ("Codex defaults to dispatchModel:'flat' until a Codex-specific spike proves continuation
// semantics; do not infer them from Claude") — docs/worker-contract.md section (a). `createSession`
// therefore sends NOTHING to the real backend (a flat backend "returns a synthetic id and sends
// nothing yet") and just remembers `sharedContext` in-memory; `runTurn` re-assembles ONE flat
// prompt (`sharedContext + item.content`) on EVERY call — the honest, no-cache-credit cost this
// dispatch model must pay, per the contract's "no cache-read credit is assumed" rule. A future
// codex-session spike (named in the Q1 ruling) would measure `codex exec resume <thread-id>`,
// which this CLI already exposes as a subcommand — see this WP's live-fire memo for what such a
// spike would need to check before this adapter could switch to `sessionResume:true`.

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionSpec, TurnItem, WorkerBackend } from "./backend-types";
import { defaultSpawn, type SpawnFn } from "./backend-spawn";
import { CODEX_ACCOUNT_DEFAULT_MODEL } from "./driver-live-model";
import type { WorkerResult, WorkerUsage } from "./worker-result";

const CODEX_BIN = "codex";
const ZERO_USAGE: WorkerUsage = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };

interface StoredSession {
  sharedContext: string;
  model?: string;
}

interface CodexEvent {
  type: string;
  usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number; reasoning_output_tokens?: number };
}

const TERMINAL_TYPES = new Set(["turn.completed", "turn.failed", "error"]);

interface ParsedJsonl {
  events: CodexEvent[];
  /** The LAST non-blank line failed to parse as a JSON object. Unlike a stray informational line
   * elsewhere in the stream (tolerated below), a malformed TAIL line means the stream may have been
   * cut off mid-write (process killed, pipe closed) — we cannot tell whether a terminal event ever
   * arrived, so the caller must reject rather than silently drop it (review blocker 4: a truncated
   * execution must never reach the ledger looking like a clean run). */
  tailMalformed: boolean;
}

/** Parses `codex exec --json`'s JSONL event stream. A stray non-JSON line NOT at the tail is
 * skipped, not fatal on its own (the live-fire spike observed one informational stderr-style line
 * mixed into stdout on an unrecognized-model warning) — but a malformed line at the very end of the
 * stream is reported via `tailMalformed`, since that is exactly the shape a truncated/incomplete
 * execution takes. The caller decides overall success/failure from the PRESENCE of exactly one
 * terminal (`turn.completed`/`turn.failed`/`error`) event, never from every line parsing cleanly. */
function parseJsonl(stdout: string): ParsedJsonl {
  const lines = stdout.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const events: CodexEvent[] = [];
  let tailMalformed = false;
  lines.forEach((line, i) => {
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        events.push(parsed as CodexEvent);
        return;
      }
    } catch {
      // falls through to the malformed handling below
    }
    if (i === lines.length - 1) tailMalformed = true;
    // else: a stray non-JSON line elsewhere in the stream — ignored, see doc comment above.
  });
  return { events, tailMalformed };
}

/** Exactly one terminal event is the only acceptable shape: none means the turn never reached a
 * conclusion (incomplete/discarded); more than one is an ambiguous/duplicated stream. Either case
 * must be rejected by the caller, never resolved by picking "the last one" (review blocker 4). */
function soleTerminalEvent(events: CodexEvent[]): CodexEvent | "missing" | "duplicate" {
  const terminals = events.filter((e) => TERMINAL_TYPES.has(e.type));
  if (terminals.length === 0) return "missing";
  if (terminals.length > 1) return "duplicate";
  return terminals[0]!;
}

function usageFrom(events: CodexEvent[]): WorkerUsage {
  const completed = events.find((e) => e.type === "turn.completed");
  const u = completed?.usage;
  return {
    input: u?.input_tokens ?? 0,
    output: (u?.output_tokens ?? 0) + (u?.reasoning_output_tokens ?? 0),
    cache_read: u?.cached_input_tokens ?? 0,
    // codex's `turn.completed` usage event exposes no separate cache-WRITE figure (only
    // `cached_input_tokens`, the read side) — 0 is the honest "not reported by this CLI", never a
    // guessed value. See this WP's live-fire memo, "real-world adapter surprises".
    cache_creation: 0,
  };
}

function budgetExceeded(item: TurnItem, usage: WorkerUsage): boolean {
  return Number.isFinite(item.maxOutputTokens) && item.maxOutputTokens > 0 && usage.output >= item.maxOutputTokens;
}

export interface CodexBackendDeps {
  spawn?: SpawnFn;
  binary?: string;
  cwd?: string;
  /** Injectable so tests never touch the real filesystem's temp directory. */
  tmpDirFactory?: () => string;
}

export class CodexBackend implements WorkerBackend {
  readonly name = "codex";
  // codex is a backend/product name, not a model lineage (docs/worker-contract.md section (e),
  // review blocker 5): it fronts OpenAI models, whose family is "gpt".
  readonly modelFamily = "gpt" as const;
  readonly capabilities = { sessionResume: false };

  private readonly spawn: SpawnFn;
  private readonly binary: string;
  private readonly cwd: string;
  private readonly tmpDirFactory: () => string;
  private readonly sessions = new Map<string, StoredSession>();

  constructor(deps: CodexBackendDeps = {}) {
    this.spawn = deps.spawn ?? defaultSpawn;
    this.binary = deps.binary ?? CODEX_BIN;
    this.cwd = deps.cwd ?? ".";
    this.tmpDirFactory = deps.tmpDirFactory ?? (() => join(tmpdir(), `rk-codex-${randomUUID()}`));
  }

  async createSession(spec: SessionSpec): Promise<{ sessionId: string }> {
    const sessionId = `flat-${randomUUID()}`;
    this.sessions.set(sessionId, { sharedContext: spec.sharedContext, model: spec.model });
    return { sessionId };
  }

  async runTurn(sessionId: string, item: TurnItem): Promise<WorkerResult> {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return { exit: 13, usage: ZERO_USAGE, dispatchModel: "flat" };

    const prompt = `${session.sharedContext}\n\n${item.content}`;
    const dir = this.tmpDirFactory();
    mkdirSync(dir, { recursive: true });
    const outFile = join(dir, "last-message.txt");
    // rk-le9: the sentinel CODEX_ACCOUNT_DEFAULT_MODEL means "no explicit model was configured" --
    // `-m` is OMITTED entirely (never passed with the sentinel string itself as a literal model
    // id), so `codex exec` falls through to whatever model its own config/auth mode already
    // resolves. A ChatGPT-account codex login 400-rejects an explicit `-m gpt-5*-codex`; omitting
    // the flag is the only way such a login can ever be reached by rk at all.
    const args = [
      "exec",
      prompt,
      "--json",
      "--skip-git-repo-check",
      "-s",
      "read-only",
      "-o",
      outFile,
      ...(session.model && session.model !== CODEX_ACCOUNT_DEFAULT_MODEL ? ["-m", session.model] : []),
    ];
    try {
      // stdin MUST be closed (`input: ""`): `codex exec` otherwise waits on interactive stdin even
      // though a prompt was already supplied as an argument (this WP's live-fire memo).
      const outcome = await this.spawn(this.binary, args, { cwd: this.cwd, timeoutMs: item.timeoutMs, input: "" });
      if (outcome.timedOut) return { exit: 10, usage: ZERO_USAGE, dispatchModel: "flat" };

      const { events, tailMalformed } = parseJsonl(outcome.stdout);
      const terminal = soleTerminalEvent(events);
      // A truncated tail, a missing terminal event, or duplicate terminal events are all shapes an
      // incomplete or discarded turn can take — none of them may reach the verdict-file read below
      // (review blocker 4). Only a single, unambiguous terminal event is even eligible for exit 0.
      if (tailMalformed || terminal === "missing" || terminal === "duplicate") {
        return { exit: 13, usage: ZERO_USAGE, dispatchModel: "flat" };
      }
      const usage = usageFrom(events);
      if (terminal.type !== "turn.completed") return { exit: 13, usage, dispatchModel: "flat" };
      if (outcome.exitCode !== 0) return { exit: 13, usage, dispatchModel: "flat" };
      if (budgetExceeded(item, usage)) return { exit: 11, usage, dispatchModel: "flat" };

      try {
        const rawText = readFileSync(outFile, "utf8");
        return { exit: 0, usage, rawText, dispatchModel: "flat" };
      } catch {
        // The CLI reported a completed turn but the file we asked it to write is absent — a
        // self-detected schema-invalid-output case (docs/worker-contract.md exit 12): no usable
        // body was produced despite an apparently successful turn.
        return { exit: 12, usage, dispatchModel: "flat" };
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
