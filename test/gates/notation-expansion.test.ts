// 1:1 tests for src/gates/notation-expansion.ts. Contract: Gate 1 notation `expansion:`.

import { describe, expect, test } from "bun:test";
import { notationExpansionFinding } from "../../src/gates/notation-expansion";
import type { NotationShard } from "../../src/gates/notation-shards";

function shard(expansion?: string): NotationShard {
  return {
    path: "definitions/notation/sym-gap.md",
    fields: expansion === undefined ? {} : { expansion },
    translations: [],
    translationsInFrontmatter: false,
  };
}

describe("notationExpansionFinding", () => {
  test("requires a non-empty expansion", () => {
    expect(notationExpansionFinding(shard())?.message).toContain("expansion-missing");
    expect(notationExpansionFinding(shard("  "))?.structural).toBe(true);
  });

  test("accepts one balanced ensuremath replacement body", () => {
    expect(notationExpansionFinding(shard("\\ensuremath{\\lambda_{\\min}}"))).toBeUndefined();
    expect(notationExpansionFinding(shard("\\ensuremath{k}"))).toBeUndefined();
  });

  test("rejects malformed wrappers and active TeX primitives", () => {
    for (const bad of ["\\epsilon", "\\ensuremath{}", "\\ensuremath{\\epsilon", "\\ensuremath{\\input{x}}", "\\ensuremath{#1}"]) {
      const finding = notationExpansionFinding(shard(bad));
      expect(finding?.message).toContain("expansion-unsafe");
      expect(finding?.structural).toBe(true);
    }
  });
});
