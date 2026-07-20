// 1:1 test file for src/drive/report-baseline.ts (M3.9's SC4 baseline comparison, split out of
// src/drive/report.ts — M3 repair-wave blocker 8, docs/reviews/2026-07-19-m3-milestone-review-
// codex.md). Covers: `parseBaselineMemo`'s versioned {schemaVersion, entries} shape and its
// non-negative-integer/uniqueness validation, and `compareToBaseline`'s (claimId, nodeId) join key
// plus its refusal to compare at all over a report carrying parse or attribution issues.

import { describe, expect, test } from "bun:test";
import { buildReport, type DriverLogRecord } from "../../src/drive/report";
import { BASELINE_MEMO_SCHEMA_VERSION, compareToBaseline, parseBaselineMemo } from "../../src/drive/report-baseline";

describe("SC4 baseline stub — never fabricates a denominator", () => {
  test("no baseline supplied: unavailable, honest caveat", () => {
    const r = buildReport([], "camp");
    const cmp = compareToBaseline(r, undefined);
    expect(cmp.available).toBe(false);
    expect(cmp.caveat).toContain("no baseline recorded");
  });

  test("baseline supplied but this lemma has zero current measured tokens: ratio is undefined, never Infinity", () => {
    const r = buildReport([], "camp");
    const cmp = compareToBaseline(r, [{ claimId: "claim-1", lemma: "lem-x", tokens: 1000, calls: 5 }]);
    expect(cmp.available).toBe(true);
    expect(cmp.rows[0]!.ratio).toBeUndefined();
    expect(cmp.rows[0]!.currentTokens).toBe(0);
  });

  test("baseline vs a measured campaign: ratio = baseline/current", () => {
    const records: DriverLogRecord[] = [
      { kind: "usage", at: "t", contractId: "c", claimId: "claim-1", nodeId: "lem-x", role: "verifier", sessionId: "s1", usage: { input: 100, output: 50, cache_read: 0, cache_creation: 0 } },
    ];
    const r = buildReport(records, "camp");
    const cmp = compareToBaseline(r, [{ claimId: "claim-1", lemma: "lem-x", tokens: 450, calls: 5 }]);
    expect(cmp.rows[0]!.currentTokens).toBe(150);
    expect(cmp.rows[0]!.ratio).toBeCloseTo(3.0, 10);
  });

  // M3 repair-wave blocker 8: "Baselines are joined using non-unique bare af node IDs" — a bare
  // nodeId can collide across two different claims/workspaces (report.ts's own documented
  // "distinct (nodeId, claimId) pairs" rule for nodeRows). The join must use (claimId, nodeId), not
  // nodeId alone, or a baseline entry can silently match the WRONG claim's node.
  test("joins by (claimId, nodeId), never bare nodeId — two claims sharing a bare node id do not collide", () => {
    const records: DriverLogRecord[] = [
      { kind: "usage", at: "t1", contractId: "c1", claimId: "claim-1", nodeId: "1", role: "verifier", sessionId: "s1", usage: { input: 100, output: 0, cache_read: 0, cache_creation: 0 } },
      { kind: "usage", at: "t2", contractId: "c2", claimId: "claim-2", nodeId: "1", role: "verifier", sessionId: "s2", usage: { input: 9, output: 0, cache_read: 0, cache_creation: 0 } },
    ];
    const r = buildReport(records, "camp");
    const cmp = compareToBaseline(r, [{ claimId: "claim-2", lemma: "1", tokens: 90, calls: 1 }]);
    // must match claim-2's node "1" (currentTokens=9), never claim-1's (currentTokens=100).
    expect(cmp.rows[0]!.currentTokens).toBe(9);
    expect(cmp.rows[0]!.ratio).toBeCloseTo(10, 10);
  });

  test("comparison is unavailable when the driver log carried parse issues — never a fabricated ratio over incomplete data", () => {
    const records: DriverLogRecord[] = [
      { kind: "usage", at: "t", contractId: "c", claimId: "claim-1", nodeId: "lem-x", role: "verifier", sessionId: "s1", usage: { input: 100, output: 50, cache_read: 0, cache_creation: 0 } },
    ];
    const r = buildReport(records, "camp", [{ line: 3, message: "not valid JSON" }]);
    const cmp = compareToBaseline(r, [{ claimId: "claim-1", lemma: "lem-x", tokens: 450, calls: 5 }]);
    expect(cmp.available).toBe(false);
    expect(cmp.rows).toEqual([]);
  });

  test("comparison is unavailable when a session's usage records span more than one claimId (attribution error)", () => {
    const records: DriverLogRecord[] = [
      { kind: "usage", at: "t1", contractId: "c1", claimId: "claim-1", nodeId: "1", role: "verifier", sessionId: "shared-session", usage: { input: 10, output: 0, cache_read: 0, cache_creation: 0 } },
      { kind: "usage", at: "t2", contractId: "c2", claimId: "claim-2", nodeId: "1", role: "verifier", sessionId: "shared-session", usage: { input: 10, output: 0, cache_read: 0, cache_creation: 0 } },
    ];
    const r = buildReport(records, "camp");
    expect(r.attributionIssues.length).toBeGreaterThan(0);
    const cmp = compareToBaseline(r, [{ claimId: "claim-1", lemma: "1", tokens: 10, calls: 1 }]);
    expect(cmp.available).toBe(false);
  });
});

describe("parseBaselineMemo", () => {
  // M3 repair-wave blocker 8: the memo shape gained a required `claimId` per entry (the join key
  // fix) and a `schemaVersion` envelope (CLAUDE.md rule 10: a baseline-memo shape change is a
  // compat event) — a bare array (the pre-fix shape) is a DIFFERENT, now-unsupported shape.
  test("valid {schemaVersion, entries} document round-trips", () => {
    const r = parseBaselineMemo(JSON.stringify({ schemaVersion: BASELINE_MEMO_SCHEMA_VERSION, entries: [{ claimId: "claim-1", lemma: "a", tokens: 1, calls: 1 }] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.baseline).toEqual([{ claimId: "claim-1", lemma: "a", tokens: 1, calls: 1 }]);
  });

  test("the pre-fix bare-array shape is rejected, not silently accepted with a missing claimId", () => {
    expect(parseBaselineMemo(JSON.stringify([{ lemma: "a", tokens: 1, calls: 1 }])).ok).toBe(false);
  });

  test("a missing/wrong schemaVersion is rejected", () => {
    expect(parseBaselineMemo(JSON.stringify({ schemaVersion: 1, entries: [{ claimId: "claim-1", lemma: "a", tokens: 1, calls: 1 }] })).ok).toBe(false);
    expect(parseBaselineMemo(JSON.stringify({ entries: [{ claimId: "claim-1", lemma: "a", tokens: 1, calls: 1 }] })).ok).toBe(false);
  });

  test("not an object / missing entries: rejected", () => {
    expect(parseBaselineMemo(JSON.stringify({ lemma: "a" })).ok).toBe(false);
  });

  test("malformed JSON: rejected, never thrown", () => {
    expect(parseBaselineMemo("{not json").ok).toBe(false);
  });

  test("an entry missing a required field (claimId): rejected", () => {
    expect(parseBaselineMemo(JSON.stringify({ schemaVersion: BASELINE_MEMO_SCHEMA_VERSION, entries: [{ lemma: "a", tokens: 1, calls: 1 }] })).ok).toBe(false);
  });

  test("an entry missing a required field (tokens): rejected", () => {
    expect(parseBaselineMemo(JSON.stringify({ schemaVersion: BASELINE_MEMO_SCHEMA_VERSION, entries: [{ claimId: "claim-1", lemma: "a", tokens: 1 }] })).ok).toBe(false);
  });

  // "duplicate, negative, and fractional baseline entries are accepted" — the exact review finding.
  test("a duplicate (claimId, lemma) pair is rejected, never silently accepted twice", () => {
    const doc = { schemaVersion: BASELINE_MEMO_SCHEMA_VERSION, entries: [{ claimId: "claim-1", lemma: "a", tokens: 1, calls: 1 }, { claimId: "claim-1", lemma: "a", tokens: 2, calls: 2 }] };
    const r = parseBaselineMemo(JSON.stringify(doc));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("duplicate");
  });

  test("the same lemma under DIFFERENT claimIds is fine (not a duplicate)", () => {
    const doc = { schemaVersion: BASELINE_MEMO_SCHEMA_VERSION, entries: [{ claimId: "claim-1", lemma: "a", tokens: 1, calls: 1 }, { claimId: "claim-2", lemma: "a", tokens: 2, calls: 2 }] };
    expect(parseBaselineMemo(JSON.stringify(doc)).ok).toBe(true);
  });

  test("a negative tokens value is rejected", () => {
    const doc = { schemaVersion: BASELINE_MEMO_SCHEMA_VERSION, entries: [{ claimId: "claim-1", lemma: "a", tokens: -1, calls: 1 }] };
    expect(parseBaselineMemo(JSON.stringify(doc)).ok).toBe(false);
  });

  test("a negative calls value is rejected", () => {
    const doc = { schemaVersion: BASELINE_MEMO_SCHEMA_VERSION, entries: [{ claimId: "claim-1", lemma: "a", tokens: 1, calls: -1 }] };
    expect(parseBaselineMemo(JSON.stringify(doc)).ok).toBe(false);
  });

  test("a fractional tokens value is rejected", () => {
    const doc = { schemaVersion: BASELINE_MEMO_SCHEMA_VERSION, entries: [{ claimId: "claim-1", lemma: "a", tokens: 1.5, calls: 1 }] };
    expect(parseBaselineMemo(JSON.stringify(doc)).ok).toBe(false);
  });

  test("a fractional calls value is rejected", () => {
    const doc = { schemaVersion: BASELINE_MEMO_SCHEMA_VERSION, entries: [{ claimId: "claim-1", lemma: "a", tokens: 1, calls: 1.5 }] };
    expect(parseBaselineMemo(JSON.stringify(doc)).ok).toBe(false);
  });

  test("an entry missing a required field (lemma): rejected", () => {
    expect(parseBaselineMemo(JSON.stringify({ schemaVersion: BASELINE_MEMO_SCHEMA_VERSION, entries: [{ claimId: "claim-1", tokens: 1, calls: 1 }] })).ok).toBe(false);
  });
});
