// rk-0ehr / P1: the retraction ledger's PURE query core — liveness (the hash binding), the
// append-only ordinal chain, and store health. Mirrors test/drive/l5-store.test.ts's discipline;
// the property that matters is that a retraction is live iff the item's CURRENT hash still equals
// the record's, IN THE MATCHING DOMAIN — the two pinned domains are never cross-compared.

import { describe, expect, test } from "bun:test";
import { buildRetractionRecord, serializeRetractionRecord, type RetractionInput, type RetractionRecord } from "../../src/drive/retraction-record";
import {
  assessRetractionOrdinalChain,
  liveRetractionFor,
  liveRetractionsByItem,
  parseRetractionLog,
  retractionStoreHealthy,
  retractedItemIds,
} from "../../src/drive/retraction-store";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function rec(over: Partial<RetractionInput> & { ordinal: number }): RetractionRecord {
  const { ordinal, ...rest } = over;
  const built = buildRetractionRecord(
    {
      itemId: "lem-a",
      contentHash: HASH_A,
      hashDomain: "l5-shard-bytes",
      retractedBy: "audit:sweep",
      reason: "defective step 3",
      ...rest,
    },
    ordinal,
  );
  if (!built.ok) throw new Error(built.reason);
  return built.record;
}

describe("liveRetractionFor — the hash binding", () => {
  test("a retraction is LIVE while the item's current hash still equals the record's", () => {
    const records = [rec({ ordinal: 0 })];
    const live = liveRetractionFor(records, "lem-a", HASH_A, "l5-shard-bytes");
    expect(live?.ordinal).toBe(0);
  });

  test("editing the artifact changes the hash and the retraction stops binding", () => {
    const records = [rec({ ordinal: 0 })];
    expect(liveRetractionFor(records, "lem-a", HASH_B, "l5-shard-bytes")).toBeUndefined();
  });

  test("the two pinned hash domains are NEVER cross-compared", () => {
    const records = [rec({ ordinal: 0, hashDomain: "af-canonical" })];
    // Identical hash VALUE, wrong domain -> not live. A retraction binds in exactly one domain.
    expect(liveRetractionFor(records, "lem-a", HASH_A, "l5-shard-bytes")).toBeUndefined();
    expect(liveRetractionFor(records, "lem-a", HASH_A, "af-canonical")?.ordinal).toBe(0);
  });

  test("another item's retraction never binds to this one", () => {
    const records = [rec({ ordinal: 0, itemId: "lem-other" })];
    expect(liveRetractionFor(records, "lem-a", HASH_A, "l5-shard-bytes")).toBeUndefined();
  });

  test("with several live records for one item the HIGHEST ordinal wins", () => {
    const records = [rec({ ordinal: 0, reason: "first" }), rec({ ordinal: 1, reason: "second" })];
    expect(liveRetractionFor(records, "lem-a", HASH_A, "l5-shard-bytes")?.reason).toBe("second");
  });

  test("a stale record never resurrects a live one, and vice versa", () => {
    const records = [rec({ ordinal: 0, contentHash: HASH_A }), rec({ ordinal: 1, contentHash: HASH_B })];
    // Current bytes hash to A: only the ordinal-0 record binds, even though a LATER record exists.
    expect(liveRetractionFor(records, "lem-a", HASH_A, "l5-shard-bytes")?.ordinal).toBe(0);
    expect(liveRetractionFor(records, "lem-a", HASH_B, "l5-shard-bytes")?.ordinal).toBe(1);
  });

  test("empty store answers 'not retracted', never a throw", () => {
    expect(liveRetractionFor([], "lem-a", HASH_A, "l5-shard-bytes")).toBeUndefined();
  });
});

describe("liveRetractionsByItem / retractedItemIds", () => {
  test("maps every item with a live retraction in the given domain, and only those", () => {
    const records = [
      rec({ ordinal: 0, itemId: "lem-a", contentHash: HASH_A }),
      rec({ ordinal: 1, itemId: "lem-b", contentHash: HASH_A }),
      rec({ ordinal: 2, itemId: "lem-c", contentHash: HASH_A, hashDomain: "af-canonical" }),
    ];
    const current = new Map([["lem-a", HASH_A], ["lem-b", HASH_B], ["lem-c", HASH_A]]);
    const live = liveRetractionsByItem(records, current, "l5-shard-bytes");
    expect([...live.keys()]).toEqual(["lem-a"]); // lem-b edited (stale), lem-c is the other domain
  });

  test("retractedItemIds lists every item the ledger ever mentions, sorted (coverage, never a silent skip)", () => {
    const records = [rec({ ordinal: 0, itemId: "lem-z" }), rec({ ordinal: 1, itemId: "lem-a" }), rec({ ordinal: 2, itemId: "lem-a" })];
    expect(retractedItemIds(records)).toEqual(["lem-a", "lem-z"]);
  });
});

describe("parseRetractionLog", () => {
  test("parses a well-formed multi-line log, trailing newline is not data loss", () => {
    const text = [rec({ ordinal: 0 }), rec({ ordinal: 1, itemId: "lem-b" })].map(serializeRetractionRecord).join("\n") + "\n";
    const parsed = parseRetractionLog(text);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.issues).toHaveLength(0);
  });

  test("an empty file is a legitimate empty store", () => {
    expect(parseRetractionLog("")).toEqual({ records: [], issues: [] });
  });

  test("a corrupted line is NEVER silently dropped — reported with its line number", () => {
    const text = serializeRetractionRecord(rec({ ordinal: 0 })) + "\n{truncated\n";
    const parsed = parseRetractionLog(text);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0]!.line).toBe(2);
  });

  test("a blank line in the MIDDLE of the log is an issue, not a skip", () => {
    const text = serializeRetractionRecord(rec({ ordinal: 0 })) + "\n\n" + serializeRetractionRecord(rec({ ordinal: 1 })) + "\n";
    expect(parseRetractionLog(text).issues).toHaveLength(1);
  });
});

describe("ordinal chain + store health (fail-closed, mirroring l5StoreHealthy)", () => {
  test("a contiguous 0,1,2 chain is intact", () => {
    expect(assessRetractionOrdinalChain([rec({ ordinal: 0 }), rec({ ordinal: 1 }), rec({ ordinal: 2 })])).toEqual([]);
  });

  test("a gap, a duplicate, a reorder, and a truncated prefix are each caught", () => {
    expect(assessRetractionOrdinalChain([rec({ ordinal: 0 }), rec({ ordinal: 2 })]).length).toBeGreaterThan(0);
    expect(assessRetractionOrdinalChain([rec({ ordinal: 0 }), rec({ ordinal: 0 })]).length).toBeGreaterThan(0);
    expect(assessRetractionOrdinalChain([rec({ ordinal: 1 }), rec({ ordinal: 0 })]).length).toBeGreaterThan(0);
    expect(assessRetractionOrdinalChain([rec({ ordinal: 1 })]).length).toBeGreaterThan(0);
  });

  test("ANY parse issue poisons the whole store — a truncated line's own itemId is unknowable", () => {
    const parsed = parseRetractionLog(serializeRetractionRecord(rec({ ordinal: 0 })) + "\ngarbage\n");
    const health = retractionStoreHealthy(parsed);
    expect(health.healthy).toBe(false);
    expect(health.problems.length).toBeGreaterThan(0);
    expect(health.problems[0]).toContain("line 2");
  });

  test("a clean store is healthy with zero problems", () => {
    const text = [rec({ ordinal: 0 }), rec({ ordinal: 1 })].map(serializeRetractionRecord).join("\n") + "\n";
    expect(retractionStoreHealthy(parseRetractionLog(text))).toEqual({ healthy: true, problems: [] });
  });
});
