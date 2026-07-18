// Unit tests for src/gates/shards.ts — Gate 6 (report-shards). The 12 corpus fixtures in
// corpus/shards/*/ (exercised end-to-end by test/corpus.test.ts) cover the gate's black-box
// behavior; this file isolates the one check a git-committed fixture tree cannot faithfully
// carry on its own — Check 1's `report/sections/` DIRECTORY-existence requirement
// (check-report-shards.sh:23, docs/gate-contracts.md Gate 6 check 1), which needs the empty-dir
// `dirs` SnapshotFact the old file-prefix-only model could not represent (rk-399 review finding 2).

import { describe, expect, test } from "bun:test";
import { shardsGate } from "../../src/gates/shards";
import type { RepoSnapshot, SnapshotFacts } from "../../src/gates/snapshot";
import { DEFAULT_GATE_CONFIG } from "../../src/gates/config";

/** Snapshot with an explicit `dirs` fact (directory existence, empty ones included), as
 * `loadSnapshot` supplies from the real tree. */
function snap(entries: Record<string, string>, dirs: string[]): RepoSnapshot {
  const m = new Map(Object.entries(entries)) as Map<string, string> & SnapshotFacts;
  Object.assign(m, {
    sha256: new Map<string, string>(),
    tracked: new Set<string>(),
    dirs: new Set<string>(dirs),
  } satisfies SnapshotFacts);
  return m;
}

function errors(result: ReturnType<typeof shardsGate.run>) {
  return result.findings.filter((f) => f.severity === "ERROR");
}

// A scaffold with master/README/catalog present but NO shards and NO sections/ directory: the
// old gate hit the empty-scaffold exemption and returned clean (false PASS). Check 1 requires the
// directory itself to exist (check-report-shards.sh:23).
const SCAFFOLD_FILES = {
  "report/main.tex": "% MASTER\n\\documentclass{article}\n\\begin{document}\n\\end{document}\n",
  "report/README.md": "# report\n",
  "report/SHARD_CATALOG.md": "# catalog\n",
};

describe("shardsGate — Check 1: report/sections/ directory existence (rk-399 finding 2)", () => {
  test("sections/ ABSENT (empty scaffold otherwise): ERROR, not a clean empty-scaffold pass", () => {
    const result = shardsGate.run(snap({ ...SCAFFOLD_FILES }, ["report"]), DEFAULT_GATE_CONFIG);
    const e = errors(result).find((f) => f.path === "report/sections");
    expect(e).toBeDefined();
    expect(e!.message).toContain("report/sections");
  });

  test("sections/ EXISTS but empty (golden empty scaffold, shards-11 shape): clean pass", () => {
    const result = shardsGate.run(
      snap({ ...SCAFFOLD_FILES }, ["report", "report/sections"]),
      DEFAULT_GATE_CONFIG,
    );
    expect(errors(result)).toEqual([]);
  });
});
