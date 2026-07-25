import { describe, expect, test } from "bun:test";
import { computeUpgradeAdvice } from "../../src/scaffold/upgrade-plan";
import type { Manifest } from "../../src/scaffold/manifest-types";

const MANIFEST: Manifest = {
  template_version: "1.0.0",
  slot_syntax: "{{RK_SLOT_<NAME>}}",
  unfilled_slot_grep: "\\{\\{RK_SLOT_",
  note: "test",
  slots: [],
  stamped: [
    { path: "CLAUDE.md", template: "CLAUDE.md.tmpl", classification: "rewritten-whole" },
    { path: "AGENTS.md", template: "CLAUDE.md.tmpl", classification: "rewritten-whole" },
    { path: "CONVENTIONS.md", template: "CONVENTIONS.md.tmpl", classification: "authored-append-only" },
    { path: "argument/thm-north-star.md", template: "argument/north-star.md.tmpl", classification: "campaign-seed" },
    { path: "definitions/", template: null, classification: "directory" },
  ],
  changelog: [
    { version: "1.0.0", changes: ["seeded the north-star shard", "documented northStarId"] },
    { version: "0.9.5", changes: ["older change"] },
    { version: "0.9.0", changes: ["oldest change"] },
  ],
};

describe("computeUpgradeAdvice (pure)", () => {
  test("no recorded version -> no-record, nothing else populated", () => {
    const advice = computeUpgradeAdvice(undefined, MANIFEST);
    expect(advice.status).toBe("no-record");
    expect(advice.stampedVersion).toBeUndefined();
    expect(advice.currentVersion).toBe("1.0.0");
    expect(advice.rewrittenWhole).toEqual([]);
    expect(advice.neverOverwritten).toEqual([]);
  });

  test("matching version -> up-to-date", () => {
    const advice = computeUpgradeAdvice("1.0.0", MANIFEST);
    expect(advice.status).toBe("up-to-date");
    expect(advice.stampedVersion).toBe("1.0.0");
  });

  test("matching version with whitespace still counts as up-to-date (semverEqual trims)", () => {
    expect(computeUpgradeAdvice(" 1.0.0\n", MANIFEST).status).toBe("up-to-date");
  });

  test("mismatched version -> mismatch, with rewritten-whole and never-overwritten lists populated", () => {
    const advice = computeUpgradeAdvice("0.9.0", MANIFEST);
    expect(advice.status).toBe("mismatch");
    expect(advice.stampedVersion).toBe("0.9.0");
    expect(advice.currentVersion).toBe("1.0.0");
    expect(advice.rewrittenWhole).toEqual(["CLAUDE.md", "AGENTS.md"]);
    expect(advice.neverOverwritten).toEqual(["CONVENTIONS.md", "argument/thm-north-star.md"]);
    // directories never appear in either list
    expect(advice.rewrittenWhole).not.toContain("definitions/");
    expect(advice.neverOverwritten).not.toContain("definitions/");
  });

  test("an unparseable stamped version is treated as a mismatch, not up-to-date", () => {
    const advice = computeUpgradeAdvice("garbage", MANIFEST);
    expect(advice.status).toBe("mismatch");
  });

  // A `campaign-seed` file is stamped ONCE and owned by the campaign thereafter: it holds real
  // research content (a registry shard's deps, status, workspace) the moment the user touches it,
  // so it belongs in the never-overwrite bucket, never in the diff-and-hand-merge bucket.
  test("campaign-seed entries are never-overwritten, never diff candidates", () => {
    const advice = computeUpgradeAdvice("0.9.0", MANIFEST);
    expect(advice.neverOverwritten).toContain("argument/thm-north-star.md");
    expect(advice.rewrittenWhole).not.toContain("argument/thm-north-star.md");
  });
});

// The version bump that carries a new stamped path or a new `.rk/config.json` key is invisible to
// a per-file diff of the files the old repo already has. `changesSince` is what `rk upgrade`
// prints instead of leaving the user to infer it.
describe("computeUpgradeAdvice: changesSince (per-version changelog)", () => {
  test("mismatch carries every changelog entry strictly newer than the stamped version", () => {
    const advice = computeUpgradeAdvice("0.9.5", MANIFEST);
    expect(advice.changesSince.map((e) => e.version)).toEqual(["1.0.0"]);
  });

  test("a very old repo gets the whole log, newest first", () => {
    const advice = computeUpgradeAdvice("0.1.0", MANIFEST);
    expect(advice.changesSince.map((e) => e.version)).toEqual(["1.0.0", "0.9.5", "0.9.0"]);
  });

  test("an unparseable stamped version gets the whole log rather than silently none", () => {
    const advice = computeUpgradeAdvice("garbage", MANIFEST);
    expect(advice.changesSince.map((e) => e.version)).toEqual(["1.0.0", "0.9.5", "0.9.0"]);
  });

  test("up-to-date and no-record carry no changelog (nothing to migrate)", () => {
    expect(computeUpgradeAdvice("1.0.0", MANIFEST).changesSince).toEqual([]);
    expect(computeUpgradeAdvice(undefined, MANIFEST).changesSince).toEqual([]);
  });

  test("a manifest with no changelog degrades to an empty list, never a throw", () => {
    const bare = { ...MANIFEST, changelog: undefined };
    expect(computeUpgradeAdvice("0.9.0", bare).changesSince).toEqual([]);
  });
});
