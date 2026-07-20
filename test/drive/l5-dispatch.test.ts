// 1:1 test file for src/drive/l5-dispatch.ts (M3.7's fourth deliverable): batch dispatch of L5
// reviews through the worker contract, end to end. INJECTED `WorkerBackend` ONLY (mirrors
// test/drive/backend-claude.test.ts's own injected-spawn discipline) — no test here spawns a real
// subprocess or calls a real LLM.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatchL5Plan, type L5DispatchDeps } from "../../src/drive/l5-dispatch";
import { readL5Store } from "../../src/drive/l5-store-io";
import { sha256Bytes } from "../../src/refs/hash";
import type { L5DispatchPlan } from "../../src/drive/l5-dispatch-plan";
import type { WorkerBackend, SessionSpec, TurnItem } from "../../src/drive/backend-types";
import type { WorkerResult, WorkerUsage } from "../../src/drive/worker-result";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function tmpRoot(): string {
  const d = mkdtempSync(join(tmpdir(), "rk-l5-dispatch-"));
  dirs.push(d);
  return d;
}

// M3 blocker 1: l5-dispatch now binds the recorded hash to the EXACT dispatched bytes and rejects
// any member whose supplied content does not hash to the plan's declared contentHash. So a plan's
// contentHash must be the real l5ContentHash-domain hash (raw shard-file SHA-256) of the content
// the deps supply — computed here, never a stand-in constant.
const hashOf = (s: string): string => sha256Bytes(new TextEncoder().encode(s));
const CONTENT_A = "shard a content";
const CONTENT_B = "shard b content";
const HASH_A = hashOf(CONTENT_A);
const HASH_B = hashOf(CONTENT_B);
const ZERO_USAGE: WorkerUsage = { input: 10, output: 5, cache_read: 0, cache_creation: 0 };

function plan(overrides: Partial<L5DispatchPlan> = {}): L5DispatchPlan {
  return {
    northStarId: "z",
    cap: 10,
    batches: [{ batchId: "batch-1", claimId: "l5:batch-1", members: [{ itemId: "a", order: 0, contentHash: HASH_A }, { itemId: "b", order: 1, contentHash: HASH_B }], score: 0 }],
    excluded: [],
    ...overrides,
  };
}

/** A fake in-memory `WorkerBackend`: `turnReplies` maps itemId -> the raw JSON body the fake
 * worker "returns" for that item's turn (already JSON.stringify-ready as an object; this fake
 * stringifies it for the caller, mirroring a real backend's `rawText`). */
function fakeBackend(turnReplies: Record<string, unknown>, opts: { exitFor?: Record<string, number> } = {}): { backend: WorkerBackend; sessionSpecs: SessionSpec[]; turns: TurnItem[] } {
  const sessionSpecs: SessionSpec[] = [];
  const turns: TurnItem[] = [];
  let sessionCounter = 0;
  const backend: WorkerBackend = {
    name: "fake",
    modelFamily: "claude",
    capabilities: { sessionResume: true },
    async createSession(spec) {
      sessionSpecs.push(spec);
      return { sessionId: `sess-${sessionCounter++}` };
    },
    async runTurn(_sessionId, item) {
      turns.push(item);
      const exit = opts.exitFor?.[item.itemId] ?? 0;
      if (exit !== 0) return { exit, usage: ZERO_USAGE };
      const body = turnReplies[item.itemId];
      const result: WorkerResult = { exit: 0, usage: ZERO_USAGE, rawText: JSON.stringify(body), dispatchModel: "session" };
      return result;
    },
  };
  return { backend, sessionSpecs, turns };
}

function deps(backend: WorkerBackend, contentOverrides: Record<string, string> = { a: CONTENT_A, b: CONTENT_B }): L5DispatchDeps {
  return { backend, model: "claude-sonnet-5", content: new Map(Object.entries(contentOverrides)), sharedContext: "rubric text", nowIso: () => "2026-07-19T00:00:00.000Z" };
}

describe("dispatchL5Plan — success path", () => {
  test("opens ONE session per batch and sends only the item content per turn (never re-sending sharedContext)", async () => {
    const { backend, sessionSpecs, turns } = fakeBackend({ a: { verdict: "VALID", justification: "checked a" }, b: { verdict: "INVALID", justification: "checked b, fails" } });
    const root = tmpRoot();
    const outcomes = await dispatchL5Plan(root, plan(), deps(backend));

    expect(sessionSpecs).toHaveLength(1);
    expect(sessionSpecs[0]!.sharedContext).toBe("rubric text");
    expect(turns.map((t) => t.content)).toEqual(["shard a content", "shard b content"]);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.rejected).toEqual([]);
    expect(outcomes[0]!.applied).toHaveLength(2);
  });

  test("applied verdicts are actually appended to the L5 ledger, bound to their planned contentHash", async () => {
    const { backend } = fakeBackend({ a: { verdict: "VALID", justification: "checked a" }, b: { verdict: "VALID", justification: "checked b" } });
    const root = tmpRoot();
    await dispatchL5Plan(root, plan(), deps(backend));
    const { records, issues } = readL5Store(root);
    expect(issues).toEqual([]);
    expect(records.map((r) => r.itemId).sort()).toEqual(["a", "b"]);
    expect(records.find((r) => r.itemId === "a")!.l5ContentHash).toBe(HASH_A);
  });

  test("batchId threads through into every appended record", async () => {
    const { backend } = fakeBackend({ a: { verdict: "VALID", justification: "j" }, b: { verdict: "VALID", justification: "j" } });
    const root = tmpRoot();
    await dispatchL5Plan(root, plan(), deps(backend));
    const { records } = readL5Store(root);
    expect(records.every((r) => r.batchId === "batch-1")).toBe(true);
  });
});

describe("dispatchL5Plan — rejection paths never silently drop a member", () => {
  test("a nonzero worker exit is rejected and reported, and does NOT get appended", async () => {
    const { backend } = fakeBackend({ a: { verdict: "VALID", justification: "j" }, b: { verdict: "VALID", justification: "j" } }, { exitFor: { b: 13 } });
    const root = tmpRoot();
    const outcomes = await dispatchL5Plan(root, plan(), deps(backend));
    expect(outcomes[0]!.applied).toHaveLength(1);
    expect(outcomes[0]!.rejected).toHaveLength(1);
    expect(outcomes[0]!.rejected[0]!.itemId).toBe("b");
    expect(readL5Store(root).records).toHaveLength(1);
  });

  test("a hard-tier-shaped reply is rejected at the binding stage (tier mismatch), never applied", async () => {
    const { backend } = fakeBackend({ a: { verdict: { outcome: "accept" }, justification: "j" }, b: { verdict: "VALID", justification: "j" } });
    const root = tmpRoot();
    const outcomes = await dispatchL5Plan(root, plan(), deps(backend));
    expect(outcomes[0]!.rejected.map((r) => r.itemId)).toContain("a");
    expect(readL5Store(root).records.map((r) => r.itemId)).toEqual(["b"]);
  });

  test("no content supplied for an item is rejected without ever calling runTurn for it", async () => {
    const { backend, turns } = fakeBackend({ a: { verdict: "VALID", justification: "j" } });
    const root = tmpRoot();
    const outcomes = await dispatchL5Plan(root, plan(), deps(backend, { a: CONTENT_A })); // "b" has no content
    expect(turns.map((t) => t.itemId)).toEqual(["a"]);
    expect(outcomes[0]!.rejected.map((r) => r.itemId)).toEqual(["b"]);
  });

  // M3 blocker 1: dispatching deps.content while recording an unrelated member.contentHash would
  // validate bytes no one reviewed — the plan's hash must match the actually-dispatched bytes.
  test("a member whose supplied bytes do not hash to the plan's contentHash is discarded before dispatch, never recorded", async () => {
    const { backend, turns } = fakeBackend({ a: { verdict: "VALID", justification: "j" }, b: { verdict: "VALID", justification: "j" } });
    const root = tmpRoot();
    // "a" declares HASH_A but the supplied content is DIFFERENT bytes (a stale plan / wrong source).
    const outcomes = await dispatchL5Plan(root, plan(), deps(backend, { a: "TAMPERED bytes that do not match HASH_A", b: CONTENT_B }));
    expect(turns.map((t) => t.itemId)).toEqual(["b"]); // "a" never dispatched (pre-fix: dispatched + recorded)
    const rejA = outcomes[0]!.rejected.find((r) => r.itemId === "a");
    expect(rejA?.stage).toBe("content-hash-mismatch");
    expect(readL5Store(root).records.map((r) => r.itemId)).toEqual(["b"]); // "a" never reaches the ledger
  });
});

describe("dispatchL5Plan — multi-batch", () => {
  test("each batch gets its own session, and batches are dispatched independently", async () => {
    const { backend, sessionSpecs } = fakeBackend({ a: { verdict: "VALID", justification: "j" }, c: { verdict: "VALID", justification: "j" } });
    const root = tmpRoot();
    const twoBatchPlan: L5DispatchPlan = {
      northStarId: "z",
      cap: 10,
      excluded: [],
      batches: [
        { batchId: "batch-1", claimId: "l5:batch-1", members: [{ itemId: "a", order: 0, contentHash: hashOf("content a") }], score: 0 },
        { batchId: "batch-2", claimId: "l5:batch-2", members: [{ itemId: "c", order: 0, contentHash: hashOf("content c") }], score: 0 },
      ],
    };
    const outcomes = await dispatchL5Plan(root, twoBatchPlan, deps(backend, { a: "content a", c: "content c" }));
    expect(sessionSpecs.map((s) => s.claimId)).toEqual(["l5:batch-1", "l5:batch-2"]);
    expect(outcomes.map((o) => o.batchId)).toEqual(["batch-1", "batch-2"]);
  });
});
