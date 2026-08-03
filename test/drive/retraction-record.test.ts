// rk-0ehr / P1 (docs/memos/2026-08-03-rk-improvement-plan-from-aism.md §P1): the retraction
// ledger's ON-DISK RECORD shape and its pure JSONL codec, mirroring test/drive/l5-record.test.ts's
// discipline for the verdict ledger. Every assertion here is a contract from
// schemas/retraction.v1.json, not a shape-of-convenience.

import { describe, expect, test } from "bun:test";
import {
  RETRACTION_HASH_DOMAINS,
  RETRACTION_SCHEMA_VERSION,
  buildRetractionRecord,
  parseRetractionRecordLine,
  serializeRetractionRecord,
  type RetractionInput,
} from "../../src/drive/retraction-record";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function input(over: Partial<RetractionInput> = {}): RetractionInput {
  return {
    itemId: "lem-stage1-approximate-group-laws",
    contentHash: HASH_A,
    hashDomain: "l5-shard-bytes",
    retractedBy: "audit:2026-07-28-independent-sweep",
    reason: "independent sweep found the step-3 approximation unjustified",
    ...over,
  };
}

describe("retraction record — build", () => {
  test("builds a complete record from a validated input plus ledger-position metadata", () => {
    const built = buildRetractionRecord(input(), 0, "2026-07-28T10:00:00.000Z");
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error("unreachable");
    expect(built.record).toEqual({
      schemaVersion: RETRACTION_SCHEMA_VERSION,
      ordinal: 0,
      itemId: "lem-stage1-approximate-group-laws",
      contentHash: HASH_A,
      hashDomain: "l5-shard-bytes",
      retractedBy: "audit:2026-07-28-independent-sweep",
      reason: "independent sweep found the step-3 approximation unjustified",
      appendedAt: "2026-07-28T10:00:00.000Z",
    });
  });

  test("appendedAt is optional — a pure caller never has to fabricate a timestamp (L3)", () => {
    const built = buildRetractionRecord(input(), 3);
    expect(built.ok).toBe(true);
    if (!built.ok) throw new Error("unreachable");
    expect("appendedAt" in built.record).toBe(false);
    expect(built.record.ordinal).toBe(3);
  });

  test("supersedesVerdictOrdinal passes through when present, absent otherwise", () => {
    const built = buildRetractionRecord(input({ supersedesVerdictOrdinal: 7 }), 1);
    if (!built.ok) throw new Error("unreachable");
    expect(built.record.supersedesVerdictOrdinal).toBe(7);
  });

  test("both pinned hash domains are accepted, and nothing else is", () => {
    for (const domain of RETRACTION_HASH_DOMAINS) {
      expect(buildRetractionRecord(input({ hashDomain: domain }), 0).ok).toBe(true);
    }
    const bogus = buildRetractionRecord(input({ hashDomain: "sha256-of-something" as never }), 0);
    expect(bogus.ok).toBe(false);
    if (bogus.ok) throw new Error("unreachable");
    expect(bogus.reason).toContain("hashDomain");
  });

  test("rejects (never throws) a blank reason — structurally checked like a verdict justification", () => {
    const blank = buildRetractionRecord(input({ reason: "   " }), 0);
    expect(blank.ok).toBe(false);
    if (blank.ok) throw new Error("unreachable");
    expect(blank.reason).toContain("reason");
  });

  test("rejects a blank retractedBy, a blank itemId, and a non-sha256 contentHash", () => {
    expect(buildRetractionRecord(input({ retractedBy: "" }), 0).ok).toBe(false);
    expect(buildRetractionRecord(input({ itemId: "" }), 0).ok).toBe(false);
    expect(buildRetractionRecord(input({ contentHash: "AABB" }), 0).ok).toBe(false);
    expect(buildRetractionRecord(input({ contentHash: HASH_A.toUpperCase() }), 0).ok).toBe(false);
  });

  test("rejects a negative or non-integer ordinal", () => {
    expect(buildRetractionRecord(input(), -1).ok).toBe(false);
    expect(buildRetractionRecord(input(), 1.5).ok).toBe(false);
  });
});

describe("retraction record — JSONL codec round trip", () => {
  test("serialize -> parse is lossless for every field", () => {
    const built = buildRetractionRecord(input({ hashDomain: "af-canonical", supersedesVerdictOrdinal: 2 }), 4, "2026-07-28T11:00:00.000Z");
    if (!built.ok) throw new Error("unreachable");
    const line = serializeRetractionRecord(built.record);
    expect(line).not.toContain("\n");
    const parsed = parseRetractionRecordLine(line, 1);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("unreachable");
    expect(parsed.record).toEqual(built.record);
  });

  test("garbage JSON is a reported issue, never a throw", () => {
    const parsed = parseRetractionRecordLine('{"schemaVersion":"1",', 9);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("unreachable");
    expect(parsed.issue.line).toBe(9);
    expect(parsed.issue.message).toContain("not valid JSON");
  });

  test("every field-shape violation is rejected with a line-attributed message", () => {
    const base = {
      schemaVersion: "1",
      ordinal: 0,
      itemId: "lem-a",
      contentHash: HASH_A,
      hashDomain: "l5-shard-bytes",
      retractedBy: "TJO",
      reason: "retracted after audit",
    };
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...base, schemaVersion: "2" }, "schemaVersion"],
      [{ ...base, ordinal: -1 }, "ordinal"],
      [{ ...base, itemId: "  " }, "itemId"],
      [{ ...base, contentHash: "nope" }, "contentHash"],
      [{ ...base, hashDomain: "l5" }, "hashDomain"],
      [{ ...base, retractedBy: "" }, "retractedBy"],
      [{ ...base, reason: "" }, "reason"],
      [{ ...base, supersedesVerdictOrdinal: "3" }, "supersedesVerdictOrdinal"],
      [{ ...base, appendedAt: 17 }, "appendedAt"],
    ];
    for (const [raw, needle] of cases) {
      const parsed = parseRetractionRecordLine(JSON.stringify(raw), 2);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) throw new Error(`expected rejection for ${needle}`);
      expect(parsed.issue.message).toContain(needle);
    }
  });

  test("a JSON array/scalar line is rejected, not coerced", () => {
    expect(parseRetractionRecordLine("[]", 1).ok).toBe(false);
    expect(parseRetractionRecordLine('"x"', 1).ok).toBe(false);
  });

  test("an unknown extra key is rejected (additionalProperties:false, schemas/retraction.v1.json)", () => {
    const raw = {
      schemaVersion: "1", ordinal: 0, itemId: "lem-a", contentHash: HASH_B,
      hashDomain: "af-canonical", retractedBy: "TJO", reason: "r", surprise: true,
    };
    const parsed = parseRetractionRecordLine(JSON.stringify(raw), 5);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("unreachable");
    expect(parsed.issue.message).toContain("surprise");
  });
});
