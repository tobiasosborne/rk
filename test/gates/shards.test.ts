// Unit tests for src/gates/shards.ts — Gate 6 (report-shards). The 12 corpus fixtures in
// corpus/shards/*/ (exercised end-to-end by test/corpus.test.ts) cover the gate's black-box
// behavior; this file isolates the one check a git-committed fixture tree cannot faithfully
// carry on its own — Check 1's `report/sections/` DIRECTORY-existence requirement
// (check-report-shards.sh:23, docs/gate-contracts.md Gate 6 check 1), which needs the empty-dir
// `dirs` SnapshotFact the old file-prefix-only model could not represent (rk-399 review finding 2).

import { describe, expect, test } from "bun:test";
import { shardsGate } from "../../src/gates/shards";
import type { RepoSnapshot } from "../../src/gates/snapshot";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { DEFAULT_GATE_CONFIG, mergeGateConfig } from "../../src/gates/config";

// R12 (bead rk-psm): shardsPrefix carries no default. The rk-1tt describe block below exercises
// real SHARD-ID header validation (the coverage-numerator fix), which is orthogonal to the
// shardsPrefix-requiredness check (its own describe block is test/corpus.test.ts's shards-14
// fixture + this file's own describe below) — configure it explicitly so those tests keep
// isolating what they were written to isolate.
const CONFIG_WITH_PREFIX = mergeGateConfig({ shardsPrefix: "AISM" });

/** Snapshot with EXTRA directory-existence facts (empty ones included), as `loadSnapshot` supplies
 * from the real tree. */
function snap(entries: Record<string, string>, dirs: string[]): RepoSnapshot {
  return snapshotFromFiles(entries, { dirs });
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

// R13 (bead rk-au6, docs/memos/2026-07-18-aism-residue-audit.md): the report/ LaTeX layout is
// NOT in rk's scaffold (PRD:79-85) -- a general research tool must not force every repo to
// hand-create it just to pass `rk check`. corpus/shards/shards-15 covers this end-to-end through
// the corpus runner (a fresh-scaffold-shaped repo with no report/ at all); these tests isolate
// the gate's own root-presence guard directly, including the "root present, deeper item absent
// still ERRORs" boundary the guard must NOT blur.
describe("shardsGate — R13: report/ ROOT presence gates every check (rk-au6)", () => {
  test("report/ entirely absent: zero findings, coverage notes 'report/: absent (not adopted)', never a silent skip", () => {
    const result = shardsGate.run(snapshotFromFiles({}), DEFAULT_GATE_CONFIG);
    expect(result.findings).toEqual([]);
    expect(result.coverage).toEqual([
      {
        gate: "shards",
        unit: "shard(s) fully conforming (included, labeled, cataloged); report/: absent (not adopted)",
        checked: 0,
        total: 0,
      },
    ]);
  });

  test("report/ absent even when OTHER project content exists (argument/lemmas present): still zero shards findings", () => {
    const result = shardsGate.run(
      snapshotFromFiles({ "argument/lemmas/lem-x.md": "---\nid: lem-x\nkind: lemma\n---\n" }),
      DEFAULT_GATE_CONFIG,
    );
    expect(result.findings).toEqual([]);
    expect(result.coverage[0]!.unit).toContain("report/: absent (not adopted)");
  });

  test("report/ ROOT present but a deeper item absent (empty report/ dir, nothing under it): still ERRORs -- root presence never blurs into deeper-item leniency", () => {
    const result = shardsGate.run(snap({}, ["report"]), DEFAULT_GATE_CONFIG);
    expect(errors(result).map((f) => f.path).sort()).toEqual([
      "report/README.md",
      "report/SHARD_CATALOG.md",
      "report/main.tex",
      "report/sections",
    ]);
    expect(result.coverage[0]!.unit).toContain("report/: present");
  });
});

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
    const result = shardsGate.run(tree(), CONFIG_WITH_PREFIX);
    expect(errors(result)).toEqual([]);
    expect(result.coverage).toEqual([
      {
        gate: "shards",
        unit: "shard(s) fully conforming (included, labeled, cataloged); report/: present",
        checked: 1,
        total: 1,
      },
    ]);
  });

  test("shards-08 shape: CATALOG missing a header value for an existing shard -> 0/1, not 1/1", () => {
    // CATALOG omits the SHARD-KEYWORDS string only; the shard's own path carries zero findings.
    const badCatalog =
      "## AISM-01-INTRO\n\nFile: report/sections/01_intro.tex\nTitle: Introduction\n\n" +
      "First summary line.\nSecond summary line.\n";
    const result = shardsGate.run(tree({ catalog: badCatalog }), CONFIG_WITH_PREFIX);
    const e = errors(result).find((f) => f.path === "report/SHARD_CATALOG.md");
    expect(e).toBeDefined();
    expect(errors(result).some((f) => f.path === "report/sections/01_intro.tex")).toBe(false);
    expect(result.coverage[0]!.checked).toBe(0);
    expect(result.coverage[0]!.total).toBe(1);
  });

  test("shards-09 shape: README missing BOTH path and label entries for an existing shard -> 0/1, not 1/1", () => {
    const badReadme = "# report/ map\n\nThis map does not mention the shard file at all.\n";
    const result = shardsGate.run(tree({ readme: badReadme }), CONFIG_WITH_PREFIX);
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

  // review N3: an \include whose target lies OUTSIDE sections/ took `continue` before the identity
  // entered any set that feeds the denominator, so it produced ERROR + 0/0 — a truthful-coverage
  // defect (contract Gate 6: the denominator includes identities named by an \include). The invalid
  // include is itself a non-conforming identity: it must count in the denominator, never the
  // numerator.
  test("invalid \\include target (outside sections/) counts in the denominator: ERROR + 0/1, not 0/0 (N3)", () => {
    const badMaster =
      "\\documentclass{article}\n\\begin{document}\n\\include{other/misplaced_shard}\n\\end{document}\n";
    const result = shardsGate.run(
      snap(
        {
          "report/main.tex": badMaster,
          "report/README.md": GOLDEN_README,
          "report/SHARD_CATALOG.md": GOLDEN_CATALOG,
        },
        ["report", "report/sections"],
      ),
      DEFAULT_GATE_CONFIG,
    );
    const e = errors(result).find((f) => f.message.includes("should point under sections/"));
    expect(e).toBeDefined();
    expect(e!.path).toBe("report/main.tex");
    // The offending include identity counts in the denominator and is excluded from the numerator.
    expect(result.coverage[0]!.checked).toBe(0);
    expect(result.coverage[0]!.total).toBe(1);
  });
});

// R12 (bead rk-psm, M1 landing-blocker): shardsPrefix carries NO default (src/gates/config.ts).
// corpus/shards/shards-14 covers this end-to-end through the corpus runner; these tests isolate
// the gate's own config-missing behavior directly.
describe("shardsGate — R12: shardsPrefix required-when-consumed (no silent AISM default)", () => {
  const GOLDEN_MASTER = "\\documentclass{article}\n\\begin{document}\n\\include{sections/01_intro}\n\\end{document}\n";
  const GOLDEN_SHARD =
    "% SHARD-ID: AISM-01-INTRO\n% SHARD-TITLE: Introduction\n% SHARD-KEYWORDS: intro, overview\n" +
    "% SHARD-SUMMARY: First summary line.\n% SHARD-SUMMARY: Second summary line.\nBody text here.\n";
  const GOLDEN_README = "# report/ map\n\n- `report/sections/01_intro.tex` (`AISM-01-INTRO`)\n";
  const GOLDEN_CATALOG =
    "## AISM-01-INTRO\n\nFile: report/sections/01_intro.tex\nTitle: Introduction\nKeywords: intro, overview\n\n" +
    "First summary line.\nSecond summary line.\n";

  function goldenTree(): RepoSnapshot {
    return snap(
      {
        "report/main.tex": GOLDEN_MASTER,
        "report/README.md": GOLDEN_README,
        "report/SHARD_CATALOG.md": GOLDEN_CATALOG,
        "report/sections/01_intro.tex": GOLDEN_SHARD,
      },
      ["report", "report/sections"],
    );
  }

  test("no shardsPrefix configured, a real shard needs SHARD-ID validation: ONE loud, counted config-missing ERROR, never a crash, never silent", () => {
    const result = shardsGate.run(goldenTree(), DEFAULT_GATE_CONFIG); // DEFAULT_GATE_CONFIG carries no shardsPrefix
    const cfgErrors = errors(result).filter((f) => f.path === ".rk/config.json");
    expect(cfgErrors).toHaveLength(1);
    expect(cfgErrors[0]!.message).toContain("shardsPrefix is not configured");
    expect(result.coverage[0]!.checked).toBe(0);
    expect(result.coverage[0]!.total).toBe(1);
  });

  // rk-enu (generality audit 2026-07-25, finding m1): the config-missing message's own example
  // used to name AISM, a prior campaign's identifier, in text a new academic reads while debugging
  // their own repo. It must now show a self-evidently generic example instead.
  test("the config-missing message's example SHARD-ID is a generic placeholder, not the AISM identifier", () => {
    const result = shardsGate.run(goldenTree(), DEFAULT_GATE_CONFIG);
    const cfgErrors = errors(result).filter((f) => f.path === ".rk/config.json");
    expect(cfgErrors[0]!.message).toContain("PROJ-01-INTRO");
    expect(cfgErrors[0]!.message).not.toContain("AISM");
  });

  test("no shardsPrefix configured, but nothing to check (empty scaffold): NOT reported — required-when-CONSUMED, not required-always", () => {
    const result = shardsGate.run(
      snap({ ...SCAFFOLD_FILES }, ["report", "report/sections"]),
      DEFAULT_GATE_CONFIG,
    );
    expect(errors(result)).toEqual([]);
  });

  test("shardsPrefix explicitly configured: no config-missing finding, normal validation proceeds", () => {
    const result = shardsGate.run(goldenTree(), CONFIG_WITH_PREFIX);
    expect(errors(result).some((f) => f.path === ".rk/config.json")).toBe(false);
  });
});

// rk-xbm (M1 review B1, docs/reviews/2026-07-18-m1-milestone-review-codex.md L1): Check 7's
// `lineCount > config.shardsMaxLines` used to trust `config.shardsMaxLines` unconditionally --
// `.rk/config.json`'s untyped JSON reaching this gate as e.g. the STRING "garbage" makes every
// such comparison coerce to `NaN`, and any comparison against `NaN` is always `false` -- a
// false-green on the per-shard line-cap check regardless of how long the shard actually is (the
// exact incident this bead names). src/gates/config.ts's `validateConfigOverrides` now sanitizes
// this at the `.rk/config.json`-loading edge (src/store/config-load.ts), so a caller going
// through `loadGateConfig` never reaches this gate with a malformed value at all; these tests
// exercise this gate's OWN defense-in-depth directly, constructing a `GateConfig` by hand the way
// a caller bypassing `loadGateConfig` still could (as `mergeGateConfig` itself performs no
// runtime validation on an already-typed `Partial<GateConfig>` -- see that function's own doc
// comment).
describe("shardsGate — rk-xbm: a malformed shardsMaxLines never produces a false-green (defense in depth)", () => {
  const GOLDEN_MASTER = "\\documentclass{article}\n\\begin{document}\n\\include{sections/01_intro}\n\\end{document}\n";
  const GOLDEN_README = "# report/ map\n\n- `report/sections/01_intro.tex` (`AISM-01-INTRO`)\n";
  const GOLDEN_CATALOG =
    "## AISM-01-INTRO\n\nFile: report/sections/01_intro.tex\nTitle: Introduction\nKeywords: intro, overview\n\n" +
    "First summary line.\nSecond summary line.\n";

  // 300 body lines (well past the real default of 280) after the four header lines + 2 summary
  // lines -- deliberately over-length so the max-lines check has something real to catch.
  const OVERLONG_SHARD =
    "% SHARD-ID: AISM-01-INTRO\n% SHARD-TITLE: Introduction\n% SHARD-KEYWORDS: intro, overview\n" +
    "% SHARD-SUMMARY: First summary line.\n% SHARD-SUMMARY: Second summary line.\n" +
    "Body line.\n".repeat(300);

  function overlongTree(): RepoSnapshot {
    return snap(
      {
        "report/main.tex": GOLDEN_MASTER,
        "report/README.md": GOLDEN_README,
        "report/SHARD_CATALOG.md": GOLDEN_CATALOG,
        "report/sections/01_intro.tex": OVERLONG_SHARD,
      },
      ["report", "report/sections"],
    );
  }

  test("shardsMaxLines: 'garbage' (a string) -- the over-length shard is STILL caught, never silently passed", () => {
    const badConfig = { ...CONFIG_WITH_PREFIX, shardsMaxLines: "garbage" as unknown as number };
    const result = shardsGate.run(overlongTree(), badConfig);
    const lineCountError = errors(result).find((f) => f.message.includes("has") && f.message.includes("lines;"));
    expect(lineCountError).toBeDefined();
    expect(lineCountError!.path).toBe("report/sections/01_intro.tex");
    // The guard falls back to the real default (280) in the message text, not the garbage value.
    expect(lineCountError!.message).toContain(`hard guard is ${DEFAULT_GATE_CONFIG.shardsMaxLines}`);
  });

  test("shardsMaxLines: 'garbage' -- also produces ONE loud config-error finding, not a silent fallback", () => {
    const badConfig = { ...CONFIG_WITH_PREFIX, shardsMaxLines: "garbage" as unknown as number };
    const result = shardsGate.run(overlongTree(), badConfig);
    const cfgErrors = errors(result).filter((f) => f.path === ".rk/config.json" && f.message.includes("shardsMaxLines"));
    expect(cfgErrors).toHaveLength(1);
    expect(cfgErrors[0]!.message).toContain("garbage");
  });

  test("shardsMaxLines: 0 (a non-positive number) is also rejected, same fallback behavior", () => {
    const badConfig = { ...CONFIG_WITH_PREFIX, shardsMaxLines: 0 };
    const result = shardsGate.run(overlongTree(), badConfig);
    const lineCountError = errors(result).find((f) => f.message.includes("has") && f.message.includes("lines;"));
    expect(lineCountError).toBeDefined();
  });

  test("a valid shardsMaxLines is completely unaffected: no config-error finding emitted", () => {
    const result = shardsGate.run(overlongTree(), CONFIG_WITH_PREFIX);
    expect(errors(result).some((f) => f.path === ".rk/config.json" && f.message.includes("shardsMaxLines"))).toBe(false);
  });

  // Mutation proof (this WP's brief): reverting Check 7 to trust `config.shardsMaxLines` directly
  // (`if (lineCount > config.shardsMaxLines)` with no `shardsMaxLinesValid`/`effectiveMaxLines`
  // guard) makes "the over-length shard is STILL caught" above go RED -- `"garbage" as unknown`
  // coerces to `NaN` in the comparison, `lineCount > NaN` is always `false`, so the over-length
  // finding disappears entirely (the exact false-green this bead fixes). Confirmed by hand during
  // implementation, reverted immediately after.
});
