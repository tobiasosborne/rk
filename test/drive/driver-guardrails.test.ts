// 1:1 test for src/drive/driver-guardrails.ts (M3.6). Each guardrail is a pure decision function;
// every test asserts the CONTRACT (PRD C9 / IMPLEMENTATION_PLAN.md M3.6: prover-overreach abort,
// stuck guard, retry cap), and each has a mutation note proving it goes RED if the rule flips.

import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MAX_STUCK_ROUNDS,
  DEFAULT_NODE_RETRY_CAP,
  checkRetryCap,
  detectProverOverreach,
  evaluateStuckGuard,
} from "../../src/drive/driver-guardrails";

describe("detectProverOverreach — provers prove, only verifiers produce verdicts", () => {
  test("a prover response carrying a 'verdict' field is DISCARDED", () => {
    // mutation: return NO_OVERREACH here → this goes red.
    const d = detectProverOverreach("prover", { verdict: { outcome: "accept" }, justification: "qed" });
    expect(d.discard).toBe(true);
    expect(d.reason).toContain("verdict");
  });

  test("a prover response carrying an 'outcome' field is DISCARDED", () => {
    expect(detectProverOverreach("prover", { outcome: "accept" }).discard).toBe(true);
  });

  test("a prover response that is a bare verdict STRING is DISCARDED", () => {
    expect(detectProverOverreach("prover", "VALID").discard).toBe(true);
    expect(detectProverOverreach("prover", "accept").discard).toBe(true);
  });

  test("a legitimate prover proof (no verdict/outcome shape) is NOT discarded", () => {
    expect(detectProverOverreach("prover", { proof: "the map is valid on the domain", steps: 3 }).discard).toBe(false);
  });

  test("a VERIFIER producing a verdict is exempt (only provers overreach)", () => {
    // mutation: drop the `role !== "prover"` early return → this goes red.
    expect(detectProverOverreach("verifier", { verdict: { outcome: "accept" }, justification: "ok" }).discard).toBe(false);
    expect(detectProverOverreach("reviewer", { outcome: "challenge" }).discard).toBe(false);
  });
});

describe("evaluateStuckGuard — no progress after N rounds aborts with a named reason", () => {
  test("aborts AT the cap (default 3)", () => {
    // mutation: `>` instead of `>=` → this exact-boundary case goes red.
    const d = evaluateStuckGuard(DEFAULT_MAX_STUCK_ROUNDS);
    expect(d.abort).toBe(true);
    expect(d.reason).toContain("stuck");
  });

  test("does not abort below the cap", () => {
    expect(evaluateStuckGuard(DEFAULT_MAX_STUCK_ROUNDS - 1).abort).toBe(false);
    expect(evaluateStuckGuard(0).abort).toBe(false);
  });

  test("a custom cap is honored", () => {
    expect(evaluateStuckGuard(1, 5).abort).toBe(false);
    expect(evaluateStuckGuard(5, 5).abort).toBe(true);
  });
});

describe("checkRetryCap — per-node attempt ceiling", () => {
  test("exhausted at the cap (default 3)", () => {
    const d = checkRetryCap(DEFAULT_NODE_RETRY_CAP);
    expect(d.exhausted).toBe(true);
    expect(d.reason).toContain("retry cap");
  });

  test("not exhausted below the cap", () => {
    expect(checkRetryCap(0).exhausted).toBe(false);
    expect(checkRetryCap(DEFAULT_NODE_RETRY_CAP - 1).exhausted).toBe(false);
  });
});
