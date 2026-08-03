// 1:1 test for src/drive/driver-live.ts (M3.5-prep). Full injected end-to-end: a FAKE
// `WorkerBackend` (never a real subprocess/LLM call) drives 3 hard-tier nodes through
// create-session -> turns -> bind -> verdict file -> a faked `af apply`, via the REAL
// `runVerifyDriver` (src/drive/driver-run.ts) loop -- the same loop `rk verify --af` (live) drives.
//
// rk-tbg (shard-cap split): the direct-coverage describe blocks for `liveDispatchProve`/
// `proverItemFor`, `liveDispatchVerify`/`verifierItemFor`, `liveDispatchClassification`, and the two
// schema-repair-reprompt suites moved byte-for-byte to test/drive/driver-live-dispatch.test.ts,
// following src/drive/driver-live.ts's own split into dispatcher CONSTRUCTION (kept here) and
// TURN-ASSEMBLY/DISPATCH-WIRING (driver-live-dispatch.ts). The three END-TO-END blocks below stay
// here unmodified: they exercise both halves together through the real `runVerifyDriver` loop, so
// they are not a 1:1 test of either shard alone.

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
  resolveModel,
  DEFAULT_MODEL_BY_BACKEND,
  DEFAULT_SESSION_TIMEOUT_MS,
  DEFAULT_TURN_TIMEOUT_MS,
  toDispatchedTurn,
  extractSingleJsonObject,
} from "../../src/drive/driver-live";
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

// rk-k0m1 (P2, RUN-REPORT-12): the turn/session timeout ceilings a live turn actually runs under.
// The DEFAULT_* constants stay the LAST fallback; a configured value must reach the backend call
// itself (spec.timeoutMs / item.timeoutMs), not merely a log line.
describe("createLiveDispatcher — turn/session timeouts reach the backend call", () => {
  /** Records the timeoutMs each backend call was handed. */
  function timeoutRecordingBackend() {
    const seen: { session?: number; turns: number[] } = { turns: [] };
    const backend: WorkerBackend = {
      name: "fake",
      modelFamily: "claude",
      capabilities: { sessionResume: true },
      async createSession(spec: SessionSpec) {
        seen.session = spec.timeoutMs;
        return { sessionId: "session-1" };
      },
      async runTurn(_sessionId: string, item: TurnItem) {
        seen.turns.push(item.timeoutMs);
        return { exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify({ verdict: { outcome: "accept" }, justification: "ok" }) };
      },
    };
    return { backend, seen };
  }

  test("nothing configured: the DEFAULT_* constants are what the backend sees (behavior unchanged by this bead)", async () => {
    const { backend, seen } = timeoutRecordingBackend();
    const registry = new BackendRegistry<WorkerBackend>(workersConfig("verifier", "hard", "fake"), [backend]);
    const created = createLiveDispatcher({ registry, role: "verifier", tier: "hard", claimId: "c1", model: "m", sharedContext: "s", ...registry.timeoutsFor("verifier", "hard") });
    if (!created.ok) throw new Error("expected ok");
    await created.dispatcher.dispatch("n1", "prompt");
    expect(seen.session).toBe(DEFAULT_SESSION_TIMEOUT_MS);
    expect(seen.turns).toEqual([DEFAULT_TURN_TIMEOUT_MS]);
  });

  test("a per-assignment turnTimeoutMs/sessionTimeoutMs reaches createSession and every runTurn", async () => {
    const { backend, seen } = timeoutRecordingBackend();
    const registry = new BackendRegistry<WorkerBackend>(
      { assignments: { verifier: { hard: { backend: "fake", fallbacks: [], turnTimeoutMs: 600_000, sessionTimeoutMs: 300_000 } } } },
      [backend],
    );
    const created = createLiveDispatcher({ registry, role: "verifier", tier: "hard", claimId: "c1", model: "m", sharedContext: "s", ...registry.timeoutsFor("verifier", "hard") });
    if (!created.ok) throw new Error("expected ok");
    await created.dispatcher.dispatch("n1", "prompt");
    await created.dispatcher.dispatch("n2", "prompt");
    expect(seen.session).toBe(300_000);
    expect(seen.turns).toEqual([600_000, 600_000]);
  });

  test("a workers-LEVEL default applies when the assignment names none", async () => {
    const { backend, seen } = timeoutRecordingBackend();
    const registry = new BackendRegistry<WorkerBackend>(
      { turnTimeoutMs: 240_000, assignments: { verifier: { hard: { backend: "fake", fallbacks: [] } } } },
      [backend],
    );
    const created = createLiveDispatcher({ registry, role: "verifier", tier: "hard", claimId: "c1", model: "m", sharedContext: "s", ...registry.timeoutsFor("verifier", "hard") });
    if (!created.ok) throw new Error("expected ok");
    await created.dispatcher.dispatch("n1", "prompt");
    expect(seen.turns).toEqual([240_000]);
    // sessionTimeoutMs was configured at NEITHER level -- still the default, per field.
    expect(seen.session).toBe(DEFAULT_SESSION_TIMEOUT_MS);
  });

  test("one ROLE's override never leaks into another role's dispatcher built from the same registry", async () => {
    const prover = timeoutRecordingBackend();
    const verifier = timeoutRecordingBackend();
    const proverBackend = { ...prover.backend, name: "p" };
    const verifierBackend = { ...verifier.backend, name: "v" };
    const registry = new BackendRegistry<WorkerBackend>(
      {
        assignments: {
          prover: { hard: { backend: "p", fallbacks: [], turnTimeoutMs: 900_000 } },
          verifier: { hard: { backend: "v", fallbacks: [] } },
        },
      },
      [proverBackend, verifierBackend],
    );
    const p = createLiveDispatcher({ registry, role: "prover", tier: "hard", claimId: "c1", model: "m", sharedContext: "s", ...registry.timeoutsFor("prover", "hard") });
    const v = createLiveDispatcher({ registry, role: "verifier", tier: "hard", claimId: "c1", model: "m", sharedContext: "s", ...registry.timeoutsFor("verifier", "hard") });
    if (!p.ok || !v.ok) throw new Error("expected ok");
    await p.dispatcher.dispatch("n1", "prompt");
    await v.dispatcher.dispatch("n1", "prompt");
    expect(prover.seen.turns).toEqual([900_000]);
    expect(verifier.seen.turns).toEqual([DEFAULT_TURN_TIMEOUT_MS]);
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
// rk-9zd: the family is now read off the backend's OWN registry-declared `modelFamily` and returned
// as a RESOLUTION (fail closed on an undeclared/out-of-vocabulary family) rather than re-derived
// from the backend NAME, which mapped every unrecognized name to "claude" (fail OPEN). The
// model-independence invariant these tests lock in is unchanged -- and now structural, since no
// model string is a parameter of `familyForBackend` at all.
describe("familyForBackend — family identity stays backend-derived, independent of any model string", () => {
  test("a codex-fronted backend declaring 'gpt' is family 'gpt', regardless of its resolved model", () => {
    expect(familyForBackend("codex", "gpt")).toEqual({ ok: true, family: "gpt" });
  });
  test("a claude backend declaring 'claude' is family 'claude', even carrying an unrelated-looking model id", () => {
    expect(familyForBackend("claude", "claude")).toEqual({ ok: true, family: "claude" });
  });
  test("a claude-backend assignment pinned to an explicit opus model still records family 'claude' -- rk-7hi's core invariant", () => {
    const registry = new BackendRegistry<WorkerBackend>(
      { assignments: { prover: { hard: { backend: "claude", model: "claude-opus-4-8", fallbacks: [] } } } },
      [{ name: "claude", modelFamily: "claude" } as WorkerBackend],
    );
    const resolvedModel = resolveModel(registry, "prover", "hard", undefined);
    expect(resolvedModel).toBe("claude-opus-4-8");
    const backend = registry.resolve("prover", "hard")!;
    // NOT derived from resolvedModel at all -- and not from the backend's NAME either (rk-9zd).
    expect(familyForBackend(backend.name, backend.modelFamily)).toEqual({ ok: true, family: "claude" });
  });
  test("rk-9zd: a backend with no declared family is REFUSED, never silently filed as 'claude'", () => {
    const registry = new BackendRegistry<WorkerBackend>(
      { assignments: { prover: { hard: { backend: "third-party-cli", fallbacks: [] } } } },
      [{ name: "third-party-cli" } as WorkerBackend],
    );
    const backend = registry.resolve("prover", "hard")!;
    const r = familyForBackend(backend.name, backend.modelFamily);
    expect(r.ok).toBe(false);
    expect(r).not.toEqual({ ok: true, family: "claude" });
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

// rk-i19: END-TO-END through the REAL runVerifyDriver loop. A prover repair turn spends REAL tokens,
// so it must reach the campaign budget and `rk verify`'s report — and the REPAIRED decomposition must
// reach af through the NORMAL `recordProof` seam (hash/role CAS included), with no bypass.
describe("END-TO-END: a schema-repaired PROVER decomposition is recorded, logged, and accounted (rk-i19)", () => {
  const MALFORMED = { children: [{ statement: "Step A" }, { justification: "modus_ponens" }] };
  const CORRECTED = { children: [{ statement: "Step A" }, { statement: "Step B", justification: "modus_ponens" }] };

  function proverWorkspace() {
    return { workspaceId: "proofs/x", rootStatement: "P", nodeCount: 1, nodes: [node("1", { statement: "P", proverReady: true, verifierReady: false })] } as AfWorkspaceView;
  }

  function proverDeps(ws: AfWorkspaceView, dispatcher: ReturnType<typeof createLiveDispatcher> extends { ok: true; dispatcher: infer D } ? D : never, over: Partial<DriverDeps>): { deps: DriverDeps; logs: string[] } {
    const logs: string[] = [];
    const deps: DriverDeps = {
      contractId: "lem-i19", claimId: "claim-i19",
      identity: { modelFamily: "claude", backend: "fake", model: "m", sessionId: "s-i19" } as VerifierIdentity,
      queryWorkspace: () => ({ ok: true, value: ws }),
      reReadContentHashes: () => new Map(ws.nodes.map((n) => [n.id, n.contentHash] as const)),
      dispatchVerify: () => undefined,
      dispatchProve: liveDispatchProve(dispatcher),
      recordProof: () => ({ ok: true }),
      dispatchClassification: () => undefined,
      applyVerdicts: (file): ApplyReport => ({ exit: 0, batchId: file.batch_id, items: [], applied: 0, blocked: 0, rejected: 0, aborted: false }),
      readShard: () => undefined, writeShard: () => {}, createBdTask: () => true,
      appendLog: (l) => logs.push(l), now: () => "2026-07-25T00:00:00Z",
      priorBalloonCount: 0, priorClassifications: [], isLoadBearing: () => false,
      ...over,
    };
    return { deps, logs };
  }

  function proverDispatcher(turnFor: (item: TurnItem) => WorkerResult, claimId: string) {
    const { backend, calls } = fakeBackend({ turnFor });
    const registry = new BackendRegistry<WorkerBackend>({ assignments: { prover: { hard: { backend: "fake", fallbacks: [] } } } }, [backend]);
    const created = createLiveDispatcher({ registry, role: "prover", tier: "hard", claimId, model: "m", sharedContext: "SHARED" });
    if (!created.ok) throw new Error(created.reason);
    return { dispatcher: created.dispatcher, calls };
  }

  test("malformed first reply -> one repair -> af recordProof receives the CORRECTED children; two usage records + one verdict-repair record", async () => {
    const FIRST_USAGE = { input: 2, output: 600, cache_read: 20000, cache_creation: 1000 };
    const REPAIR_USAGE = { input: 1, output: 60, cache_read: 21000, cache_creation: 0 };
    let turnNo = 0;
    const { dispatcher, calls } = proverDispatcher(() => {
      turnNo++;
      return turnNo === 1
        ? { exit: 0, usage: FIRST_USAGE, rawText: JSON.stringify(MALFORMED) }
        : { exit: 0, usage: REPAIR_USAGE, rawText: JSON.stringify(CORRECTED) };
    }, "claim-i19");
    const ws = proverWorkspace();
    const recordedChildren: unknown[] = [];
    const { deps, logs } = proverDeps(ws, dispatcher, {
      recordProof: (n, proof) => {
        recordedChildren.push(proof.children);
        for (const x of ws.nodes) if (x.id === n.id) x.proverReady = false; // af re-classifies; loop ends
        return { ok: true };
      },
    });

    await runVerifyDriver(deps);
    // exactly two backend turns: the original and ONE repair
    expect(calls.filter((c) => c.includes("start:runTurn")).length).toBe(2);
    // the REPAIRED decomposition is what af was handed — through the normal seam, nothing bypassed
    expect(recordedChildren).toEqual([[{ statement: "Step A" }, { statement: "Step B", justification: "modus_ponens" }]]);
    const usageRecs = logs.filter((l) => l.includes('"kind":"usage"')).map((l) => JSON.parse(l));
    expect(usageRecs.length).toBe(2);
    expect(usageRecs[0].usage).toEqual(FIRST_USAGE);
    expect(usageRecs[1].usage).toEqual(REPAIR_USAGE);
    expect(usageRecs[1].repair).toBe(true);
    expect(usageRecs[1].role).toBe("prover");
    const repairRecs = logs.filter((l) => l.includes('"kind":"verdict-repair"')).map((l) => JSON.parse(l));
    expect(repairRecs.length).toBe(1);
    expect(repairRecs[0].role).toBe("prover");
    expect(repairRecs[0].outcome).toBe("repaired");
    expect(JSON.stringify(repairRecs[0].issues)).toContain("$.children[1].statement");
  });

  test("the prover repair turn's tokens are charged to the campaign budget (both turns counted)", async () => {
    // DISCRIMINATING by construction: first turn 10 tokens, repair 90, cap 95. Only if the repair's
    // 90 accrues does round 0 end at 100 and round 1 abort "budget-exhausted"; if the repair were
    // free, spend would creep 10 per round and a different guard would stop the run instead.
    const { dispatcher } = proverDispatcher((item) => (item.itemId.endsWith("#repair")
      ? { exit: 0, usage: { input: 90, output: 0, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify(MALFORMED) }
      : { exit: 0, usage: { input: 10, output: 0, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify(MALFORMED) }), "claim-i19b");
    const ws = proverWorkspace();
    const { deps } = proverDeps(ws, dispatcher, { budget: { maxCampaignTokens: 95, perCallReserve: 1 } });
    const r = await runVerifyDriver(deps);
    expect(r.stopReason).toBe("budget-exhausted");
    expect(r.message).toContain("100 spent");
    expect(r.rounds).toBe(2);
  });
});
