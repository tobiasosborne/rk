// 1:1 test for src/drive/driver-live.ts (M3.5-prep). Full injected end-to-end: a FAKE
// `WorkerBackend` (never a real subprocess/LLM call) drives 3 hard-tier nodes through
// create-session -> turns -> bind -> verdict file -> a faked `af apply`, via the REAL
// `runVerifyDriver` (src/drive/driver-run.ts) loop -- the same loop `rk verify --af` (live) drives.

import { describe, expect, test } from "bun:test";
import { BackendRegistry, type WorkersConfig } from "../../src/drive/backend-registry";
import type { SessionSpec, TurnItem, WorkerBackend } from "../../src/drive/backend-types";
import type { WorkerResult } from "../../src/drive/worker-result";
import {
  createLiveDispatcher,
  describeMissingWorkersConfig,
  liveDispatchClassification,
  liveDispatchVerify,
  toDispatchedTurn,
  verifierItemFor,
} from "../../src/drive/driver-live";
import { runVerifyDriver, type DriverDeps } from "../../src/drive/driver-run";
import type { AfWorkspaceView, ApplyReport, FilledVerdictFile } from "../../src/drive/driver-af";
import type { AfNodeView } from "../../src/drive/driver-plan";
import type { VerifierIdentity } from "../../src/drive/identity";

const HASH = "a".repeat(64);
function node(id: string, o: Partial<AfNodeView> = {}): AfNodeView {
  return { id, epistemicState: "pending", workflowState: "available", crux: false, contentHash: HASH, statement: `statement for ${id}`, childIds: [], ...o };
}

/** A scripted fake backend: `createSession` mints a fresh sessionId every call (so the test can
 * detect an accidental SECOND session creation); `runTurn` returns whatever the caller queued for
 * that item, defaulting to a plain accept. Every call is logged as a start/end pair against a FAKE
 * (counter, not wall-clock) clock so ordering/staggering is asserted deterministically. */
function fakeBackend(opts: { turnFor?: (item: TurnItem) => WorkerResult; sessionShouldFail?: boolean } = {}) {
  const calls: string[] = [];
  let clock = 0;
  let sessionCounter = 0;
  const backend: WorkerBackend = {
    name: "fake",
    modelFamily: "claude",
    capabilities: { sessionResume: true },
    async createSession(spec: SessionSpec) {
      calls.push(`${clock++}:start:createSession`);
      if (opts.sessionShouldFail) { calls.push(`${clock++}:end:createSession:FAILED`); throw new Error("fake session failure"); }
      sessionCounter++;
      calls.push(`${clock++}:end:createSession:session-${sessionCounter}`);
      void spec;
      return { sessionId: `session-${sessionCounter}` };
    },
    async runTurn(sessionId: string, item: TurnItem) {
      calls.push(`${clock++}:start:runTurn:${item.itemId}`);
      const result = opts.turnFor
        ? opts.turnFor(item)
        : { exit: 0, usage: { input: 10, output: 5, cache_read: 20, cache_creation: 0 }, rawText: JSON.stringify({ verdict: { outcome: "accept" }, justification: "ok" }) };
      calls.push(`${clock++}:end:runTurn:${item.itemId}:session=${sessionId}`);
      return result;
    },
  };
  return { backend, calls };
}

function workersConfig(role: "verifier", tier: "hard", backendName: string): WorkersConfig {
  return { assignments: { [role]: { [tier]: { backend: backendName, fallbacks: [] } } } };
}

describe("createLiveDispatcher — preflight loudness", () => {
  test("no workers config entry for (role,tier): {ok:false} naming the EXACT config shape needed", () => {
    const registry = new BackendRegistry<WorkerBackend>({ assignments: {} }, []);
    const result = createLiveDispatcher({ registry, role: "verifier", tier: "hard", claimId: "c1", model: "m", sharedContext: "shared" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("workers.assignments.verifier.hard");
    expect(result.reason).toContain('"backend": "claude"');
    expect(result.reason).toBe(describeMissingWorkersConfig("verifier", "hard"));
  });

  test("a backend named in config but never REGISTERED is the same as unconfigured (never a silent guess)", () => {
    const registry = new BackendRegistry<WorkerBackend>(workersConfig("verifier", "hard", "claude"), []); // "claude" named, not registered
    const result = createLiveDispatcher({ registry, role: "verifier", tier: "hard", claimId: "c1", model: "m", sharedContext: "shared" });
    expect(result.ok).toBe(false);
  });
});

describe("createLiveDispatcher — session create-once + stagger ordering", () => {
  test("ensureSession is idempotent: 3 sequential dispatch() calls create exactly ONE session, in strict non-overlapping order", async () => {
    const { backend, calls } = fakeBackend();
    const registry = new BackendRegistry<WorkerBackend>(workersConfig("verifier", "hard", "fake"), [backend]);
    const result = createLiveDispatcher({ registry, role: "verifier", tier: "hard", claimId: "claim-1", model: "m", sharedContext: "SHARED" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await result.dispatcher.dispatch("1.1", "turn-1");
    await result.dispatcher.dispatch("1.2", "turn-2");
    await result.dispatcher.dispatch("1.3", "turn-3");

    const createSessionCalls = calls.filter((c) => c.includes("createSession"));
    expect(createSessionCalls.length).toBe(2); // one start, one end -- exactly once
    // stagger: createSession's start+end both precede every runTurn start (turn 1 never races turn 1's own session creation, per docs/worker-contract.md (d).1).
    const firstRunTurnIdx = calls.findIndex((c) => c.includes("start:runTurn"));
    const lastCreateSessionIdx = calls.map((c, i) => (c.includes("createSession") ? i : -1)).filter((i) => i >= 0).pop()!;
    expect(lastCreateSessionIdx).toBeLessThan(firstRunTurnIdx);
    // every start:X is immediately followed by its own end:X -- no interleaving across the 3 turns.
    // Compare only the call-kind (+ itemId, for runTurn) segment, ignoring the trailing
    // session-id/counter suffix each `end:` entry additionally carries.
    for (let i = 0; i < calls.length; i += 2) {
      const startParts = calls[i]!.split(":");
      const endParts = calls[i + 1]!.split(":");
      expect(startParts[1]).toBe("start");
      expect(endParts[1]).toBe("end");
      expect(startParts[2]).toBe(endParts[2]); // call kind (createSession / runTurn)
      if (startParts[2] === "runTurn") expect(startParts[3]).toBe(endParts[3]); // itemId
    }
  });

  test("session creation failure -> dispatch reports exit 13 (backend-unavailable), never throws", async () => {
    const { backend } = fakeBackend({ sessionShouldFail: true });
    const registry = new BackendRegistry<WorkerBackend>(workersConfig("verifier", "hard", "fake"), [backend]);
    const result = createLiveDispatcher({ registry, role: "verifier", tier: "hard", claimId: "c1", model: "m", sharedContext: "s" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const turn = await result.dispatcher.dispatch("1.1", "content");
    expect(turn.exit).toBe(13);
    expect(turn.raw).toBeUndefined();
  });
});

describe("toDispatchedTurn — WorkerResult -> DispatchedTurn discipline", () => {
  test("nonzero exit passes through untouched, raw undefined (authoritative exit, never parsed)", () => {
    const t = toDispatchedTurn("verifier", { exit: 10, usage: { input: 1, output: 0, cache_read: 0, cache_creation: 0 }, rawText: '{"verdict":"VALID","justification":"x"}' });
    expect(t.exit).toBe(10);
    expect(t.raw).toBeUndefined();
  });
  test("exit 0 with unparseable rawText -> exit 12 (schema-invalid), never a crash", () => {
    const t = toDispatchedTurn("verifier", { exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: "not json" });
    expect(t.exit).toBe(12);
  });
  test("exit 0 with no rawText at all -> exit 12", () => {
    const t = toDispatchedTurn("verifier", { exit: 0, usage: { input: 0, output: 0, cache_read: 0, cache_creation: 0 } });
    expect(t.exit).toBe(12);
  });
  test("exit 0 + valid JSON -> parsed raw, exit 0", () => {
    const t = toDispatchedTurn("verifier", { exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify({ verdict: { outcome: "accept" }, justification: "ok" }) });
    expect(t.exit).toBe(0);
    expect(t.raw).toEqual({ verdict: { outcome: "accept" }, justification: "ok" });
  });
});

describe("liveDispatchVerify / verifierItemFor", () => {
  test("uses the node's childIds as deps and its statement, never inventing either", () => {
    const n = node("1.1", { statement: "P holds", childIds: ["1.1.1", "1.1.2"] });
    const item = verifierItemFor(n, "hard");
    expect(item.deps).toEqual(["1.1.1", "1.1.2"]);
    expect(item.statement).toBe("P holds");
  });
  test("a node with no recorded statement gets an honest placeholder, never a crash", () => {
    const n = node("1.2", { statement: undefined });
    expect(verifierItemFor(n, "hard").statement).toContain("no statement recorded");
  });
});

describe("liveDispatchClassification", () => {
  test("exit 0 -> returns the parsed raw body", async () => {
    const { backend } = fakeBackend({ turnFor: () => ({ exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify({ classification: "genuine-gap", rationale: "weak" }) }) });
    const registry = new BackendRegistry<WorkerBackend>(workersConfig("verifier", "hard", "fake"), [backend]);
    const result = createLiveDispatcher({ registry, role: "verifier", tier: "hard", claimId: "c1", model: "m", sharedContext: "s" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const out = await liveDispatchClassification(result.dispatcher)(["1", "1.1"]);
    expect(out).toEqual({ classification: "genuine-gap", rationale: "weak" });
  });
  test("a failed dispatch -> undefined, never a thrown error (driver-balloon.ts treats undefined as unclassified)", async () => {
    const { backend } = fakeBackend({ turnFor: () => ({ exit: 13, usage: { input: 0, output: 0, cache_read: 0, cache_creation: 0 } }) });
    const registry = new BackendRegistry<WorkerBackend>(workersConfig("verifier", "hard", "fake"), [backend]);
    const result = createLiveDispatcher({ registry, role: "verifier", tier: "hard", claimId: "c1", model: "m", sharedContext: "s" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const out = await liveDispatchClassification(result.dispatcher)(["1"]);
    expect(out).toBeUndefined();
  });
});

describe("END-TO-END: 3 nodes through runVerifyDriver with a live-shaped dispatcher, faked af", () => {
  test("create-session -> 3 turns -> bind -> verdict file -> faked af apply, usage logged for every turn", async () => {
    const { backend, calls } = fakeBackend();
    const registry = new BackendRegistry<WorkerBackend>(workersConfig("verifier", "hard", "fake"), [backend]);
    const result = createLiveDispatcher({ registry, role: "verifier", tier: "hard", claimId: "claim-3", model: "m", sharedContext: "SHARED" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const identity: VerifierIdentity = { modelFamily: "claude", backend: "fake", model: "m", sessionId: "pending" };
    const logs: string[] = [];
    const applied: FilledVerdictFile[] = [];
    const ws: AfWorkspaceView = { workspaceId: "proofs/x", rootStatement: "P", nodeCount: 3, nodes: [node("1.1"), node("1.2"), node("1.3")] };

    const deps: DriverDeps = {
      contractId: "lem-x",
      claimId: "claim-3",
      identity,
      queryWorkspace: () => ({ ok: true, value: ws }),
      dispatchVerify: liveDispatchVerify(result.dispatcher, "hard"),
      dispatchClassification: liveDispatchClassification(result.dispatcher),
      applyVerdicts: (file): ApplyReport => {
        applied.push(file);
        // Simulate af's own state advancing on a real apply -- af's state machine is the truth
        // (driver-plan.ts's own header note), so an applied accept must mark the node validated,
        // or the next round's `queryWorkspace()` would see it "pending" forever.
        for (const item of file.items) {
          const n = ws.nodes.find((x) => x.id === item.node);
          if (n) n.epistemicState = "validated";
        }
        return { exit: 0, batchId: file.batch_id, items: file.items.map((i) => ({ node: i.node, verdict: i.verdict, status: "applied" })), applied: file.items.length, blocked: 0, rejected: 0, aborted: false };
      },
      readShard: () => "---\nid: lem-x\n---\nbody\n",
      writeShard: () => {},
      createBdTask: () => true,
      appendLog: (l) => logs.push(l),
      now: () => "2026-07-19T00:00:00Z",
      priorBalloonCount: 0,
      priorClassifications: [],
      // This test exercises live dispatch + usage logging, not the cross-vendor rule (M3.8). Per
      // the harness convention in driver-run.test.ts, `false` means "not load-bearing," under
      // which decideCrossVendor is always satisfied — cross-vendor has its own dedicated tests.
      isLoadBearing: () => false,
    };

    const r = await runVerifyDriver(deps);
    expect(r.status).toBe("converged");
    expect(r.appliedNodeIds.sort()).toEqual(["1.1", "1.2", "1.3"]);
    expect(applied.length).toBe(1); // all 3 independent+ready nodes composed into one apply file
    expect(applied[0]!.items.length).toBe(3);

    const usageLines = logs.filter((l) => l.includes('"kind":"usage"'));
    expect(usageLines.length).toBe(3);
    for (const l of usageLines) expect(JSON.parse(l).usage).toEqual({ input: 10, output: 5, cache_read: 20, cache_creation: 0 });

    // exactly one createSession call across all 3 nodes' turns (session-per-claim, not per-node).
    expect(calls.filter((c) => c.includes("start:createSession")).length).toBe(1);
    expect(calls.filter((c) => c.includes("start:runTurn")).length).toBe(3);
  });
});
