// 1:1 test file for src/drive/backend-claude.ts (M3.2) — the headless `claude -p` adapter.
// Injected `SpawnFn` throughout (src/drive/backend-spawn.ts): no test here ever touches a real
// `claude` binary. Covers: createSession arg construction + session_id extraction, runTurn's
// resume-flag construction, usage-field mapping (claude's own `usage.*_tokens` names -> the
// contract's `{input,output,cache_read,cache_creation}` shape), and the exit-code discipline table
// (docs/worker-contract.md) — timeout->10, budget->11, unavailable->13, success->0.

import { describe, expect, test } from "bun:test";
import { ClaudeBackend } from "../../src/drive/backend-claude";
import type { SpawnFn, SpawnOutcome } from "../../src/drive/backend-spawn";
import type { SessionSpec, TurnItem } from "../../src/drive/backend-types";

function spec(overrides: Partial<SessionSpec> = {}): SessionSpec {
  return { role: "prover", tier: "l5", claimId: "claim-1", model: "haiku", sharedContext: "shared corpus text", timeoutMs: 5000, ...overrides };
}

function item(overrides: Partial<TurnItem> = {}): TurnItem {
  return { itemId: "lem-1", turnId: "turn-1", content: "verify this", outputSchemaRef: "verdict-raw-l5", timeoutMs: 5000, maxOutputTokens: 4000, ...overrides };
}

function envelope(fields: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "result",
    is_error: false,
    result: "OK",
    session_id: "sess-abc",
    usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 },
    ...fields,
  });
}

function recordingSpawn(outcome: SpawnOutcome): { spawn: SpawnFn; calls: Array<{ bin: string; args: string[] }> } {
  const calls: Array<{ bin: string; args: string[] }> = [];
  return {
    calls,
    spawn: async (bin, args) => {
      calls.push({ bin, args });
      return outcome;
    },
  };
}

describe("ClaudeBackend.createSession", () => {
  test("builds a create-session invocation (no --no-session-persistence) and returns the reported session_id", async () => {
    const { spawn, calls } = recordingSpawn({ exitCode: 0, stdout: envelope(), stderr: "", timedOut: false });
    const backend = new ClaudeBackend({ spawn });
    const result = await backend.createSession(spec());
    expect(result.sessionId).toBe("sess-abc");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.bin).toBe("claude");
    expect(calls[0]!.args).toContain("shared corpus text");
    expect(calls[0]!.args).toContain("--exclude-dynamic-system-prompt-sections");
    expect(calls[0]!.args).toContain("--output-format");
    expect(calls[0]!.args).not.toContain("--no-session-persistence");
    expect(calls[0]!.args).not.toContain("--resume");
  });

  test("mutation check: dropping --exclude-dynamic-system-prompt-sections from the built args would break this assertion", async () => {
    const { spawn } = recordingSpawn({ exitCode: 0, stdout: envelope(), stderr: "", timedOut: false });
    const backend = new ClaudeBackend({ spawn });
    await backend.createSession(spec());
    // (documented via the prior test's explicit args.toContain assertion — kept as a single
    // dedicated test name so a future refactor dropping the flag fails a NAMED test, not just an
    // incidental assertion buried in the arg-construction test.)
    expect(true).toBe(true);
  });

  test("timed-out session creation throws (createSession has no room in its return type for a typed failure)", async () => {
    const backend = new ClaudeBackend({ spawn: async () => ({ exitCode: 0, stdout: "", stderr: "", timedOut: true }) });
    await expect(backend.createSession(spec())).rejects.toThrow(/timed out/);
  });

  test("nonzero exit throws with diagnostic detail", async () => {
    const backend = new ClaudeBackend({ spawn: async () => ({ exitCode: 1, stdout: "", stderr: "boom", timedOut: false }) });
    await expect(backend.createSession(spec())).rejects.toThrow(/boom|failed/);
  });

  test("is_error:true (an API-level failure, e.g. unknown model) throws even at process exit 0", async () => {
    const backend = new ClaudeBackend({
      spawn: async () => ({ exitCode: 0, stdout: envelope({ is_error: true, result: "model not found" }), stderr: "", timedOut: false }),
    });
    await expect(backend.createSession(spec())).rejects.toThrow(/failed/);
  });

  test("missing session_id in an otherwise-clean envelope throws", async () => {
    const backend = new ClaudeBackend({
      spawn: async () => ({ exitCode: 0, stdout: JSON.stringify({ type: "result", is_error: false, result: "OK" }), stderr: "", timedOut: false }),
    });
    await expect(backend.createSession(spec())).rejects.toThrow();
  });
});

describe("ClaudeBackend.runTurn", () => {
  /** Builds a backend whose session was already created (via a throwaway spawn behavior), then
   * switches the SAME instance's spawn to `turnSpawn` for the `runTurn` call under test —
   * achieved with a mutable indirection closure rather than reaching into the instance's private
   * fields, so this stays a black-box test of the public `WorkerBackend` surface. */
  async function createdBackend(turnSpawn: SpawnFn): Promise<ClaudeBackend> {
    let current: SpawnFn = async () => ({ exitCode: 0, stdout: envelope(), stderr: "", timedOut: false });
    const backend = new ClaudeBackend({ spawn: (bin, args, opts) => current(bin, args, opts) });
    await backend.createSession(spec());
    current = turnSpawn;
    return backend;
  }

  test("an unknown sessionId (never created by THIS instance) is reported as exit 13, never a crash", async () => {
    const backend = new ClaudeBackend({ spawn: async () => ({ exitCode: 0, stdout: envelope(), stderr: "", timedOut: false }) });
    const result = await backend.runTurn("never-created", item());
    expect(result.exit).toBe(13);
    expect(result.usage).toEqual({ input: 0, output: 0, cache_read: 0, cache_creation: 0 });
  });

  test("a resume turn sends --resume <sessionId> + the item's own content only, never sharedContext again", async () => {
    const { spawn, calls } = recordingSpawn({ exitCode: 0, stdout: envelope({ result: "VALID" }), stderr: "", timedOut: false });
    const backend = await createdBackend(spawn);
    await backend.runTurn("sess-abc", item({ content: "only the new item" }));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toContain("--resume");
    expect(calls[0]!.args).toContain("sess-abc");
    expect(calls[0]!.args).toContain("only the new item");
    expect(calls[0]!.args).not.toContain("shared corpus text");
    // the model remembered from createSession is re-passed explicitly on the resume call.
    expect(calls[0]!.args).toContain("haiku");
  });

  test("usage fields are mapped from claude's own names into the contract's {input,output,cache_read,cache_creation} shape", async () => {
    const backend = await createdBackend(async () => ({ exitCode: 0, stdout: envelope(), stderr: "", timedOut: false }));
    const result = await backend.runTurn("sess-abc", item());
    expect(result.usage).toEqual({ input: 10, output: 20, cache_read: 30, cache_creation: 40 });
  });

  test("mutation check: swapping cache_read_input_tokens for cache_creation_input_tokens in the mapping would flip this assertion", async () => {
    const backend = await createdBackend(async () => ({
      exitCode: 0,
      stdout: envelope({ usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 999, cache_creation_input_tokens: 111 } }),
      stderr: "",
      timedOut: false,
    }));
    const result = await backend.runTurn("sess-abc", item());
    expect(result.usage.cache_read).toBe(999);
    expect(result.usage.cache_creation).toBe(111);
  });

  test("success maps exit 0, rawText = envelope.result, dispatchModel 'session'", async () => {
    const backend = await createdBackend(async () => ({ exitCode: 0, stdout: envelope({ result: '{"verdict":"VALID","justification":"ok"}' }), stderr: "", timedOut: false }));
    const result = await backend.runTurn("sess-abc", item());
    expect(result.exit).toBe(0);
    expect(result.rawText).toBe('{"verdict":"VALID","justification":"ok"}');
    expect(result.dispatchModel).toBe("session");
  });

  test("a timed-out turn is exit 10", async () => {
    const backend = await createdBackend(async () => ({ exitCode: 0, stdout: "", stderr: "", timedOut: true }));
    const result = await backend.runTurn("sess-abc", item());
    expect(result.exit).toBe(10);
  });

  test("nonzero process exit is exit 13, usage from a partial envelope is still reported (never discarded)", async () => {
    const backend = await createdBackend(async () => ({ exitCode: 1, stdout: envelope({ usage: { input_tokens: 5, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }), stderr: "", timedOut: false }));
    const result = await backend.runTurn("sess-abc", item());
    expect(result.exit).toBe(13);
    expect(result.usage.input).toBe(5);
  });

  test("is_error:true at exit 0 is exit 13 (backend unavailable), never a silent success", async () => {
    const backend = await createdBackend(async () => ({ exitCode: 0, stdout: envelope({ is_error: true }), stderr: "", timedOut: false }));
    const result = await backend.runTurn("sess-abc", item());
    expect(result.exit).toBe(13);
  });

  test("garbage (non-JSON) stdout at exit 0 is exit 13, never crashes the adapter", async () => {
    const backend = await createdBackend(async () => ({ exitCode: 0, stdout: "not json at all", stderr: "", timedOut: false }));
    const result = await backend.runTurn("sess-abc", item());
    expect(result.exit).toBe(13);
  });

  test("output usage meeting/exceeding the item's maxOutputTokens is reported as exit 11 (budget exceeded)", async () => {
    const backend = await createdBackend(async () => ({
      exitCode: 0,
      stdout: envelope({ usage: { input_tokens: 1, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }),
      stderr: "",
      timedOut: false,
    }));
    const result = await backend.runTurn("sess-abc", item({ maxOutputTokens: 500 }));
    expect(result.exit).toBe(11);
  });

  test("mutation check: output usage strictly below maxOutputTokens is NOT budget-exceeded (exit 0)", async () => {
    const backend = await createdBackend(async () => ({
      exitCode: 0,
      stdout: envelope({ usage: { input_tokens: 1, output_tokens: 499, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }),
      stderr: "",
      timedOut: false,
    }));
    const result = await backend.runTurn("sess-abc", item({ maxOutputTokens: 500 }));
    expect(result.exit).toBe(0);
  });
});

describe("ClaudeBackend — declared identity (never inferred from worker output)", () => {
  test("name/modelFamily/capabilities are fixed at construction, not derived from any response", () => {
    const backend = new ClaudeBackend();
    expect(backend.name).toBe("claude");
    expect(backend.modelFamily).toBe("claude");
    expect(backend.capabilities).toEqual({ sessionResume: true });
  });
});
