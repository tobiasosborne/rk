// 1:1 test file for src/drive/l5-dispatch.ts (M3.7's fourth deliverable): batch dispatch of L5
// reviews through the worker contract, end to end. INJECTED `WorkerBackend` ONLY (mirrors
// test/drive/backend-claude.test.ts's own injected-spawn discipline) — no test here spawns a real
// subprocess or calls a real LLM.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatchL5Plan, type L5DispatchDeps } from "../../src/drive/l5-dispatch";
import { deriveBatchId } from "../../src/drive/batch-composer";
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

// rk-74o: a plan's batchId is `deriveBatchId(northStar, members)` over its ACTUAL members, so these
// fixtures derive it rather than using a stand-in constant — otherwise the "re-derivation is a
// no-op when nothing is dropped" assertion below could not distinguish a real no-op from a rename.
const BATCH_AB = deriveBatchId("z", ["a", "b"]);
const BATCH_A = deriveBatchId("z", ["a"]);
const BATCH_B = deriveBatchId("z", ["b"]);

function plan(overrides: Partial<L5DispatchPlan> = {}): L5DispatchPlan {
  return {
    northStarId: "z",
    cap: 10,
    batches: [{ batchId: BATCH_AB, composedBatchId: BATCH_AB, claimId: `l5:${BATCH_AB}`, members: [{ itemId: "a", order: 0, contentHash: HASH_A }, { itemId: "b", order: 1, contentHash: HASH_B }], score: 0 }],
    excluded: [],
    ...overrides,
  };
}

/** A fake in-memory `WorkerBackend`: `turnReplies` maps itemId -> the raw JSON body the fake
 * worker "returns" for that item's turn (already JSON.stringify-ready as an object; this fake
 * stringifies it for the caller, mirroring a real backend's `rawText`). `sessionUsage`, when
 * supplied, is what `createSession` reports back (M3 blocker 8: a session-capable backend's
 * `createSession` can itself spend real tokens — see backend-types.ts's additive `usage` field). */
function fakeBackend(turnReplies: Record<string, unknown>, opts: { exitFor?: Record<string, number>; sessionUsage?: WorkerUsage } = {}): { backend: WorkerBackend; sessionSpecs: SessionSpec[]; turns: TurnItem[] } {
  const sessionSpecs: SessionSpec[] = [];
  const turns: TurnItem[] = [];
  let sessionCounter = 0;
  const backend: WorkerBackend = {
    name: "fake",
    modelFamily: "claude",
    capabilities: { sessionResume: true },
    async createSession(spec) {
      sessionSpecs.push(spec);
      return { sessionId: `sess-${sessionCounter++}`, usage: opts.sessionUsage };
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

function deps(backend: WorkerBackend, contentOverrides: Record<string, string> = { a: CONTENT_A, b: CONTENT_B }, extra: Partial<L5DispatchDeps> = {}): L5DispatchDeps {
  return { backend, model: "claude-sonnet-5", content: new Map(Object.entries(contentOverrides)), sharedContext: "rubric text", nowIso: () => "2026-07-19T00:00:00.000Z", ...extra };
}

/** Captures every `appendLog` line as a parsed JSON object, in call order — the shape a real
 * `.rk/driver-log.jsonl` writer (src/cli/verify-live.ts's `appendDriverLog`, out of this WP's
 * scope) would persist. */
function logCapture(): { appendLog: (line: string) => void; records: Record<string, unknown>[] } {
  const records: Record<string, unknown>[] = [];
  return { appendLog: (line: string) => records.push(JSON.parse(line)), records };
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
    expect(records.every((r) => r.batchId === BATCH_AB)).toBe(true);
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
        { batchId: BATCH_A, composedBatchId: BATCH_A, claimId: `l5:${BATCH_A}`, members: [{ itemId: "a", order: 0, contentHash: hashOf("content a") }], score: 0 },
        { batchId: deriveBatchId("z", ["c"]), composedBatchId: deriveBatchId("z", ["c"]), claimId: `l5:${deriveBatchId("z", ["c"])}`, members: [{ itemId: "c", order: 0, contentHash: hashOf("content c") }], score: 0 },
      ],
    };
    const outcomes = await dispatchL5Plan(root, twoBatchPlan, deps(backend, { a: "content a", c: "content c" }));
    expect(sessionSpecs.map((s) => s.claimId)).toEqual([`l5:${BATCH_A}`, `l5:${deriveBatchId("z", ["c"])}`]);
    expect(outcomes.map((o) => o.batchId)).toEqual([BATCH_A, deriveBatchId("z", ["c"])]);
  });
});

// M3 repair-wave blocker 8 (docs/reviews/2026-07-19-m3-milestone-review-codex.md): "session-creation
// usage and all L5 usage are absent" from the SC4 accounting report. Before this WP, dispatchL5Plan
// discarded every WorkerResult's `usage` field and never called `createSession`'s optional `usage`
// at all — real L5 spend was structurally invisible to src/drive/report.ts. These tests assert the
// fix's contract: an injected `appendLog` receives one `{kind:"usage",...}` line per real backend
// call (session open + every dispatched turn, applied OR rejected — tokens are spent either way),
// and zero lines for members discarded BEFORE dispatch (no tokens spent).
describe("dispatchL5Plan — M3 blocker 8: L5 usage accounting", () => {
  test("logs one usage record per dispatched turn, for BOTH applied and rejected members", async () => {
    const usageA: WorkerUsage = { input: 11, output: 22, cache_read: 0, cache_creation: 0 };
    const usageB: WorkerUsage = { input: 33, output: 44, cache_read: 0, cache_creation: 0 };
    const { backend } = fakeBackend({ a: { verdict: "VALID", justification: "j" }, b: { verdict: "VALID", justification: "j" } }, { exitFor: { b: 13 } });
    // fakeBackend always returns the SAME usage per test; override runTurn behavior via a thin
    // wrapper so "a" and "b" report distinguishable usage.
    const usageByItem: Record<string, WorkerUsage> = { a: usageA, b: usageB };
    const wrapped: WorkerBackend = { ...backend, runTurn: async (sid, item) => { const r = await backend.runTurn(sid, item); return { ...r, usage: usageByItem[item.itemId]! }; } };
    const root = tmpRoot();
    const { appendLog, records } = logCapture();
    await dispatchL5Plan(root, plan(), deps(wrapped, undefined, { appendLog }));

    const usageRecords = records.filter((r) => r.kind === "usage" && r.nodeId !== "(session-open)");
    expect(usageRecords.map((r) => r.nodeId).sort()).toEqual(["a", "b"]);
    const recA = usageRecords.find((r) => r.nodeId === "a")!;
    expect(recA.usage).toEqual(usageA);
    expect(recA.claimId).toBe(`l5:${BATCH_AB}`);
    const recB = usageRecords.find((r) => r.nodeId === "b")!;
    expect(recB.usage).toEqual(usageB); // rejected turn (exit 13) still spent real tokens
  });

  test("logs a session-creation usage record when the backend reports one, distinct from member nodeIds", async () => {
    const sessionUsage: WorkerUsage = { input: 500, output: 0, cache_read: 0, cache_creation: 200 };
    const { backend } = fakeBackend({ a: { verdict: "VALID", justification: "j" }, b: { verdict: "VALID", justification: "j" } }, { sessionUsage });
    const root = tmpRoot();
    const { appendLog, records } = logCapture();
    await dispatchL5Plan(root, plan(), deps(backend, undefined, { appendLog }));

    const sessionRecords = records.filter((r) => r.kind === "usage" && r.nodeId === "(session-open)");
    expect(sessionRecords).toHaveLength(1);
    expect(sessionRecords[0]!.usage).toEqual(sessionUsage);
    expect(sessionRecords[0]!.claimId).toBe(`l5:${BATCH_AB}`);
    // session-open logged before any member turn (log order feeds report.ts's fair-share pooling).
    const allNodeIds = records.filter((r) => r.kind === "usage").map((r) => r.nodeId);
    expect(allNodeIds[0]).toBe("(session-open)");
  });

  test("no session-creation usage record when the backend reports none (a flat/no-usage backend)", async () => {
    const { backend } = fakeBackend({ a: { verdict: "VALID", justification: "j" }, b: { verdict: "VALID", justification: "j" } });
    const root = tmpRoot();
    const { appendLog, records } = logCapture();
    await dispatchL5Plan(root, plan(), deps(backend, undefined, { appendLog }));
    expect(records.some((r) => r.nodeId === "(session-open)")).toBe(false);
  });

  test("a member discarded BEFORE dispatch (content-hash mismatch) logs NO usage record — no tokens spent", async () => {
    const { backend } = fakeBackend({ a: { verdict: "VALID", justification: "j" }, b: { verdict: "VALID", justification: "j" } });
    const root = tmpRoot();
    const { appendLog, records } = logCapture();
    await dispatchL5Plan(root, plan(), deps(backend, { a: "TAMPERED bytes that do not match HASH_A", b: CONTENT_B }, { appendLog }));
    const usageRecords = records.filter((r) => r.kind === "usage" && r.nodeId !== "(session-open)");
    expect(usageRecords.map((r) => r.nodeId)).toEqual(["b"]); // "a" never dispatched, never logged
    // rk-74o: and the session it WAS logged under is the re-derived, single-member batch's claim.
    expect(usageRecords[0]!.claimId).toBe(`l5:${BATCH_B}`);
  });

  test("dispatch works unchanged when appendLog is not supplied (optional dep, no crash)", async () => {
    const { backend } = fakeBackend({ a: { verdict: "VALID", justification: "j" }, b: { verdict: "VALID", justification: "j" } });
    const root = tmpRoot();
    const outcomes = await dispatchL5Plan(root, plan(), deps(backend));
    expect(outcomes[0]!.applied).toHaveLength(2);
  });
});

// rk-74o (M3 review follow-up 3, "actual-member provenance"): the batch id stamped on a verdict is
// what `af unvalidate --batch <id>` revokes, so it must name the set that actually shared a verifier
// session — the correlated-risk set. Members discarded BEFORE dispatch (no content, hash mismatch)
// never entered that session, so the pre-fix behaviour (screen inside the dispatch loop, keep the
// plan's id) recorded an id describing items the session never saw.
describe("dispatchL5Plan — rk-74o: the recorded batch id describes the members actually dispatched", () => {
  test("a member discarded pre-dispatch is NOT in the recorded batch id, and the survivors' id is re-derived", async () => {
    const { backend } = fakeBackend({ b: { verdict: "VALID", justification: "j" } });
    const root = tmpRoot();
    const outcomes = await dispatchL5Plan(root, plan(), deps(backend, { a: "TAMPERED bytes that do not match HASH_A", b: CONTENT_B }));
    expect(outcomes[0]!.batchId).toBe(BATCH_B);
    expect(outcomes[0]!.plannedBatchId).toBe(BATCH_AB);
    const { records } = readL5Store(root);
    expect(records.map((r) => r.itemId)).toEqual(["b"]);
    expect(records.every((r) => r.batchId === BATCH_B)).toBe(true);
  });

  test("the SESSION is opened under the re-derived claim id — session isolation names the dispatched set", async () => {
    const { backend, sessionSpecs } = fakeBackend({ b: { verdict: "VALID", justification: "j" } });
    const root = tmpRoot();
    await dispatchL5Plan(root, plan(), deps(backend, { b: CONTENT_B })); // "a" has no content at all
    expect(sessionSpecs.map((s) => s.claimId)).toEqual([`l5:${BATCH_B}`]);
  });

  test("when NOTHING is discarded the re-derivation is a no-op — the plan's own id is recorded", async () => {
    const { backend } = fakeBackend({ a: { verdict: "VALID", justification: "j" }, b: { verdict: "VALID", justification: "j" } });
    const root = tmpRoot();
    const outcomes = await dispatchL5Plan(root, plan(), deps(backend));
    expect(outcomes[0]!.batchId).toBe(BATCH_AB);
    expect(readL5Store(root).records.every((r) => r.batchId === BATCH_AB)).toBe(true);
  });

  test("a batch whose members are ALL discarded pre-dispatch opens NO session and records NO batch id", async () => {
    const { backend, sessionSpecs, turns } = fakeBackend({});
    const root = tmpRoot();
    const outcomes = await dispatchL5Plan(root, plan(), deps(backend, {})); // neither member has content
    expect(sessionSpecs).toEqual([]);
    expect(turns).toEqual([]);
    expect(outcomes[0]!.batchId).toBeUndefined();
    expect(outcomes[0]!.claimId).toBeUndefined();
    expect(outcomes[0]!.plannedBatchId).toBe(BATCH_AB);
    expect(outcomes[0]!.rejected.map((r) => r.itemId).sort()).toEqual(["a", "b"]);
  });

  test("a turn that FAILS after dispatch stays inside the batch id — it shared the session, so revocation must cover it", async () => {
    const { backend } = fakeBackend({ a: { verdict: "VALID", justification: "j" }, b: { verdict: "VALID", justification: "j" } }, { exitFor: { b: 13 } });
    const root = tmpRoot();
    const outcomes = await dispatchL5Plan(root, plan(), deps(backend));
    // "b" spent real tokens in the shared session and could have biased "a"; it stays a member.
    expect(outcomes[0]!.batchId).toBe(BATCH_AB);
    expect(readL5Store(root).records.every((r) => r.batchId === BATCH_AB)).toBe(true);
  });
});
