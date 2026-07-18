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
    { path: "definitions/", template: null, classification: "directory" },
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
    expect(advice.neverOverwritten).toEqual(["CONVENTIONS.md"]);
    // directories never appear in either list
    expect(advice.rewrittenWhole).not.toContain("definitions/");
    expect(advice.neverOverwritten).not.toContain("definitions/");
  });

  test("an unparseable stamped version is treated as a mismatch, not up-to-date", () => {
    const advice = computeUpgradeAdvice("garbage", MANIFEST);
    expect(advice.status).toBe("mismatch");
  });
});
