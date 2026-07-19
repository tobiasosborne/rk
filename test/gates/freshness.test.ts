// Unit tests for Gate 7 — freshness (src/gates/freshness.ts, M2.6, docs/gate-contracts.md's
// "Gate 7 — freshness"). corpus/freshness/freshness-01..05 (test/corpus.test.ts) cover the
// gate end-to-end through the real snapshot loader; these tests isolate the pure functions
// directly (manifest parsing, the Check-11 supersession boundary, first-diff-line reporting)
// against hand-built snapshots, faster to iterate on than a fixture directory.

import { describe, expect, test } from "bun:test";
import { freshnessGate, freshnessSupersededPaths, MANIFEST_PATH } from "../../src/gates/freshness";
import { checkGenerated, renderIndex } from "../../src/gates/linker-render";
import { parseRegistry } from "../../src/gates/linker-parse";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { DEFAULT_GATE_CONFIG } from "../../src/gates/config";

const LEMMA = `---
id: lem-simple
kind: lemma
status: stated
af: none
contract: Simple contract text.
---
`;

function manifest(entries: Array<{ path: string; generator: string }>): string {
  return JSON.stringify({ schema_version: "1", entries });
}

describe("freshnessGate: manifest presence-conditional (whole-mechanism)", () => {
  test("no .rk/generated.json at all -> zero findings, coverage names non-adoption, 0/0", () => {
    const snapshot = snapshotFromFiles({ "argument/lemmas/lem-simple.md": LEMMA });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings).toEqual([]);
    expect(result.coverage).toEqual([
      { gate: "freshness", unit: `generated artifacts (manifest not adopted: ${MANIFEST_PATH} absent)`, checked: 0, total: 0 },
    ]);
  });

  test("manifest present, entries: [] -> adopted-but-empty is distinct from not-adopted, still 0/0", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: manifest([]),
    });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings).toEqual([]);
    expect(result.coverage[0]!.unit).not.toContain("not adopted");
    expect(result.coverage[0]!.checked).toBe(0);
    expect(result.coverage[0]!.total).toBe(0);
  });
});

describe("freshnessGate: regenerate-and-diff over a declared linker-index entry", () => {
  function repoWithIndex(indexContent: string) {
    return snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      "argument/INDEX.md": indexContent,
      [MANIFEST_PATH]: manifest([{ path: "argument/INDEX.md", generator: "linker-index" }]),
    });
  }

  test("clean regenerate: byte-identical INDEX.md -> zero findings, checked=1/1", () => {
    const { lemmas } = parseRegistry(
      snapshotFromFiles({ "argument/lemmas/lem-simple.md": LEMMA }),
    );
    const fresh = renderIndex(lemmas);
    const result = freshnessGate.run(repoWithIndex(fresh), DEFAULT_GATE_CONFIG);
    expect(result.findings).toEqual([]);
    expect(result.coverage).toEqual([{ gate: "freshness", unit: "generated artifacts", checked: 1, total: 1 }]);
  });

  test("hand-edited INDEX.md -> ERROR naming the file and the first differing line", () => {
    const result = freshnessGate.run(repoWithIndex("hand-edited nonsense, not a real render\n"), DEFAULT_GATE_CONFIG);
    expect(result.findings.length).toBe(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("ERROR");
    expect(f.path).toBe("argument/INDEX.md");
    expect(f.message).toContain("is STALE");
    expect(f.message).toContain("first difference at line 1");
    expect(result.coverage[0]!.checked).toBe(1);
    expect(result.coverage[0]!.total).toBe(1);
  });

  test("declared but missing: manifest names a path absent from the snapshot -> ERROR", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: manifest([{ path: "argument/INDEX.md", generator: "linker-index" }]),
    });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.path).toBe("argument/INDEX.md");
    expect(result.findings[0]!.message).toContain("declared in .rk/generated.json");
    expect(result.findings[0]!.message).toContain("absent from the repo");
  });

  test("unrecognized generator id: never an ERROR, named 'not adopted' on the coverage line, excluded from checked", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      "build/site/index.html": "<html></html>",
      [MANIFEST_PATH]: manifest([{ path: "build/site/index.html", generator: "render-html-v2" }]),
    });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings).toEqual([]);
    expect(result.coverage[0]!.checked).toBe(0);
    expect(result.coverage[0]!.total).toBe(1);
    expect(result.coverage[0]!.unit).toContain("1 not adopted");
    expect(result.coverage[0]!.unit).toContain("render-html-v2");
  });
});

describe("freshnessGate: malformed manifest is a loud ERROR, never a crash and never silent-absent", () => {
  test("not valid JSON -> ERROR at .rk/generated.json:1, never treated as 'manifest absent'", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: "{ not json ,,, }",
    });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.path).toBe(MANIFEST_PATH);
    expect(result.findings[0]!.message).toContain("not valid JSON");
    // Must NOT read as the presence-conditional golden pass — that would silently swallow a
    // real, visible defect (a malformed manifest) into the "never adopted" green state.
    expect(result.coverage[0]!.unit).not.toContain("not adopted:");
  });

  test("valid JSON, wrong top-level shape (no 'entries' array) -> ERROR", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: JSON.stringify({ schema_version: "1" }),
    });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]!.message).toContain('expected a JSON object with an "entries" array');
  });

  test("one malformed entry (missing 'generator') is a per-entry ERROR; well-formed siblings still check", () => {
    const { lemmas } = parseRegistry(snapshotFromFiles({ "argument/lemmas/lem-simple.md": LEMMA }));
    const fresh = renderIndex(lemmas);
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      "argument/INDEX.md": fresh,
      [MANIFEST_PATH]: JSON.stringify({
        schema_version: "1",
        entries: [{ path: "argument/INDEX.md", generator: "linker-index" }, { path: "argument/DAG.md" }],
      }),
    });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    const shapeErrors = result.findings.filter((f) => f.message.includes("entries[1]"));
    expect(shapeErrors.length).toBe(1);
    // The well-formed sibling entry (INDEX.md) is still individually checked and clean.
    expect(result.coverage[0]!.checked).toBe(1);
  });
});

describe("freshnessSupersededPaths: the Gate 2 Check 11 boundary", () => {
  test("empty/absent manifest supersedes nothing", () => {
    const snapshot = snapshotFromFiles({ "argument/lemmas/lem-simple.md": LEMMA });
    expect(freshnessSupersededPaths(snapshot).size).toBe(0);
  });

  test("a declared entry with a RECOGNIZED generator supersedes exactly its path", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: manifest([{ path: "argument/INDEX.md", generator: "linker-index" }]),
    });
    const superseded = freshnessSupersededPaths(snapshot);
    expect(superseded.has("argument/INDEX.md")).toBe(true);
    expect(superseded.has("argument/DAG.md")).toBe(false);
  });

  test("a declared entry with an UNRECOGNIZED generator supersedes nothing (no silent gap)", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: manifest([{ path: "argument/INDEX.md", generator: "future-html-render" }]),
    });
    expect(freshnessSupersededPaths(snapshot).size).toBe(0);
  });

  test("checkGenerated (Gate 2 Check 11) skips a superseded path entirely, even when it is stale", () => {
    const { lemmas } = parseRegistry(snapshotFromFiles({ "argument/lemmas/lem-simple.md": LEMMA }));
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      "argument/INDEX.md": "definitely stale, not a real render\n",
    });
    const superseded = new Set(["argument/INDEX.md"]);
    const { findings, mirrorStatus } = checkGenerated(snapshot, lemmas, superseded);
    expect(findings).toEqual([]);
    const indexStatus = mirrorStatus.find((m) => m.path === "argument/INDEX.md")!;
    expect(indexStatus.superseded).toBe(true);
  });

  test("checkGenerated's default (no superseded set) is byte-identical to pre-M2.6 behavior — a stale mirror still ERRORs", () => {
    const { lemmas } = parseRegistry(snapshotFromFiles({ "argument/lemmas/lem-simple.md": LEMMA }));
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      "argument/INDEX.md": "definitely stale, not a real render\n",
    });
    const { findings } = checkGenerated(snapshot, lemmas);
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toContain("STALE");
  });
});
