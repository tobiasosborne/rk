// 1:1 test file for src/drive/report-parse.ts (split from report.ts, rk-tbg). Covers: driver-log
// line parsing (l5-store's corrupted-tail precedent) and the top-level text-splitting/trailing-
// newline convention. These describe blocks were previously in test/drive/report.test.ts before
// the report.ts hard-cap-280 split; the assertions themselves are unchanged, only the import path
// moved to the new module. `buildReport`'s own tests stay in test/drive/report.test.ts, which now
// covers report.ts's AGGREGATE half only.

import { describe, expect, test } from "bun:test";
import {
  parseDriverLog,
  parseDriverLogLine,
  type UsageLogRecord,
} from "../../src/drive/report-parse";

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

  // blocker-review FU4: the driver writes 'proof-recorded' (a prover decomposition landed) and
  // 'churn-cap' (a growth-only run aborted); the parser's allowlist previously OMITTED both, so real
  // driver logs mis-reported them as "unrecognized 'kind'" / "could not be parsed". Recognize them.
  test("the driver's own 'proof-recorded' kind is recognized, never 'unrecognized'", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "proof-recorded", at: "t", node: "1.1", children: 3 }), 1);
    expect(r.ok).toBe(true);
  });
  test("the driver's own 'churn-cap' kind is recognized, never 'unrecognized'", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "churn-cap", at: "t", reason: "grew 6 rounds without advance", offenders: ["1.2"] }), 1);
    expect(r.ok).toBe(true);
  });

  // rk-53r (P3) + rk-jit (STOP-4): the driver writes these two discard kinds; the report reader
  // must RECOGNIZE them (never print "unrecognized 'kind'"), and validate their node/reason fields.
  test("the driver's own 'cross-vendor-rejected' kind is recognized, never 'unrecognized'", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "cross-vendor-rejected", at: "t", node: "1", reason: "identity-unparseable" }), 1);
    expect(r.ok).toBe(true);
  });
  test("the new 'vacuous-accept-discarded' kind is recognized", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "vacuous-accept-discarded", at: "t", node: "1", reason: "nothing to verify" }), 1);
    expect(r.ok).toBe(true);
  });
  test("a discard kind missing its 'node'/'reason' is a loud issue, never silently accepted", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "cross-vendor-rejected", at: "t" }), 1);
    expect(r.ok).toBe(false);
  });

  // rk-qxp: the driver's new 'bind-failed' evidence record — persisted whenever a returned verdict
  // fails to bind, carrying node + issues (with paths) + a bounded raw snippet so the next live stop
  // is self-diagnosing. Must be RECOGNIZED (never "unrecognized 'kind'") and its node validated.
  test("the new 'bind-failed' kind is recognized, never 'unrecognized'", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "bind-failed", at: "t", node: "1", issues: [{ path: "$.verdict.target", message: "must be a non-blank string" }], rawSnippet: '{"verdict":{"outcome":"challenge","target":1}}' }), 1);
    expect(r.ok).toBe(true);
  });

  test("a 'bind-failed' record missing its 'node' is a loud issue, never silently accepted", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "bind-failed", at: "t", issues: [], rawSnippet: "x" }), 1);
    expect(r.ok).toBe(false);
  });

  test("a 'bind-failed' record whose 'rawSnippet' is not a string is a loud issue", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "bind-failed", at: "t", node: "1", issues: [], rawSnippet: 42 }), 1);
    expect(r.ok).toBe(false);
  });

  // GAP 7(b): the driver's new 'parse-failed' evidence record — persisted whenever a nominally
  // successful turn's output could not be extracted to a single JSON object (exit 12), carrying node
  // + role + a bounded raw snippet. Must be RECOGNIZED (never "unrecognized 'kind'").
  test("the new 'parse-failed' kind is recognized, never 'unrecognized'", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "parse-failed", at: "t", node: "1", role: "verifier", rawSnippet: "prose {\"verdict\":\"VALID\"} more prose" }), 1);
    expect(r.ok).toBe(true);
  });
  test("a 'parse-failed' record missing its 'node' is a loud issue", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "parse-failed", at: "t", role: "verifier", rawSnippet: "x" }), 1);
    expect(r.ok).toBe(false);
  });
  test("a 'parse-failed' record with an unknown 'role' is a loud issue", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "parse-failed", at: "t", node: "1", role: "wizard", rawSnippet: "x" }), 1);
    expect(r.ok).toBe(false);
  });
  test("a 'parse-failed' record whose 'rawSnippet' is not a string is a loud issue", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "parse-failed", at: "t", node: "1", role: "verifier", rawSnippet: 42 }), 1);
    expect(r.ok).toBe(false);
  });
  // rk-d1n (M3.5 live debug): the new diagnosability fields (parseError, classification, rawFailurePath)
  // are validated LENIENTLY — a record carrying them is recognized, AND an OLD-shape record without any
  // of them still parses (they predate the fields; they must not become a loud "unrecognized" issue).
  test("a 'parse-failed' record WITH the new diagnosability fields is recognized", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "parse-failed", at: "t", node: "1", role: "verifier", rawSnippet: "{\"a\":1", parseError: "Unterminated string in JSON at position 5", classification: "unterminated", rawFailurePath: ".rk/parse-failures/1-1.txt" }), 1);
    expect(r.ok).toBe(true);
  });
  test("an OLD-shape 'parse-failed' record (no parseError/classification/rawFailurePath) still parses", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "parse-failed", at: "t", node: "1", role: "verifier", rawSnippet: "x" }), 1);
    expect(r.ok).toBe(true);
  });
  test("a 'parse-failed' record whose 'classification' is present but not a string is a loud issue", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "parse-failed", at: "t", node: "1", role: "verifier", rawSnippet: "x", classification: 7 }), 1);
    expect(r.ok).toBe(false);
  });

  // GAP 8 (STOP-REPORT-7): the driver's new 'record-proof-failed' evidence record — persisted whenever
  // af record-proof refuses a prover decomposition, carrying node + af reason + a bounded children
  // snippet. Must be RECOGNIZED (never "unrecognized 'kind'") and its node/reason validated.
  test("the new 'record-proof-failed' kind is recognized, never 'unrecognized'", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "record-proof-failed", at: "t", node: "1", reason: "af record-proof exit 1: child 2: dependency node 1.1 does not exist", rawSnippet: '[{"statement":"x","depends":["1.1"]}]' }), 1);
    expect(r.ok).toBe(true);
  });
  test("a 'record-proof-failed' record missing its 'node' is a loud issue", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "record-proof-failed", at: "t", reason: "boom", rawSnippet: "x" }), 1);
    expect(r.ok).toBe(false);
  });
  test("a 'record-proof-failed' record missing its 'reason' is a loud issue", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "record-proof-failed", at: "t", node: "1", rawSnippet: "x" }), 1);
    expect(r.ok).toBe(false);
  });
  test("a 'record-proof-failed' record whose 'rawSnippet' is not a string is a loud issue", () => {
    const r = parseDriverLogLine(JSON.stringify({ kind: "record-proof-failed", at: "t", node: "1", reason: "boom", rawSnippet: 42 }), 1);
    expect(r.ok).toBe(false);
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
