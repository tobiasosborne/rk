// 1:1 test file for src/drive/l5-record.ts (M3.7): the L5 store's per-line record shape and its
// build-from-VerdictDocument / serialize / parse codec.

import { describe, expect, test } from "bun:test";
import {
  buildL5StoredVerdict,
  parseL5StoredVerdictLine,
  serializeL5StoredVerdict,
  L5_STORE_SCHEMA_VERSION,
  type L5StoredVerdict,
} from "../../src/drive/l5-record";
import type { VerdictDocument } from "../../src/drive/verdict-schema";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function l5Document(overrides: Partial<VerdictDocument["verdicts"][number]> = {}, batchId?: string): VerdictDocument {
  return {
    schema_version: "1",
    ...(batchId !== undefined ? { batchId } : {}),
    verifier: { modelFamily: "claude", backend: "claude", model: "claude-sonnet-5", sessionId: "sess-1" },
    verdicts: [{ itemId: "lem-1", tier: "l5", contentHash: HASH_A, justification: "Checked against def-halo.", verdict: "VALID", ...overrides }] as VerdictDocument["verdicts"],
  };
}

describe("buildL5StoredVerdict", () => {
  test("builds a record from a plain VALID l5 document", () => {
    const result = buildL5StoredVerdict(l5Document(), 0, "2026-07-19T00:00:00.000Z");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.record).toEqual({
      schemaVersion: "1",
      ordinal: 0,
      itemId: "lem-1",
      l5ContentHash: HASH_A,
      verdict: "VALID",
      justification: "Checked against def-halo.",
      verifierSeam: "claude|claude|claude-sonnet-5|sess-1",
      appendedAt: "2026-07-19T00:00:00.000Z",
    });
  });

  test("carries batchId through when present", () => {
    const result = buildL5StoredVerdict(l5Document({}, "batch-1"), 3);
    if (!result.ok) throw new Error("expected ok");
    expect(result.record.batchId).toBe("batch-1");
  });

  test("carries a VALID-WITH-CORRECTION's correction field through", () => {
    const doc = l5Document({ verdict: "VALID-WITH-CORRECTION", correction: { description: "fix the sign", correctedContentHash: HASH_B } });
    const result = buildL5StoredVerdict(doc, 0);
    if (!result.ok) throw new Error("expected ok");
    expect(result.record.correction).toEqual({ description: "fix the sign", correctedContentHash: HASH_B });
  });

  test("appendedAt is omitted, not defaulted, when the caller supplies none", () => {
    const result = buildL5StoredVerdict(l5Document(), 0);
    if (!result.ok) throw new Error("expected ok");
    expect("appendedAt" in result.record).toBe(false);
  });

  test("rejects a hard-tier document — the L5 store never records hard-tier verdicts", () => {
    const doc: VerdictDocument = {
      schema_version: "1",
      verifier: { modelFamily: "claude", backend: "claude", model: "m", sessionId: "s" },
      verdicts: [{ itemId: "n-1", tier: "hard", contentHash: HASH_A, justification: "j", verdict: { outcome: "accept" } }],
    };
    const result = buildL5StoredVerdict(doc, 0);
    expect(result.ok).toBe(false);
  });

  test("rejects a verifier identity that cannot be losslessly seam-encoded", () => {
    const doc = l5Document();
    doc.verifier = { modelFamily: "claude", backend: "cla|ude", model: "m", sessionId: "s" };
    const result = buildL5StoredVerdict(doc, 0);
    expect(result.ok).toBe(false);
  });
});

describe("serializeL5StoredVerdict / parseL5StoredVerdictLine — round trip", () => {
  function record(overrides: Partial<L5StoredVerdict> = {}): L5StoredVerdict {
    return {
      schemaVersion: "1",
      ordinal: 0,
      itemId: "lem-1",
      l5ContentHash: HASH_A,
      verdict: "VALID",
      justification: "j",
      verifierSeam: "claude|claude|m|s",
      ...overrides,
    };
  }

  test("a serialized record parses back byte-for-byte equal", () => {
    const r = record({ batchId: "batch-1", appendedAt: "2026-07-19T00:00:00.000Z" });
    const line = serializeL5StoredVerdict(r);
    const parsed = parseL5StoredVerdictLine(line, 1);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected ok");
    expect(parsed.record).toEqual(r);
  });

  test("a VALID-WITH-CORRECTION record round-trips its correction field", () => {
    const r = record({ verdict: "VALID-WITH-CORRECTION", correction: { description: "d", correctedContentHash: HASH_B } });
    const parsed = parseL5StoredVerdictLine(serializeL5StoredVerdict(r), 1);
    if (!parsed.ok) throw new Error("expected ok");
    expect(parsed.record).toEqual(r);
  });
});

describe("parseL5StoredVerdictLine — corruption is reported, never thrown", () => {
  test("garbage (not JSON) is rejected with an issue naming the line", () => {
    const result = parseL5StoredVerdictLine("{not json", 7);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.issue.line).toBe(7);
  });

  test("a short/truncated write (partial JSON object) is rejected, not thrown", () => {
    const result = parseL5StoredVerdictLine('{"schemaVersion":"1","ordinal":0,"itemId":"lem', 3);
    expect(result.ok).toBe(false);
  });

  test("an array instead of an object is rejected", () => {
    const result = parseL5StoredVerdictLine("[]", 1);
    expect(result.ok).toBe(false);
  });

  test("wrong schemaVersion is rejected", () => {
    const result = parseL5StoredVerdictLine(JSON.stringify({ schemaVersion: "2", ordinal: 0, itemId: "i", l5ContentHash: HASH_A, verdict: "VALID", justification: "j", verifierSeam: "a|b|c|d" }), 1);
    expect(result.ok).toBe(false);
  });

  test("a negative ordinal is rejected", () => {
    const result = parseL5StoredVerdictLine(JSON.stringify({ schemaVersion: L5_STORE_SCHEMA_VERSION, ordinal: -1, itemId: "i", l5ContentHash: HASH_A, verdict: "VALID", justification: "j", verifierSeam: "a|b|c|d" }), 1);
    expect(result.ok).toBe(false);
  });

  test("a malformed l5ContentHash (not 64 hex chars) is rejected", () => {
    const result = parseL5StoredVerdictLine(JSON.stringify({ schemaVersion: L5_STORE_SCHEMA_VERSION, ordinal: 0, itemId: "i", l5ContentHash: "abc", verdict: "VALID", justification: "j", verifierSeam: "a|b|c|d" }), 1);
    expect(result.ok).toBe(false);
  });

  test("an unrecognized verdict value is rejected", () => {
    const result = parseL5StoredVerdictLine(JSON.stringify({ schemaVersion: L5_STORE_SCHEMA_VERSION, ordinal: 0, itemId: "i", l5ContentHash: HASH_A, verdict: "MAYBE", justification: "j", verifierSeam: "a|b|c|d" }), 1);
    expect(result.ok).toBe(false);
  });

  test("VALID-WITH-CORRECTION without a correction field is rejected", () => {
    const result = parseL5StoredVerdictLine(JSON.stringify({ schemaVersion: L5_STORE_SCHEMA_VERSION, ordinal: 0, itemId: "i", l5ContentHash: HASH_A, verdict: "VALID-WITH-CORRECTION", justification: "j", verifierSeam: "a|b|c|d" }), 1);
    expect(result.ok).toBe(false);
  });

  test("a correction field on a plain VALID verdict is rejected", () => {
    const result = parseL5StoredVerdictLine(
      JSON.stringify({ schemaVersion: L5_STORE_SCHEMA_VERSION, ordinal: 0, itemId: "i", l5ContentHash: HASH_A, verdict: "VALID", justification: "j", verifierSeam: "a|b|c|d", correction: { description: "d", correctedContentHash: HASH_B } }),
      1,
    );
    expect(result.ok).toBe(false);
  });
});
