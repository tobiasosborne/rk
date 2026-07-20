// 1:1 test for src/drive/cross-vendor.ts (M3.8 deliverable 1) — the apply-time half of the
// cross-vendor rule (PRD C9 / docs/worker-contract.md section (e)). See driver-run.test.ts for the
// end-to-end wiring proof (same-family critical-path apply REJECTED before the verdict file is
// ever written).

import { describe, expect, test } from "bun:test";
import { crossVendorRejectionMessage, decideCrossVendor } from "../../src/drive/cross-vendor";

const CLAUDE_A = "claude|claude-code|opus|s1";
const CLAUDE_B = "claude|claude-code|opus|s2";
const GPT_A = "gpt|codex|gpt-5.6|s3";

describe("decideCrossVendor — load-bearing (critical-path) claims", () => {
  test("cross-family: satisfied, reason cross-family", () => {
    const d = decideCrossVendor(CLAUDE_A, GPT_A, true);
    expect(d).toEqual({ satisfied: true, reason: "cross-family", proverFamily: "claude", verifierFamily: "gpt" });
  });

  test("same-family (both decode, same family): REJECTED", () => {
    const d = decideCrossVendor(CLAUDE_A, CLAUDE_B, true);
    expect(d.satisfied).toBe(false);
    expect(d.reason).toBe("same-family");
    expect(d.proverFamily).toBe("claude");
    expect(d.verifierFamily).toBe("claude");
  });

  test("author absent entirely: fails closed, reason identity-unparseable (never same-family)", () => {
    const d = decideCrossVendor(undefined, GPT_A, true);
    expect(d.satisfied).toBe(false);
    expect(d.reason).toBe("identity-unparseable");
    expect(d.proverFamily).toBeUndefined();
    expect(d.verifierFamily).toBe("gpt");
  });

  test("author present but unparseable free text: fails closed, identity-unparseable", () => {
    const d = decideCrossVendor("codex", GPT_A, true);
    expect(d.satisfied).toBe(false);
    expect(d.reason).toBe("identity-unparseable");
    expect(d.proverFamily).toBeUndefined();
  });

  test("verifier seam itself unparseable: identity-unparseable (defensive — driver always supplies an encodable seam, but this function never trusts that)", () => {
    const d = decideCrossVendor(CLAUDE_A, "not-a-seam", true);
    expect(d.satisfied).toBe(false);
    expect(d.reason).toBe("identity-unparseable");
  });
});

describe("decideCrossVendor — non-critical-path claims (loadBearing=false)", () => {
  test("same-family is ALLOWED but still RECORDED (satisfied true, reason same-family)", () => {
    const d = decideCrossVendor(CLAUDE_A, CLAUDE_B, false);
    expect(d.satisfied).toBe(true);
    expect(d.reason).toBe("same-family");
  });

  test("identity-unparseable is likewise allowed off the critical path", () => {
    const d = decideCrossVendor(undefined, GPT_A, false);
    expect(d.satisfied).toBe(true);
    expect(d.reason).toBe("identity-unparseable");
  });

  test("cross-family stays satisfied", () => {
    const d = decideCrossVendor(CLAUDE_A, GPT_A, false);
    expect(d.satisfied).toBe(true);
    expect(d.reason).toBe("cross-family");
  });
});

describe("crossVendorRejectionMessage", () => {
  test("distinguishes same-family from identity-unparseable in the message text", () => {
    const same = decideCrossVendor(CLAUDE_A, CLAUDE_B, true);
    const unknown = decideCrossVendor(undefined, GPT_A, true);
    const msgSame = crossVendorRejectionMessage("1.2", same);
    const msgUnknown = crossVendorRejectionMessage("1.2", unknown);
    expect(msgSame).toContain("same-family");
    expect(msgSame).not.toContain("identity-unparseable");
    expect(msgUnknown).toContain("identity-unparseable");
    expect(msgUnknown).not.toContain("same-family on load-bearing");
  });

  test("throws on a satisfied decision (never fabricates a rejection message for a pass)", () => {
    const ok = decideCrossVendor(CLAUDE_A, GPT_A, true);
    expect(() => crossVendorRejectionMessage("1.2", ok)).toThrow();
  });
});
