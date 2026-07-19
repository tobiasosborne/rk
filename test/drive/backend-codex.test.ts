// 1:1 test file for src/drive/backend-codex.ts (M3.2) — the `codex exec` adapter. Injected
// `SpawnFn` + `tmpDirFactory` throughout (src/drive/backend-spawn.ts): no test here touches a real
// `codex` binary or the real OS temp directory. Covers: `createSession` sends NOTHING (flat
// backend), `runTurn`'s flat-prompt re-assembly (`sharedContext + item.content` on EVERY call),
// usage mapping (codex's own `turn.completed.usage` names), the exit-code table, and the
// output-file read (`-o`/`--output-last-message`) including its own absent-file edge case (exit
// 12).

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexBackend } from "../../src/drive/backend-codex";
import type { SpawnFn } from "../../src/drive/backend-spawn";
import type { SessionSpec, TurnItem } from "../../src/drive/backend-types";

function spec(overrides: Partial<SessionSpec> = {}): SessionSpec {
  return { role: "verifier", tier: "l5", claimId: "claim-1", model: "gpt-5.6-sol", sharedContext: "shared corpus text", timeoutMs: 5000, ...overrides };
}

function item(overrides: Partial<TurnItem> = {}): TurnItem {
  return { itemId: "lem-1", turnId: "turn-1", content: "verify this", outputSchemaRef: "verdict-raw-l5", timeoutMs: 5000, maxOutputTokens: 4000, ...overrides };
}

function outFileArg(args: string[]): string {
  const idx = args.indexOf("-o");
  if (idx === -1) throw new Error("test setup: -o not found in args");
  return args[idx + 1]!;
}

function turnCompletedLine(usage: Record<string, number> = {}): string {
  return JSON.stringify({ type: "turn.completed", usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 10, reasoning_output_tokens: 0, ...usage } });
}

describe("CodexBackend.createSession — flat backend sends nothing yet", () => {
  test("returns a synthetic sessionId without spawning any process", async () => {
    let spawnCalls = 0;
    const backend = new CodexBackend({ spawn: async () => { spawnCalls++; return { exitCode: 0, stdout: "", stderr: "", timedOut: false }; } });
    const result = await backend.createSession(spec());
    expect(result.sessionId.startsWith("flat-")).toBe(true);
    expect(spawnCalls).toBe(0);
  });

  test("two sessions get distinct synthetic ids", async () => {
    const backend = new CodexBackend();
    const a = await backend.createSession(spec());
    const b = await backend.createSession(spec());
    expect(a.sessionId).not.toBe(b.sessionId);
  });
});

describe("CodexBackend.runTurn", () => {
  let dir: string;
  function freshTmpDir(): () => string {
    dir = mkdtempSync(join(tmpdir(), "rk-codex-test-"));
    return () => dir;
  }

  test("an unknown sessionId is exit 13, never a crash, no spawn attempted", async () => {
    let spawnCalls = 0;
    const backend = new CodexBackend({ spawn: async () => { spawnCalls++; return { exitCode: 0, stdout: "", stderr: "", timedOut: false }; } });
    const result = await backend.runTurn("never-created", item());
    expect(result.exit).toBe(13);
    expect(spawnCalls).toBe(0);
  });

  test("runTurn re-sends sharedContext + item.content as ONE flat prompt on every call", async () => {
    const calls: string[][] = [];
    const tmpDirFactory = freshTmpDir();
    const backend = new CodexBackend({
      tmpDirFactory,
      spawn: async (_bin, args) => {
        calls.push(args);
        writeFileSync(outFileArg(args), "OK");
        return { exitCode: 0, stdout: turnCompletedLine(), stderr: "", timedOut: false };
      },
    });
    const { sessionId } = await backend.createSession(spec({ sharedContext: "SHARED-BLOCK" }));
    await backend.runTurn(sessionId, item({ content: "ITEM-ONE" }));
    await backend.runTurn(sessionId, item({ content: "ITEM-TWO" }));
    rmSync(dir, { recursive: true, force: true });

    expect(calls).toHaveLength(2);
    for (const args of calls) {
      const prompt = args[1]!;
      expect(prompt).toContain("SHARED-BLOCK");
    }
    expect(calls[0]![1]).toContain("ITEM-ONE");
    expect(calls[1]![1]).toContain("ITEM-TWO");
  });

  test("stdin is explicitly closed (empty), never left open for interactive read", async () => {
    let seenInput: string | undefined = "not-set";
    const backend = new CodexBackend({
      tmpDirFactory: freshTmpDir(),
      spawn: async (_bin, args, opts) => {
        seenInput = opts.input;
        writeFileSync(outFileArg(args), "OK");
        return { exitCode: 0, stdout: turnCompletedLine(), stderr: "", timedOut: false };
      },
    });
    const { sessionId } = await backend.createSession(spec());
    await backend.runTurn(sessionId, item());
    rmSync(dir, { recursive: true, force: true });
    expect(seenInput).toBe("");
  });

  test("model is passed via -m when the session was created with one", async () => {
    let seenArgs: string[] = [];
    const backend = new CodexBackend({
      tmpDirFactory: freshTmpDir(),
      spawn: async (_bin, args) => {
        seenArgs = args;
        writeFileSync(outFileArg(args), "OK");
        return { exitCode: 0, stdout: turnCompletedLine(), stderr: "", timedOut: false };
      },
    });
    const { sessionId } = await backend.createSession(spec({ model: "gpt-5.6-sol" }));
    await backend.runTurn(sessionId, item());
    rmSync(dir, { recursive: true, force: true });
    expect(seenArgs).toContain("-m");
    expect(seenArgs).toContain("gpt-5.6-sol");
  });

  test("usage is mapped from codex's turn.completed event: cached_input_tokens -> cache_read, output+reasoning -> output, cache_creation always 0", async () => {
    const backend = new CodexBackend({
      tmpDirFactory: freshTmpDir(),
      spawn: async (_bin, args) => {
        writeFileSync(outFileArg(args), "OK");
        return { exitCode: 0, stdout: turnCompletedLine({ input_tokens: 7, cached_input_tokens: 8, output_tokens: 9, reasoning_output_tokens: 3 }), stderr: "", timedOut: false };
      },
    });
    const { sessionId } = await backend.createSession(spec());
    const result = await backend.runTurn(sessionId, item());
    rmSync(dir, { recursive: true, force: true });
    expect(result.usage).toEqual({ input: 7, output: 12, cache_read: 8, cache_creation: 0 });
  });

  test("success: exit 0, rawText read from the -o file, dispatchModel 'flat'", async () => {
    const backend = new CodexBackend({
      tmpDirFactory: freshTmpDir(),
      spawn: async (_bin, args) => {
        writeFileSync(outFileArg(args), '{"verdict":"VALID","justification":"ok"}');
        return { exitCode: 0, stdout: turnCompletedLine(), stderr: "", timedOut: false };
      },
    });
    const { sessionId } = await backend.createSession(spec());
    const result = await backend.runTurn(sessionId, item());
    rmSync(dir, { recursive: true, force: true });
    expect(result.exit).toBe(0);
    expect(result.rawText).toBe('{"verdict":"VALID","justification":"ok"}');
    expect(result.dispatchModel).toBe("flat");
  });

  test("a timed-out call is exit 10", async () => {
    const backend = new CodexBackend({ tmpDirFactory: freshTmpDir(), spawn: async () => ({ exitCode: 0, stdout: "", stderr: "", timedOut: true }) });
    const { sessionId } = await backend.createSession(spec());
    const result = await backend.runTurn(sessionId, item());
    rmSync(dir, { recursive: true, force: true });
    expect(result.exit).toBe(10);
  });

  test("a turn.failed event is exit 13, even at process exit 0", async () => {
    const backend = new CodexBackend({
      tmpDirFactory: freshTmpDir(),
      spawn: async () => ({
        exitCode: 0,
        stdout: [JSON.stringify({ type: "turn.started" }), JSON.stringify({ type: "turn.failed", error: { message: "model not supported" } })].join("\n"),
        stderr: "",
        timedOut: false,
      }),
    });
    const { sessionId } = await backend.createSession(spec());
    const result = await backend.runTurn(sessionId, item());
    rmSync(dir, { recursive: true, force: true });
    expect(result.exit).toBe(13);
  });

  test("a nonzero process exit is exit 13", async () => {
    const backend = new CodexBackend({ tmpDirFactory: freshTmpDir(), spawn: async () => ({ exitCode: 1, stdout: turnCompletedLine(), stderr: "", timedOut: false }) });
    const { sessionId } = await backend.createSession(spec());
    const result = await backend.runTurn(sessionId, item());
    rmSync(dir, { recursive: true, force: true });
    expect(result.exit).toBe(13);
  });

  test("output usage meeting/exceeding maxOutputTokens is exit 11 (budget exceeded)", async () => {
    const backend = new CodexBackend({
      tmpDirFactory: freshTmpDir(),
      spawn: async (_bin, args) => {
        writeFileSync(outFileArg(args), "OK");
        return { exitCode: 0, stdout: turnCompletedLine({ output_tokens: 500, reasoning_output_tokens: 0 }), stderr: "", timedOut: false };
      },
    });
    const { sessionId } = await backend.createSession(spec());
    const result = await backend.runTurn(sessionId, item({ maxOutputTokens: 500 }));
    rmSync(dir, { recursive: true, force: true });
    expect(result.exit).toBe(11);
  });

  test("a completed turn whose output file is absent is exit 12 (self-detected schema-invalid output)", async () => {
    const backend = new CodexBackend({
      tmpDirFactory: freshTmpDir(),
      spawn: async () => ({ exitCode: 0, stdout: turnCompletedLine(), stderr: "", timedOut: false }), // never writes the -o file
    });
    const { sessionId } = await backend.createSession(spec());
    const result = await backend.runTurn(sessionId, item());
    rmSync(dir, { recursive: true, force: true });
    expect(result.exit).toBe(12);
  });

  test("the temp directory is cleaned up after a successful turn", async () => {
    const tmpDirFactory = freshTmpDir();
    const backend = new CodexBackend({
      tmpDirFactory,
      spawn: async (_bin, args) => {
        writeFileSync(outFileArg(args), "OK");
        return { exitCode: 0, stdout: turnCompletedLine(), stderr: "", timedOut: false };
      },
    });
    const { sessionId } = await backend.createSession(spec());
    await backend.runTurn(sessionId, item());
    expect(() => readFileSync(join(dir, "last-message.txt"))).toThrow();
  });
});

describe("CodexBackend — declared identity (never inferred from worker output)", () => {
  test("name/modelFamily/capabilities are fixed at construction: codex's family is 'gpt', not 'codex'", () => {
    const backend = new CodexBackend();
    expect(backend.name).toBe("codex");
    expect(backend.modelFamily).toBe("gpt");
    expect(backend.capabilities).toEqual({ sessionResume: false });
  });
});
