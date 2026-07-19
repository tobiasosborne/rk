// 1:1 test file for src/store/build-graph.ts's `diagnostics` surface (M2-boundary-review blocker
// 2, producer side). Ground truth: the review's own resolution text — "make build diagnostics
// first-class... registrySkips/frMalformedLines... visibly distinguish degraded/absent fallbacks
// from authoritative empty stores." This file tests ONLY the aggregation `buildGraphDocument`
// performs over its already-tested constituent readers (src/store/{af,fr,bd,registry}-load.ts,
// each with their own 1:1 test file) — no new store-reading logic lives here.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGraphDocument } from "../../src/store/build-graph";

const ABSENT = ["definitely-not-a-real-binary-xyz"];

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "rk-build-graph-test-"));
}

function writeShard(root: string, rel: string, frontmatter: string): void {
  mkdirSync(join(root, "argument"), { recursive: true });
  writeFileSync(join(root, "argument", rel), `---\n${frontmatter}\n---\nBody.\n`);
}

describe("buildGraphDocument — diagnostics.structuralLoss + diagnostics.sources (M2-boundary-review blocker 2)", () => {
  test("a clean repo (no shards, no fr/af/bd) is structurally complete, every source absent", () => {
    const root = tempRoot();
    const { diagnostics } = buildGraphDocument(root, { afCommand: ABSENT, frCommand: ABSENT });
    expect(diagnostics).toEqual({
      structuralLoss: { registrySkips: [], frMalformedLines: [] },
      sources: { af: "absent", fr: "absent", bd: "absent" },
      isStructurallyComplete: true,
    });
    rmSync(root, { recursive: true, force: true });
  });

  test("a shard with an unrecognized kind is a registrySkip -> structurally INCOMPLETE, never silently dropped", () => {
    const root = tempRoot();
    writeShard(root, "lem-bad.md", "id: lem-bad\nkind: not-a-real-kind\ncontract: c.\naf: none");
    const { diagnostics } = buildGraphDocument(root, { afCommand: ABSENT, frCommand: ABSENT });
    expect(diagnostics.structuralLoss.registrySkips).toEqual([
      { path: "argument/lem-bad.md", reason: "unrecognized or missing kind 'not-a-real-kind'" },
    ]);
    expect(diagnostics.isStructurallyComplete).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  test("a malformed nonblank fr log line is a structural diagnostic -> structurally INCOMPLETE, source reported as log-fallback (not silently absent)", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".frontier"), { recursive: true });
    writeFileSync(join(root, ".frontier", "log.jsonl"), 'not valid json\n{"cycle":1,"outcome":"orient"}\n');
    const { diagnostics, fr } = buildGraphDocument(root, { afCommand: ABSENT, frCommand: ABSENT });
    expect(fr.present).toBe(true);
    expect(diagnostics.sources.fr).toBe("log-fallback"); // degraded fallback, never conflated with "export" or "absent"
    expect(diagnostics.structuralLoss.frMalformedLines).toEqual([{ lineNo: 1, snippet: "not valid json" }]);
    expect(diagnostics.isStructurallyComplete).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  test("bd present (a real .beads/issues.jsonl) reports sources.bd:'read'", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".beads"), { recursive: true });
    writeFileSync(join(root, ".beads", "issues.jsonl"), '{"id":"rk-x","issue_type":"task"}\n');
    const { diagnostics } = buildGraphDocument(root, { afCommand: ABSENT, frCommand: ABSENT });
    expect(diagnostics.sources.bd).toBe("read");
    rmSync(root, { recursive: true, force: true });
  });

  test("accounting property: registry candidates handed to from-registry.ts == projected nodes + registrySkips, for every shape", () => {
    const shapes: { rel: string; fm: string }[][] = [
      [],
      [{ rel: "lem-good.md", fm: "id: lem-good\nkind: lemma\ncontract: c.\naf: none" }],
      [
        { rel: "lem-good.md", fm: "id: lem-good\nkind: lemma\ncontract: c.\naf: none" },
        { rel: "lem-bad-1.md", fm: "id: lem-bad-1\nkind: nope\ncontract: c.\naf: none" },
        { rel: "lem-bad-2.md", fm: "id: lem-bad-2\ncontract: c.\naf: none" }, // no kind at all
      ],
    ];
    for (const shards of shapes) {
      const root = tempRoot();
      for (const s of shards) writeShard(root, s.rel, s.fm);
      const { report, registry } = buildGraphDocument(root, { afCommand: ABSENT, frCommand: ABSENT });
      // every candidate `loadRegistrySource` handed to assembleGraphDocument (report.lemmasIn,
      // itself == registry.total here since none of these fixtures exercise a structural
      // frontmatter/id failure) becomes EITHER a projected node OR a registrySkip — never both,
      // never neither.
      expect(report.lemmasIn).toBe(registry.total);
      expect(report.nodesOut + report.registrySkipped.length).toBe(report.lemmasIn);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
