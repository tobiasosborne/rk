// 1:1 tests for src/gates/signature-context.ts — repeated predicates are conjunctions, represented
// by one interval intersection or a fail-closed empty/unrepresentable state.

import { describe, expect, test } from "bun:test";
import type { Signature } from "../../src/gates/signature";
import { buildContext, conjoinSignature } from "../../src/gates/signature-context";
import { intersect, parseConventionProfile } from "../../src/gates/signature-profile";

const profile = (() => {
  const parsed = parseConventionProfile("test.v1", JSON.stringify({
    lattices: {
      gap: ["inv-poly", "inv-log", "const"],
      reduction: {
        kind: "poset",
        values: ["karp", "quasi-poly", "turing"],
        edges: [["karp", "quasi-poly"], ["karp", "turing"]],
      },
    },
  }));
  if (!parsed.ok) throw new Error(parsed.why);
  return parsed.profile;
})();

function sig(parts: Partial<Signature>): Signature {
  return { schema_version: "1", profile: "test.v1", pre: [], post: [], regime: [], ...parts };
}

describe("interval intersection", () => {
  test("overlap becomes the maximum lower and minimum upper bound", () => {
    expect(intersect(
      profile, "gap",
      { lo: "inv-poly", hi: "inv-log" },
      { lo: "inv-log", hi: "const" },
    )).toEqual({ lo: "inv-log", hi: "inv-log" });
  });

  test("disjoint chain intervals are empty", () => {
    expect(intersect(
      profile, "gap",
      { lo: "inv-poly", hi: "inv-poly" },
      { lo: "const", hi: "const" },
    )).toBe("empty");
  });

  test("incomparable poset lower bounds are unrepresentable", () => {
    expect(intersect(
      profile, "reduction",
      { lo: "quasi-poly", hi: "quasi-poly" },
      { lo: "turing", hi: "turing" },
    )).toBe("unrepresentable");
  });
});

describe("signature conjunction", () => {
  test("overlapping repeated predicates collapse to one point", () => {
    const joined = conjoinSignature(sig({ regime: [
      { gap: ["inv-poly", "inv-log"] },
      { gap: ["inv-log", "const"] },
    ] }), profile);
    expect(joined.issues).toEqual([]);
    expect(joined.signature.regime).toEqual([{ gap: "inv-log" }]);
  });

  test("a context retains an empty contradiction and entails nothing", () => {
    const context = buildContext([{ regime: [{ gap: "inv-poly" }, { gap: "const" }] }], profile);
    expect(context.contradictions()).toMatchObject([{ scope: "#ambient", key: "gap", reason: "empty" }]);
    expect(context.unmet({ pre: [], regime: [{ gap: "const" }] })).toHaveLength(1);
  });
});
