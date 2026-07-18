// Pins the M1.3 structural/non-structural classification docs/gate-contracts.md "Phase matrix"
// commits to, directly against each gate's real output — not just src/gates/phase.ts's generic
// applyPhase logic (test/gates/phase.test.ts). Guards against a future gate edit silently
// reclassifying a finding (e.g. a refactor that drops `structural: true` from the cycle check)
// without anyone touching the contract doc.

import { describe, expect, test } from "bun:test";
import { defsGate } from "../../src/gates/defs";
import { linkerGate } from "../../src/gates/linker";
import { refsGate } from "../../src/gates/refs";
import { DEFAULT_GATE_CONFIG } from "../../src/gates/config";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import type { RepoSnapshot } from "../../src/gates/snapshot";
import type { Finding } from "../../src/gates/framework";

function structuralOf(findings: Finding[], messageSubstring: string): boolean | undefined {
  return findings.find((f) => f.message.includes(messageSubstring))?.structural;
}

describe("Gate 1 (defs) structural classification", () => {
  test("DRIFT (duplicate alias) is structural", () => {
    const snap = snapshotFromFiles({
      "definitions/a.md": "---\nid: a\nterm: Same\nkind: original\nstatus: locked\nconsensus: x\n---\n",
      "definitions/b.md": "---\nid: b\nterm: Same\nkind: original\nstatus: locked\nconsensus: x\n---\n",
    });
    const { findings } = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "DRIFT")).toBe(true);
  });

  test("missing/unterminated frontmatter is structural", () => {
    const snap = snapshotFromFiles({ "definitions/a.md": "no frontmatter here\n" });
    const { findings } = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "missing/unterminated frontmatter")).toBe(true);
  });

  test("bad kind enum value is NON-structural (schema completeness, demotable)", () => {
    const snap = snapshotFromFiles({
      "definitions/a.md": "---\nid: a\nterm: T\nkind: bogus\nstatus: locked\n---\n",
    });
    const { findings } = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "not in cited")).toBeFalsy();
  });

  test("cited shard missing source/sha256 is NON-structural (provenance)", () => {
    const snap = snapshotFromFiles({
      "definitions/a.md": "---\nid: a\nterm: T\nkind: cited\nstatus: locked\n---\n",
    });
    const { findings } = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "missing required 'source:'")).toBeFalsy();
  });
});

function linkerSnap(files: Record<string, string>): RepoSnapshot {
  return snapshotFromFiles(files);
}

describe("Gate 2 (linker) structural classification", () => {
  test("dependency cycle is structural", () => {
    const snap = linkerSnap({
      "argument/lemmas/lem-a.md": "---\nid: lem-a\nkind: lemma\ncontract: A\ndeps: lem-b\n---\n",
      "argument/lemmas/lem-b.md": "---\nid: lem-b\nkind: lemma\ncontract: B\ndeps: lem-a\n---\n",
    });
    const { findings } = linkerGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "cycle detected")).toBe(true);
  });

  test("unknown dep id (broken reference) is structural", () => {
    const snap = linkerSnap({
      "argument/lemmas/lem-a.md": "---\nid: lem-a\nkind: lemma\ncontract: A\ndeps: lem-nonexistent\n---\n",
    });
    const { findings } = linkerGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "unknown dep")).toBe(true);
  });

  test("missing 'kind:' field (schema completeness) is NON-structural", () => {
    const snap = linkerSnap({
      "argument/lemmas/lem-a.md": "---\nid: lem-a\ncontract: A\n---\n",
    });
    const { findings } = linkerGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "missing required field 'kind'")).toBeFalsy();
  });

  test("generated-freshness (INDEX.md/DAG.md stale) is NON-structural", () => {
    const snap = linkerSnap({
      "argument/lemmas/lem-a.md": "---\nid: lem-a\nkind: lemma\ncontract: A\n---\n",
      "argument/INDEX.md": "stale\n",
      "argument/DAG.md": "stale\n",
    });
    const { findings } = linkerGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "STALE")).toBeFalsy();
  });
});

describe("Gate 3 (refs) structural classification", () => {
  test("unparseable external JSON is structural", () => {
    const snap = linkerSnap({ "proofs/ws/externals/ext.json": "{ not json" });
    const { findings } = refsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "unparseable JSON")).toBe(true);
  });

  test("refs payload absent (byte-verification / provenance) is NON-structural", () => {
    const snap = linkerSnap({
      "proofs/ws/externals/ext.json": JSON.stringify({ source: 'VERBATIM "hello world" at refs/x.md' }),
    });
    const { findings } = refsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "ABSENT")).toBeFalsy();
  });
});
