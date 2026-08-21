// 1:1 test file for src/graph/bite.ts — the MECHANICAL half of the bite admission criterion
// (docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md section 8, repairing Tier A review LB3:
// "the bite criterion is both prose-only and trivially gameable"). NOT wired into any gate: Gate C
// is A1/N2 work (beads rk-ptx0 / rk-lmtr). This file pins the core so that when Gate C lands it
// consumes a tested function instead of re-deriving one.
//
// The four gameable moves LB3 named, and where each is caught here:
//   alias renaming            -> canonical identity compares OBJECT IDS, so a rename changes nothing
//   spectator consume         -> `spectatorConsumes`
//   redundant-predicate inflation -> `stripRedundant`, applied before every comparison
//   signature-only inflation  -> `advanceClause` demands a STRICT strengthening, not just a change

import { describe, expect, test } from "bun:test";
import type { Signature } from "../../src/gates/signature";
import { canonicalSignatureText } from "../../src/gates/signature";
import { parseConventionProfile, type ConventionProfile } from "../../src/gates/signature-profile";
import {
  advanceClause,
  spectatorConsumes,
  stripRedundant,
  strongerOrEqual,
  type BiteDag,
} from "../../src/graph/bite";

const profile: ConventionProfile = (() => {
  const p = parseConventionProfile(
    "rk-test.v1",
    JSON.stringify({
      lattices: {
        gap: ["inv-poly", "inv-log", "const"],
        qdim: ["const", "polylog", "poly"],
        reduction: { kind: "poset", values: ["karp", "quasi-poly", "turing"], edges: [["karp", "quasi-poly"], ["karp", "turing"]] },
      },
      enums: { norm: ["relative", "absolute"] },
    }),
  );
  if (!p.ok) throw new Error(p.why);
  return p.profile;
})();

function sig(parts: Partial<Signature>): Signature {
  return { schema_version: "1", profile: "rk-test.v1", pre: [], post: [], regime: [], ...parts };
}

// Deterministic mulberry32 — no runtime dependency (L4), seed-reproducible, test-only.
function mulberry32(seed: number): () => number {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GAP = ["inv-poly", "inv-log", "const"];
const QDIM = ["const", "polylog", "poly"];

/** A random signature over the fixture profile — point and ranged intervals, on two objects. */
function randomSignature(rand: () => number): Signature {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const value = (values: readonly string[]): string | [string | null, string | null] => {
    const a = Math.floor(rand() * values.length);
    const b = Math.floor(rand() * values.length);
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    if (lo === hi) return values[lo]!;
    return [rand() < 0.2 ? null : values[lo]!, rand() < 0.2 ? null : values[hi]!];
  };
  const objects = ["def-a", "def-b"].filter(() => rand() < 0.8);
  return sig({
    pre: objects.map((obj) => ({ obj, keys: { gap: value(GAP) } })),
    post: objects.map((obj) => ({ obj, keys: { qdim: value(QDIM) } })),
    regime: rand() < 0.5 ? [{ gap: value(GAP) }] : [],
    ...(rand() < 0.3 ? { pre: [{ obj: pick(objects.length ? objects : ["def-a"]), keys: { gap: value(GAP) } }] } : {}),
  });
}

describe("the partial order (memo section 8, item 2)", () => {
  // Direction, stated once because it is the thing to get wrong: a REQUIREMENT interval is weaker
  // the WIDER it is (more contexts fall inside it), while a PROVISION is stronger the narrower it
  // is (it pins the parameter down further). So the stronger signature has the wider `pre` and the
  // narrower `post`.
  const weak = sig({ pre: [{ obj: "def-a", keys: { gap: "const" } }], post: [{ obj: "def-b", keys: { qdim: ["const", "poly"] } }] });
  const strong = sig({ pre: [{ obj: "def-a", keys: { gap: ["inv-poly", "const"] } }], post: [{ obj: "def-b", keys: { qdim: "const" } }] });

  test("needing LESS and giving MORE is stronger; the reverse is not", () => {
    expect(strongerOrEqual(strong, weak, profile)).toBe(true);
    expect(strongerOrEqual(weak, strong, profile)).toBe(false);
  });

  test("reflexive", () => {
    for (const s of [weak, strong]) expect(strongerOrEqual(s, s, profile)).toBe(true);
  });

  test("a signature that declares a key the other does not is not weaker for it", () => {
    const bare = sig({ pre: [{ obj: "def-a", keys: { gap: "const" } }] });
    const extra = sig({ pre: [{ obj: "def-a", keys: { gap: "const", norm: "relative" } }] });
    // `extra` needs MORE (an extra condition on its context), so it is NOT at least as strong.
    expect(strongerOrEqual(extra, bare, profile)).toBe(false);
    expect(strongerOrEqual(bare, extra, profile)).toBe(true);
  });

  test("PROPERTY: reflexive and transitive over random signatures", () => {
    const rand = mulberry32(20260820);
    const sample = Array.from({ length: 40 }, () => randomSignature(rand));
    for (const s of sample) expect(strongerOrEqual(s, s, profile)).toBe(true);
    let checked = 0;
    for (const a of sample) {
      for (const b of sample) {
        if (!strongerOrEqual(a, b, profile)) continue;
        for (const c of sample) {
          if (!strongerOrEqual(b, c, profile)) continue;
          checked++;
          expect(strongerOrEqual(a, c, profile)).toBe(true);
        }
      }
    }
    // A property test that never fired its hypothesis proves nothing.
    expect(checked).toBeGreaterThan(50);
  });

  test("PROPERTY: ANTISYMMETRIC on stripped signatures — mutual strength means the same claim", () => {
    const rand = mulberry32(7);
    const sample = Array.from({ length: 40 }, () => randomSignature(rand));
    let mutual = 0;
    for (const a of sample) {
      for (const b of sample) {
        if (!strongerOrEqual(a, b, profile) || !strongerOrEqual(b, a, profile)) continue;
        mutual++;
        expect(canonicalSignatureText(stripRedundant(a, profile))).toBe(canonicalSignatureText(stripRedundant(b, profile)));
      }
    }
    expect(mutual).toBeGreaterThan(40);
  });
});

describe("canonical identity is immune to RENAMING (LB3's first gameable move)", () => {
  test("PROPERTY: reordering entries and keys never changes the canonical text", () => {
    const rand = mulberry32(99);
    for (let i = 0; i < 20; i++) {
      const s = randomSignature(rand);
      const shuffled = sig({
        ...s,
        pre: [...s.pre].reverse().map((p) => ({ obj: p.obj, keys: Object.fromEntries(Object.entries(p.keys).reverse()) })),
        post: [...s.post].reverse(),
        regime: [...s.regime].reverse(),
      });
      expect(canonicalSignatureText(shuffled)).toBe(canonicalSignatureText(s));
    }
  });

  test("a candidate whose canonical signature equals an admitted one is SUBSUMED, not an advance", () => {
    const s = sig({ pre: [{ obj: "def-a", keys: { gap: "const" } }], post: [{ obj: "def-b", keys: { qdim: "const" } }] });
    const dag: BiteDag = { admitted: new Map([["thm-old", s]]), objectClosure: new Set(["def-a", "def-b"]), profile };
    const v = advanceClause({ id: "thm-new-name", signature: s, statementBlessed: "about def-a and def-b" }, dag);
    expect(v.ok).toBe(false);
    expect(v.clause).toBe("none");
    expect(v.reason).toContain("subsumption");
    expect(v.reason).toContain("thm-old");
  });
});

describe("spectator exclusion (LB3's second gameable move)", () => {
  const s = sig({
    pre: [
      { obj: "def-real", keys: { gap: "const" } },
      { obj: "def-spectator-register", keys: { gap: "const" } },
    ],
  });

  test("a pre object occurring nowhere is named", () => {
    expect(spectatorConsumes(s, "A statement mentioning def-real only.", [])).toEqual(["def-spectator-register"]);
  });

  test("a declared decomposition member counts as an occurrence", () => {
    expect(spectatorConsumes(s, "A statement mentioning def-real only.", ["def-spectator-register"])).toEqual([]);
  });

  test("KNOWN WEAKNESS, recorded not hidden: the statement test is LEXICAL", () => {
    // Mentioning the id in passing satisfies it. This is the residual the Tier A review flagged
    // and rk-8805 carries forward; it is documented in the module, not papered over.
    expect(spectatorConsumes(s, "def-real, and def-spectator-register is not used here", [])).toEqual([]);
  });
});

describe("redundancy stripping (LB3's third gameable move)", () => {
  const inflated = sig({
    pre: [
      { obj: "def-a", keys: { gap: ["inv-poly", "const"] } },
      { obj: "def-a", keys: { gap: "const" } },
    ],
  });

  test("a predicate implied by another is dropped; the strongest survives", () => {
    const s = stripRedundant(inflated, profile);
    expect(s.pre).toHaveLength(1);
    expect(s.pre[0]!.keys.gap).toBe("const");
  });

  test("PROPERTY: idempotent", () => {
    const rand = mulberry32(1234);
    for (let i = 0; i < 25; i++) {
      const once = stripRedundant(randomSignature(rand), profile);
      expect(canonicalSignatureText(stripRedundant(once, profile))).toBe(canonicalSignatureText(once));
    }
  });

  test("inflation by redundant atoms changes NOTHING about the order", () => {
    const lean = sig({ pre: [{ obj: "def-a", keys: { gap: "const" } }] });
    expect(strongerOrEqual(inflated, lean, profile)).toBe(true);
    expect(strongerOrEqual(lean, inflated, profile)).toBe(true);
    expect(canonicalSignatureText(stripRedundant(inflated, profile))).toBe(canonicalSignatureText(stripRedundant(lean, profile)));
  });

  test("overlapping predicates are conjoined to their interval intersection", () => {
    const irreducible = sig({
      pre: [
        { obj: "def-a", keys: { gap: ["inv-poly", "inv-log"] } },
        { obj: "def-a", keys: { gap: ["inv-log", "const"] } },
      ],
    });
    const stripped = stripRedundant(irreducible, profile);
    expect(stripped.pre).toHaveLength(1);
    expect(stripped.pre[0]!.keys.gap).toBe("inv-log");
  });

  test("a contradictory signature is never stronger than an admitted one", () => {
    const contradictory = sig({ regime: [{ qdim: "const" }, { qdim: "poly" }] });
    expect(strongerOrEqual(contradictory, sig({ regime: [{ qdim: "poly" }] }), profile)).toBe(false);
  });
});

describe("advanceClause (memo section 8, item 4)", () => {
  const target = sig({ pre: [{ obj: "def-a", keys: { gap: "const" } }], post: [{ obj: "def-b", keys: { qdim: ["const", "poly"] } }] });
  const dag = (over: Partial<BiteDag> = {}): BiteDag => ({
    admitted: new Map([["thm-target", target]]),
    objectClosure: new Set(["def-a", "def-b"]),
    profile,
    ...over,
  });
  const stronger = sig({ pre: [{ obj: "def-a", keys: { gap: ["inv-poly", "const"] } }], post: [{ obj: "def-b", keys: { qdim: "const" } }] });

  test("(i) decomposition: a declared route member strictly stronger than its target", () => {
    const v = advanceClause(
      { id: "lem-new", signature: stronger, statementBlessed: "def-a def-b", decomposition: { targetId: "thm-target", memberIds: ["lem-new"] } },
      dag(),
    );
    expect(v).toMatchObject({ ok: true, clause: "i" });
  });

  test("(i) is refused when the declared target is not admitted", () => {
    const v = advanceClause(
      { id: "lem-new", signature: stronger, statementBlessed: "def-a def-b", decomposition: { targetId: "thm-ghost", memberIds: [] } },
      dag(),
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("thm-ghost");
  });

  test("(ii) strengthening: strictly stronger than an admitted shard with the SAME post objects", () => {
    const v = advanceClause({ id: "thm-better", signature: stronger, statementBlessed: "def-a def-b" }, dag());
    expect(v).toMatchObject({ ok: true, clause: "ii" });
  });

  test("(iii) new tool: a non-spectator pre object outside the DAG's closure", () => {
    const withNewObject = sig({ pre: [{ obj: "def-new-tool", keys: { gap: "const" } }], post: [{ obj: "def-c", keys: { qdim: "const" } }] });
    const v = advanceClause({ id: "lem-tool", signature: withNewObject, statementBlessed: "uses def-new-tool" }, dag());
    expect(v).toMatchObject({ ok: true, clause: "iii" });
  });

  test("(iii) does NOT count a SPECTATOR object (LB3's exact exploit)", () => {
    const spectator = sig({
      pre: [{ obj: "def-a", keys: { gap: ["inv-poly", "const"] } }, { obj: "def-spectator-register", keys: { gap: "const" } }],
      post: [{ obj: "def-b", keys: { qdim: "const" } }],
    });
    const v = advanceClause({ id: "thm-inflated", signature: spectator, statementBlessed: "def-a and def-b" }, dag());
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("spectator");
    expect(v.reason).toContain("def-spectator-register");
  });

  test("signature-only inflation: a WEAKER restatement advances nothing", () => {
    const weaker = sig({ pre: [{ obj: "def-a", keys: { gap: "const" } }], post: [{ obj: "def-b", keys: { qdim: ["const", "poly"] } }], regime: [{ norm: "relative" }] });
    const v = advanceClause({ id: "thm-reworded", signature: weaker, statementBlessed: "def-a def-b" }, dag());
    expect(v.ok).toBe(false);
    expect(v.clause).toBe("none");
  });

  test("an EMPTY dag admits a first candidate through clause (iii), not vacuously through (ii)", () => {
    const v = advanceClause(
      { id: "thm-first", signature: stronger, statementBlessed: "def-a def-b" },
      { admitted: new Map(), objectClosure: new Set(), profile },
    );
    expect(v).toMatchObject({ ok: true, clause: "iii" });
  });
});
