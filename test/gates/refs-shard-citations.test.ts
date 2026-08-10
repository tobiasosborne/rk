// Gate 3 argument-shard citations (rk-uqxh). `rk refs quote` emits a two-line
// `refs/<path>:<line>` + `"<byte-verbatim quote>"` pair; cited argument shards embed that pair
// in their Markdown body. These tests pin per-run exact-byte, locus, and adopted-hash checks.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runFixture } from "../../src/corpus/run";
import { DEFAULT_GATE_CONFIG } from "../../src/gates/config";
import { formatCoverageLine } from "../../src/gates/framework";
import { refsGate } from "../../src/gates/refs";
import { sha256Hex } from "../../src/gates/sha256";
import { snapshotFromFiles, type RepoSnapshot } from "../../src/gates/snapshot";

const SOURCE_PATH = "refs/sources/paper.txt";
const SOURCE_TEXT = "heading\nThe cited sentence is byte-verbatim.\ntrailer\n";

function lockFor(path: string, text: string): string {
  return JSON.stringify({
    files: [{
      path: path.slice("refs/".length),
      sha256: sha256Hex(new TextEncoder().encode(text)),
      source_id: "paper",
      fetch: null,
    }],
  });
}

function shard(body: string, status = "cited"): string {
  return `---\nid: lem-literature\nkind: lemma\nstatus: ${status}\naf: none\ncontract: Literature fact.\n---\n\n${body}\n`;
}

function snap(shardBody: string, extras: Record<string, string> = {}, status = "cited"): RepoSnapshot {
  return snapshotFromFiles({ "argument/lem-literature.md": shard(shardBody, status), ...extras });
}

function errors(result: ReturnType<typeof refsGate.run>): string[] {
  return result.findings.filter((f) => f.severity === "ERROR").map((f) => f.message);
}

describe("Gate 3 — argument-shard citation byte verification", () => {
  test("green: an adopted, hash-matching quote at the emitted line is checked 1/1", () => {
    const result = refsGate.run(snap(
      `    ${SOURCE_PATH}:2\n    "The cited sentence is byte-verbatim."`,
      {
        [SOURCE_PATH]: SOURCE_TEXT,
        "refs/manifest/sources.lock.json": lockFor(SOURCE_PATH, SOURCE_TEXT),
      },
    ), DEFAULT_GATE_CONFIG);

    expect(errors(result)).toEqual([]);
    expect(formatCoverageLine(result.coverage[0]!)).toContain("checked 1/1 shard citations");
  });

  test("red incident: an edited quote that no longer matches is ERROR and checked 0/1", () => {
    const result = refsGate.run(snap(
      `    ${SOURCE_PATH}:2\n    "The edited sentence is no longer verbatim."`,
      {
        [SOURCE_PATH]: SOURCE_TEXT,
        "refs/manifest/sources.lock.json": lockFor(SOURCE_PATH, SOURCE_TEXT),
      },
    ), DEFAULT_GATE_CONFIG);

    expect(errors(result).some((m) => m.includes("NOT found byte-for-byte at recorded locus"))).toBe(true);
    expect(formatCoverageLine(result.coverage[0]!)).toContain("checked 0/1 shard citations");
  });

  test("a quote found elsewhere but not on its recorded line is an unresolvable-locus ERROR", () => {
    const result = refsGate.run(snap(
      `    ${SOURCE_PATH}:3\n    "The cited sentence is byte-verbatim."`,
      {
        [SOURCE_PATH]: SOURCE_TEXT,
        "refs/manifest/sources.lock.json": lockFor(SOURCE_PATH, SOURCE_TEXT),
      },
    ), DEFAULT_GATE_CONFIG);

    expect(errors(result).some((m) => m.includes("NOT found byte-for-byte at recorded locus line 3"))).toBe(true);
  });

  test("a non-numeric locus is recognized but ERRORs as unresolvable", () => {
    const result = refsGate.run(snap(
      `    ${SOURCE_PATH}:section-two\n    "The cited sentence is byte-verbatim."`,
      {
        [SOURCE_PATH]: SOURCE_TEXT,
        "refs/manifest/sources.lock.json": lockFor(SOURCE_PATH, SOURCE_TEXT),
      },
    ), DEFAULT_GATE_CONFIG);

    expect(errors(result).some((m) => m.includes("no resolvable positive line locus"))).toBe(true);
  });

  test("a missing source payload is ERROR, never an unchecked cited green", () => {
    const missing = "refs/sources/missing.txt";
    const result = refsGate.run(snap(`    ${missing}:1\n    "unavailable quote"`), DEFAULT_GATE_CONFIG);

    expect(errors(result).some((m) => m.includes("source payload") && m.includes("ABSENT"))).toBe(true);
    expect(formatCoverageLine(result.coverage[0]!)).toContain("checked 0/1 shard citations");
  });

  test("a present payload absent from the adoption lock is ERROR as unhashed", () => {
    const result = refsGate.run(snap(
      `    ${SOURCE_PATH}:2\n    "The cited sentence is byte-verbatim."`,
      { [SOURCE_PATH]: SOURCE_TEXT },
    ), DEFAULT_GATE_CONFIG);

    expect(errors(result).some((m) => m.includes("not hash-pinned"))).toBe(true);
  });

  test("payload drift from its adopted sha256 is ERROR even when the quote still matches", () => {
    const original = SOURCE_TEXT;
    const drifted = `${SOURCE_TEXT}post-adoption edit\n`;
    const result = refsGate.run(snap(
      `    ${SOURCE_PATH}:2\n    "The cited sentence is byte-verbatim."`,
      {
        [SOURCE_PATH]: drifted,
        "refs/manifest/sources.lock.json": lockFor(SOURCE_PATH, original),
      },
    ), DEFAULT_GATE_CONFIG);

    expect(errors(result).some((m) => m.includes("sha256") && m.includes("does not match"))).toBe(true);
  });

  test("cited with no recognizable rk refs quote pair fails the zero-coverage guard", () => {
    const result = refsGate.run(snap("Prose claims this came from a paper, without a quote pointer."), DEFAULT_GATE_CONFIG);

    expect(errors(result).some((m) => m.includes("status cited") && m.includes("no recognizable"))).toBe(true);
    expect(errors(result).some((m) => m.includes("zero byte-verified shard citations"))).toBe(true);
    expect(formatCoverageLine(result.coverage[0]!)).toContain("checked 0/1 shard citations");
  });

  test("a non-cited shard carrying an rk refs quote pair is still verified", () => {
    const result = refsGate.run(snap(
      `    ${SOURCE_PATH}:2\n    "The cited sentence is byte-verbatim."`,
      {
        [SOURCE_PATH]: SOURCE_TEXT,
        "refs/manifest/sources.lock.json": lockFor(SOURCE_PATH, SOURCE_TEXT),
      },
      "stated",
    ), DEFAULT_GATE_CONFIG);

    expect(errors(result)).toEqual([]);
    expect(formatCoverageLine(result.coverage[0]!)).toContain("checked 1/1 shard citations");
  });

  test("every quote pair in one shard is checked, not only the first", () => {
    const result = refsGate.run(snap(
      `    ${SOURCE_PATH}:2\n    "The cited sentence is byte-verbatim."\n\n    ${SOURCE_PATH}:3\n    "trailer"`,
      {
        [SOURCE_PATH]: SOURCE_TEXT,
        "refs/manifest/sources.lock.json": lockFor(SOURCE_PATH, SOURCE_TEXT),
      },
    ), DEFAULT_GATE_CONFIG);

    expect(errors(result)).toEqual([]);
    expect(formatCoverageLine(result.coverage[0]!)).toContain("checked 2/2 shard citations");
  });
});

describe("Gate 3 shard-citation corpus fixtures", () => {
  const corpusRoot = join(import.meta.dir, "..", "..", "corpus");
  for (const id of ["refs-12", "refs-13", "refs-14"]) {
    test(id, async () => {
      const result = await runFixture(corpusRoot, "refs", id);
      expect(result.errors).toEqual([]);
    });
  }
});
