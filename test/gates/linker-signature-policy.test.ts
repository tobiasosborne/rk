// 1:1 tests for src/gates/linker-signature-policy.ts — signed-result evidence cannot evade a
// required signature through an exempt kind, while coherence starts only after adoption.

import { describe, expect, test } from "bun:test";
import type { Lemma } from "../../src/gates/linker-lemma";
import { kindStatusIncoherent, signatureDemanded } from "../../src/gates/linker-signature-policy";

function lemma(over: Partial<Lemma>): Lemma {
  return {
    id: "x", path: "argument/x.md", af: "none", contract: "x", defs: [], deps: [], routes: [],
    balloons: { count: 0, classifications: [] }, ...over,
  };
}

describe("required signature policy", () => {
  test.each([
    [lemma({ kind: "lemma" }), true],
    [lemma({ kind: "open-problem", status: "proved" }), true],
    [lemma({ kind: "open-problem", af: "seeded" }), true],
    [lemma({ kind: "open-problem", status: "open" }), false],
  ])("required evaluates kind OR status OR af", (l, expected) => {
    expect(signatureDemanded(l, "required")).toBe(expected);
  });

  test("optional remains gradual and kind-scoped", () => {
    expect(signatureDemanded(lemma({ kind: "open-problem", status: "proved" }), "optional")).toBe(false);
    expect(signatureDemanded(lemma({ kind: "theorem" }), "optional")).toBe(true);
  });
});

describe("kind/status coherence adoption ruling", () => {
  const incoherent = lemma({ kind: "open-problem", status: "proved" });
  test("adopted repositories reject it", () => expect(kindStatusIncoherent(incoherent, true)).toBe(true));
  test("unadopted repositories retain the old policy", () => expect(kindStatusIncoherent(incoherent, false)).toBe(false));
});
