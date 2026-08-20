// 1:1 test file for src/gates/signature-profile.ts + src/gates/signature-entail.ts — the closed
// vocabulary (typed lattices from the convention profile) and the ROUTE-SCOPED ENTAILMENT rule.
// Ground truth: docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md section 6, docs/gate-contracts.md
// Gate 2 Check 17.
//
// THE PAIR THIS FILE EXISTS FOR (review LB2, docs/reviews/2026-08-20-qpcp-plan-tierA-codex.md):
// `lem-amp` holds at qudit dimension d=poly and produces gap=const; `thm-qpcp` runs at d=const and
// consumes gap=const AND d=const. v1's atom-wise matching PASSED this — the gap atom came from the
// dependency and the dimension atom from the parent's own regime — although lem-amp is unavailable
// in a constant-dimension context. Route-scoped entailment rejects it, naming lem-amp's `d`.

import { describe, expect, test } from "bun:test";
import type { Signature } from "../../src/gates/signature";
import {
  type ConventionProfile,
  keyPolarity,
  parseConventionProfile,
  valueRank,
} from "../../src/gates/signature-profile";
import {
  AMBIENT_SCOPE,
  buildContext,
  checkRoute,
  topoOrderMembers,
  validateSignatureVocabulary,
} from "../../src/gates/signature-entail";

// Both on-disk profile spellings are accepted (see src/gates/signature-profile.ts): the
// campaign draft's `lattices` + `key_polarity` maps, and the inline `{values, polarity}` entry.
// POLARITY (campaign draft section 9.1, decision D4): `values` is ALWAYS ordered by the
// underlying parameter, smallest -> largest, whatever the polarity; polarity picks the
// comparison. `qdim` is AFFORDED (dimension ROOM a result needs) and `qdim_cap` is CAPPED (a
// guarantee the ambient dimension stays at or below a bound).
const PROFILE_TEXT = JSON.stringify({
  schema_version: "1",
  name: "rk-test.v1",
  lattices: {
    gap: ["inv-poly", "inv-log", "const"],
    d: ["const", "poly"],
    d_cap: { values: ["const", "poly"], polarity: "capped" },
    degree: ["bounded", "unbounded"],
  },
  enums: { norm: ["relative", "absolute"], n: ["to-infinity"], hardness: ["QMA-hard", "NP-hard"] },
  key_polarity: {
    gap: "afforded",
    d: "afforded",
    degree: "afforded",
    norm: "equality",
    n: "equality",
    hardness: "equality",
  },
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
  regime: [{ d: "poly" }],
  post: [{ obj: "def-promise-gap", keys: { gap: "const" } }],
});

const THM_QPCP_BAD = sig({
  regime: [{ d: "const" }],
  pre: [
    { obj: "def-promise-gap", keys: { gap: "const" } },
    { obj: "def-local-hamiltonian", keys: { d: "const" } },
  ],
  post: [{ obj: "def-promise-gap", keys: { gap: "const" } }],
});

const THM_QPCP_OK = sig({
  regime: [{ d: "poly" }],
  pre: [{ obj: "def-local-hamiltonian", keys: { d: "poly" } }],
  post: [{ obj: "def-promise-gap", keys: { gap: "const" } }],
});

describe("convention profile — the closed vocabulary", () => {
  test("lattices are ordered weakest -> strongest; valueRank reads that order", () => {
    expect(valueRank(profile, "gap", "inv-poly")).toBe(0);
    expect(valueRank(profile, "gap", "const")).toBe(2);
    expect(valueRank(profile, "d", "const")).toBe(0);
    expect(valueRank(profile, "d", "poly")).toBe(1);
  });

  test.each([
    ["not an object", "[]"],
    ["no lattices map", JSON.stringify({ enums: {} })],
    ["a lattice that is not an array", JSON.stringify({ lattices: { gap: "const" }, enums: {} })],
    ["a lattice with a duplicate value", JSON.stringify({ lattices: { gap: ["const", "const"] }, enums: {} })],
    ["an empty lattice", JSON.stringify({ lattices: { gap: [] }, enums: {} })],
    ["a key declared BOTH as a lattice and an enum", JSON.stringify({ lattices: { gap: ["a"] }, enums: { gap: ["a"] } })],
  ])("an unusable profile (%s) fails closed, never a partial vocabulary", (_label, text) => {
    const p = parseConventionProfile("rk-test.v1", text);
    expect(p.ok).toBe(false);
  });

  test("unknown keys and unknown values are separate, named findings", () => {
    const issues = validateSignatureVocabulary(
      sig({
        pre: [{ obj: "def-x", keys: { bogus: "const" } }],
        post: [{ obj: "def-y", keys: { gap: "enormous" } }],
        regime: [{ d: "poly" }],
      }),
      profile,
    );
    expect(issues.map((i) => i.code).sort()).toEqual(["unknown-key", "unknown-value"]);
    expect(issues.find((i) => i.code === "unknown-key")!.message).toContain("bogus");
    expect(issues.find((i) => i.code === "unknown-value")!.message).toContain("enormous");
  });

  test("polarity is REQUIRED for every key — an undeclared polarity refuses the profile", () => {
    const p = parseConventionProfile(
      "rk-test.v1",
      JSON.stringify({ lattices: { gap: ["inv-poly", "const"] }, enums: {}, key_polarity: {} }),
    );
    expect(p.ok).toBe(false);
    if (p.ok) throw new Error("unreachable");
    expect(p.why).toContain("polarity");
  });

  test("a lattice key declared `equality`, or an enum key declared ordered, refuses the profile", () => {
    expect(
      parseConventionProfile("p", JSON.stringify({ lattices: { gap: ["a", "b"] }, enums: {}, key_polarity: { gap: "equality" } })).ok,
    ).toBe(false);
    expect(
      parseConventionProfile("p", JSON.stringify({ lattices: {}, enums: { norm: ["a"] }, key_polarity: { norm: "afforded" } })).ok,
    ).toBe(false);
  });

  test("a `<key>_cap` written in REVERSE of its base key refuses the profile (the double-flip trap)", () => {
    const p = parseConventionProfile(
      "p",
      JSON.stringify({
        lattices: { d: ["const", "poly"], d_cap: ["poly", "const"] },
        enums: {},
        key_polarity: { d: "afforded", d_cap: "capped" },
      }),
    );
    expect(p.ok).toBe(false);
    if (p.ok) throw new Error("unreachable");
    expect(p.why).toContain("d_cap");
  });

  test("keyPolarity reads the declared polarity, and is undefined for an unknown key", () => {
    expect(keyPolarity(profile, "gap")).toBe("afforded");
    expect(keyPolarity(profile, "d_cap")).toBe("capped");
    expect(keyPolarity(profile, "norm")).toBe("equality");
    expect(keyPolarity(profile, "nope")).toBeUndefined();
  });

  test("an enum key admits only its declared values, with no ordering", () => {
    const issues = validateSignatureVocabulary(sig({ regime: [{ norm: "relative" }] }), profile);
    expect(issues).toEqual([]);
    const bad = validateSignatureVocabulary(sig({ regime: [{ norm: "sideways" }] }), profile);
    expect(bad.map((i) => i.code)).toEqual(["unknown-value"]);
  });

  test("an optional `hardness` is vocabulary-checked when present, silent when absent", () => {
    expect(validateSignatureVocabulary(sig({ hardness: "QMA-hard" }), profile)).toEqual([]);
    expect(validateSignatureVocabulary(sig({ hardness: "vibes" }), profile).map((i) => i.code)).toEqual([
      "unknown-value",
    ]);
    expect(validateSignatureVocabulary(sig({}), profile)).toEqual([]);
  });
});

describe("per-object entailment", () => {
  test("a regime predicate NEVER satisfies an object-scoped one (the LB2 conflation)", () => {
    const ctx = buildContext([{ regime: [{ d: "const" }] }]);
    const fails = ctx.unmet(profile, { pre: [{ obj: "def-local-hamiltonian", keys: { d: "const" } }], regime: [] });
    expect(fails).toHaveLength(1);
    expect(fails[0]!.scope).toBe("def-local-hamiltonian");
    expect(fails[0]!.available).toEqual([]);
  });

  test("a stronger context value entails a weaker requirement (const gap covers inv-poly)", () => {
    const ctx = buildContext([{ post: [{ obj: "def-promise-gap", keys: { gap: "const" } }] }]);
    expect(ctx.unmet(profile, { pre: [{ obj: "def-promise-gap", keys: { gap: "inv-poly" } }], regime: [] })).toEqual([]);
  });

  test("a weaker context value does NOT entail a stronger requirement", () => {
    const ctx = buildContext([{ post: [{ obj: "def-promise-gap", keys: { gap: "inv-poly" } }] }]);
    const fails = ctx.unmet(profile, { pre: [{ obj: "def-promise-gap", keys: { gap: "const" } }], regime: [] });
    expect(fails).toHaveLength(1);
    expect(fails[0]!.key).toBe("gap");
    expect(fails[0]!.required).toBe("const");
    expect(fails[0]!.available).toEqual(["inv-poly"]);
  });

  test("a CAPPED key entails in the OPPOSITE direction: a tighter guarantee meets a looser cap", () => {
    // context guarantees d <= const; requirement asks for d <= poly. A tighter guarantee is
    // stronger, so it entails.
    const tight = buildContext([{ regime: [{ d_cap: "const" }] }]);
    expect(tight.unmet(profile, { pre: [], regime: [{ d_cap: "poly" }] })).toEqual([]);
    // ...and the reverse does NOT: a poly-dimension context cannot promise a constant cap.
    const loose = buildContext([{ regime: [{ d_cap: "poly" }] }]);
    const fails = loose.unmet(profile, { pre: [], regime: [{ d_cap: "const" }] });
    expect(fails).toHaveLength(1);
    expect(fails[0]!.key).toBe("d_cap");
  });

  test("polarity is load-bearing: the SAME values compare oppositely on an afforded vs a capped key", () => {
    const ctx = buildContext([{ regime: [{ d: "poly", d_cap: "poly" }] }]);
    expect(ctx.unmet(profile, { pre: [], regime: [{ d: "const" }] })).toEqual([]);
    expect(ctx.unmet(profile, { pre: [], regime: [{ d_cap: "const" }] })).toHaveLength(1);
  });

  test("an enum key entails only on exact equality (no order to compare)", () => {
    const ctx = buildContext([{ regime: [{ norm: "absolute" }] }]);
    expect(ctx.unmet(profile, { pre: [], regime: [{ norm: "relative" }] })).toHaveLength(1);
    expect(ctx.unmet(profile, { pre: [], regime: [{ norm: "absolute" }] })).toEqual([]);
  });

  test("a key the context never mentions is unmet, reported with an empty available list", () => {
    const fails = buildContext([]).unmet(profile, { pre: [], regime: [{ d: "poly" }] });
    expect(fails).toHaveLength(1);
    expect(fails[0]!.scope).toBe(AMBIENT_SCOPE);
    expect(fails[0]!.available).toEqual([]);
  });
});

describe("route-scoped entailment — the review's exact pair", () => {
  const signatureOf = new Map<string, Signature>([["lem-amp", LEM_AMP]]);

  test("REJECTS thm-qpcp (d=const) consuming lem-amp (d=poly), naming lem-amp's `d`", () => {
    const r = checkRoute({
      shardId: "thm-qpcp",
      signature: THM_QPCP_BAD,
      route: ["lem-amp"],
      signatureOf,
      profile,
    });
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]!.memberId).toBe("lem-amp");
    expect(r.failures[0]!.failure.key).toBe("d");
    expect(r.failures[0]!.failure.required).toBe("poly");
    expect(r.failures[0]!.failure.available).toEqual(["const"]);
    expect(r.entailmentsChecked).toBe(1);
  });

  test("the dependency's post is NOT added to the context when its demand is unmet", () => {
    const r = checkRoute({
      shardId: "thm-qpcp",
      signature: sig({ ...THM_QPCP_BAD, pre: [] }),
      route: ["lem-amp"],
      signatureOf,
      profile,
    });
    // thm's own post (gap=const) is now unsupported: lem-amp, which would have supplied it, was
    // never made available. Route entailment failing must never quietly still hand over the post.
    expect(r.postUnsupported.map((f) => f.key)).toEqual(["gap"]);
  });

  test("ACCEPTS the same chain when the amplifier is available in the context (d=poly)", () => {
    const r = checkRoute({ shardId: "thm-ok", signature: THM_QPCP_OK, route: ["lem-amp"], signatureOf, profile });
    expect(r.failures).toEqual([]);
    expect(r.postUnsupported).toEqual([]);
    expect(r.entailmentsChecked).toBe(1);
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

  test("members are walked in DEPENDENCY order, not declaration order", () => {
    // lem-b needs what lem-a provides. Declared b-then-a, the walk must still see a first.
    const lemA = sig({ post: [{ obj: "def-promise-gap", keys: { gap: "const" } }] });
    const lemB = sig({ pre: [{ obj: "def-promise-gap", keys: { gap: "const" } }] });
    const r = checkRoute({
      shardId: "thm",
      signature: sig({}),
      route: ["lem-b", "lem-a"],
      signatureOf: new Map([
        ["lem-a", lemA],
        ["lem-b", lemB],
      ]),
      depsOf: (id) => (id === "lem-b" ? ["lem-a"] : []),
      profile,
    });
    expect(r.failures).toEqual([]);
    expect(r.order).toEqual(["lem-a", "lem-b"]);
  });

  test("topoOrderMembers is deterministic and total even on a cycle (Check 6 owns the cycle)", () => {
    const order = topoOrderMembers(["b", "a"], (id) => (id === "a" ? ["b"] : ["a"]));
    expect(order).toEqual(["a", "b"]);
  });
});
