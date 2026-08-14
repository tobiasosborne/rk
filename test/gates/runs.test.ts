// Unit tests for src/gates/runs.ts — Gate 5 (runs). Ground truth: docs/gate-contracts.md
// "Gate 5 — runs" checks 1-6, and the corpus fixtures in corpus/runs/*/ (exercised end-to-end by
// test/corpus.test.ts). This file drives the pure Gate directly against hand-built RepoSnapshots
// (a plain Map) to isolate each check's boundary and the two documented substring-looseness notes
// (Known limitations: checks 3-5 are plain substring search, not structural) rather than
// re-deriving them from a full fixture tree each time.

import { describe, expect, test } from "bun:test";
import { runsGate } from "../../src/gates/runs";
import type { RepoSnapshot } from "../../src/gates/snapshot";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { DEFAULT_GATE_CONFIG } from "../../src/gates/config";

/** A minimal, fully-compliant README body: all four required fields plus an invariant marker. */
function goodReadme(): string {
  return [
    "# Run bundle README",
    "",
    "**Hypothesis.** A test hypothesis.",
    "",
    "**Command.** `python3 scripts/example.py --seed 1`",
    "",
    "**Finding.** The headline finding.",
    "",
    "**Invariant.** A checkable cross-check.",
    "",
    "**Next.** Next steps.",
  ].join("\n");
}

function snapshot(entries: Record<string, string>): RepoSnapshot {
  return snapshotFromFiles(entries);
}

/** Snapshot carrying EXTRA empty-directory existence facts, as `loadSnapshot` supplies from the
 * real tree — the only way to model a genuinely-empty on-disk bundle directory, which git cannot
 * store and file-prefix inference cannot see (rk-399 review finding 2). */
function snapshotWithDirs(entries: Record<string, string>, dirs: string[]): RepoSnapshot {
  return snapshotFromFiles(entries, { dirs });
}

function run(entries: Record<string, string>) {
  return runsGate.run(snapshot(entries), DEFAULT_GATE_CONFIG);
}

function errors(result: ReturnType<typeof run>) {
  return result.findings.filter((f) => f.severity === "ERROR");
}
function warnings(result: ReturnType<typeof run>) {
  return result.findings.filter((f) => f.severity === "WARN");
}

describe("runsGate — day-1 vacuity", () => {
  test("no runs/ directory at all: zero findings, coverage 0/0", () => {
    const result = run({ "INDEX.md": "# INDEX\n" });
    expect(result.findings).toEqual([]);
    expect(result.coverage).toEqual([{ gate: "runs", unit: "run bundle(s)", checked: 0, total: 0 }]);
  });

  test("runs/README.md only (the schema doc, SKIP-listed): zero findings, coverage 0/0", () => {
    const result = run({
      "INDEX.md": "# INDEX\n",
      "runs/README.md": "# runs/ — numerical evidence bundles\n\nDay 1: empty by design.\n",
    });
    expect(result.findings).toEqual([]);
    expect(result.coverage).toEqual([{ gate: "runs", unit: "run bundle(s)", checked: 0, total: 0 }]);
  });
});

describe("runsGate — empty bundle directory (rk-399 finding 2)", () => {
  test("a run bundle dir that EXISTS but is empty (no README): ERROR missing README, counted 0/1", () => {
    // The bundle dir has no files, so file-prefix inference cannot see it — the old gate reported
    // 0/0 clean (false PASS, gate-contracts.md:862). The `dirs` fact makes the empty directory
    // visible, so the missing-README check fires and the bundle is counted.
    const result = runsGate.run(
      snapshotWithDirs({ "INDEX.md": "runs/2026-01-01-empty\n" }, ["runs", "runs/2026-01-01-empty"]),
      DEFAULT_GATE_CONFIG,
    );
    const e = errors(result).find((f) => f.message.includes("missing README.md"));
    expect(e).toBeDefined();
    expect(e!.path).toBe("runs/2026-01-01-empty");
    expect(result.coverage[0]).toEqual({ gate: "runs", unit: "run bundle(s)", checked: 1, total: 1 });
  });

  test("empty dir whose name also violates the grammar: BOTH bad-name and missing-README fire", () => {
    const result = runsGate.run(
      snapshotWithDirs({ "INDEX.md": "" }, ["runs", "runs/Bad_Name"]),
      DEFAULT_GATE_CONFIG,
    );
    expect(errors(result).some((f) => f.message.includes("bad bundle name"))).toBe(true);
    expect(errors(result).some((f) => f.message.includes("missing README.md"))).toBe(true);
  });
});

describe("runsGate — bundle name grammar (check 1)", () => {
  test("valid date-slug name: no bad-name finding", () => {
    const result = run({
      "INDEX.md": "runs/2026-07-15-my-bundle",
      "runs/2026-07-15-my-bundle/README.md": goodReadme(),
    });
    expect(errors(result).some((f) => f.message.includes("bad bundle name"))).toBe(false);
  });

  test("single-char slug boundary ([a-z0-9][a-z0-9-]*): valid", () => {
    const result = run({
      "INDEX.md": "runs/2026-07-15-a",
      "runs/2026-07-15-a/README.md": goodReadme(),
    });
    expect(errors(result)).toEqual([]);
  });

  test("missing leading zero in date part: bad bundle name, path is the bundle dir", () => {
    const result = run({
      "INDEX.md": "runs/2026-7-15-x",
      "runs/2026-7-15-x/README.md": goodReadme(),
    });
    const bad = errors(result).find((f) => f.message.includes("bad bundle name"));
    expect(bad).toBeDefined();
    expect(bad!.path).toBe("runs/2026-7-15-x");
  });

  test("uppercase slug: bad bundle name", () => {
    const result = run({
      "INDEX.md": "runs/2026-07-15-Bad",
      "runs/2026-07-15-Bad/README.md": goodReadme(),
    });
    expect(errors(result).some((f) => f.message.includes("bad bundle name"))).toBe(true);
  });

  test("bad name does NOT skip the remaining per-bundle checks (runs-03 shape)", () => {
    // Bad name, but README complete and bundle IS referenced in INDEX.md -> only the bad-name
    // ERROR fires, proving the other checks still ran (and passed) rather than being skipped.
    const result = run({
      "INDEX.md": "- `runs/not-a-date-slug/`",
      "runs/not-a-date-slug/README.md": goodReadme(),
    });
    expect(errors(result)).toHaveLength(1);
    expect(errors(result)[0]!.message).toContain("bad bundle name");
  });
});

describe("runsGate — README.md presence (check 2)", () => {
  test("missing README.md: ERROR at the bundle dir path, no README-content checks fire", () => {
    const result = run({
      "INDEX.md": "runs/2026-07-15-no-readme",
      "runs/2026-07-15-no-readme/data.csv": "x,y\n1,2\n",
    });
    expect(errors(result)).toHaveLength(1);
    expect(errors(result)[0]!.message).toContain("missing README.md");
    expect(errors(result)[0]!.path).toBe("runs/2026-07-15-no-readme");
  });
});

describe("runsGate — required-field section detection (check 3)", () => {
  test("all four fields present: no missing-field finding", () => {
    const result = run({
      "INDEX.md": "runs/2026-07-15-ok",
      "runs/2026-07-15-ok/README.md": goodReadme(),
    });
    expect(errors(result).some((f) => f.message.includes("missing required field"))).toBe(false);
  });

  test("one field missing: message names exactly that field, path is the README file", () => {
    const readme = [
      "# Run bundle README",
      "**Hypothesis.** A test hypothesis.",
      "**Finding.** The headline finding.",
      "**Invariant.** A checkable cross-check.",
      "**Next.** Next steps.",
    ].join("\n");
    const result = run({
      "INDEX.md": "runs/2026-07-15-missing-command",
      "runs/2026-07-15-missing-command/README.md": readme,
    });
    const missing = errors(result).find((f) => f.message.includes("missing required field"));
    expect(missing).toBeDefined();
    expect(missing!.message).toContain("command");
    expect(missing!.message).not.toContain("hypothesis");
    expect(missing!.path).toBe("runs/2026-07-15-missing-command/README.md");
  });

  test("two fields missing: both named in one ERROR, comma-joined", () => {
    const readme = ["# Run bundle README", "**Hypothesis.** A test hypothesis.", "**Finding.** The headline finding."].join(
      "\n",
    );
    const result = run({
      "INDEX.md": "runs/2026-07-15-two-missing",
      "runs/2026-07-15-two-missing/README.md": readme,
    });
    const missing = errors(result).find((f) => f.message.includes("missing required field"));
    expect(missing!.message).toContain("command");
    expect(missing!.message).toContain("next");
  });

  test("case-insensitive: fields in any case satisfy the check", () => {
    const readme = ["HYPOTHESIS: x", "Command: y", "finding: z", "NEXT: w", "invariant: v"].join("\n");
    const result = run({
      "INDEX.md": "runs/2026-07-15-caseok",
      "runs/2026-07-15-caseok/README.md": readme,
    });
    expect(errors(result).some((f) => f.message.includes("missing required field"))).toBe(false);
  });

  test("documented looseness: a field word inside unrelated prose still satisfies (substring, not structural)", () => {
    // docs/gate-contracts.md Gate 5 Known limitations: "A README containing the literal word
    // 'hypothesis' anywhere -- e.g. inside 'no hypothesis was tested' -- satisfies check 3
    // regardless of context." Carried forward unchanged (ruling #5) -- this test documents the
    // contract's intended behavior, not a bug.
    const readme = [
      "no hypothesis was tested here",
      "command: none",
      "finding: none",
      "next: none",
      "invariant: none",
    ].join("\n");
    const result = run({
      "INDEX.md": "runs/2026-07-15-loose",
      "runs/2026-07-15-loose/README.md": readme,
    });
    expect(errors(result).some((f) => f.message.includes("missing required field"))).toBe(false);
  });
});

describe("runsGate — invariant-presence detection (check 4)", () => {
  test("no invariant-marker substring present: ERROR, path is the README file", () => {
    const readme = [
      "# Run bundle README",
      "**Hypothesis.** A test hypothesis.",
      "**Command.** `x`",
      "**Finding.** The headline finding.",
      "**Next.** Next steps.",
    ].join("\n");
    const result = run({
      "INDEX.md": "runs/2026-07-15-missing-invariant",
      "runs/2026-07-15-missing-invariant/README.md": readme,
    });
    const inv = errors(result).find((f) => f.message.includes("no checkable invariant"));
    expect(inv).toBeDefined();
    expect(inv!.path).toBe("runs/2026-07-15-missing-invariant/README.md");
  });

  // One test per marker in the disjunction (docs/gate-contracts.md Gate 5 Inputs): any ONE of
  // these satisfies the check. Each case swaps in a bare marker word for "Invariant." above.
  const markers = [
    "invariant",
    "certificate",
    "known value",
    "known-value",
    "independent",
    "cross-check",
    "cross check",
    "residual",
    "tolerance",
  ];
  for (const marker of markers) {
    test(`marker '${marker}' alone satisfies the invariant-presence check`, () => {
      const readme = [
        "# Run bundle README",
        "**Hypothesis.** A test hypothesis.",
        "**Command.** `x`",
        "**Finding.** The headline finding.",
        `**Next.** See ${marker} above for the re-run details.`,
      ].join("\n");
      const result = run({
        "INDEX.md": "runs/2026-07-15-marker",
        "runs/2026-07-15-marker/README.md": readme,
      });
      expect(errors(result).some((f) => f.message.includes("no checkable invariant"))).toBe(false);
    });
  }
});

describe("runsGate — INDEX.md reverse-lookup (check 5)", () => {
  test("bundle dirname absent from INDEX.md text: ERROR, path is the bundle dir (not README.md)", () => {
    const result = run({
      "INDEX.md": "# INDEX\n\nNo mention of the orphan bundle anywhere in this file.\n",
      "runs/2026-07-15-orphan/README.md": goodReadme(),
    });
    const orphan = errors(result).find((f) => f.message.includes("not referenced in INDEX.md"));
    expect(orphan).toBeDefined();
    expect(orphan!.path).toBe("runs/2026-07-15-orphan");
  });

  test("missing INDEX.md entirely: treated as empty text, every bundle is orphaned", () => {
    const result = run({
      "runs/2026-07-15-noindex/README.md": goodReadme(),
    });
    expect(errors(result).some((f) => f.message.includes("not referenced in INDEX.md"))).toBe(true);
  });

  test("documented looseness: bundle name mentioned in prose (not a real index row) still satisfies", () => {
    // Known limitations: "a bundle dirname mentioned in INDEX.md prose (not an actual index row)
    // satisfies check 5." Carried forward unchanged (ruling #5).
    const result = run({
      "INDEX.md": "We plan to eventually delete runs/2026-07-15-mentioned some day.",
      "runs/2026-07-15-mentioned/README.md": goodReadme(),
    });
    expect(errors(result).some((f) => f.message.includes("not referenced in INDEX.md"))).toBe(false);
  });
});

describe("runsGate — stray top-level file (check 6)", () => {
  test("a non-README file directly under runs/: WARN, not ERROR, full file path", () => {
    const result = run({
      "INDEX.md": "# INDEX\n",
      "runs/NOTES.txt": "Loose notes that are not a bundle directory.\n",
    });
    expect(errors(result)).toEqual([]);
    expect(warnings(result)).toHaveLength(1);
    expect(warnings(result)[0]!.message).toContain("stray file at runs/ top level");
    expect(warnings(result)[0]!.path).toBe("runs/NOTES.txt");
    // A stray file is not a bundle: coverage excludes it.
    expect(result.coverage).toEqual([{ gate: "runs", unit: "run bundle(s)", checked: 0, total: 0 }]);
  });

  test("a WARN-only tree is still verdict-pass (WARN never fails a gate)", () => {
    const result = run({
      "INDEX.md": "# INDEX\n",
      "runs/NOTES.txt": "stray\n",
    });
    expect(errors(result)).toEqual([]);
  });
});

// rk-z93m: the 1.7.0 constitution's § 4b I.3 REQUIRES a sanctioned, ledgered probe channel, and
// campaign D stood it up exactly where the channel has to live — `runs/probe-channel.sh` +
// `runs/probe-ledger.jsonl`, at the top of runs/, next to the bundle DIRECTORIES it writes. Check
// 6's bundles-are-dirs rule then WARNed on both: the template's own mandatory artifact failed the
// template's own gate. These tests pin the declared-infrastructure allowance — exactly the two
// names `rk init` stamps/owns are sanctioned, in BOTH phases (the gate is phase-unaware; the
// corpus and these tests run the consolidation default), every other stray still WARNs, and the
// coverage line SAYS what it sanctioned (CLAUDE.md L2: never a silent skip).
describe("runsGate — declared probe-channel infrastructure (check 6 allowance, rk-z93m)", () => {
  const CAMPAIGN_D_LAYOUT = {
    "INDEX.md": "- `runs/2026-08-13-one-sided-gap-probes/`\n",
    "runs/probe-channel.sh": "#!/usr/bin/env bash\n# the sanctioned probe execution channel\n",
    "runs/probe-ledger.jsonl": '{"ts":"2026-08-13T19:09:26Z","bundle":"runs/2026-08-13-one-sided-gap-probes"}\n',
    "runs/2026-08-13-one-sided-gap-probes/README.md": goodReadme(),
  };

  test("the campaign-D layout draws ZERO findings: neither channel nor ledger is a stray file", () => {
    const result = run(CAMPAIGN_D_LAYOUT);
    expect(result.findings).toEqual([]);
  });

  test("neither sanctioned file is counted as a run bundle (coverage denominator unchanged)", () => {
    const result = run(CAMPAIGN_D_LAYOUT);
    expect(result.coverage[0]!.checked).toBe(1);
    expect(result.coverage[0]!.total).toBe(1);
  });

  test("the coverage line NAMES what it sanctioned, never a silent skip (L2)", () => {
    const unit = run(CAMPAIGN_D_LAYOUT).coverage[0]!.unit;
    expect(unit).toContain("run bundle(s)");
    expect(unit).toContain("sanctioned runs/ infrastructure");
    expect(unit).toContain("probe-channel.sh");
    expect(unit).toContain("probe-ledger.jsonl");
  });

  test("each sanctioned name is allowed on its own (a ledger with no channel yet, and vice versa)", () => {
    const channelOnly = run({ "INDEX.md": "# INDEX\n", "runs/probe-channel.sh": "#!/usr/bin/env bash\n" });
    expect(channelOnly.findings).toEqual([]);
    expect(channelOnly.coverage[0]!.unit).toContain("probe-channel.sh");
    expect(channelOnly.coverage[0]!.unit).not.toContain("probe-ledger.jsonl");

    const ledgerOnly = run({ "INDEX.md": "# INDEX\n", "runs/probe-ledger.jsonl": "" });
    expect(ledgerOnly.findings).toEqual([]);
    expect(ledgerOnly.coverage[0]!.unit).toContain("probe-ledger.jsonl");
    expect(ledgerOnly.coverage[0]!.unit).not.toContain("probe-channel.sh");
  });

  test("the allowance is NOT a hole: an arbitrary stray next to the sanctioned pair still WARNs", () => {
    const result = run({ ...CAMPAIGN_D_LAYOUT, "runs/NOTES.txt": "loose notes\n" });
    expect(warnings(result)).toHaveLength(1);
    expect(warnings(result)[0]!.path).toBe("runs/NOTES.txt");
    expect(warnings(result)[0]!.message).toContain("stray file at runs/ top level");
  });

  test("the allowance is exact-name, not a prefix or extension family", () => {
    const result = run({
      "INDEX.md": "# INDEX\n",
      "runs/probe-channel.sh.bak": "old copy\n",
      "runs/probe-ledger.jsonl.tmp": "half-written\n",
      "runs/probe-ledger-2.jsonl": "a second, unsanctioned ledger\n",
      "runs/probes/probe-channel.sh": "not at the runs/ top level\n",
    });
    const strayPaths = warnings(result)
      .filter((f) => f.message.includes("stray file at runs/ top level"))
      .map((f) => f.path)
      .sort();
    expect(strayPaths).toEqual(["runs/probe-channel.sh.bak", "runs/probe-ledger-2.jsonl", "runs/probe-ledger.jsonl.tmp"]);
    // `runs/probes/` holds a file, so it is a DIRECTORY at the runs/ top level — a (badly named)
    // bundle, exactly as before: the allowance never reclassifies a directory.
    expect(errors(result).some((f) => f.path === "runs/probes" && f.message.includes("bad bundle name"))).toBe(true);
  });

  test("day-1 (no infrastructure present): the coverage line is unchanged, nothing is claimed", () => {
    const result = run({ "INDEX.md": "# INDEX\n" });
    expect(result.coverage).toEqual([{ gate: "runs", unit: "run bundle(s)", checked: 0, total: 0 }]);
  });

  test("a DIRECTORY carrying a sanctioned name is still a bundle, not sanctioned infrastructure", () => {
    // Defense against the allowance leaking into the bundle classifier: `runs/probe-ledger.jsonl/`
    // as a directory is a malformed bundle and must keep drawing the bad-name ERROR.
    const result = runsGate.run(
      snapshotWithDirs({ "INDEX.md": "# INDEX\n" }, ["runs", "runs/probe-ledger.jsonl"]),
      DEFAULT_GATE_CONFIG,
    );
    expect(errors(result).some((f) => f.path === "runs/probe-ledger.jsonl" && f.message.includes("bad bundle name"))).toBe(true);
    expect(result.coverage[0]!.unit).not.toContain("sanctioned runs/ infrastructure");
  });
});

describe("runsGate — coverage counting", () => {
  test("checked/total both equal the bundle-directory count, not the file count", () => {
    const result = run({
      "INDEX.md": "runs/2026-07-15-a runs/2026-07-15-b",
      "runs/2026-07-15-a/README.md": goodReadme(),
      "runs/2026-07-15-b/README.md": goodReadme(),
      "runs/2026-07-15-b/data.csv": "x,y\n1,2\n",
      "runs/NOTES.txt": "stray\n",
    });
    expect(result.coverage).toEqual([{ gate: "runs", unit: "run bundle(s)", checked: 2, total: 2 }]);
  });

  test("a bundle with every check failing is still counted once in coverage, not multiple times", () => {
    const result = run({
      "INDEX.md": "# INDEX\n",
      "runs/BAD-NAME/README.md": "nothing useful here",
    });
    expect(result.coverage).toEqual([{ gate: "runs", unit: "run bundle(s)", checked: 1, total: 1 }]);
    expect(errors(result).length).toBeGreaterThan(1);
  });
});
