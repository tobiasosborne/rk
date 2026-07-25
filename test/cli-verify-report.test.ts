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

  // GAP 8: an af record-proof rejection (the codex-prover forward-sibling depends stop) renders its
  // own count on the discards line, even on an otherwise unmeasured deadlock run.
  test("record-proof-failed count renders on the discards line (GAP 8), even with zero usage records", () => {
    const records: DriverLogRecord[] = [
      { kind: "record-proof-failed", at: "t1", node: "1", reason: "af record-proof exit 1: child 2: dependency node 1.1 does not exist", rawSnippet: '[{"statement":"x","depends":["1.1"]}]' } as DriverLogRecord,
    ];
    const report = buildReport(records, "camp-recproof");
    expect(report.measured).toBe(false);
    const lines = reportLines(report);
    const discards = lines.find((l) => l.includes("discards:"));
    expect(discards).toBeDefined();
    expect(discards!).toContain("record-proof-failed=1");
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

// rk-xxp (GAP 11): a repair is a RECOVERED turn, not a discard -- it gets its own line, worded as a
// recovery that still cost real extra spend, never folded into `discardsLine` and never presented as
// an unqualified success.
describe("reportLines — rk-xxp: bounded schema-repair counters render on their own line", () => {
  test("a measured report with a successful repair prints a 'repairs' line, separate from 'discards:'", () => {
    const records: DriverLogRecord[] = [
      { kind: "usage", at: "t1", contractId: "c1", claimId: "cl1", nodeId: "1", role: "verifier", sessionId: "s1", usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 } } as DriverLogRecord,
      { kind: "usage", at: "t2", contractId: "c1", claimId: "cl1", nodeId: "1", role: "verifier", sessionId: "s1", usage: { input: 2, output: 3, cache_read: 0, cache_creation: 0 }, repair: true } as DriverLogRecord,
      { kind: "verdict-repair", at: "t2", node: "1", role: "verifier", outcome: "repaired", issues: [{ path: "$.justification", message: "required" }] } as DriverLogRecord,
    ];
    const report = buildReport(records, "camp-repair");
    const lines = reportLines(report);
    const repairs = lines.find((l) => l.includes("repairs"));
    expect(repairs).toBeDefined();
    expect(repairs!).toContain("repaired=1");
    expect(repairs!).toContain("failed=0");
    // never merged into the discards line
    const discards = lines.find((l) => l.includes("discards:"));
    expect(discards!).not.toContain("repair");
  });

  test("a report with a failed repair attempt counts it on the 'failed' side", () => {
    const records: DriverLogRecord[] = [
      { kind: "usage", at: "t1", contractId: "c1", claimId: "cl1", nodeId: "1", role: "verifier", sessionId: "s1", usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 } } as DriverLogRecord,
      { kind: "verdict-repair", at: "t1", node: "1", role: "verifier", outcome: "failed", issues: [{ path: "$.justification", message: "required" }], repairIssues: [{ path: "$", message: "still bad" }] } as DriverLogRecord,
    ];
    const report = buildReport(records, "camp-repair-fail");
    const lines = reportLines(report);
    const repairs = lines.find((l) => l.includes("repairs"));
    expect(repairs).toBeDefined();
    expect(repairs!).toContain("repaired=0");
    expect(repairs!).toContain("failed=1");
  });

  test("verdict-repair diagnostics render even with zero usage records (same FU4 convention as discards)", () => {
    const records: DriverLogRecord[] = [
      { kind: "verdict-repair", at: "t1", node: "1", role: "verifier", outcome: "failed", issues: [], repairIssues: [{ path: "$", message: "still bad" }] } as DriverLogRecord,
    ];
    const report = buildReport(records, "camp-repair-unmeasured");
    expect(report.measured).toBe(false);
    const lines = reportLines(report);
    expect(lines.some((l) => l.includes("repairs") && l.includes("failed=1"))).toBe(true);
  });

  // The required regression: a log with NO verdict-repair records at all must render byte-identical
  // to the pre-GAP-11 output -- no spurious "repaired=0 failed=0" line ever appears.
  test("a log with no verdict-repair records renders with NO 'repairs' line at all (no spurious line)", () => {
    const records: DriverLogRecord[] = [
      { kind: "usage", at: "t1", contractId: "c1", claimId: "cl1", nodeId: "1", role: "verifier", sessionId: "s1", usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 } } as DriverLogRecord,
      { kind: "vacuous-accept-discarded", at: "t2", node: "1", reason: "nothing to verify" } as DriverLogRecord,
    ];
    const report = buildReport(records, "camp-no-repair");
    const lines = reportLines(report);
    expect(lines.some((l) => l.includes("repairs"))).toBe(false);
  });

  test("the honestly-unmeasured banner path also carries no spurious 'repairs' line when there were no repairs", () => {
    const records: DriverLogRecord[] = [
      { kind: "vacuous-accept-discarded", at: "t2", node: "1", reason: "nothing to verify" } as DriverLogRecord,
    ];
    const report = buildReport(records, "camp-no-repair-unmeasured");
    expect(report.measured).toBe(false);
    const lines = reportLines(report);
    expect(lines.some((l) => l.includes("repairs"))).toBe(false);
  });
});
