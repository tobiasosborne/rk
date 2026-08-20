// 1:1 test file for src/gates/signature-profile.ts + src/gates/signature-entail.ts — the closed
// vocabulary (chains and posets from the convention profile), INTERVAL entailment, and the
// FIXED-POINT route rule. Ground truth: docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md
// section 6, the codex Tier A review of the convention-profile draft (findings 10-13),
// docs/gate-contracts.md Gate 2 Check 17.
//
// THE PAIR THIS FILE EXISTS FOR (review LB2, docs/reviews/2026-08-20-qpcp-plan-tierA-codex.md):
// `lem-amp` holds at qudit dimension qdim=poly and produces gap=const; `thm-qpcp` runs at
// qdim=const and consumes gap=const AND qdim=const. v1's atom-wise matching PASSED this — the gap
// atom came from the dependency and the dimension atom from the parent's own regime — although
// lem-amp is unavailable in a constant-dimension context. Interval entailment rejects it: the
// context's qdim interval ['const','const'] is not CONTAINED in the required ['poly','poly'].

import { describe, expect, test } from "bun:test";
import type { Signature } from "../../src/gates/signature";
import { type ConventionProfile, leq, parseConventionProfile } from "../../src/gates/signature-profile";
import {
  AMBIENT_SCOPE,
  buildContext,
  checkRoute,
  validateSignatureVocabulary,
} from "../../src/gates/signature-entail";

// Values are INTERVALS over each key's declared order; a bare string is the point interval. Two
// order kinds: `gap`/`qdim` are chains, `reduction` is a genuine POSET (quasi-poly and
// quantum-poly are incomparable — a time bound and a model widening neither of which implies the
// other, review finding 12), and `norm` is the degenerate poset with no edges, i.e. an enum.
const PROFILE_TEXT = JSON.stringify({
  schema_version: "1",
  name: "rk-test.v1",
  lattices: {
    gap: ["inv-poly", "inv-log", "const"],
    qdim: { kind: "chain", values: ["const", "polylog", "poly"] },
    reduction: {
      kind: "poset",
      values: ["karp", "quasi-poly", "quantum-poly", "turing"],
      edges: [
        ["karp", "quasi-poly"],
        ["karp", "quantum-poly"],
        ["karp", "turing"],
      ],
    },
  },
  enums: { norm: ["relative", "absolute"], hardness: ["QMA-hard", "NP-hard"] },
});

const profile: ConventionProfile = (() => {
  const p = parseConventionProfile("rk-test.v1", PROFILE_TEXT);
  if (!p.ok) throw new Error(p.why);
  return p.profile;
})();

function sig(parts: Partial<Signature>): Signature {
  return { schema_version: "1", profile: "rk-test.v1", pre: [], post: [], regime: [], ...parts };
}

const LEM_AMP = sig({
  regime: [{ qdim: "poly" }],
  post: [{ obj: "def-promise-gap", keys: { gap: "const" } }],
});

const THM_QPCP_BAD = sig({
  regime: [{ qdim: "const" }],
  pre: [
    { obj: "def-promise-gap", keys: { gap: "const" } },
    { obj: "def-local-hamiltonian", keys: { qdim: "const" } },
  ],
  post: [{ obj: "def-promise-gap", keys: { gap: "const" } }],
});

const THM_QPCP_OK = sig({
  regime: [{ qdim: "poly" }],
  pre: [{ obj: "def-local-hamiltonian", keys: { qdim: "poly" } }],
  post: [{ obj: "def-promise-gap", keys: { gap: "const" } }],
});

describe("convention profile — chains, posets, and what is refused", () => {
  test("a chain orders by array position; a poset by its declared edges, reflexively", () => {
    expect(leq(profile, "gap", "inv-poly", "const")).toBe(true);
    expect(leq(profile, "gap", "const", "inv-poly")).toBe(false);
    expect(leq(profile, "reduction", "karp", "turing")).toBe(true);
    expect(leq(profile, "reduction", "turing", "turing")).toBe(true);
  });

  test("INCOMPARABLE poset values are not related in either direction (review finding 12)", () => {
    expect(leq(profile, "reduction", "quasi-poly", "turing")).toBe(false);
    expect(leq(profile, "reduction", "turing", "quasi-poly")).toBe(false);
    expect(leq(profile, "reduction", "quasi-poly", "quantum-poly")).toBe(false);
  });

  test("an enum is the degenerate poset: nothing is below anything but itself", () => {
    expect(leq(profile, "norm", "relative", "relative")).toBe(true);
    expect(leq(profile, "norm", "relative", "absolute")).toBe(false);
  });

  test.each([
    ["not an object", "[]"],
    ["no vocabulary at all", JSON.stringify({ enums: {} })],
    ["a lattice that is neither an array nor a spec", JSON.stringify({ lattices: { gap: "const" } })],
    ["a duplicate value", JSON.stringify({ lattices: { gap: ["const", "const"] } })],
    ["an empty lattice", JSON.stringify({ lattices: { gap: [] } })],
    ["a key declared BOTH as a lattice and an enum", JSON.stringify({ lattices: { gap: ["a"] }, enums: { gap: ["a"] } })],
    ["a chain that also declares edges", JSON.stringify({ lattices: { gap: { kind: "chain", values: ["a", "b"], edges: [] } } })],
    ["a poset edge naming an undeclared value", JSON.stringify({ lattices: { r: { kind: "poset", values: ["a"], edges: [["a", "z"]] } } })],
    ["a poset self-edge", JSON.stringify({ lattices: { r: { kind: "poset", values: ["a"], edges: [["a", "a"]] } } })],
    ["a cyclic poset", JSON.stringify({ lattices: { r: { kind: "poset", values: ["a", "b"], edges: [["a", "b"], ["b", "a"]] } } })],
  ])("an unusable profile (%s) fails closed, never a partial vocabulary", (_label, text) => {
    expect(parseConventionProfile("p", text).ok).toBe(false);
  });

  test("a profile still carrying `key_polarity` is REFUSED, not read under interval semantics", () => {
    const p = parseConventionProfile("p", JSON.stringify({ lattices: { gap: ["a", "b"] }, key_polarity: { gap: "afforded" } }));
    expect(p.ok).toBe(false);
    if (p.ok) throw new Error("unreachable");
    expect(p.why).toContain("key_polarity");
  });
});

describe("closed vocabulary", () => {
  test("unknown keys and unknown values are separate, named findings", () => {
    const issues = validateSignatureVocabulary(
      sig({
        pre: [{ obj: "def-x", keys: { bogus: "const" } }],
        post: [{ obj: "def-y", keys: { gap: "enormous" } }],
        regime: [{ qdim: "poly" }],
      }),
      profile,
    );
    expect(issues.map((i) => i.code).sort()).toEqual(["unknown-key", "unknown-value"]);
    expect(issues.find((i) => i.code === "unknown-key")!.message).toContain("bogus");
    expect(issues.find((i) => i.code === "unknown-value")!.message).toContain("enormous");
  });

  test("BOTH endpoints of an interval are vocabulary-checked", () => {
    const issues = validateSignatureVocabulary(sig({ regime: [{ gap: ["inv-poly", "enormous"] }] }), profile);
    expect(issues.map((i) => i.code)).toEqual(["unknown-value"]);
  });

  test("an INCONSISTENT interval (lo above hi) is `signature-malformed`, not a regime clash", () => {
    const issues = validateSignatureVocabulary(sig({ regime: [{ gap: ["const", "inv-poly"] }] }), profile);
    expect(issues.map((i) => i.code)).toEqual(["signature-malformed"]);
  });

  test("on a POSET, an interval between INCOMPARABLE endpoints is malformed too", () => {
    const issues = validateSignatureVocabulary(sig({ regime: [{ reduction: ["quasi-poly", "turing"] }] }), profile);
    expect(issues.map((i) => i.code)).toEqual(["signature-malformed"]);
  });

  test("an optional `hardness` is vocabulary-checked when present, silent when absent", () => {
    expect(validateSignatureVocabulary(sig({ hardness: "QMA-hard" }), profile)).toEqual([]);
    expect(validateSignatureVocabulary(sig({ hardness: "vibes" }), profile).map((i) => i.code)).toEqual(["unknown-value"]);
    expect(validateSignatureVocabulary(sig({}), profile)).toEqual([]);
  });
});

describe("interval entailment — containment, in both directions", () => {
  test("a regime predicate NEVER satisfies an object-scoped one (the LB2 conflation)", () => {
    const ctx = buildContext([{ regime: [{ qdim: "const" }] }]);
    const fails = ctx.unmet(profile, { pre: [{ obj: "def-local-hamiltonian", keys: { qdim: "const" } }], regime: [] });
    expect(fails).toHaveLength(1);
    expect(fails[0]!.scope).toBe("def-local-hamiltonian");
    expect(fails[0]!.available).toEqual([]);
  });

  test("AFFORDED reading: a point context inside a ranged requirement entails it", () => {
    // "at least an inverse-polynomial gap" is the requirement [inv-poly, const]; a constant gap
    // sits inside it.
    const ctx = buildContext([{ post: [{ obj: "def-promise-gap", keys: { gap: "const" } }] }]);
    expect(ctx.unmet(profile, { pre: [{ obj: "def-promise-gap", keys: { gap: ["inv-poly", "const"] } }], regime: [] })).toEqual([]);
  });

  test("CAPPED reading: the same containment rule, with the bound on the other side", () => {
    // "the dimension is at most constant" is the requirement [*, const].
    const tight = buildContext([{ regime: [{ qdim: "const" }] }]);
    expect(tight.unmet(profile, { pre: [], regime: [{ qdim: [null, "const"] }] })).toEqual([]);
    const loose = buildContext([{ regime: [{ qdim: "poly" }] }]);
    expect(loose.unmet(profile, { pre: [], regime: [{ qdim: [null, "const"] }] })).toHaveLength(1);
  });

  test("a point requirement is met only by that exact point (an enum, and any exact demand)", () => {
    const ctx = buildContext([{ regime: [{ norm: "absolute" }] }]);
    expect(ctx.unmet(profile, { pre: [], regime: [{ norm: "relative" }] })).toHaveLength(1);
    expect(ctx.unmet(profile, { pre: [], regime: [{ norm: "absolute" }] })).toEqual([]);
  });

  test("a WIDER context does not entail a NARROWER requirement (containment, not overlap)", () => {
    const ctx = buildContext([{ regime: [{ gap: ["inv-poly", "const"] }] }]);
    expect(ctx.unmet(profile, { pre: [], regime: [{ gap: "const" }] })).toHaveLength(1);
  });

  test("an unbounded CONTEXT endpoint is only entailed by an equally unbounded requirement", () => {
    const ctx = buildContext([{ regime: [{ gap: [null, "const"] }] }]);
    expect(ctx.unmet(profile, { pre: [], regime: [{ gap: ["inv-poly", "const"] }] })).toHaveLength(1);
    expect(ctx.unmet(profile, { pre: [], regime: [{ gap: [null, "const"] }] })).toEqual([]);
  });

  test("POSET: incomparable values do not entail each other in either direction", () => {
    const quasi = buildContext([{ regime: [{ reduction: "quasi-poly" }] }]);
    expect(quasi.unmet(profile, { pre: [], regime: [{ reduction: "turing" }] })).toHaveLength(1);
    const turing = buildContext([{ regime: [{ reduction: "turing" }] }]);
    expect(turing.unmet(profile, { pre: [], regime: [{ reduction: "quasi-poly" }] })).toHaveLength(1);
    // ...but the poset's bottom entails everything above it.
    const karp = buildContext([{ regime: [{ reduction: "karp" }] }]);
    expect(karp.unmet(profile, { pre: [], regime: [{ reduction: [null, "turing"] }] })).toEqual([]);
  });

  test("a key the context never mentions is unmet, reported with an empty available list", () => {
    const fails = buildContext([]).unmet(profile, { pre: [], regime: [{ qdim: "poly" }] });
    expect(fails).toHaveLength(1);
    expect(fails[0]!.scope).toBe(AMBIENT_SCOPE);
    expect(fails[0]!.available).toEqual([]);
  });
});

describe("route entailment — the review's exact pair, and the fixed point", () => {
  const signatureOf = new Map<string, Signature>([["lem-amp", LEM_AMP]]);

  test("REJECTS thm-qpcp (qdim=const) consuming lem-amp (qdim=poly), naming lem-amp's `qdim`", () => {
    const r = checkRoute({ shardId: "thm-qpcp", signature: THM_QPCP_BAD, route: ["lem-amp"], signatureOf, profile });
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]!.memberId).toBe("lem-amp");
    expect(r.failures[0]!.failure.key).toBe("qdim");
    expect(r.failures[0]!.failure.required).toBe("'poly'");
    expect(r.failures[0]!.failure.available).toEqual(["'const'"]);
    expect(r.available).toEqual([]);
    expect(r.entailmentsChecked).toBe(1);
  });

  test("an unavailable member's post is NOT in the final context", () => {
    const r = checkRoute({
      shardId: "thm-qpcp",
      signature: sig({ ...THM_QPCP_BAD, pre: [] }),
      route: ["lem-amp"],
      signatureOf,
      profile,
    });
    expect(r.postUnsupported.map((f) => f.key)).toEqual(["gap"]);
  });

  test("ACCEPTS the same chain when the amplifier is available in the context (qdim=poly)", () => {
    const r = checkRoute({ shardId: "thm-ok", signature: THM_QPCP_OK, route: ["lem-amp"], signatureOf, profile });
    expect(r.failures).toEqual([]);
    expect(r.postUnsupported).toEqual([]);
    expect(r.available).toEqual(["lem-amp"]);
  });

  test("a member with no signature contributes nothing and demands nothing (counted, never silent)", () => {
    const r = checkRoute({
      shardId: "thm-ok",
      signature: THM_QPCP_OK,
      route: ["lem-amp", "lem-nosig"],
      signatureOf,
      profile,
    });
    expect(r.failures).toEqual([]);
    expect(r.membersWithoutSignature).toEqual(["lem-nosig"]);
    expect(r.entailmentsChecked).toBe(1);
  });

  // Review finding 13: the fixed point exists precisely so the author's LISTING ORDER is not part
  // of the verdict. lem-b needs what lem-a provides; declared either way round, both are available.
  const CHAINED = new Map<string, Signature>([
    ["lem-a", sig({ post: [{ obj: "def-promise-gap", keys: { gap: "const" } }] })],
    ["lem-b", sig({ pre: [{ obj: "def-promise-gap", keys: { gap: "const" } }] })],
  ]);

  test.each([
    [["lem-a", "lem-b"]],
    [["lem-b", "lem-a"]],
  ])("a chained route resolves whatever order its members are listed in (%p)", (route) => {
    const r = checkRoute({ shardId: "thm", signature: sig({}), route, signatureOf: CHAINED, profile });
    expect(r.failures).toEqual([]);
    expect(r.available).toEqual(["lem-a", "lem-b"]);
  });

  test("PROPERTY: over every permutation of a 4-member route, the verdict is identical", () => {
    const members = new Map<string, Signature>([
      ["m-1", sig({ post: [{ obj: "def-a", keys: { gap: "inv-log" } }] })],
      ["m-2", sig({ pre: [{ obj: "def-a", keys: { gap: ["inv-poly", "const"] } }], post: [{ obj: "def-b", keys: { qdim: "poly" } }] })],
      ["m-3", sig({ pre: [{ obj: "def-b", keys: { qdim: "poly" } }], post: [{ obj: "def-c", keys: { gap: "const" } }] })],
      // Never satisfiable: nothing supplies def-d.
      ["m-4", sig({ pre: [{ obj: "def-d", keys: { gap: "const" } }] })],
    ]);
    const ids = [...members.keys()];
    const permutations: string[][] = [];
    const permute = (rest: string[], acc: string[]): void => {
      if (rest.length === 0) permutations.push(acc);
      rest.forEach((x, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x]));
    };
    permute(ids, []);
    expect(permutations).toHaveLength(24);

    const verdicts = permutations.map((route) => {
      const r = checkRoute({ shardId: "thm", signature: sig({}), route, signatureOf: members, profile });
      return JSON.stringify({ available: r.available, failures: r.failures });
    });
    expect(new Set(verdicts).size).toBe(1);
    const first = JSON.parse(verdicts[0]!) as { available: string[]; failures: { memberId: string }[] };
    expect(first.available).toEqual(["m-1", "m-2", "m-3"]);
    expect(first.failures.map((f) => f.memberId)).toEqual(["m-4"]);
  });

  test("mutually dependent members cannot bootstrap each other into availability", () => {
    const mutual = new Map<string, Signature>([
      ["lem-x", sig({ pre: [{ obj: "def-a", keys: { gap: "const" } }], post: [{ obj: "def-b", keys: { gap: "const" } }] })],
      ["lem-y", sig({ pre: [{ obj: "def-b", keys: { gap: "const" } }], post: [{ obj: "def-a", keys: { gap: "const" } }] })],
    ]);
    const r = checkRoute({ shardId: "thm", signature: sig({}), route: ["lem-x", "lem-y"], signatureOf: mutual, profile });
    expect(r.available).toEqual([]);
    expect(r.failures.map((f) => f.memberId)).toEqual(["lem-x", "lem-y"]);
  });
});
