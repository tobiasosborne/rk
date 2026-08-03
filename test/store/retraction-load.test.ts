// 1:1 test file for src/store/retraction-load.ts (rk-0ehr / P1) — the graph pipeline's edge over
// `.rk/retractions.jsonl`. This is the ONE layer that resolves LIVENESS (the pure graph core never
// hashes a file), so the tests here are about exactly that: a real hash comparison in the
// `l5-shard-bytes` domain, and the documented fail-closed default in the `af-canonical` one.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRetractionSource } from "../../src/store/retraction-load";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(ledger?: string): string {
  const root = mkdtempSync(join(tmpdir(), "rk-retraction-load-"));
  dirs.push(root);
  if (ledger !== undefined) {
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "retractions.jsonl"), ledger, "utf8");
  }
  return root;
}

function line(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: "1", ordinal: 0, itemId: "lem-a", contentHash: HASH_A,
    hashDomain: "l5-shard-bytes", retractedBy: "TJO", reason: "withdrawn after audit", ...over,
  });
}

describe("loadRetractionSource — presence", () => {
  test("no ledger file at all -> absent, no records, structurally fine", () => {
    const source = loadRetractionSource(repo(), new Map());
    expect(source.present).toBe(false);
    expect(source.healthy).toBe(true);
    expect(source.records).toEqual([]);
    expect(source.problems).toEqual([]);
  });

  test("an empty ledger is present-but-empty, distinct from absent", () => {
    const source = loadRetractionSource(repo(""), new Map());
    expect(source.present).toBe(true);
    expect(source.records).toEqual([]);
  });
});

describe("loadRetractionSource — liveness in the l5-shard-bytes domain is a real hash comparison", () => {
  test("current hash equals the record's -> live, and the comparison was actually observed", () => {
    const source = loadRetractionSource(repo(line() + "\n"), new Map([["lem-a", HASH_A]]));
    expect(source.records).toHaveLength(1);
    expect(source.records[0]!.live).toBe(true);
    expect(source.records[0]!.currentHashObserved).toBe(true);
  });

  test("the item was edited -> NOT live, and the release was observed, not assumed", () => {
    const source = loadRetractionSource(repo(line() + "\n"), new Map([["lem-a", HASH_B]]));
    expect(source.records[0]!.live).toBe(false);
    expect(source.records[0]!.currentHashObserved).toBe(true);
  });

  test("no current hash available for the item -> FAIL CLOSED: live, and honestly unobserved", () => {
    const source = loadRetractionSource(repo(line() + "\n"), new Map());
    expect(source.records[0]!.live).toBe(true);
    expect(source.records[0]!.currentHashObserved).toBe(false);
  });
});

describe("loadRetractionSource — the af-canonical domain fails closed, and says so", () => {
  test("live regardless of any l5-domain hash, currentHashObserved false (rk cannot read af's hash)", () => {
    const ledger = line({ hashDomain: "af-canonical", contentHash: HASH_B }) + "\n";
    const source = loadRetractionSource(repo(ledger), new Map([["lem-a", HASH_A]]));
    expect(source.records[0]!.live).toBe(true);
    expect(source.records[0]!.currentHashObserved).toBe(false);
  });
});

describe("loadRetractionSource — fail closed on corruption", () => {
  test("a truncated line poisons the store: unhealthy, ZERO records, problems reported", () => {
    const source = loadRetractionSource(repo(line() + "\n{truncated\n"), new Map([["lem-a", HASH_A]]));
    expect(source.present).toBe(true);
    expect(source.healthy).toBe(false);
    expect(source.records).toEqual([]);
    expect(source.problems.length).toBeGreaterThan(0);
  });

  test("a broken ordinal chain is equally fatal", () => {
    const ledger = [line(), line({ ordinal: 5, itemId: "lem-b" })].join("\n") + "\n";
    const source = loadRetractionSource(repo(ledger), new Map());
    expect(source.healthy).toBe(false);
    expect(source.records).toEqual([]);
  });
});

describe("loadRetractionSource — projection shape", () => {
  test("every record field the graph edge carries is passed through unmodified", () => {
    const ledger = line({ retractedBy: "audit:x", reason: "why", ordinal: 0 }) + "\n";
    const source = loadRetractionSource(repo(ledger), new Map([["lem-a", HASH_A]]));
    expect(source.records[0]).toEqual({
      itemId: "lem-a", ordinal: 0, contentHash: HASH_A, hashDomain: "l5-shard-bytes",
      retractedBy: "audit:x", reason: "why", live: true, currentHashObserved: true,
    });
  });
});
