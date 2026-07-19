// 1:1 test file for src/drive/bind-verdicts.ts — the M3.1 repair wave's landing-blocker-1 fix.
// `bindVerdicts(dispatchState, rawWorkerOutput)` is where the untrusted shape (a) meets the
// driver-owned dispatch state to construct shape (b); this file is the property test the review
// explicitly asked for ("a pure `bindVerdicts(dispatchState, workerOutput)` function with red
// tests for every mismatch class").

import { describe, expect, test } from "bun:test";
import { bindVerdicts, hardChallengeAcceptsThisTurn, correctionRequiresReVerificationBeforePromotion, type DispatchState } from "../../src/drive/bind-verdicts";

function l5Dispatch(overrides: Partial<DispatchState> = {}): DispatchState {
  return {
    itemId: "lem-halo-collapse",
    contentHash: "a".repeat(64),
    tier: "l5",
    claimId: "claim-01",
    verifier: { modelFamily: "gpt", backend: "codex", model: "gpt-5.6-sol", sessionId: "sess-01" },
    ...overrides,
  };
}

function hardDispatch(overrides: Partial<DispatchState> = {}): DispatchState {
  return {
    itemId: "node-14",
    contentHash: "b".repeat(64),
    tier: "hard",
    claimId: "claim-02",
    batchId: "batch-01",
    verifier: { modelFamily: "claude", backend: "claude", model: "claude-sonnet-5", sessionId: "sess-02" },
    ...overrides,
  };
}

describe("bindVerdicts — successful binding injects driver-owned fields", () => {
  test("l5 plain verdict: itemId/contentHash/tier/verifier are INJECTED from dispatch state, never from raw", () => {
    const dispatch = l5Dispatch();
    const result = bindVerdicts(dispatch, { verdict: "VALID", justification: "Matches def-halo." });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.document.verdicts).toHaveLength(1);
    const item = result.document.verdicts[0]!;
    expect(item.itemId).toBe(dispatch.itemId);
    expect(item.contentHash).toBe(dispatch.contentHash);
    expect(item.tier).toBe("l5");
    expect(result.document.verifier).toEqual(dispatch.verifier);
    expect(result.document.batchId).toBeUndefined();
  });

  test("hard accept verdict binds cleanly and carries batchId through", () => {
    const dispatch = hardDispatch();
    const result = bindVerdicts(dispatch, { verdict: { outcome: "accept" }, justification: "Deps validated." });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.document.batchId).toBe("batch-01");
    expect((result.document.verdicts[0] as any).verdict.outcome).toBe("accept");
  });

  test("hard challenge verdict binds cleanly", () => {
    const dispatch = hardDispatch();
    const raw = { verdict: { outcome: "challenge", target: "t", severity: "major", reason: "r" }, justification: "j" };
    const result = bindVerdicts(dispatch, raw);
    expect(result.ok).toBe(true);
  });

  test("l5 VALID-WITH-CORRECTION binds the correction field through unmodified", () => {
    const dispatch = l5Dispatch();
    const raw = { verdict: "VALID-WITH-CORRECTION", justification: "Sign error.", correction: { description: "Flipped sign.", correctedContentHash: "e".repeat(64) } };
    const result = bindVerdicts(dispatch, raw);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect((result.document.verdicts[0] as any).correction).toEqual(raw.correction);
  });

  test("a worker attempting to smuggle a false itemId is IGNORED, not merged in — the injected value wins because raw shape (a) has no itemId field at all", () => {
    const dispatch = l5Dispatch({ itemId: "real-item" });
    // Even if a caller mistakenly tries to pass an itemId-bearing object, shape (a) rejects it
    // outright (see test/drive/verdict-raw.test.ts) rather than silently trusting or merging it.
    const result = bindVerdicts(dispatch, { itemId: "forged-item", verdict: "VALID", justification: "j" });
    expect(result.ok).toBe(false);
  });
});

describe("bindVerdicts — rejection classes", () => {
  test("malformed dispatch state (bad contentHash) is rejected before touching raw output", () => {
    const dispatch = l5Dispatch({ contentHash: "not-a-hash" });
    const result = bindVerdicts(dispatch, { verdict: "VALID", justification: "j" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.issues.some((i) => i.stage === "dispatchState")).toBe(true);
  });

  test("blank claimId in dispatch state is rejected", () => {
    const dispatch = l5Dispatch({ claimId: "" });
    const result = bindVerdicts(dispatch, { verdict: "VALID", justification: "j" });
    expect(result.ok).toBe(false);
  });

  test("tier mismatch: hard-shaped raw output against an l5 dispatch is rejected with an explicit tier-mismatch message", () => {
    const dispatch = l5Dispatch();
    const result = bindVerdicts(dispatch, { verdict: { outcome: "accept" }, justification: "j" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.issues.some((i) => i.message.includes("tier mismatch"))).toBe(true);
  });

  test("tier mismatch: l5-shaped raw output (string verdict) against a hard dispatch is rejected with an explicit tier-mismatch message", () => {
    const dispatch = hardDispatch();
    const result = bindVerdicts(dispatch, { verdict: "VALID", justification: "j" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.issues.some((i) => i.message.includes("tier mismatch"))).toBe(true);
  });

  test("raw output missing justification is rejected at the rawOutput stage", () => {
    const dispatch = l5Dispatch();
    const result = bindVerdicts(dispatch, { verdict: "VALID" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.issues.some((i) => i.stage === "rawOutput")).toBe(true);
  });

  test("raw output with an unknown (driver-owned) field is rejected at the rawOutput stage", () => {
    const dispatch = l5Dispatch();
    const result = bindVerdicts(dispatch, { verdict: "VALID", justification: "j", batchId: "sneaky" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.issues.some((i) => i.stage === "rawOutput")).toBe(true);
  });

  test("VALID-WITH-CORRECTION without a correction field is rejected", () => {
    const dispatch = l5Dispatch();
    const result = bindVerdicts(dispatch, { verdict: "VALID-WITH-CORRECTION", justification: "j" });
    expect(result.ok).toBe(false);
  });

  test("non-object raw output is rejected", () => {
    const dispatch = l5Dispatch();
    expect(bindVerdicts(dispatch, "not an object").ok).toBe(false);
    expect(bindVerdicts(dispatch, null).ok).toBe(false);
    expect(bindVerdicts(dispatch, [1, 2, 3]).ok).toBe(false);
  });
});

describe("blocker 6 policy helpers are real, testable code artifacts", () => {
  test("hardChallengeAcceptsThisTurn is false for every severity — no accept-with-advisory shape in v1", () => {
    for (const severity of ["critical", "major", "minor", "note"]) {
      expect(hardChallengeAcceptsThisTurn(severity)).toBe(false);
    }
  });

  test("correctionRequiresReVerificationBeforePromotion is always true", () => {
    expect(correctionRequiresReVerificationBeforePromotion({ description: "d", correctedContentHash: "a".repeat(64) })).toBe(true);
  });
});
