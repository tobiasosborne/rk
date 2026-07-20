// 1:1 test file for src/drive/verdict-raw.ts (shape (a): raw, untrusted worker output). New in
// the M3.1 repair wave (Tier A review landing-blocker 1) — this shape did not exist before the
// review; the pre-review v1 validated worker output directly against the enriched document shape,
// which is exactly the trust-boundary violation the review flagged. Ground truth:
// docs/worker-contract.md's data-flow section.

import { describe, expect, test } from "bun:test";
import { validateRawWorkerOutput, validateCorrectionDetail, type RawIssue } from "../../src/drive/verdict-raw";

function messages(issues: RawIssue[]): string {
  return issues.map((i) => `${i.path}: ${i.message}`).join(" | ");
}

describe("validateRawWorkerOutput — valid raw output", () => {
  test("l5 plain VALID is valid", () => {
    expect(validateRawWorkerOutput("l5", { verdict: "VALID", justification: "Matches def-halo." })).toEqual([]);
  });

  test("l5 plain INVALID is valid", () => {
    expect(validateRawWorkerOutput("l5", { verdict: "INVALID", justification: "Contradicts def-halo." })).toEqual([]);
  });

  test("l5 VALID-WITH-CORRECTION with a correction detail is valid", () => {
    const raw = { verdict: "VALID-WITH-CORRECTION", justification: "Sign error in step 2.", correction: { description: "Flipped inequality sign.", correctedContentHash: "a".repeat(64) } };
    expect(validateRawWorkerOutput("l5", raw)).toEqual([]);
  });

  test("hard accept (no note) is valid", () => {
    expect(validateRawWorkerOutput("hard", { verdict: { outcome: "accept" }, justification: "Deps 12/13 already validated." })).toEqual([]);
  });

  test("hard accept (with note) is valid", () => {
    expect(validateRawWorkerOutput("hard", { verdict: { outcome: "accept", note: "Tightened wording." }, justification: "OK." })).toEqual([]);
  });

  test("hard challenge (no category) is valid", () => {
    const raw = { verdict: { outcome: "challenge", target: "node-22-step-3", severity: "major", reason: "Unjustified injectivity." }, justification: "See target." };
    expect(validateRawWorkerOutput("hard", raw)).toEqual([]);
  });

  test("hard challenge (with category) is valid", () => {
    const raw = { verdict: { outcome: "challenge", target: "t", severity: "minor", reason: "r", category: "unclear" }, justification: "j" };
    expect(validateRawWorkerOutput("hard", raw)).toEqual([]);
  });
});

describe("validateRawWorkerOutput — rejection classes: driver-owned fields never allowed (blocker 1)", () => {
  test("itemId in raw l5 output is rejected outright", () => {
    const issues = validateRawWorkerOutput("l5", { itemId: "sneaky", verdict: "VALID", justification: "j" });
    expect(messages(issues)).toContain("unknown property 'itemId'");
  });

  test("contentHash in raw l5 output is rejected outright", () => {
    const issues = validateRawWorkerOutput("l5", { contentHash: "a".repeat(64), verdict: "VALID", justification: "j" });
    expect(messages(issues)).toContain("unknown property 'contentHash'");
  });

  test("tier in raw l5 output is rejected outright", () => {
    const issues = validateRawWorkerOutput("l5", { tier: "l5", verdict: "VALID", justification: "j" });
    expect(messages(issues)).toContain("unknown property 'tier'");
  });

  test("batchId in raw l5 output is rejected outright", () => {
    const issues = validateRawWorkerOutput("l5", { batchId: "b1", verdict: "VALID", justification: "j" });
    expect(messages(issues)).toContain("unknown property 'batchId'");
  });

  test("a verifier identity block in raw hard output is rejected outright", () => {
    const issues = validateRawWorkerOutput("hard", { verifier: { modelFamily: "claude" }, verdict: { outcome: "accept" }, justification: "j" });
    expect(messages(issues)).toContain("unknown property 'verifier'");
  });

  test("sessionId in raw hard output is rejected outright", () => {
    const issues = validateRawWorkerOutput("hard", { sessionId: "s1", verdict: { outcome: "accept" }, justification: "j" });
    expect(messages(issues)).toContain("unknown property 'sessionId'");
  });
});

describe("validateRawWorkerOutput — rejection classes: shape and content", () => {
  test("non-object raw output is rejected", () => {
    expect(validateRawWorkerOutput("l5", "not an object").length).toBeGreaterThan(0);
    expect(validateRawWorkerOutput("l5", null).length).toBeGreaterThan(0);
    expect(validateRawWorkerOutput("l5", [1, 2]).length).toBeGreaterThan(0);
  });

  test("l5 missing verdict is rejected", () => {
    expect(messages(validateRawWorkerOutput("l5", { justification: "j" }))).toContain("verdict");
  });

  test("l5 missing justification is rejected", () => {
    expect(messages(validateRawWorkerOutput("l5", { verdict: "VALID" }))).toContain("justification");
  });

  test("l5 blank justification is rejected", () => {
    expect(messages(validateRawWorkerOutput("l5", { verdict: "VALID", justification: "" }))).toContain("justification");
  });

  test("l5 whitespace-only justification is rejected", () => {
    expect(messages(validateRawWorkerOutput("l5", { verdict: "VALID", justification: "   " }))).toContain("justification");
  });

  test("l5 verdict outside the closed enum is rejected", () => {
    expect(messages(validateRawWorkerOutput("l5", { verdict: "SORT-OF-VALID", justification: "j" }))).toContain("verdict");
  });

  test("l5 VALID-WITH-CORRECTION missing correction is rejected", () => {
    expect(messages(validateRawWorkerOutput("l5", { verdict: "VALID-WITH-CORRECTION", justification: "j" }))).toContain("correction");
  });

  test("l5 plain VALID with a correction field present is rejected (forbidden except on VALID-WITH-CORRECTION)", () => {
    const raw = { verdict: "VALID", justification: "j", correction: { description: "d", correctedContentHash: "a".repeat(64) } };
    expect(messages(validateRawWorkerOutput("l5", raw))).toContain("correction");
  });

  test("correction.description missing is rejected", () => {
    const raw = { verdict: "VALID-WITH-CORRECTION", justification: "j", correction: { correctedContentHash: "a".repeat(64) } };
    expect(messages(validateRawWorkerOutput("l5", raw))).toContain("correction.description");
  });

  test("correction.description blank is rejected", () => {
    const raw = { verdict: "VALID-WITH-CORRECTION", justification: "j", correction: { description: "  ", correctedContentHash: "a".repeat(64) } };
    expect(messages(validateRawWorkerOutput("l5", raw))).toContain("correction.description");
  });

  test("correction.correctedContentHash malformed is rejected", () => {
    const raw = { verdict: "VALID-WITH-CORRECTION", justification: "j", correction: { description: "d", correctedContentHash: "nope" } };
    expect(messages(validateRawWorkerOutput("l5", raw))).toContain("correction.correctedContentHash");
  });

  test("correction with an unknown key is rejected", () => {
    const raw = { verdict: "VALID-WITH-CORRECTION", justification: "j", correction: { description: "d", correctedContentHash: "a".repeat(64), extra: true } };
    expect(messages(validateRawWorkerOutput("l5", raw))).toContain("unknown property 'extra'");
  });

  test("hard missing verdict is rejected", () => {
    expect(messages(validateRawWorkerOutput("hard", { justification: "j" }))).toContain("verdict");
  });

  test("hard missing justification is rejected", () => {
    expect(messages(validateRawWorkerOutput("hard", { verdict: { outcome: "accept" } }))).toContain("justification");
  });

  test("hard verdict outcome outside {accept,challenge} is rejected", () => {
    expect(messages(validateRawWorkerOutput("hard", { verdict: { outcome: "reject" }, justification: "j" }))).toContain("outcome");
  });

  test("hard accept with an unknown property is rejected", () => {
    expect(messages(validateRawWorkerOutput("hard", { verdict: { outcome: "accept", extra: 1 }, justification: "j" }))).toContain("unknown property 'extra'");
  });

  test("hard challenge missing target/severity/reason is rejected", () => {
    const issues = validateRawWorkerOutput("hard", { verdict: { outcome: "challenge" }, justification: "j" });
    const msg = messages(issues);
    expect(msg).toContain("target");
    expect(msg).toContain("severity");
    expect(msg).toContain("reason");
  });

  test("hard challenge invalid severity is rejected", () => {
    const raw = { verdict: { outcome: "challenge", target: "t", severity: "urgent", reason: "r" }, justification: "j" };
    expect(messages(validateRawWorkerOutput("hard", raw))).toContain("severity");
  });

  test("hard challenge invalid category is rejected", () => {
    const raw = { verdict: { outcome: "challenge", target: "t", severity: "minor", reason: "r", category: "vibes" }, justification: "j" };
    expect(messages(validateRawWorkerOutput("hard", raw))).toContain("category");
  });
});

// rk-qxp: tolerant-but-safe node-id parsing for the challenge "target". A model routinely emits the
// target as a bare JSON NUMBER because af node ids look numeric ("1"). An INTEGER round-trips
// unambiguously and is coerced in place to its string form; a NON-INTEGER number is REJECTED, never
// coerced, because JSON parses a dotted id like 1.10 to the number 1.1 and String(1.1) === "1.1"
// would silently name a DIFFERENT child ("1.10" vs "1.1"). This is parse-layer tolerance for an
// unambiguous encoding, NOT a validity-semantics change.
describe("validateRawWorkerOutput — challenge target number tolerance (rk-qxp)", () => {
  test("an INTEGER-number target (e.g. 1) is accepted and coerced in place to the string '1'", () => {
    const raw = { verdict: { outcome: "challenge", target: 1, severity: "major", reason: "r" }, justification: "j" };
    expect(validateRawWorkerOutput("hard", raw)).toEqual([]);
    expect((raw.verdict as { target: unknown }).target).toBe("1"); // coerced, so the document downstream carries a string
  });

  test("a large integer-number target is coerced, not rejected", () => {
    const raw = { verdict: { outcome: "challenge", target: 42, severity: "note", reason: "r" }, justification: "j" };
    expect(validateRawWorkerOutput("hard", raw)).toEqual([]);
    expect((raw.verdict as { target: unknown }).target).toBe("42");
  });

  test("a NON-INTEGER number target (e.g. 1.10 -> 1.1) is REJECTED with a quote-the-id message, never coerced", () => {
    const raw = { verdict: { outcome: "challenge", target: 1.1, severity: "major", reason: "r" }, justification: "j" };
    const msg = messages(validateRawWorkerOutput("hard", raw));
    expect(msg).toContain("$.verdict.target");
    expect(msg.toLowerCase()).toContain("quote");
    expect((raw.verdict as { target: unknown }).target).toBe(1.1); // NOT coerced — a dotted id must stay a quoted string
  });

  test("the non-integer rejection does NOT double-report (single target issue, not a coercion + a blank-string issue)", () => {
    const raw = { verdict: { outcome: "challenge", target: 1.5, severity: "major", reason: "r" }, justification: "j" };
    const issues = validateRawWorkerOutput("hard", raw);
    expect(issues.filter((i) => i.path === "$.verdict.target").length).toBe(1);
  });

  test("a string target is still accepted unchanged (dotted ids stay strings)", () => {
    const raw = { verdict: { outcome: "challenge", target: "1.10", severity: "major", reason: "r" }, justification: "j" };
    expect(validateRawWorkerOutput("hard", raw)).toEqual([]);
    expect((raw.verdict as { target: unknown }).target).toBe("1.10");
  });
});

describe("validateCorrectionDetail (exported for reuse by src/drive/verdict-schema.ts)", () => {
  test("valid correction detail is accepted", () => {
    const issues: RawIssue[] = [];
    validateCorrectionDetail({ description: "d", correctedContentHash: "a".repeat(64) }, "$.correction", issues);
    expect(issues).toEqual([]);
  });

  test("non-object correction is rejected", () => {
    const issues: RawIssue[] = [];
    validateCorrectionDetail("nope", "$.correction", issues);
    expect(issues.length).toBeGreaterThan(0);
  });
});
