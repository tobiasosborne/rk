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
  familyForBackend,
  liveDispatchClassification,
  liveDispatchProve,
  liveDispatchVerify,
  proverItemFor,
  resolveModel,
  DEFAULT_MODEL_BY_BACKEND,
  toDispatchedTurn,
  extractSingleJsonObject,
  verifierItemFor,
} from "../../src/drive/driver-live";
import { buildProverTurnPrompt } from "../../src/drive/driver-prompts";
import { runVerifyDriver, type DriverDeps } from "../../src/drive/driver-run";
import type { AfWorkspaceView, ApplyReport, FilledVerdictFile } from "../../src/drive/driver-af";
import type { AfNodeView } from "../../src/drive/driver-plan";
import type { VerifierIdentity } from "../../src/drive/identity";

const HASH = "a".repeat(64);
function node(id: string, o: Partial<AfNodeView> = {}): AfNodeView {
  const base: AfNodeView = { id, epistemicState: "pending", workflowState: "available", crux: false, contentHash: HASH, statement: `statement for ${id}`, childIds: [], ...o };
  // rk-gn4: default af's verifier_ready flag from the axes (pending + not blocked) unless set.
  return { verifierReady: base.epistemicState === "pending" && base.workflowState !== "blocked", ...base };
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

// rk-7hi (M3.5 STOP-2 blocker): resolveModel's three-way precedence -- per-assignment `model` >
// global `--model` > DEFAULT_MODEL_BY_BACKEND. This is the ONLY mechanism that lets prover and
// verifier carry two DIFFERENT explicit models in the SAME run (the TJO worker-model pin).
describe("resolveModel — per-assignment model > global --model > DEFAULT_MODEL_BY_BACKEND", () => {
  test("per-assignment model wins over a global --model flag", () => {
    const registry = new BackendRegistry<WorkerBackend>(
      { assignments: { prover: { hard: { backend: "claude", model: "claude-opus-4-8", fallbacks: [] } } } },
      [],
    );
    expect(resolveModel(registry, "prover", "hard", "claude-sonnet-4-5")).toBe("claude-opus-4-8");
  });

  test("the global --model flag wins over DEFAULT_MODEL_BY_BACKEND when no per-assignment model is set", () => {
    const registry = new BackendRegistry<WorkerBackend>(workersConfig("verifier", "hard", "codex"), [{ name: "codex" } as WorkerBackend]);
    expect(resolveModel(registry, "verifier", "hard", "gpt-5.1-codex-explicit")).toBe("gpt-5.1-codex-explicit");
  });

  test("DEFAULT_MODEL_BY_BACKEND is the last resort: no per-assignment model, no global --model", () => {
    const registry = new BackendRegistry<WorkerBackend>(workersConfig("verifier", "hard", "codex"), [{ name: "codex" } as WorkerBackend]);
    expect(resolveModel(registry, "verifier", "hard", undefined)).toBe(DEFAULT_MODEL_BY_BACKEND.codex);
  });

  test("undefined for both a global model AND an unresolvable backend falls back to the honest 'unknown' sentinel", () => {
    const registry = new BackendRegistry<WorkerBackend>({ assignments: {} }, []);
    expect(resolveModel(registry, "verifier", "hard", undefined)).toBe("unknown");
  });

  // THE two-dispatcher case the M3.5 STOP-2 report named: prover=claude pinned explicitly,
  // verifier=codex left on its own default, in the SAME registry / SAME run.
  test("a cross-vendor run: prover (claude) gets its pinned model, verifier (codex) gets its own default -- independently", () => {
    const registry = new BackendRegistry<WorkerBackend>(
      {
        assignments: {
          prover: { hard: { backend: "claude", model: "claude-opus-4-8", fallbacks: [] } },
          verifier: { hard: { backend: "codex", fallbacks: [] } },
        },
      },
      [{ name: "claude" } as WorkerBackend, { name: "codex" } as WorkerBackend],
    );
    // no --model flag passed at all (undefined) -- the pin lives entirely in config now.
    expect(resolveModel(registry, "prover", "hard", undefined)).toBe("claude-opus-4-8");
    expect(resolveModel(registry, "verifier", "hard", undefined)).toBe(DEFAULT_MODEL_BY_BACKEND.codex);
    expect(resolveModel(registry, "prover", "hard", undefined)).not.toBe(resolveModel(registry, "verifier", "hard", undefined));
  });

  test("an empty global --model string is treated the same as absent (falls through to the next tier)", () => {
    const registry = new BackendRegistry<WorkerBackend>(workersConfig("verifier", "hard", "claude"), [{ name: "claude" } as WorkerBackend]);
    expect(resolveModel(registry, "verifier", "hard", "")).toBe(DEFAULT_MODEL_BY_BACKEND.claude);
  });
});

// rk-7hi: family identity is backend-derived and MUST stay completely independent of whatever
// resolveModel picks -- an arbitrary per-assignment model string can never perturb the cross-vendor
// gate (src/drive/identity.ts, untouched by this WP).
describe("familyForBackend — family identity stays backend-derived, independent of any model string", () => {
  test("the codex backend is always family 'gpt', regardless of its resolved model", () => {
    expect(familyForBackend("codex")).toBe("gpt");
  });
  test("the claude backend is always family 'claude', even carrying an unrelated-looking model id", () => {
    expect(familyForBackend("claude")).toBe("claude");
  });
  test("a claude-backend assignment pinned to an explicit opus model still records family 'claude' -- rk-7hi's core invariant", () => {
    const registry = new BackendRegistry<WorkerBackend>(
      { assignments: { prover: { hard: { backend: "claude", model: "claude-opus-4-8", fallbacks: [] } } } },
      [{ name: "claude" } as WorkerBackend],
    );
    const resolvedModel = resolveModel(registry, "prover", "hard", undefined);
    expect(resolvedModel).toBe("claude-opus-4-8");
    expect(familyForBackend("claude")).toBe("claude"); // NOT derived from resolvedModel at all
  });
});

describe("liveDispatchProve / proverItemFor — the live PROVER dispatch wiring (rk-gn4)", () => {
  test("dispatches a PROVER-role turn whose prompt is the node's decomposition request, and returns the parsed children body", async () => {
    const proverBody = { children: [{ statement: "sub-step", justification: "modus_ponens" }] };
    let sentPrompt = "";
    const { backend } = fakeBackend({ turnFor: (item) => { sentPrompt = item.content; return { exit: 0, usage: { input: 4, output: 2, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify(proverBody) }; } });
    const registry = new BackendRegistry<WorkerBackend>({ assignments: { prover: { hard: { backend: "fake", fallbacks: [] } } } }, [backend]);
    const created = createLiveDispatcher({ registry, role: "prover", tier: "hard", claimId: "claim-p", model: "m", sharedContext: "S" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const n = node("1.1", { statement: "P holds", deps: ["1.1.1"] });
    const turn = await liveDispatchProve(created.dispatcher)(n);
    expect(turn.role).toBe("prover");                       // → driver-prove-node.ts's role guard passes
    expect(turn.exit).toBe(0);
    expect(turn.raw).toEqual(proverBody);                   // the decomposition, NOT a verdict
    // the turn carried the prover decomposition prompt (never a verifier/verdict prompt).
    expect(sentPrompt).toBe(buildProverTurnPrompt({ nodeId: "1.1", statement: "P holds", deps: ["1.1.1"] }));
  });

  test("proverItemFor maps statement + recorded deps (rk B2), with a self-teaching statement fallback", () => {
    expect(proverItemFor(node("1.2", { statement: "S", deps: ["1.2.1", "1.2.2"] }))).toEqual({ nodeId: "1.2", statement: "S", deps: ["1.2.1", "1.2.2"] });
    expect(proverItemFor(node("1.3", { statement: undefined, deps: [] })).statement).toContain("no statement recorded");
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

  // GAP 7(a): a model that ignores the "bare JSON" instruction and wraps its single object in a
  // markdown fence is tolerated at the ENCODING layer — the fence + whitespace are stripped and the
  // lone object is used. This is the one and only tolerance added; nothing else is scanned for.
  test("exit 0 + a single fenced ```json object -> extracted, exit 0", () => {
    const body = { verdict: "VALID", justification: "ok" };
    const t = toDispatchedTurn("verifier", { exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: "```json\n" + JSON.stringify(body) + "\n```" });
    expect(t.exit).toBe(0);
    expect(t.raw).toEqual(body);
  });
  test("exit 0 + a bare ``` fence (no language tag) around one object -> extracted, exit 0", () => {
    const body = { verdict: "VALID", justification: "ok" };
    const t = toDispatchedTurn("verifier", { exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: "```\n" + JSON.stringify(body) + "\n```\n" });
    expect(t.exit).toBe(0);
    expect(t.raw).toEqual(body);
  });

  // GAP 7(a)+(b): AMBIGUOUS output still fails (loudly), and the raw text is CARRIED so the edge can
  // persist it. These are the mis-extraction cases the conservative rule deliberately refuses.
  test("exit 0 + prose wrapped around JSON -> exit 12, raw undefined, rawText carried for evidence", () => {
    const raw = 'Here is my verdict:\n{"verdict":"VALID","justification":"ok"}\nHope that helps!';
    const t = toDispatchedTurn("verifier", { exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: raw });
    expect(t.exit).toBe(12);
    expect(t.raw).toBeUndefined();
    expect(t.rawText).toBe(raw); // persisted, not thrown away
  });
  test("exit 0 + MULTIPLE concatenated objects -> exit 12 (never pick one), rawText carried", () => {
    const raw = '{"verdict":"VALID","justification":"a"}{"verdict":"INVALID","justification":"b"}';
    const t = toDispatchedTurn("verifier", { exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: raw });
    expect(t.exit).toBe(12);
    expect(t.rawText).toBe(raw);
  });
  test("exit 0 + a bare JSON ARRAY (not an object) -> exit 12, rawText carried", () => {
    const raw = '[{"verdict":"VALID"}]';
    const t = toDispatchedTurn("verifier", { exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: raw });
    expect(t.exit).toBe(12);
    expect(t.rawText).toBe(raw);
  });
  test("a successful bare-object parse carries NO rawText (evidence only on failure)", () => {
    const t = toDispatchedTurn("verifier", { exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: '{"verdict":"VALID","justification":"ok"}' });
    expect(t.exit).toBe(0);
    expect(t.rawText).toBeUndefined();
    expect(t.parseError).toBeUndefined(); // rk-d1n: no diagnostics on success
    expect(t.parseClass).toBeUndefined();
  });
  // rk-d1n: an exit-12 parse/extraction failure now ALSO attaches the JSON.parse error message and a
  // diagnostic failure-mode class (DIAGNOSTIC ONLY — the exit is still 12), so the edge's parse-failed
  // record can tell an unterminated verbose `reason` apart from trailing content (the attempt-11 gap).
  test("exit 0 + an UNTERMINATED object (model cut mid-string) -> exit 12, parseClass 'unterminated' + a parseError", () => {
    const raw = '{"verdict":{"outcome":"challenge","target":"1","severity":"major","reason":"long reason that never';
    const t = toDispatchedTurn("verifier", { exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: raw });
    expect(t.exit).toBe(12);
    expect(t.rawText).toBe(raw);
    expect(t.parseClass).toBe("unterminated");
    expect(t.parseError!.length).toBeGreaterThan(0);
  });
  test("exit 0 + trailing prose after a balanced object -> exit 12, parseClass 'trailing-content'", () => {
    const raw = '{"verdict":"VALID","justification":"ok"} Hope that helps!';
    const t = toDispatchedTurn("verifier", { exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: raw });
    expect(t.exit).toBe(12);
    expect(t.parseClass).toBe("trailing-content");
  });
});

describe("extractSingleJsonObject — conservative, single-object-only extraction (GAP 7a)", () => {
  test("a lone object (bare or fenced) is accepted; prose/multiple/array/primitive are refused", () => {
    expect(extractSingleJsonObject('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(extractSingleJsonObject('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
    expect(extractSingleJsonObject('prefix {"a":1}').ok).toBe(false);
    expect(extractSingleJsonObject('{"a":1}{"b":2}').ok).toBe(false);
    expect(extractSingleJsonObject('[{"a":1}]').ok).toBe(false);
    expect(extractSingleJsonObject('42').ok).toBe(false);
    expect(extractSingleJsonObject('"just a string"').ok).toBe(false);
    expect(extractSingleJsonObject('null').ok).toBe(false);
  });
});

describe("liveDispatchVerify / verifierItemFor", () => {
  test("resolves each RECORDED dep (rk B2) to its statement + epistemic state, keeping the node statement (GAP 10)", () => {
    const n = node("1.1", { statement: "P holds", deps: ["1.1.1", "1.1.2"] });
    const all = [n, node("1.1.1", { statement: "lemma A", epistemicState: "validated" }), node("1.1.2", { statement: "lemma B", epistemicState: "pending" })];
    const item = verifierItemFor(n, "hard", all);
    expect(item.deps).toEqual([
      { id: "1.1.1", statement: "lemma A", epistemicState: "validated" },
      { id: "1.1.2", statement: "lemma B", epistemicState: "pending" },
    ]);
    expect(item.statement).toBe("P holds");
  });
  test("a node with no recorded statement gets an honest placeholder, never a crash", () => {
    const n = node("1.2", { statement: undefined });
    expect(verifierItemFor(n, "hard", [n]).statement).toContain("no statement recorded");
  });
  // GAP 10: a declared dependency the export does not carry is a LOUD item-construction failure — a
  // silent omission is exactly the bug this fixes (the verifier judging a step against content it
  // cannot see). This is the perturbation-proof: drop the dependency's node from the export → throw.
  test("a declared dependency missing from the export throws a loud, self-naming error (GAP 10)", () => {
    const n = node("1.7", { statement: "S", deps: ["1.4", "1.5"] });
    const all = [n, node("1.4", { statement: "dep four", epistemicState: "validated" })]; // 1.5 absent
    expect(() => verifierItemFor(n, "hard", all)).toThrow(/declares dependency '1\.5'/);
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
    // rk-jit (STOP-4): these leaves are genuinely PROVEN (each carries a real inference rule), so the
    // new vacuous-accept backstop (isProoflessNode) leaves them for the verifier to accept — the
    // discard fires only on a BARE node (no children, no deps, inference empty/"assumption").
    const ws: AfWorkspaceView = { workspaceId: "proofs/x", rootStatement: "P", nodeCount: 3, nodes: [node("1.1", { inference: "arithmetic" }), node("1.2", { inference: "arithmetic" }), node("1.3", { inference: "arithmetic" })] };

    const deps: DriverDeps = {
      contractId: "lem-x",
      claimId: "claim-3",
      identity,
      queryWorkspace: () => ({ ok: true, value: ws }),
      reReadContentHashes: () => new Map(ws.nodes.map((n) => [n.id, n.contentHash] as const)),
      dispatchVerify: liveDispatchVerify(result.dispatcher, "hard"),
      dispatchProve: () => undefined, // this end-to-end exercises the verify path; no prover-ready nodes
      recordProof: () => ({ ok: true }),
      dispatchClassification: liveDispatchClassification(result.dispatcher),
      applyVerdicts: (file): ApplyReport => {
        applied.push(file);
        // Simulate af's own state advancing on a real apply -- af's state machine is the truth
        // (driver-plan.ts's own header note), so an applied accept must mark the node validated,
        // or the next round's `queryWorkspace()` would see it "pending" forever.
        for (const item of file.items) {
          const n = ws.nodes.find((x) => x.id === item.node);
          // af clears verifier_ready and marks the (challenge-free) node closed on validate — rk B3
          // convergence reads the root's `closed`, so the fake af must advance it too.
          if (n) { n.epistemicState = "validated"; n.verifierReady = false; n.closed = true; }
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
    // M3 blocker 3: pass-1 hard tier is per-node — each ready node is its OWN non-batch apply
    // (empty batch_id), never one shared V2 batch apply that would stamp batch provenance on all 3.
    expect(applied.length).toBe(3);
    expect(applied.every((f) => f.items.length === 1)).toBe(true);
    expect(applied.every((f) => f.batch_id === "")).toBe(true);

    const usageLines = logs.filter((l) => l.includes('"kind":"usage"'));
    expect(usageLines.length).toBe(3);
    for (const l of usageLines) expect(JSON.parse(l).usage).toEqual({ input: 10, output: 5, cache_read: 20, cache_creation: 0 });

    // exactly one createSession call across all 3 nodes' turns (session-per-claim, not per-node).
    expect(calls.filter((c) => c.includes("start:createSession")).length).toBe(1);
    expect(calls.filter((c) => c.includes("start:runTurn")).length).toBe(3);
  });
});

// rk-xxp (GAP 11): THE banked attempt-11 failure and its ONE bounded schema-repair reprompt.
// Evidence: ../rk-m3.5-baseline/_logs/lem-{mass-split,starvation-completion-obstruction}.run-B
// .attempt11.driver-log.jsonl — six `parse-failed` records, every one a semantically complete
// hard-tier challenge with NO top-level `justification` (the model folded its reasoning into
// `verdict.reason`). 96,066 tokens, 0 nodes applied, prover never dispatched.
describe("liveDispatchVerify — ONE bounded schema-repair reprompt (rk-xxp / GAP 11)", () => {
  /** The banked payload, verbatim from the parse-failed record's snippet (its `reason` sentence
   * closed so the fixture is well-formed JSON — the defect under test is the MISSING SIBLING). */
  const BANKED = {
    verdict: {
      outcome: "challenge", target: "1", severity: "critical", category: "missing",
      reason: "No proof or derivation has been recorded for this statement. Node 1 carries the mass-split claim with inference 'assumption', has no sub-steps or children, and cites no dependencies (0 established deps).",
    },
  };
  const CORRECTED = { verdict: BANKED.verdict, justification: "No derivation is recorded for node 1; a prover must produce one first." };

  function dispatcherOver(turnFor: (item: TurnItem) => WorkerResult) {
    const { backend, calls } = fakeBackend({ turnFor });
    const registry = new BackendRegistry<WorkerBackend>(workersConfig("verifier", "hard", "fake"), [backend]);
    const result = createLiveDispatcher({ registry, role: "verifier", tier: "hard", claimId: "c-xxp", model: "m", sharedContext: "SHARED" });
    if (!result.ok) throw new Error(result.reason);
    return { dispatcher: result.dispatcher, calls };
  }

  const n1 = node("1", { statement: "S", deps: [] });

  test("the banked payload gets exactly ONE repair turn and the corrected reply is accepted", async () => {
    const seen: string[] = [];
    const { dispatcher, calls } = dispatcherOver((item) => {
      seen.push(item.content);
      const body = seen.length === 1 ? BANKED : CORRECTED;
      return { exit: 0, usage: { input: 1, output: 10, cache_read: 5, cache_creation: 0 }, rawText: JSON.stringify(body) };
    });
    const turn = await liveDispatchVerify(dispatcher, "hard")(n1, [n1]);
    // Exactly two backend turns: the original and ONE repair. Never three.
    expect(calls.filter((c) => c.includes("start:runTurn")).length).toBe(2);
    // The repair turn echoed the CONCRETE validation issue.
    expect(seen[1]).toContain("$.justification");
    expect(seen[1]).toContain("REJECTED");
    // ...and the corrected body is what flows on, at exit 0, with the repair recorded.
    expect(turn.exit).toBe(0);
    expect(turn.raw).toEqual(CORRECTED);
    expect(turn.repair!.ok).toBe(true);
    expect(turn.repair!.issues.map((i) => i.path)).toContain("$.justification");
  });

  test("a repair turn that ALSO fails is terminal: no second repair, original failure preserved", async () => {
    const { dispatcher, calls } = dispatcherOver(() => ({ exit: 0, usage: { input: 1, output: 10, cache_read: 5, cache_creation: 0 }, rawText: JSON.stringify(BANKED) }));
    const turn = await liveDispatchVerify(dispatcher, "hard")(n1, [n1]);
    expect(calls.filter((c) => c.includes("start:runTurn")).length).toBe(2); // NOT 3+
    expect(turn.raw).toEqual(BANKED);
    expect(turn.repair!.ok).toBe(false);
    expect(turn.repair!.repairIssues!.map((i) => i.path)).toContain("$.justification");
  });

  test("an exit-12 parse failure is repaired too, and a corrected reply clears the failure fields", async () => {
    let n = 0;
    const { dispatcher } = dispatcherOver(() => {
      n++;
      return n === 1
        ? { exit: 0, usage: { input: 1, output: 10, cache_read: 0, cache_creation: 0 }, rawText: '{"verdict":{"outcome":"accept"}, "justification":"ok"} Hope that helps!' }
        : { exit: 0, usage: { input: 1, output: 4, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify({ verdict: { outcome: "accept" }, justification: "ok" }) };
    });
    const turn = await liveDispatchVerify(dispatcher, "hard")(n1, [n1]);
    expect(turn.exit).toBe(0);
    expect(turn.rawText).toBeUndefined();
    expect(turn.parseClass).toBeUndefined();
    expect(turn.repair!.ok).toBe(true);
  });

  test("a valid first reply is never repaired (no wasted turn)", async () => {
    const { dispatcher, calls } = dispatcherOver(() => ({ exit: 0, usage: { input: 1, output: 4, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify({ verdict: { outcome: "accept" }, justification: "ok" }) }));
    const turn = await liveDispatchVerify(dispatcher, "hard")(n1, [n1]);
    expect(calls.filter((c) => c.includes("start:runTurn")).length).toBe(1);
    expect(turn.repair).toBeUndefined();
  });

  test("a backend-level failure (exit 13) is never repaired — a repair turn cannot fix an unavailable backend", async () => {
    const { dispatcher, calls } = dispatcherOver(() => ({ exit: 13, usage: { input: 0, output: 0, cache_read: 0, cache_creation: 0 } }));
    const turn = await liveDispatchVerify(dispatcher, "hard")(n1, [n1]);
    expect(calls.filter((c) => c.includes("start:runTurn")).length).toBe(1);
    expect(turn.repair).toBeUndefined();
    expect(turn.exit).toBe(13);
  });
});

// rk-xxp (GAP 11): the repair turn spends REAL tokens, so it must be visible to the campaign budget
// and to `rk verify`'s report — and it must be countable as a distinct event, not hidden inside the
// first turn's accounting. End-to-end through the REAL runVerifyDriver loop.
describe("END-TO-END: a schema-repaired verdict is applied, logged, and fully accounted (rk-xxp)", () => {
  test("banked-shape first reply -> one repair -> af apply; TWO usage records + one verdict-repair record", async () => {
    const BANKED = { verdict: { outcome: "challenge", target: "1.1", severity: "critical", category: "missing", reason: "no derivation recorded" } };
    const FIRST_USAGE = { input: 2, output: 630, cache_read: 28187, cache_creation: 1813 };
    const REPAIR_USAGE = { input: 1, output: 40, cache_read: 30000, cache_creation: 0 };
    let turnNo = 0;
    const { backend, calls } = fakeBackend({
      turnFor: () => {
        turnNo++;
        return turnNo === 1
          ? { exit: 0, usage: FIRST_USAGE, rawText: JSON.stringify(BANKED) }
          : { exit: 0, usage: REPAIR_USAGE, rawText: JSON.stringify({ verdict: { outcome: "accept" }, justification: "step follows from 1.1.1" }) };
      },
    });
    const registry = new BackendRegistry<WorkerBackend>(workersConfig("verifier", "hard", "fake"), [backend]);
    const created = createLiveDispatcher({ registry, role: "verifier", tier: "hard", claimId: "claim-xxp", model: "m", sharedContext: "SHARED" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const logs: string[] = [];
    const applied: FilledVerdictFile[] = [];
    const ws: AfWorkspaceView = { workspaceId: "proofs/x", rootStatement: "P", nodeCount: 1, nodes: [node("1.1", { inference: "arithmetic" })] };
    const deps: DriverDeps = {
      contractId: "lem-xxp",
      claimId: "claim-xxp",
      identity: { modelFamily: "claude", backend: "fake", model: "m", sessionId: "pending" } as VerifierIdentity,
      queryWorkspace: () => ({ ok: true, value: ws }),
      reReadContentHashes: () => new Map(ws.nodes.map((n) => [n.id, n.contentHash] as const)),
      dispatchVerify: liveDispatchVerify(created.dispatcher, "hard"),
      dispatchProve: () => undefined,
      recordProof: () => ({ ok: true }),
      dispatchClassification: liveDispatchClassification(created.dispatcher),
      applyVerdicts: (file): ApplyReport => {
        applied.push(file);
        for (const item of file.items) {
          const n = ws.nodes.find((x) => x.id === item.node);
          if (n) { n.epistemicState = "validated"; n.verifierReady = false; n.closed = true; }
        }
        return { exit: 0, batchId: file.batch_id, items: file.items.map((i) => ({ node: i.node, verdict: i.verdict, status: "applied" })), applied: file.items.length, blocked: 0, rejected: 0, aborted: false };
      },
      readShard: () => "---\nid: lem-xxp\n---\nbody\n",
      writeShard: () => {},
      createBdTask: () => true,
      appendLog: (l) => logs.push(l),
      now: () => "2026-07-25T00:00:00Z",
      priorBalloonCount: 0,
      priorClassifications: [],
      isLoadBearing: () => false,
    };

    const r = await runVerifyDriver(deps);
    // The repaired verdict went through the NORMAL pipeline and was applied — no bypass anywhere.
    expect(r.status).toBe("converged");
    expect(r.appliedNodeIds).toEqual(["1.1"]);
    expect(applied.length).toBe(1);
    // Two REAL backend turns happened, so two honest `usage` records exist — the repair's cost is
    // never folded into the first turn's, and never lost.
    const usageRecs = logs.filter((l) => l.includes('"kind":"usage"')).map((l) => JSON.parse(l));
    expect(usageRecs.length).toBe(2);
    expect(usageRecs[0].usage).toEqual(FIRST_USAGE);
    expect(usageRecs[1].usage).toEqual(REPAIR_USAGE);
    expect(usageRecs[1].repair).toBe(true);
    // ...and the repair is countable as its own driver-log kind.
    const repairRecs = logs.filter((l) => l.includes('"kind":"verdict-repair"')).map((l) => JSON.parse(l));
    expect(repairRecs.length).toBe(1);
    expect(repairRecs[0].node).toBe("1.1");
    expect(repairRecs[0].role).toBe("verifier");
    expect(repairRecs[0].outcome).toBe("repaired");
    expect(JSON.stringify(repairRecs[0].issues)).toContain("$.justification");
    expect(calls.filter((c) => c.includes("start:runTurn")).length).toBe(2);
  });

  test("the repair turn's tokens are charged to the campaign budget (both turns counted)", async () => {
    const BANKED = { verdict: { outcome: "challenge", target: "1.1", severity: "critical", category: "missing", reason: "no derivation recorded" } };
    // DISCRIMINATING by construction: the first turn costs 10 and the repair costs 90, against a cap
    // of 95. If (and only if) the repair's 90 is accrued, round 0 ends at 100 spent and the run aborts
    // "budget-exhausted". If the repair were free, spend would creep 10 per round and the STUCK guard
    // would abort first with a different stopReason — so this test cannot pass by accident.
    const { backend } = fakeBackend({
      turnFor: (item) => (item.itemId.endsWith("#repair")
        ? { exit: 0, usage: { input: 90, output: 0, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify(BANKED) }
        : { exit: 0, usage: { input: 10, output: 0, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify(BANKED) }),
    });
    const registry = new BackendRegistry<WorkerBackend>(workersConfig("verifier", "hard", "fake"), [backend]);
    const created = createLiveDispatcher({ registry, role: "verifier", tier: "hard", claimId: "claim-b", model: "m", sharedContext: "S" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const ws: AfWorkspaceView = { workspaceId: "proofs/x", rootStatement: "P", nodeCount: 1, nodes: [node("1.1", { inference: "arithmetic" })] };
    const deps: DriverDeps = {
      contractId: "lem-b", claimId: "claim-b",
      identity: { modelFamily: "claude", backend: "fake", model: "m", sessionId: "pending" } as VerifierIdentity,
      queryWorkspace: () => ({ ok: true, value: ws }),
      reReadContentHashes: () => new Map(ws.nodes.map((n) => [n.id, n.contentHash] as const)),
      dispatchVerify: liveDispatchVerify(created.dispatcher, "hard"),
      dispatchProve: () => undefined,
      recordProof: () => ({ ok: true }),
      dispatchClassification: liveDispatchClassification(created.dispatcher),
      applyVerdicts: (file): ApplyReport => ({ exit: 0, batchId: file.batch_id, items: [], applied: 0, blocked: 0, rejected: 0, aborted: false }),
      readShard: () => undefined, writeShard: () => {}, createBdTask: () => true,
      appendLog: () => {}, now: () => "2026-07-25T00:00:00Z",
      priorBalloonCount: 0, priorClassifications: [], isLoadBearing: () => false,
      budget: { maxCampaignTokens: 95, perCallReserve: 1 },
    };
    const r = await runVerifyDriver(deps);
    expect(r.stopReason).toBe("budget-exhausted");
    // 100 spent (10 + the repair's 90), not 10 — the repair turn is charged, not free.
    expect(r.message).toContain("100 spent");
    // Aborted at the SECOND round's pre-dispatch check: one dispatch (turn + repair) blew the cap.
    expect(r.rounds).toBe(2);
  });
});
