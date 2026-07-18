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

// rk-1tt (review finding 5): the old numerator subtracted a shard from `checked` only when an
// ERROR's own `path` equalled the shard file's path. Checks 8/16/17/18 (README/CATALOG
// cross-indexing) and check 6 (missing \include target) all attribute their ERROR to a DIFFERENT
// file (README, CATALOG, or MASTER) than the shard they are actually about — so a shard that
// provably fails cataloging, listing, or even existing could still be counted "included, labeled,
// cataloged" in the coverage line. The fix tracks non-conformance directly at each check site
// (whichever file the finding is attributed to), not by reverse-matching finding.path afterward.
describe("shardsGate — rk-1tt: coverage numerator means fully-conforming, computed consistently across cross-file findings", () => {
  const GOLDEN_MASTER = "\\documentclass{article}\n\\begin{document}\n\\include{sections/01_intro}\n\\end{document}\n";
  const GOLDEN_SHARD =
    "% SHARD-ID: AISM-01-INTRO\n% SHARD-TITLE: Introduction\n% SHARD-KEYWORDS: intro, overview\n" +
    "% SHARD-SUMMARY: First summary line.\n% SHARD-SUMMARY: Second summary line.\nBody text here.\n";
  const GOLDEN_README = "# report/ map\n\n- `report/sections/01_intro.tex` (`AISM-01-INTRO`)\n";
  const GOLDEN_CATALOG =
    "## AISM-01-INTRO\n\nFile: report/sections/01_intro.tex\nTitle: Introduction\nKeywords: intro, overview\n\n" +
    "First summary line.\nSecond summary line.\n";

  function tree(overrides: Partial<Record<"main" | "readme" | "catalog" | "shard", string>> = {}) {
    return snap(
      {
        "report/main.tex": overrides.main ?? GOLDEN_MASTER,
        "report/README.md": overrides.readme ?? GOLDEN_README,
        "report/SHARD_CATALOG.md": overrides.catalog ?? GOLDEN_CATALOG,
        "report/sections/01_intro.tex": overrides.shard ?? GOLDEN_SHARD,
      },
      ["report", "report/sections"],
    );
  }

  test("golden fully-conforming single shard: coverage 1/1 (sanity baseline the fix must not regress)", () => {
    const result = shardsGate.run(tree(), DEFAULT_GATE_CONFIG);
    expect(errors(result)).toEqual([]);
    expect(result.coverage).toEqual([
      { gate: "shards", unit: "shard(s) fully conforming (included, labeled, cataloged)", checked: 1, total: 1 },
    ]);
  });

  test("shards-08 shape: CATALOG missing a header value for an existing shard -> 0/1, not 1/1", () => {
    // CATALOG omits the SHARD-KEYWORDS string only; the shard's own path carries zero findings.
    const badCatalog =
      "## AISM-01-INTRO\n\nFile: report/sections/01_intro.tex\nTitle: Introduction\n\n" +
      "First summary line.\nSecond summary line.\n";
    const result = shardsGate.run(tree({ catalog: badCatalog }), DEFAULT_GATE_CONFIG);
    const e = errors(result).find((f) => f.path === "report/SHARD_CATALOG.md");
    expect(e).toBeDefined();
    expect(errors(result).some((f) => f.path === "report/sections/01_intro.tex")).toBe(false);
    expect(result.coverage[0]!.checked).toBe(0);
    expect(result.coverage[0]!.total).toBe(1);
  });

  test("shards-09 shape: README missing BOTH path and label entries for an existing shard -> 0/1, not 1/1", () => {
    const badReadme = "# report/ map\n\nThis map does not mention the shard file at all.\n";
    const result = shardsGate.run(tree({ readme: badReadme }), DEFAULT_GATE_CONFIG);
    expect(errors(result).filter((f) => f.path === "report/README.md")).toHaveLength(2);
    expect(errors(result).some((f) => f.path === "report/sections/01_intro.tex")).toBe(false);
    expect(result.coverage[0]!.checked).toBe(0);
    expect(result.coverage[0]!.total).toBe(1);
  });

  test("missing \\include target file: ERROR attributed to MASTER, but the nonexistent shard must still count as non-conforming (0/1, not a false 1/1)", () => {
    // Check 6's ERROR names MASTER (the \include statement), not the (nonexistent) target file —
    // yet `seenFiles` still gains that path before existence is checked, inflating the denominator.
    // A reverse path-match numerator would find no ERROR whose path equals the shard file and
    // wrongly count it as conforming.
    const result = shardsGate.run(
      snap(
        {
          "report/main.tex": GOLDEN_MASTER,
          "report/README.md": GOLDEN_README,
          "report/SHARD_CATALOG.md": GOLDEN_CATALOG,
        },
        ["report", "report/sections"],
      ),
      DEFAULT_GATE_CONFIG,
    );
    const e = errors(result).find((f) => f.message.includes("points to missing"));
    expect(e).toBeDefined();
    expect(e!.path).toBe("report/main.tex");
    expect(result.coverage[0]!.checked).toBe(0);
    expect(result.coverage[0]!.total).toBe(1);
  });
});
