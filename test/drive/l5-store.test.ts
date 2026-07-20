// 1:1 test file for src/drive/l5-store.ts (M3.7): the L5 verdict store's query core. Ground truth
// is the WP brief's own property list: "append-then-edit stales; re-append after edit refreshes;
// two verdicts for one shard -> latest-by-ordinal wins; corrupted-tail detection; round-trip
// byte-stability" (round-trip stability is covered in test/drive/l5-record.test.ts; this file
// covers the remaining four plus the coverage/reporting shapes).

import { describe, expect, test } from "bun:test";
import { assessL5OrdinalChain, coverage, freshVerdicts, knownShardIds, l5StoreHealthy, latestVerdictFor, parseL5Log } from "../../src/drive/l5-store";
import { serializeL5StoredVerdict, type L5StoredVerdict } from "../../src/drive/l5-record";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function rec(overrides: Partial<L5StoredVerdict> = {}): L5StoredVerdict {
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

describe("latestVerdictFor", () => {
  test("absent when no record exists for the shard", () => {
    expect(latestVerdictFor([rec({ itemId: "other" })], "lem-1", HASH_A)).toBeUndefined();
  });

  test("fresh: true when the latest record's bound hash matches currentHash", () => {
    const latest = latestVerdictFor([rec({ l5ContentHash: HASH_A })], "lem-1", HASH_A);
    expect(latest).toEqual({ verdict: "VALID", fresh: true, record: rec({ l5ContentHash: HASH_A }) });
  });

  test("PROPERTY: append-then-edit stales — a record bound to the OLD hash reads stale once currentHash changes", () => {
    const latest = latestVerdictFor([rec({ l5ContentHash: HASH_A })], "lem-1", HASH_B);
    expect(latest?.fresh).toBe(false);
  });

  test("PROPERTY: re-append after edit refreshes — a NEWER record bound to the new hash reads fresh again", () => {
    const records = [rec({ ordinal: 0, l5ContentHash: HASH_A }), rec({ ordinal: 1, l5ContentHash: HASH_B })];
    const latest = latestVerdictFor(records, "lem-1", HASH_B);
    expect(latest?.fresh).toBe(true);
    expect(latest?.record.ordinal).toBe(1);
  });

  test("PROPERTY: two verdicts for one shard -- latest-by-ordinal wins, REGARDLESS of input order", () => {
    const inOrder = [rec({ ordinal: 0, verdict: "INVALID" }), rec({ ordinal: 5, verdict: "VALID" })];
    const reversed = [rec({ ordinal: 5, verdict: "VALID" }), rec({ ordinal: 0, verdict: "INVALID" })];
    expect(latestVerdictFor(inOrder, "lem-1", HASH_A)?.verdict).toBe("VALID");
    expect(latestVerdictFor(reversed, "lem-1", HASH_A)?.verdict).toBe("VALID");
  });

  test("MUTATION-PROOF: a higher ordinal with a DIFFERENT (non-matching) hash still supersedes an older fresh-looking record", () => {
    // If latest-by-ordinal were implemented as "prefer whichever record's hash matches
    // currentHash" instead of "always the highest ordinal, then check ITS freshness," this test
    // would read fresh:true (ordinal 0 matches). The contract requires the superseding record's
    // own freshness to govern, even though it reads stale here.
    const records = [rec({ ordinal: 0, l5ContentHash: HASH_A }), rec({ ordinal: 1, l5ContentHash: HASH_C })];
    const latest = latestVerdictFor(records, "lem-1", HASH_A);
    expect(latest?.record.ordinal).toBe(1);
    expect(latest?.fresh).toBe(false);
  });
});

describe("assessL5OrdinalChain — BLOCKER 6: append-only ordinal integrity", () => {
  test("a healthy contiguous chain 0,1,2 has no problems", () => {
    expect(assessL5OrdinalChain([rec({ ordinal: 0 }), rec({ ordinal: 1 }), rec({ ordinal: 2 })])).toEqual([]);
  });

  test("an empty log has no problems", () => {
    expect(assessL5OrdinalChain([])).toEqual([]);
  });

  test("a DUPLICATE ordinal is a chain problem (two records claim the same append position)", () => {
    const problems = assessL5OrdinalChain([rec({ ordinal: 0 }), rec({ ordinal: 1 }), rec({ ordinal: 1 })]);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(" ")).toContain("duplicate ordinal 1");
  });

  test("a GAP breaks the contiguous chain (a cleanly-deleted line, no parse issue to catch it)", () => {
    const problems = assessL5OrdinalChain([rec({ ordinal: 0 }), rec({ ordinal: 2 })]);
    expect(problems.length).toBeGreaterThan(0);
  });

  test("OUT-OF-ORDER ordinals in file order are a chain problem", () => {
    const problems = assessL5OrdinalChain([rec({ ordinal: 1 }), rec({ ordinal: 0 })]);
    expect(problems.length).toBeGreaterThan(0);
  });

  test("a log that does not start at 0 (truncated prefix) is a chain problem", () => {
    const problems = assessL5OrdinalChain([rec({ ordinal: 3 }), rec({ ordinal: 4 })]);
    expect(problems.length).toBeGreaterThan(0);
  });
});

describe("l5StoreHealthy — BLOCKER 6: parse issues OR chain problems poison the store", () => {
  test("healthy when there are no parse issues and the chain is contiguous", () => {
    const text = serializeL5StoredVerdict(rec({ ordinal: 0 })) + "\n" + serializeL5StoredVerdict(rec({ ordinal: 1 })) + "\n";
    expect(l5StoreHealthy(parseL5Log(text)).healthy).toBe(true);
  });

  test("a parse issue (corrupted tail) poisons health", () => {
    const good = serializeL5StoredVerdict(rec({ ordinal: 0 }));
    const text = good + "\n" + '{"schemaVersion":"1","ordinal":1,"itemId":"x"'; // truncated
    const h = l5StoreHealthy(parseL5Log(text));
    expect(h.healthy).toBe(false);
    expect(h.problems.length).toBeGreaterThan(0);
  });

  test("a duplicate ordinal (both lines parse) poisons health", () => {
    const text = serializeL5StoredVerdict(rec({ ordinal: 0 })) + "\n" + serializeL5StoredVerdict(rec({ ordinal: 0 })) + "\n";
    expect(l5StoreHealthy(parseL5Log(text)).healthy).toBe(false);
  });
});

describe("knownShardIds", () => {
  test("every distinct itemId, sorted, no duplicates", () => {
    expect(knownShardIds([rec({ itemId: "b" }), rec({ itemId: "a" }), rec({ itemId: "b" })])).toEqual(["a", "b"]);
  });
});

describe("freshVerdicts — the promotion-relevant view", () => {
  test("includes only shards whose latest record is fresh", () => {
    const records = [rec({ itemId: "fresh-one", l5ContentHash: HASH_A }), rec({ itemId: "stale-one", l5ContentHash: HASH_A })];
    const currentHashes = new Map([["fresh-one", HASH_A], ["stale-one", HASH_B]]);
    const result = freshVerdicts(records, currentHashes);
    expect([...result.keys()]).toEqual(["fresh-one"]);
  });

  test("a shard with no record at all is simply absent, never a placeholder entry", () => {
    const result = freshVerdicts([], new Map([["never-dispatched", HASH_A]]));
    expect(result.size).toBe(0);
  });
});

describe("coverage", () => {
  test("classifies every shard into exactly one of fresh/stale/missing, totals sum correctly", () => {
    const records = [rec({ itemId: "fresh-one", l5ContentHash: HASH_A }), rec({ itemId: "stale-one", l5ContentHash: HASH_A })];
    const currentHashes = new Map([["fresh-one", HASH_A], ["stale-one", HASH_B]]);
    const report = coverage(records, ["fresh-one", "stale-one", "never-dispatched"], currentHashes);
    expect(report).toEqual({
      totalShards: 3,
      fresh: 1,
      stale: 1,
      missing: 1,
      staleShardIds: ["stale-one"],
      missingShardIds: ["never-dispatched"],
    });
  });

  test("a shard absent from currentHashes (caller never read its bytes) counts as missing", () => {
    const report = coverage([rec({ itemId: "a" })], ["a"], new Map());
    expect(report.missing).toBe(1);
  });
});

describe("parseL5Log", () => {
  test("empty text parses to zero records, zero issues", () => {
    expect(parseL5Log("")).toEqual({ records: [], issues: [] });
  });

  test("parses every well-formed newline-terminated line, ignoring the one trailing empty element", () => {
    const text = serializeL5StoredVerdict(rec({ ordinal: 0 })) + "\n" + serializeL5StoredVerdict(rec({ ordinal: 1 })) + "\n";
    const { records, issues } = parseL5Log(text);
    expect(issues).toEqual([]);
    expect(records.map((r) => r.ordinal)).toEqual([0, 1]);
  });

  test("PROPERTY: corrupted-tail detection — a truncated final line is reported as an issue, and every earlier record stays readable", () => {
    const good = serializeL5StoredVerdict(rec({ ordinal: 0 }));
    const truncated = '{"schemaVersion":"1","ordinal":1,"itemId":"lem-1","l5ContentHash":"' + HASH_A.slice(0, 10);
    const text = good + "\n" + truncated; // no trailing newline -- exactly what a crash mid-append leaves behind
    const { records, issues } = parseL5Log(text);
    expect(records).toHaveLength(1);
    expect(records[0]!.ordinal).toBe(0);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.line).toBe(2);
  });

  test("a corrupted line in the MIDDLE is also reported, never silently dropped, and does not block a later good line", () => {
    const text = [serializeL5StoredVerdict(rec({ ordinal: 0 })), "{garbage", serializeL5StoredVerdict(rec({ ordinal: 1 }))].join("\n") + "\n";
    const { records, issues } = parseL5Log(text);
    expect(records.map((r) => r.ordinal)).toEqual([0, 1]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.line).toBe(2);
  });

  test("a blank line that is NOT the file's own trailing newline is reported, never silently skipped (L2)", () => {
    const text = serializeL5StoredVerdict(rec({ ordinal: 0 })) + "\n\n" + serializeL5StoredVerdict(rec({ ordinal: 1 })) + "\n";
    const { issues } = parseL5Log(text);
    expect(issues.length).toBeGreaterThan(0);
  });
});
