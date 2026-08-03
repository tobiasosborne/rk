// 1:1 test file for src/drive/batch-composer.ts (M3.4). Ground truth: IMPLEMENTATION_PLAN.md
// M3.4's acceptance bar ("chained pair never batches; critical-path node never batches; composer
// prefers siblings over scattered nodes in a synthetic fixture") plus PRD C3's guardrails
// (independence, cap, critical-path exclusion, shared-context preference, determinism).

import { describe, expect, test } from "bun:test";
import { composeBatches, deriveBatchId, DEFAULT_BATCH_CAP } from "../../src/drive/batch-composer";
import { afNodeKey, type BatchCandidate } from "../../src/drive/batch-eligibility";
import type { GraphDocument, RegistryNode } from "../../src/graph/types";
import { GRAPH_SCHEMA_VERSION } from "../../src/graph/types";

function node(id: string, overrides: Partial<RegistryNode> = {}): RegistryNode {
  return {
    id,
    kind: "lemma",
    path: `argument/${id}.md`,
    contract: `${id} holds.`,
    af: "none",
    deps: [],
    routes: [],
    defs: [],
    balloons: { count: 0, classifications: [] },
    ...overrides,
  };
}

function doc(nodes: RegistryNode[]): GraphDocument {
  return {
    schema_version: GRAPH_SCHEMA_VERSION,
    nodes,
    edges: { af: [], bd: [], fr: [], report: [], retraction: [] },
    unresolved: [],
    conflicts: [],
  };
}

function allMembers(batches: { members: string[] }[]): string[] {
  return batches.flatMap((b) => b.members);
}

/** Fully-evidenced l5 candidates — the ONLY shape src/drive/batch-eligibility.ts lets through, so
 * every pre-rk-74o test below now states the evidence it used to leave implicit. */
function l5(...ids: string[]): BatchCandidate[] {
  return ids.map((id) => ({ id, tier: "l5" as const, crux: false }));
}

const L5 = { tier: "l5" as const };

describe("composeBatches — independence guardrail (a chained pair must be impossible in one batch)", () => {
  test("direct dependency: b depends on a -- never co-batched", () => {
    const d = doc([node("z"), node("a"), node("b", { deps: ["a"] })]);
    const r = composeBatches(d, l5("a", "b"), "z", L5);
    expect(r.excluded).toEqual([]);
    for (const b of r.batches) expect(b.members).not.toEqual(expect.arrayContaining(["a", "b"]));
    expect(r.batches.every((b) => b.members.length === 1)).toBe(true);
  });

  test("transitive dependency: c -> b -> a -- no two of the chain ever co-batch", () => {
    const d = doc([node("z"), node("a"), node("b", { deps: ["a"] }), node("c", { deps: ["b"] })]);
    const r = composeBatches(d, l5("a", "b", "c"), "z", L5);
    expect(r.excluded).toEqual([]);
    expect(r.batches.every((b) => b.members.length === 1)).toBe(true);
  });

  test("chain via an OR-route member: b's route names a -- never co-batched even though the route may go unsatisfied", () => {
    const d = doc([
      node("z"),
      node("a"),
      node("other"),
      node("b", { routes: [["a"], ["other"]] }),
    ]);
    const r = composeBatches(d, l5("a", "b"), "z", L5);
    expect(r.excluded).toEqual([]);
    expect(r.batches.every((b) => b.members.length === 1)).toBe(true);
  });

  test("two independent nodes with no relation DO co-batch", () => {
    const d = doc([node("z"), node("a"), node("b")]);
    const r = composeBatches(d, l5("a", "b"), "z", L5);
    expect(r.batches).toHaveLength(1);
    expect(r.batches[0]!.members).toEqual(["a", "b"]);
  });
});

describe("composeBatches — critical-path exclusion", () => {
  test("a node on the path to the north star is never batched, and is reported excluded with reason critical-path", () => {
    const d = doc([node("star", { deps: ["crit"] }), node("crit"), node("routine")]);
    const r = composeBatches(d, l5("crit", "routine"), "star", L5);
    expect(r.excluded.map((e) => [e.id, e.reason])).toContainEqual(["crit", "critical-path"]);
    expect(allMembers(r.batches)).not.toContain("crit");
    expect(allMembers(r.batches)).toContain("routine");
  });

  test("an id naming no real node is reported excluded with reason unknown-node, never silently dropped", () => {
    const d = doc([node("star"), node("routine")]);
    const r = composeBatches(d, l5("routine", "ghost"), "star", L5);
    expect(r.excluded.map((e) => [e.id, e.reason])).toContainEqual(["ghost", "unknown-node"]);
    expect(allMembers(r.batches)).toEqual(["routine"]);
  });

  test("BLOCKER 5d — an UNRESOLVED north star fails closed: every candidate is treated load-bearing and excluded, NO batch is composed", () => {
    const d = doc([node("a"), node("b"), node("c")]);
    const r = composeBatches(d, l5("a", "b", "c"), "north-star-does-not-exist", L5);
    // Pre-fix: computeCriticalPath returns an EMPTY set for an unresolved north star, so nothing is
    // excluded and every candidate co-batches — the exact "permits every batch" hole the review named.
    expect(r.batches).toEqual([]);
    expect(r.excluded.map((e) => e.id).sort()).toEqual(["a", "b", "c"]);
    for (const e of r.excluded) expect(e.reason).toBe("north-star-unresolved");
  });
});

describe("composeBatches — cap", () => {
  test("default cap is respected with more candidates than the cap", () => {
    const nodes = [node("z"), ...Array.from({ length: DEFAULT_BATCH_CAP + 5 }, (_, i) => node(`n${i}`))];
    const d = doc(nodes);
    const candidates = nodes.filter((n) => n.id !== "z").map((n) => n.id);
    const r = composeBatches(d, l5(...candidates), "z", L5);
    expect(r.batches.every((b) => b.members.length <= DEFAULT_BATCH_CAP)).toBe(true);
    expect(allMembers(r.batches).sort()).toEqual([...candidates].sort());
  });

  test("a config cap is respected and never exceeded", () => {
    const nodes = [node("z"), ...Array.from({ length: 7 }, (_, i) => node(`n${i}`))];
    const d = doc(nodes);
    const candidates = nodes.filter((n) => n.id !== "z").map((n) => n.id);
    const r = composeBatches(d, l5(...candidates), "z", { ...L5, cap: 2 });
    expect(r.batches.every((b) => b.members.length <= 2)).toBe(true);
    expect(r.batches.length).toBeGreaterThanOrEqual(Math.ceil(candidates.length / 2));
  });
});

describe("composeBatches — shared-context preference (siblings over scattered nodes)", () => {
  test("sibling leaves of a shared (non-critical-path) parent are grouped ahead of unrelated scattered nodes", () => {
    const d = doc([
      node("star", { deps: ["m"] }),
      node("m"),
      node("parent-p", { deps: ["leaf-a", "leaf-b", "leaf-c"] }),
      node("leaf-a"),
      node("leaf-b"),
      node("leaf-c"),
      node("scatter-x"),
      node("scatter-y"),
    ]);
    const candidates = ["leaf-a", "leaf-b", "leaf-c", "scatter-x", "scatter-y"];
    const r = composeBatches(d, l5(...candidates), "star", { ...L5, cap: 3 });
    expect(r.excluded).toEqual([]);
    expect(r.batches).toHaveLength(2);
    expect(r.batches[0]!.members).toEqual(["leaf-a", "leaf-b", "leaf-c"]);
    expect(r.batches[1]!.members).toEqual(["scatter-x", "scatter-y"]);
    // The cohesive batch's score must be strictly higher than the scattered one's.
    expect(r.batches[0]!.score).toBeGreaterThan(r.batches[1]!.score);
    expect(r.batches[1]!.score).toBe(0);
  });

  test("shared defs also contribute to the cohesion score", () => {
    const d = doc([
      node("star"),
      node("a", { defs: ["def-x"] }),
      node("b", { defs: ["def-x"] }),
      node("c", { defs: ["def-y"] }),
    ]);
    const r = composeBatches(d, l5("a", "b", "c"), "star", L5);
    expect(r.batches).toHaveLength(1);
    expect(r.batches[0]!.score).toBeGreaterThan(0);
  });
});

describe("composeBatches — determinism", () => {
  test("same candidate set in a different order produces byte-identical output", () => {
    const d = doc([
      node("star", { deps: ["m"] }),
      node("m"),
      node("parent-p", { deps: ["leaf-a", "leaf-b", "leaf-c"] }),
      node("leaf-a"),
      node("leaf-b"),
      node("leaf-c"),
      node("scatter-x"),
      node("scatter-y"),
    ]);
    const forward = ["leaf-a", "leaf-b", "leaf-c", "scatter-x", "scatter-y"];
    const reversed = [...forward].reverse();
    const shuffled = ["scatter-y", "leaf-c", "leaf-a", "scatter-x", "leaf-b"];
    const r1 = composeBatches(d, l5(...forward), "star", { ...L5, cap: 3 });
    const r2 = composeBatches(d, l5(...reversed), "star", { ...L5, cap: 3 });
    const r3 = composeBatches(d, l5(...shuffled), "star", { ...L5, cap: 3 });
    expect(r2).toEqual(r1);
    expect(r3).toEqual(r1);
  });
});

describe("deriveBatchId", () => {
  test("deterministic: same north star + same members -> same id, regardless of member array order", () => {
    const id1 = deriveBatchId("star", ["b", "a", "c"]);
    const id2 = deriveBatchId("star", ["c", "b", "a"]);
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^batch-[0-9a-f]{16}$/);
  });

  test("changing membership changes the id", () => {
    const id1 = deriveBatchId("star", ["a", "b"]);
    const id2 = deriveBatchId("star", ["a", "b", "c"]);
    expect(id1).not.toBe(id2);
  });

  test("changing the north star changes the id even with identical members", () => {
    const id1 = deriveBatchId("star-1", ["a", "b"]);
    const id2 = deriveBatchId("star-2", ["a", "b"]);
    expect(id1).not.toBe(id2);
  });
});

// ---------------------------------------------------------------------------------------
// rk-74o (M3 review follow-up 3): the guardrails are STRUCTURAL, not a caller promise. Each test
// below is RED without the corresponding check in src/drive/batch-eligibility.ts / this composer.
// ---------------------------------------------------------------------------------------

describe("composeBatches — rk-74o: eligibility is enforced, never promised", () => {
  test("a bare candidate carrying NO evidence composes NOTHING (the caller promise no longer works)", () => {
    const d = doc([node("z"), node("a"), node("b")]);
    const r = composeBatches(d, [{ id: "a" }, { id: "b" }], "z", L5);
    expect(r.batches).toEqual([]);
    expect(r.excluded.map((e) => e.reason).sort()).toEqual(["tier-undeclared", "tier-undeclared"]);
  });

  test("an UNDECLARED dispatch tier composes nothing, even for otherwise-perfect candidates", () => {
    const d = doc([node("z"), node("a"), node("b")]);
    const r = composeBatches(d, l5("a", "b"), "z", {});
    expect(r.batches).toEqual([]);
    expect(r.tier).toBeUndefined();
    for (const e of r.excluded) expect(e.reason).toBe("dispatch-tier-undeclared");
  });

  test("a crux candidate is refused even though it is registry-independent and off the critical path", () => {
    const d = doc([node("z"), node("a"), node("b")]);
    const r = composeBatches(d, [{ id: "a", tier: "l5", crux: true }, { id: "b", tier: "l5", crux: false }], "z", L5);
    expect(allMembers(r.batches)).toEqual(["b"]);
    expect(r.excluded.map((e) => [e.id, e.reason])).toContainEqual(["a", "crux"]);
  });

  test("every composed batch carries the run's dispatch tier — tier is derived, never re-supplied downstream", () => {
    const d = doc([node("z"), node("a"), node("b")]);
    const r = composeBatches(d, l5("a", "b"), "z", L5);
    expect(r.tier).toBe("l5");
    expect(r.batches.every((b) => b.tier === "l5")).toBe(true);
  });

  test("accounting: every candidate id lands in exactly one of batches/excluded, evidence or not", () => {
    const d = doc([node("z"), node("a"), node("b"), node("c")]);
    const r = composeBatches(d, [...l5("a", "b"), { id: "c" }, { id: "ghost" }], "z", L5);
    const accounted = [...allMembers(r.batches), ...r.excluded.map((e) => e.id)].sort();
    expect(accounted).toEqual(["a", "b", "c", "ghost"]);
    expect(new Set(accounted).size).toBe(accounted.length);
  });
});

describe("composeBatches — rk-74o: af proof-tree independence (hard tier)", () => {
  const WS = "proofs/ws";
  const afParents = new Map<string, readonly string[]>([
    [afNodeKey(WS, "1"), []],
    [afNodeKey(WS, "1.1"), [afNodeKey(WS, "1")]],
    [afNodeKey(WS, "1.1.1"), [afNodeKey(WS, "1.1")]],
    [afNodeKey(WS, "1.2"), [afNodeKey(WS, "1")]],
  ]);
  function hard(id: string, afNodeId: string): BatchCandidate {
    return { id, tier: "hard", crux: false, afWorkspace: WS, afNodeId };
  }

  test("an af ANCESTOR/DESCENDANT pair never co-batches, even though the registry sees them as independent", () => {
    // The registry graph deliberately records NO dependency between "a" and "b": if af ancestry were
    // ignored, these two would co-batch and accepting the child would bias its own ancestor.
    const d = doc([node("z"), node("a"), node("b")]);
    const r = composeBatches(d, [hard("a", "1.1"), hard("b", "1.1.1")], "z", { tier: "hard", afParents });
    expect(r.excluded).toEqual([]);
    expect(r.batches.every((x) => x.members.length === 1)).toBe(true);
  });

  test("af SIBLINGS (a shared ancestor, neither above the other) DO co-batch — the shape C3 wants", () => {
    const d = doc([node("z"), node("a"), node("b")]);
    const r = composeBatches(d, [hard("a", "1.1"), hard("b", "1.2")], "z", { tier: "hard", afParents });
    expect(r.batches).toHaveLength(1);
    expect(r.batches[0]!.members).toEqual(["a", "b"]);
  });

  test("a hard-tier run with NO af parent edges composes nothing — ancestry is unclosable, so nothing is independent", () => {
    const d = doc([node("z"), node("a"), node("b")]);
    const r = composeBatches(d, [hard("a", "1.1"), hard("b", "1.2")], "z", { tier: "hard" });
    expect(r.batches).toEqual([]);
    for (const e of r.excluded) expect(e.reason).toBe("af-ancestry-unclosable");
  });
});

// ---------------------------------------------------------------------------------------
// Property tests. Deterministic mulberry32 PRNG -- no runtime dependency (CLAUDE.md L4), the
// same generator shape test/graph/query-path.test.ts and test/graph/serialize.test.ts already use.
// ---------------------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRandomDoc(rand: () => number, n: number): GraphDocument {
  const ids = Array.from({ length: n }, (_, i) => `n${i}`);
  const nodes = ids.map((id) => {
    const deps = ids.filter(() => rand() < 0.12).filter((d) => d !== id);
    const hasRoutes = rand() < 0.2;
    const routes = hasRoutes
      ? [ids.filter(() => rand() < 0.1).filter((d) => d !== id), ids.filter(() => rand() < 0.1).filter((d) => d !== id)]
      : [];
    const defs = ids.filter(() => rand() < 0.08).map((x) => `def-${x}`);
    return node(id, { deps, routes, defs });
  });
  return doc(nodes);
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

describe("composeBatches — cap property", () => {
  for (const seed of [1, 7, 42, 1000, 99999]) {
    for (const cap of [1, 2, 4]) {
      test(`seed ${seed}, cap ${cap}: no batch ever exceeds the cap; every candidate is accounted for exactly once`, () => {
        const rand = mulberry32(seed);
        const d = buildRandomDoc(rand, 16);
        const candidates = d.nodes.filter((n) => n.id !== "n0").map((n) => n.id);
        const r = composeBatches(d, l5(...candidates), "n0", { ...L5, cap });
        expect(r.batches.every((b) => b.members.length <= cap)).toBe(true);

        const accounted = [...allMembers(r.batches), ...r.excluded.map((e) => e.id)].sort();
        expect(accounted).toEqual([...candidates].sort());

        // No candidate appears in two places (batched twice, or both batched and excluded).
        expect(new Set(accounted).size).toBe(accounted.length);
      });
    }
  }
});

describe("composeBatches — determinism property", () => {
  for (const seed of [2, 13, 500, 8675]) {
    test(`seed ${seed}: shuffling the candidate array never changes the composed result`, () => {
      const rand = mulberry32(seed);
      const d = buildRandomDoc(rand, 14);
      const candidates = d.nodes.filter((n) => n.id !== "n0").map((n) => n.id);
      const baseline = composeBatches(d, l5(...candidates), "n0", { ...L5, cap: 4 });
      for (let trial = 0; trial < 3; trial++) {
        const shuffled = shuffle(candidates, rand);
        const result = composeBatches(d, l5(...shuffled), "n0", { ...L5, cap: 4 });
        expect(result).toEqual(baseline);
      }
    });
  }
});
