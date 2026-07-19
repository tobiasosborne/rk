// 1:1 test file for src/drive/report.ts (M3.9). Covers: driver-log line parsing (l5-store's
// corrupted-tail precedent), the attribution conservation property, honest empty states, campaign/
// claim/node rollups, and the SC4 baseline stub.

import { describe, expect, test } from "bun:test";
import {
  buildReport,
  compareToBaseline,
  parseBaselineMemo,
  parseDriverLog,
  parseDriverLogLine,
  type DriverLogRecord,
  type UsageLogRecord,
} from "../../src/drive/report";

function usageLine(o: Partial<UsageLogRecord> & { usage: UsageLogRecord["usage"] }): string {
  return JSON.stringify({ kind: "usage", at: "2026-07-19T00:00:00Z", contractId: "c1", claimId: "claim-1", nodeId: "1.1", role: "verifier", sessionId: "s1", ...o });
}

describe("parseDriverLogLine", () => {
  test("garbage JSON is a loud issue, never thrown", () => {
    const r = parseDriverLogLine("{not json", 1);
    expect(r.ok).toBe(false);
  });

  test("an array (not an object) is rejected", () => {
    const r = parseDriverLogLine("[1,2,3]", 1);
    expect(r.ok).toBe(false);
  });

  test("an unrecognized 'kind' is rejected, never silently coerced", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "mystery", at: "x" }), 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issue.message).toContain("unrecognized");
  });

  test("a well-formed 'usage' record round-trips", () => {
    const r = parseDriverLogLine(usageLine({ usage: { input: 1, output: 2, cache_read: 3, cache_creation: 4 } }), 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.record as UsageLogRecord).usage).toEqual({ input: 1, output: 2, cache_read: 3, cache_creation: 4 });
  });

  test("a 'usage' record with a bad role is rejected", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "usage", at: "t", contractId: "c", claimId: "cl", nodeId: "n", role: "wizard", sessionId: "s", usage: { input: 0, output: 0, cache_read: 0, cache_creation: 0 } }), 1);
    expect(r.ok).toBe(false);
  });

  test("a 'usage' record with non-numeric usage fields is rejected", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "usage", at: "t", contractId: "c", claimId: "cl", nodeId: "n", role: "verifier", sessionId: "s", usage: { input: "lots", output: 0, cache_read: 0, cache_creation: 0 } }), 1);
    expect(r.ok).toBe(false);
  });

  test("a diagnostic-only kind (node-skipped) needs no more than a valid object + recognized kind", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "node-skipped", at: "t", node: "1.1", reason: "no worker" }), 1);
    expect(r.ok).toBe(true);
  });
});

describe("parseDriverLog — corrupted-tail precedent (mirrors l5-store's parseL5Log)", () => {
  test("empty text parses to zero records, zero issues", () => {
    expect(parseDriverLog("")).toEqual({ records: [], issues: [] });
  });

  test("parses every well-formed newline-terminated line, ignoring the one trailing empty element", () => {
    const text = usageLine({ usage: { input: 1, output: 0, cache_read: 0, cache_creation: 0 } }) + "\n" + usageLine({ nodeId: "1.2", usage: { input: 2, output: 0, cache_read: 0, cache_creation: 0 } }) + "\n";
    const { records, issues } = parseDriverLog(text);
    expect(issues).toEqual([]);
    expect(records).toHaveLength(2);
  });

  test("PROPERTY: a truncated final line (crash mid-append) is reported, earlier records stay readable", () => {
    const good = usageLine({ usage: { input: 1, output: 0, cache_read: 0, cache_creation: 0 } });
    const truncated = '{"kind":"usage","at":"t","contractId":"c'; // no trailing newline
    const { records, issues } = parseDriverLog(good + "\n" + truncated);
    expect(records).toHaveLength(1);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.line).toBe(2);
  });

  test("a corrupted line in the MIDDLE is reported, never silently dropped, and does not block a later good line", () => {
    const text = [usageLine({ usage: { input: 1, output: 0, cache_read: 0, cache_creation: 0 } }), "{garbage", usageLine({ nodeId: "1.2", usage: { input: 1, output: 0, cache_read: 0, cache_creation: 0 } })].join("\n") + "\n";
    const { records, issues } = parseDriverLog(text);
    expect(records).toHaveLength(2);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.line).toBe(2);
  });

  test("a blank line that is NOT the file's own trailing newline is reported, never silently skipped (L2)", () => {
    const text = usageLine({ usage: { input: 1, output: 0, cache_read: 0, cache_creation: 0 } }) + "\n\n" + usageLine({ nodeId: "1.2", usage: { input: 1, output: 0, cache_read: 0, cache_creation: 0 } }) + "\n";
    const { issues } = parseDriverLog(text);
    expect(issues.length).toBeGreaterThan(0);
  });
});

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

describe("SC4 baseline stub — never fabricates a denominator", () => {
  test("no baseline supplied: unavailable, honest caveat", () => {
    const r = buildReport([], "camp");
    const cmp = compareToBaseline(r, undefined);
    expect(cmp.available).toBe(false);
    expect(cmp.caveat).toContain("no baseline recorded");
  });

  test("baseline supplied but this lemma has zero current measured tokens: ratio is undefined, never Infinity", () => {
    const r = buildReport([], "camp");
    const cmp = compareToBaseline(r, [{ lemma: "lem-x", tokens: 1000, calls: 5 }]);
    expect(cmp.available).toBe(true);
    expect(cmp.rows[0]!.ratio).toBeUndefined();
    expect(cmp.rows[0]!.currentTokens).toBe(0);
  });

  test("baseline vs a measured campaign: ratio = baseline/current", () => {
    const records: DriverLogRecord[] = [
      { kind: "usage", at: "t", contractId: "c", claimId: "claim-1", nodeId: "lem-x", role: "verifier", sessionId: "s1", usage: { input: 100, output: 50, cache_read: 0, cache_creation: 0 } },
    ];
    const r = buildReport(records, "camp");
    const cmp = compareToBaseline(r, [{ lemma: "lem-x", tokens: 450, calls: 5 }]);
    expect(cmp.rows[0]!.currentTokens).toBe(150);
    expect(cmp.rows[0]!.ratio).toBeCloseTo(3.0, 10);
  });
});

describe("parseBaselineMemo", () => {
  test("valid array round-trips", () => {
    const r = parseBaselineMemo(JSON.stringify([{ lemma: "a", tokens: 1, calls: 1 }]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.baseline).toEqual([{ lemma: "a", tokens: 1, calls: 1 }]);
  });

  test("not an array: rejected", () => {
    expect(parseBaselineMemo(JSON.stringify({ lemma: "a" })).ok).toBe(false);
  });

  test("malformed JSON: rejected, never thrown", () => {
    expect(parseBaselineMemo("{not json").ok).toBe(false);
  });

  test("an entry missing a required field: rejected", () => {
    expect(parseBaselineMemo(JSON.stringify([{ lemma: "a", tokens: 1 }])).ok).toBe(false);
  });
});
