// 1:1 test file for src/drive/worker-result.ts — M3.1 repair wave landing-blocker 7: "the response
// envelope and partial-delivery contract are inconsistent." `resolveTurn` is the buffered
// apply-or-discard pipeline the review asked for: process exit code (authoritative) → JSON parse
// → bindVerdicts (raw-shape validation + document construction + validation). Every stage's
// failure mode gets its own red test; the success path is asserted once completely.

import { describe, expect, test } from "bun:test";
import { resolveTurn, type WorkerResult } from "../../src/drive/worker-result";
import type { DispatchState } from "../../src/drive/bind-verdicts";

function usage(): WorkerResult["usage"] {
  return { input: 100, output: 20, cache_read: 90, cache_creation: 0 };
}

function dispatch(): DispatchState {
  return {
    itemId: "lem-1",
    contentHash: "a".repeat(64),
    tier: "l5",
    claimId: "claim-1",
    verifier: { modelFamily: "claude", backend: "claude", model: "claude-sonnet-5", sessionId: "sess-1" },
  };
}

describe("resolveTurn — success path", () => {
  test("exit 0 + valid JSON + valid raw output applies and returns the constructed document", () => {
    const raw = { verdict: "VALID", justification: "Checked against def-halo." };
    const result: WorkerResult = { exit: 0, usage: usage(), rawText: JSON.stringify(raw) };
    const outcome = resolveTurn(dispatch(), result);
    expect(outcome.status).toBe("applied");
    if (outcome.status !== "applied") throw new Error("expected applied");
    expect(outcome.document.verdicts[0]!.itemId).toBe("lem-1");
    expect(outcome.usage).toEqual(usage());
  });
});

describe("resolveTurn — rejection classes, every stage discards entirely", () => {
  test("nonzero exit is rejected at the processExit stage EVEN IF rawText looks like a valid verdict", () => {
    const raw = { verdict: "VALID", justification: "Looks fine but the process still crashed." };
    const result: WorkerResult = { exit: 1, usage: usage(), rawText: JSON.stringify(raw) };
    const outcome = resolveTurn(dispatch(), result);
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("expected rejected");
    expect(outcome.stage).toBe("processExit");
  });

  test("exit 0 with no rawText at all is rejected at the parse stage (never treated as empty success)", () => {
    const result: WorkerResult = { exit: 0, usage: usage() };
    const outcome = resolveTurn(dispatch(), result);
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("expected rejected");
    expect(outcome.stage).toBe("parse");
  });

  test("exit 0 with unparseable JSON is rejected at the parse stage", () => {
    const result: WorkerResult = { exit: 0, usage: usage(), rawText: "{not json" };
    const outcome = resolveTurn(dispatch(), result);
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("expected rejected");
    expect(outcome.stage).toBe("parse");
  });

  test("exit 0 with well-formed JSON that fails raw-shape validation is rejected at the binding stage", () => {
    const result: WorkerResult = { exit: 0, usage: usage(), rawText: JSON.stringify({ verdict: "NOT-A-REAL-VERDICT", justification: "j" }) };
    const outcome = resolveTurn(dispatch(), result);
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("expected rejected");
    expect(outcome.stage).toBe("binding");
  });

  test("exit 0 with a tier-mismatched body is rejected at the binding stage", () => {
    const result: WorkerResult = { exit: 0, usage: usage(), rawText: JSON.stringify({ verdict: { outcome: "accept" }, justification: "j" }) };
    const outcome = resolveTurn(dispatch(), result);
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") throw new Error("expected rejected");
    expect(outcome.stage).toBe("binding");
  });

  test("every rejection stage still reports usage (tokens spent are never silently lost from the report)", () => {
    const result: WorkerResult = { exit: 1, usage: usage() };
    const outcome = resolveTurn(dispatch(), result);
    expect(outcome.usage).toEqual(usage());
  });
});

describe("property: a rejection at any stage never produces an 'applied' outcome", () => {
  const badResults: Array<[string, WorkerResult]> = [
    ["nonzero exit", { exit: 2, usage: usage(), rawText: JSON.stringify({ verdict: "VALID", justification: "j" }) }],
    ["missing rawText", { exit: 0, usage: usage() }],
    ["garbage JSON", { exit: 0, usage: usage(), rawText: "!!!" }],
    ["array instead of object", { exit: 0, usage: usage(), rawText: "[]" }],
    ["driver-owned field smuggled in", { exit: 0, usage: usage(), rawText: JSON.stringify({ verdict: "VALID", justification: "j", itemId: "forged" }) }],
  ];
  for (const [label, result] of badResults) {
    test(label, () => {
      const outcome = resolveTurn(dispatch(), result);
      expect(outcome.status).toBe("rejected");
    });
  }
});
