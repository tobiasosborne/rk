// Pure-render test for src/cli/verify-report.ts's `reportLines` (the fs edge `reportCommand` wraps
// it). blocker-review FU4: the driver's own discard diagnostics must print even when the log carries
// ZERO usage records — a run that discards every vacuous bootstrap accept and spends no measurable
// usage still has to show WHY (the bootstrap-deadlock signature). Pre-fix, the not-measured branch
// returned early BEFORE the discards line, so a pure-deadlock log printed no diagnostics.

import { describe, expect, test } from "bun:test";
import { reportLines } from "../src/cli/verify-report";
import { buildReport, type DriverLogRecord } from "../src/drive/report";

describe("reportLines — FU4: discard diagnostics render even with zero usage records", () => {
  test("a log with only vacuous-accept-discarded records (no usage) still prints the discards line", () => {
    const records: DriverLogRecord[] = [
      { kind: "vacuous-accept-discarded", at: "t1", node: "1", reason: "nothing to verify" } as DriverLogRecord,
      { kind: "vacuous-accept-discarded", at: "t2", node: "1", reason: "nothing to verify" } as DriverLogRecord,
      { kind: "cross-vendor-rejected", at: "t3", node: "1.2", reason: "same family" } as DriverLogRecord,
    ];
    const report = buildReport(records, "camp-deadlock");
    expect(report.measured).toBe(false); // no usage records
    const lines = reportLines(report);
    // the ZERO-usage banner still appears...
    expect(lines.some((l) => l.includes("ZERO usage records"))).toBe(true);
    // ...AND the discards line is present (pre-fix: absent — early return skipped it).
    const discards = lines.find((l) => l.includes("discards:"));
    expect(discards).toBeDefined();
    expect(discards!).toContain("vacuous-accept-discarded=2");
    expect(discards!).toContain("cross-vendor-rejected=1");
  });

  test("bind-failed count renders on the discards line (rk-qxp), even with zero usage records", () => {
    const records: DriverLogRecord[] = [
      { kind: "bind-failed", at: "t1", node: "1", issues: [{ path: "$.verdict.target", message: "must be a non-blank string" }], rawSnippet: '{"verdict":{"outcome":"challenge","target":1}}' } as DriverLogRecord,
    ];
    const report = buildReport(records, "camp-bindfail");
    expect(report.measured).toBe(false);
    const lines = reportLines(report);
    const discards = lines.find((l) => l.includes("discards:"));
    expect(discards).toBeDefined();
    expect(discards!).toContain("bind-failed=1");
  });

  // GAP 7(b): a parse/extraction failure (the claude-verifier exit-12 gap) renders its own count on
  // the discards line, even on an otherwise unmeasured (zero-usage) deadlock run.
  test("parse-failed count renders on the discards line (GAP 7b), even with zero usage records", () => {
    const records: DriverLogRecord[] = [
      { kind: "parse-failed", at: "t1", node: "1", role: "verifier", rawSnippet: 'Here is the verdict: {"verdict":"VALID"}' } as DriverLogRecord,
    ];
    const report = buildReport(records, "camp-parsefail");
    expect(report.measured).toBe(false);
    const lines = reportLines(report);
    const discards = lines.find((l) => l.includes("discards:"));
    expect(discards).toBeDefined();
    expect(discards!).toContain("parse-failed=1");
  });

  test("a measured report still prints the discards line (unchanged path)", () => {
    const records: DriverLogRecord[] = [
      { kind: "usage", at: "t1", contractId: "c1", claimId: "cl1", nodeId: "1", role: "verifier", sessionId: "s1", usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 } } as DriverLogRecord,
      { kind: "vacuous-accept-discarded", at: "t2", node: "1", reason: "nothing to verify" } as DriverLogRecord,
    ];
    const report = buildReport(records, "camp");
    expect(report.measured).toBe(true);
    const lines = reportLines(report);
    expect(lines.some((l) => l.includes("discards:") && l.includes("vacuous-accept-discarded=1"))).toBe(true);
  });
});
