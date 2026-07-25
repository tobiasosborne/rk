// 1:1 test file for src/drive/report.ts (M3.9). Covers: the AGGREGATE half only — honest empty
// states, campaign/claim/node rollups, the attribution conservation property, and
// parseIssues/attributionIssues threading (M3 repair-wave blocker 8). Driver-log line/text parsing
// (parseDriverLogLine/parseDriverLog) moved to src/drive/report-parse.ts (rk-tbg hard-cap-280
// split) and is now covered by test/drive/report-parse.test.ts. The SC4 baseline comparison itself
// (parseBaselineMemo/compareToBaseline) lives in src/drive/report-baseline.ts and is covered by
// test/drive/report-baseline.test.ts.

import { describe, expect, test } from "bun:test";
import { buildReport, type DriverLogRecord } from "../../src/drive/report";

describe("buildReport — honest empty states", () => {
  test("zero records: unmeasured, zero totals, never presented as a measured zero", () => {
    const r = buildReport([], "camp");
    expect(r.measured).toBe(false);
    expect(r.totals).toEqual({ input: 0, output: 0, cache_read: 0, cache_creation: 0, turns: 0 });
  });

  test("records present but none are 'usage' kind: still unmeasured", () => {
    const records: DriverLogRecord[] = [{ kind: "verdict-outcome", at: "t", node: "1.1", verdict: "accept", status: "applied", exit: 0 }];
    const r = buildReport(records, "camp");
    expect(r.measured).toBe(false);
    expect(r.verdicts.applied).toBe(1);
  });

  test("discard kinds are counted per kind (rk-53r / rk-jit), never silently dropped", () => {
    const records: DriverLogRecord[] = [
      { kind: "cross-vendor-rejected", at: "t", node: "1", reason: "identity-unparseable" },
      { kind: "cross-vendor-rejected", at: "t", node: "1", reason: "identity-unparseable" },
      { kind: "vacuous-accept-discarded", at: "t", node: "1", reason: "nothing to verify" },
    ];
    const r = buildReport(records, "camp");
    expect(r.discards.crossVendorRejected).toBe(2);
    expect(r.discards.vacuousAcceptDiscarded).toBe(1);
  });

  test("bind-failed records are counted (rk-qxp), never silently dropped", () => {
    const records: DriverLogRecord[] = [
      { kind: "bind-failed", at: "t", node: "1", issues: [{ path: "$.verdict.target", message: "must be a non-blank string" }], rawSnippet: "{}" } as DriverLogRecord,
      { kind: "bind-failed", at: "t", node: "1", issues: [], rawSnippet: "{}" } as DriverLogRecord,
    ];
    const r = buildReport(records, "camp");
    expect(r.bindFailures).toBe(2);
  });

  test("parse-failed records are counted (GAP 7b), never silently dropped", () => {
    const records: DriverLogRecord[] = [
      { kind: "parse-failed", at: "t", node: "1", role: "verifier", rawSnippet: "prose {} prose" } as DriverLogRecord,
      { kind: "parse-failed", at: "t", node: "2", role: "prover", rawSnippet: "```json\n{}\n``` extra" } as DriverLogRecord,
    ];
    const r = buildReport(records, "camp");
    expect(r.parseFailures).toBe(2);
  });

  test("record-proof-failed records are counted (GAP 8), never silently dropped", () => {
    const records: DriverLogRecord[] = [
      { kind: "record-proof-failed", at: "t", node: "1", reason: "af record-proof exit 1: child 2: dependency node 1.1 does not exist", rawSnippet: '[{"statement":"x"}]' } as DriverLogRecord,
      { kind: "record-proof-failed", at: "t", node: "1", reason: "af record-proof exit 1", rawSnippet: "[]" } as DriverLogRecord,
    ];
    const r = buildReport(records, "camp");
    expect(r.recordProofFailures).toBe(2);
  });

  // rk-xxp (GAP 11): 'verdict-repair' records are counted per outcome -- 'repaired' and 'failed' are
  // separate counters (never merged), and never confused with parseFailures/bindFailures (which
  // count the FIRST turn's terminal failure representation, preserved verbatim regardless of the
  // repair's own outcome).
  test("verdict-repair records are counted per outcome, never silently dropped", () => {
    const records: DriverLogRecord[] = [
      { kind: "verdict-repair", at: "t", node: "1", role: "verifier", outcome: "repaired", issues: [{ path: "$.justification", message: "required" }] } as DriverLogRecord,
      { kind: "verdict-repair", at: "t", node: "2", role: "verifier", outcome: "repaired", issues: [] } as DriverLogRecord,
      { kind: "verdict-repair", at: "t", node: "3", role: "prover", outcome: "failed", issues: [], repairIssues: [{ path: "$", message: "still bad" }] } as DriverLogRecord,
    ];
    const r = buildReport(records, "camp");
    expect(r.repairSucceeded).toBe(2);
    expect(r.repairFailures).toBe(1);
  });

  test("zero verdict-repair records: both counters are honestly zero, not merged into other counters", () => {
    const records: DriverLogRecord[] = [
      { kind: "parse-failed", at: "t", node: "1", role: "verifier", rawSnippet: "x" } as DriverLogRecord,
      { kind: "bind-failed", at: "t", node: "2", issues: [], rawSnippet: "{}" } as DriverLogRecord,
    ];
    const r = buildReport(records, "camp");
    expect(r.repairSucceeded).toBe(0);
    expect(r.repairFailures).toBe(0);
    expect(r.parseFailures).toBe(1);
    expect(r.bindFailures).toBe(1);
  });
});

describe("buildReport — node/claim/campaign rollups", () => {
  const records: DriverLogRecord[] = [
    { kind: "usage", at: "t1", contractId: "c1", claimId: "claim-1", nodeId: "1.1", role: "verifier", sessionId: "s1", usage: { input: 10, output: 5, cache_read: 0, cache_creation: 0 } },
    { kind: "usage", at: "t2", contractId: "c1", claimId: "claim-1", nodeId: "1.2", role: "verifier", sessionId: "s1", usage: { input: 10, output: 5, cache_read: 90, cache_creation: 0 } },
    { kind: "usage", at: "t3", contractId: "c2", claimId: "claim-2", nodeId: "1.1", role: "verifier", sessionId: "s2", usage: { input: 20, output: 8, cache_read: 0, cache_creation: 30 } },
    { kind: "verdict-outcome", at: "t4", node: "1.1", verdict: "accept", status: "applied", exit: 0 },
    { kind: "verdict-outcome", at: "t5", node: "1.2", verdict: "challenge", status: "blocked-by:reviewer==author", exit: 5 },
    { kind: "balloon", at: "t6", contractId: "c2", nodeCount: 50, cap: 40, classification: "genuine-gap", routing: "mandatory-review", priorBalloonCount: 0, offendingSubtree: ["1"], rationale: "r" },
  ];

  test("measured is true once at least one usage record exists", () => {
    expect(buildReport(records, "camp").measured).toBe(true);
  });

  test("campaign totals sum every usage record exactly", () => {
    const r = buildReport(records, "camp");
    expect(r.totals).toEqual({ input: 40, output: 18, cache_read: 90, cache_creation: 30, turns: 3 });
  });

  test("distinct (nodeId, claimId) pairs are separate rows — same bare node id across two claims never collides", () => {
    const r = buildReport(records, "camp");
    const ones = r.nodeRows.filter((n) => n.nodeId === "1.1");
    expect(ones).toHaveLength(2);
    expect(new Set(ones.map((n) => n.claimId))).toEqual(new Set(["claim-1", "claim-2"]));
  });

  test("verdict counts are campaign-wide (documented limitation: no claim split for this kind)", () => {
    const r = buildReport(records, "camp");
    expect(r.verdicts).toEqual({ total: 2, applied: 1, blocked: 1, rejected: 0, other: 0 });
  });

  test("balloon events attribute safely per claim via contractId", () => {
    const r = buildReport(records, "camp");
    const claim2 = r.claimRows.find((c) => c.claimId === "claim-2")!;
    const claim1 = r.claimRows.find((c) => c.claimId === "claim-1")!;
    expect(claim2.balloons.total).toBe(1);
    expect(claim1.balloons.total).toBe(0);
  });

  test("a single-turn session attributes cache_creation wholly to that turn's node", () => {
    const r = buildReport(records, "camp");
    const n = r.nodeRows.find((n) => n.claimId === "claim-2" && n.nodeId === "1.1")!;
    expect(n.attributedTokens).toBe(20 + 8 + 0 + 30); // own input+output+cache_read + its whole session's cache_creation
  });
});

describe("PROPERTY: attribution conservation — sum of per-node attributed tokens == total attributable", () => {
  function usage(i: number) {
    return { input: (i * 7) % 13, output: (i * 3) % 11, cache_read: (i * 5) % 17, cache_creation: (i * 11) % 23 };
  }

  test("many turns, several sessions each shared by several nodes, several claims — conservation holds exactly", () => {
    const sessions = ["s1", "s2", "s3"];
    const claims = ["claim-1", "claim-2"];
    const records: DriverLogRecord[] = [];
    let totalAttributable = 0;
    for (let i = 0; i < 97; i++) {
      const u = usage(i);
      totalAttributable += u.input + u.output + u.cache_read + u.cache_creation;
      records.push({
        kind: "usage", at: `t${i}`, contractId: "c", claimId: claims[i % claims.length]!, nodeId: `n${i % 5}`,
        role: "verifier", sessionId: sessions[i % sessions.length]!, usage: u,
      });
    }
    const r = buildReport(records, "camp");
    const sumAttributed = r.nodeRows.reduce((s, n) => s + n.attributedTokens, 0);
    expect(sumAttributed).toBe(totalAttributable);
    const sumClaimAttributed = r.claimRows.reduce((s, c) => s + c.attributedTokens, 0);
    expect(sumClaimAttributed).toBe(totalAttributable);
  });
});

describe("buildReport — parseIssues and attributionIssues are honestly threaded through", () => {
  test("caller-supplied parse issues are carried into the report, never dropped", () => {
    const r = buildReport([], "camp", [{ line: 5, message: "garbage line" }]);
    expect(r.parseIssues).toEqual([{ line: 5, message: "garbage line" }]);
  });

  test("no parse issues supplied: parseIssues defaults to empty, never undefined", () => {
    const r = buildReport([], "camp");
    expect(r.parseIssues).toEqual([]);
  });

  test("clean single-claim-per-session usage: zero attribution issues", () => {
    const records: DriverLogRecord[] = [
      { kind: "usage", at: "t1", contractId: "c1", claimId: "claim-1", nodeId: "1", role: "verifier", sessionId: "s1", usage: { input: 1, output: 0, cache_read: 0, cache_creation: 0 } },
      { kind: "usage", at: "t2", contractId: "c1", claimId: "claim-1", nodeId: "2", role: "verifier", sessionId: "s1", usage: { input: 1, output: 0, cache_read: 0, cache_creation: 0 } },
    ];
    expect(buildReport(records, "camp").attributionIssues).toEqual([]);
  });
});
