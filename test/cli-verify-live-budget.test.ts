// 1:1 test for src/cli/verify-live-budget.ts (rk-s9t) — the fail-closed parse/validate of the
// required-for-live `--max-campaign-tokens` flag. The CLI integration is exercised end-to-end in
// test/cli-verify.test.ts; this asserts the pure parser's contract directly.

import { describe, expect, test } from "bun:test";
import { parseCampaignBudget } from "../src/cli/verify-live-budget";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "../src/drive/driver-live";

describe("parseCampaignBudget — fail-closed campaign token cap", () => {
  test("an ABSENT flag is refused with a self-teaching message (never a silent unlimited default)", () => {
    // mutation: return an ok budget here → this goes red (the exact hole the review named).
    const r = parseCampaignBudget(undefined);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("REQUIRES a campaign token cap");
    expect(r.message).toContain("--max-campaign-tokens");
  });

  test("a valid positive integer yields a BudgetConfig with the per-call reserve = one turn's output cap", () => {
    const r = parseCampaignBudget("500000");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.budget.maxCampaignTokens).toBe(500000);
    expect(r.budget.perCallReserve).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
  });

  test("zero, negatives, fractionals, and junk are each refused", () => {
    for (const bad of ["0", "-5", "1.5", "abc", "10x", ""]) {
      const r = parseCampaignBudget(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("positive integer");
    }
  });
});
