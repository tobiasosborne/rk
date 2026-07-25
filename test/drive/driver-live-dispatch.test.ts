// 1:1 test for src/drive/driver-live-dispatch.ts (rk-tbg shard-cap split of driver-live.ts, 386 ->
// two files). These describe blocks moved byte-for-byte out of test/drive/driver-live.test.ts (same
// assertions, only the import path and physical location changed, plus the small local-helper
// duplication (fakeBackend/node/workersConfig) every split test file in this repo carries) --
// following src/drive/driver-live.ts's own split into driver-live.ts (dispatcher CONSTRUCTION, whose
// tests stay in driver-live.test.ts unmodified, including its three END-TO-END blocks that exercise
// both halves together through the real runVerifyDriver loop) and driver-live-dispatch.ts (the
// TURN-ASSEMBLY / DISPATCH-WIRING half moved here).

import { describe, expect, test } from "bun:test";
import { BackendRegistry, type WorkersConfig } from "../../src/drive/backend-registry";
import type { SessionSpec, TurnItem, WorkerBackend } from "../../src/drive/backend-types";
import type { WorkerResult } from "../../src/drive/worker-result";
import { createLiveDispatcher } from "../../src/drive/driver-live";
import {
  liveDispatchClassification,
  liveDispatchProve,
  liveDispatchVerify,
  proverItemFor,
  REPAIR_MAX_OUTPUT_TOKENS,
  verifierItemFor,
} from "../../src/drive/driver-live-dispatch";
import { buildProverTurnPrompt } from "../../src/drive/driver-prompts";
import type { AfNodeView } from "../../src/drive/driver-plan";

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

// rk-i19: the PROVER's bounded schema-repair reprompt. `liveDispatchProve` had the identical exit-12
// death mode GAP 11 fixed for the verifier — one malformed prover reply burned a full context-heavy
// turn and stalled the claim with no correction attempt at all. Same rules verbatim: at most ONE
// repair ever (structurally), no extra trust, usage accounted, original failure preserved.
describe("liveDispatchProve — ONE bounded schema-repair reprompt (rk-i19)", () => {
  const MALFORMED = { children: [{ statement: "Step A" }, { justification: "modus_ponens" }] }; // child 1 has no statement
  const CORRECTED = { children: [{ statement: "Step A" }, { statement: "Step B", justification: "modus_ponens" }] };

  function proverDispatcherOver(turnFor: (item: TurnItem) => WorkerResult) {
    const { backend, calls } = fakeBackend({ turnFor });
    const registry = new BackendRegistry<WorkerBackend>({ assignments: { prover: { hard: { backend: "fake", fallbacks: [] } } } }, [backend]);
    const result = createLiveDispatcher({ registry, role: "prover", tier: "hard", claimId: "c-i19", model: "m", sharedContext: "SHARED" });
    if (!result.ok) throw new Error(result.reason);
    return { dispatcher: result.dispatcher, calls };
  }

  const n1 = node("1.1", { statement: "P holds", deps: [] });

  test("a malformed decomposition gets exactly ONE repair turn and the corrected reply is what flows on", async () => {
    const seen: string[] = [];
    const { dispatcher, calls } = proverDispatcherOver((item) => {
      seen.push(item.content);
      return { exit: 0, usage: { input: 1, output: 10, cache_read: 5, cache_creation: 0 }, rawText: JSON.stringify(seen.length === 1 ? MALFORMED : CORRECTED) };
    });
    const turn = await liveDispatchProve(dispatcher)(n1);
    expect(calls.filter((c) => c.includes("start:runTurn")).length).toBe(2); // never three
    // the repair turn echoed the CONCRETE indexed issue, and asked only for a shape fix
    expect(seen[1]).toContain("$.children[1].statement");
    expect(seen[1]).toContain("REJECTED");
    expect(turn.exit).toBe(0);
    expect(turn.role).toBe("prover");
    expect(turn.raw).toEqual(CORRECTED);
    expect(turn.repair!.ok).toBe(true);
  });

  test("a repair turn that ALSO fails is terminal: no second repair, original body preserved", async () => {
    const { dispatcher, calls } = proverDispatcherOver(() => ({ exit: 0, usage: { input: 1, output: 10, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify(MALFORMED) }));
    const turn = await liveDispatchProve(dispatcher)(n1);
    expect(calls.filter((c) => c.includes("start:runTurn")).length).toBe(2);
    expect(turn.raw).toEqual(MALFORMED);
    expect(turn.repair!.ok).toBe(false);
    expect(turn.repair!.repairIssues!.map((i) => i.path)).toContain("$.children[1].statement");
  });

  test("an exit-12 parse failure is repaired too, and a corrected reply clears the failure fields", async () => {
    let n = 0;
    const { dispatcher } = proverDispatcherOver(() => {
      n++;
      return n === 1
        ? { exit: 0, usage: { input: 1, output: 10, cache_read: 0, cache_creation: 0 }, rawText: `${JSON.stringify(CORRECTED)} Hope that helps!` }
        : { exit: 0, usage: { input: 1, output: 4, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify(CORRECTED) };
    });
    const turn = await liveDispatchProve(dispatcher)(n1);
    expect(turn.exit).toBe(0);
    expect(turn.raw).toEqual(CORRECTED);
    expect(turn.rawText).toBeUndefined();
    expect(turn.parseClass).toBeUndefined();
    expect(turn.repair!.ok).toBe(true);
  });

  test("a valid first decomposition is never repaired (no wasted turn)", async () => {
    const { dispatcher, calls } = proverDispatcherOver(() => ({ exit: 0, usage: { input: 1, output: 4, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify(CORRECTED) }));
    const turn = await liveDispatchProve(dispatcher)(n1);
    expect(calls.filter((c) => c.includes("start:runTurn")).length).toBe(1);
    expect(turn.repair).toBeUndefined();
  });

  test("a backend-level failure (exit 13) is never repaired — 10/11/13 are never repaired", async () => {
    for (const exit of [10, 11, 13]) {
      const { dispatcher, calls } = proverDispatcherOver(() => ({ exit, usage: { input: 0, output: 0, cache_read: 0, cache_creation: 0 } }));
      const turn = await liveDispatchProve(dispatcher)(n1);
      expect(calls.filter((c) => c.includes("start:runTurn")).length).toBe(1);
      expect(turn.repair).toBeUndefined();
      expect(turn.exit).toBe(exit);
    }
  });

  // The no-laundering rule at the dispatch edge: an overreaching prover body must reach
  // driver-prove-node.ts's `detectProverOverreach` discard UNTOUCHED, never be quietly reshaped.
  test("an OVERREACHING prover body is never repaired — it stays exactly what the overreach guard will discard", async () => {
    const OVERREACH = { verdict: { outcome: "accept" }, children: [{ statement: "A" }] };
    const { dispatcher, calls } = proverDispatcherOver(() => ({ exit: 0, usage: { input: 1, output: 4, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify(OVERREACH) }));
    const turn = await liveDispatchProve(dispatcher)(n1);
    expect(calls.filter((c) => c.includes("start:runTurn")).length).toBe(1);
    expect(turn.repair).toBeUndefined();
    expect(turn.raw).toEqual(OVERREACH);
  });

  // The verifier's repair re-emits ONE small verdict object, so it is capped tight
  // (REPAIR_MAX_OUTPUT_TOKENS = 1500). A prover repair re-emits the WHOLE decomposition; that cap
  // would truncate it mid-object and guarantee the second failure the repair exists to avoid.
  test("the prover repair turn is NOT capped at the verifier's tight repair budget", async () => {
    const budgets: (number | undefined)[] = [];
    const { dispatcher } = proverDispatcherOver((item) => {
      budgets.push(item.maxOutputTokens);
      return { exit: 0, usage: { input: 1, output: 4, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify(budgets.length === 1 ? MALFORMED : CORRECTED) };
    });
    await liveDispatchProve(dispatcher)(n1);
    expect(budgets.length).toBe(2);
    expect(budgets[1]).not.toBe(REPAIR_MAX_OUTPUT_TOKENS);
    // it gets the same room the first prover turn had — a repair must be able to restate the proof
    expect(budgets[1]).toBe(budgets[0]);
  });
});
