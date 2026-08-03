// 1:1 test file for src/drive/retraction-store-io.ts (rk-0ehr / P1): the ONE fs edge around
// `.rk/retractions.jsonl`. Real (temp-dir) filesystem, same convention as
// test/drive/l5-store-io.test.ts. Covers: missing-file is a legitimate empty state, append-only by
// construction, ordinal continuity across separate calls, refusal to append through a corrupt
// store, and clock injection (the pure core never reads a clock — L3).

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  appendRetraction,
  appendRetractions,
  readRetractionStore,
  retractionStorePath,
} from "../../src/drive/retraction-store-io";
import type { RetractionInput } from "../../src/drive/retraction-record";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmpRoot(): string {
  const d = mkdtempSync(join(tmpdir(), "rk-retraction-io-"));
  dirs.push(d);
  return d;
}

function input(over: Partial<RetractionInput> = {}): RetractionInput {
  return {
    itemId: "lem-a",
    contentHash: HASH_A,
    hashDomain: "l5-shard-bytes",
    retractedBy: "TJO",
    reason: "independent sweep found a gap",
    ...over,
  };
}

const FIXED_CLOCK = () => "2026-08-03T00:00:00.000Z";

describe("readRetractionStore", () => {
  test("a missing ledger file is a legitimate empty state, never an error", () => {
    expect(readRetractionStore(tmpRoot())).toEqual({ records: [], issues: [] });
  });

  test("retractionStorePath is the campaign-repo-relative .rk/retractions.jsonl", () => {
    const root = tmpRoot();
    expect(retractionStorePath(root)).toBe(join(root, ".rk", "retractions.jsonl"));
  });
});

describe("appendRetractions", () => {
  test("appends one newline-terminated line per accepted record, with edge-supplied appendedAt", () => {
    const root = tmpRoot();
    const result = appendRetractions(root, [input()], FIXED_CLOCK);
    expect(result.ok).toBe(true);
    expect(result.appended).toHaveLength(1);
    expect(result.appended[0]!.ordinal).toBe(0);
    expect(result.appended[0]!.appendedAt).toBe("2026-08-03T00:00:00.000Z");

    const raw = readFileSync(retractionStorePath(root), "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.split("\n").filter((l) => l.length > 0)).toHaveLength(1);
  });

  test("APPEND-ONLY: a second call preserves every earlier record and continues the ordinal chain", () => {
    const root = tmpRoot();
    appendRetraction(root, input(), FIXED_CLOCK);
    appendRetraction(root, input({ itemId: "lem-b", contentHash: HASH_B }), FIXED_CLOCK);

    const parsed = readRetractionStore(root);
    expect(parsed.issues).toEqual([]);
    expect(parsed.records.map((r) => [r.ordinal, r.itemId])).toEqual([[0, "lem-a"], [1, "lem-b"]]);
  });

  test("a rejected input contributes NOTHING to the write; the good ones still land", () => {
    const root = tmpRoot();
    const result = appendRetractions(root, [input(), input({ reason: "  " })], FIXED_CLOCK);
    expect(result.ok).toBe(false);
    expect(result.appended).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.reason).toContain("reason");

    const parsed = readRetractionStore(root);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.issues).toEqual([]); // never a partial/garbage line on disk
  });

  test("REFUSES to append through a corrupt store — writes nothing, rejects everything", () => {
    const root = tmpRoot();
    appendRetraction(root, input(), FIXED_CLOCK);
    const path = retractionStorePath(root);
    writeFileSync(path, readFileSync(path, "utf8") + "{truncated\n", "utf8");

    const before = readFileSync(path, "utf8");
    const result = appendRetractions(root, [input({ itemId: "lem-c" })], FIXED_CLOCK);
    expect(result.ok).toBe(false);
    expect(result.appended).toEqual([]);
    expect(result.rejected[0]!.reason).toContain("store integrity compromised");
    expect(readFileSync(path, "utf8")).toBe(before); // not one byte written
  });

  test("a corrupted on-disk line is LOUD on read, never silently swallowed", () => {
    const root = tmpRoot();
    mkdirSync(dirname(retractionStorePath(root)), { recursive: true });
    writeFileSync(retractionStorePath(root), "not json at all\n", "utf8");
    const parsed = readRetractionStore(root);
    expect(parsed.records).toEqual([]);
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0]!.line).toBe(1);
  });
});
