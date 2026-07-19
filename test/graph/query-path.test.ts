// Unit + property tests for src/graph/query-path.ts's `computeCriticalPath` (M2.5). Ground truth:
// the module's own doc comment — a node is on the path iff reachable from the north star via
// AND-deps and/or OR-route members, transitively, BOTH route branches counted regardless of which
// is currently satisfied (the conservative, over-inclusive reading PRD C9/C2 requires so M3.4
// never batches a node that could become load-bearing).

import { describe, expect, test } from "bun:test";
import { computeCriticalPath } from "../../src/graph/query-path";
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
    edges: { af: [], bd: [], fr: [], report: [] },
    unresolved: [],
    conflicts: [],
  };
}

describe("computeCriticalPath", () => {
  test("unknown north star: found false, empty path", () => {
    const d = doc([node("a")]);
    const r = computeCriticalPath(d, "does-not-exist");
    expect(r).toEqual({ northStarId: "does-not-exist", found: false, nodeIds: [] });
  });

  test("a lone north star with no deps/routes: path is just itself", () => {
    const d = doc([node("a")]);
    const r = computeCriticalPath(d, "a");
    expect(r.found).toBe(true);
    expect(r.nodeIds).toEqual(["a"]);
  });

  test("a linear AND-dep chain: every ancestor is on the path", () => {
    const d = doc([
      node("a", { deps: ["b"] }),
      node("b", { deps: ["c"] }),
      node("c"),
      node("unrelated"),
    ]);
    const r = computeCriticalPath(d, "a");
    expect(r.nodeIds).toEqual(["a", "b", "c"]);
  });

  test("OR-routes: BOTH branches are on the path, even though only one is satisfied", () => {
    // "a" has two alternative routes to be established: route 1 ["b"], route 2 ["c"] -- only "b"
    // is af-validated (satisfied); "c" is a bare open problem. Both must appear on the path
    // (over-inclusion, query-path.ts's module doc): the unsatisfied route could win tomorrow.
    const d = doc([
      node("a", { routes: [["b"], ["c"]] }),
      node("b", { af: "validated" }),
      node("c", { status: "open" }),
    ]);
    const r = computeCriticalPath(d, "a");
    expect(r.nodeIds).toEqual(["a", "b", "c"]);
  });

  test("deps and routes combine: the full requirement closure, deduplicated", () => {
    const d = doc([
      node("a", { deps: ["shared"], routes: [["shared", "x"], ["y"]] }),
      node("shared"),
      node("x"),
      node("y"),
    ]);
    const r = computeCriticalPath(d, "a");
    expect(r.nodeIds).toEqual(["a", "shared", "x", "y"]);
  });

  test("a node reachable only through a dep-of-a-route-member is still included (deep transitivity)", () => {
    const d = doc([
      node("a", { routes: [["b"]] }),
      node("b", { deps: ["deep"] }),
      node("deep"),
    ]);
    const r = computeCriticalPath(d, "a");
    expect(r.nodeIds).toEqual(["a", "b", "deep"]);
  });

  test("a broken reference (dep naming no real node) does not crash -- simply absent from the path", () => {
    const d = doc([node("a", { deps: ["ghost"] })]);
    const r = computeCriticalPath(d, "a");
    expect(r.nodeIds).toEqual(["a"]);
  });

  test("a cycle does not infinite-loop -- every member of the cycle still appears exactly once", () => {
    const d = doc([node("a", { deps: ["b"] }), node("b", { deps: ["a"] })]);
    const r = computeCriticalPath(d, "a");
    expect(r.nodeIds).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------------------
// Monotonicity property test: adding an edge to the graph can only GROW the critical path from a
// fixed north star, never shrink it -- a mathematical fact about reachability closures (the set
// of nodes reachable under a bigger relation is a superset of the set reachable under any of its
// sub-relations), so this test is a genuine regression guard against an implementation bug (e.g.
// an accidental early-exit or a memoization leak), not a restatement of the algorithm.
// ---------------------------------------------------------------------------------------

// Deterministic mulberry32 PRNG -- no runtime dependency (CLAUDE.md L4), seed-reproducible, same
// generator shape test/graph/serialize.test.ts already uses for its own property tests.
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
    const deps = ids.filter(() => rand() < 0.15).filter((d) => d !== id);
    const hasRoutes = rand() < 0.3;
    const routes = hasRoutes
      ? [ids.filter(() => rand() < 0.15).filter((d) => d !== id), ids.filter(() => rand() < 0.15).filter((d) => d !== id)]
      : [];
    return node(id, { deps, routes });
  });
  return doc(nodes);
}

describe("computeCriticalPath — monotonicity property", () => {
  for (const seed of [1, 7, 42, 1000, 99999]) {
    test(`seed ${seed}: adding one requirement edge never removes a node from the critical path`, () => {
      const rand = mulberry32(seed);
      const d = buildRandomDoc(rand, 12);
      const before = computeCriticalPath(d, "n0");

      // Add one new AND-dep edge from a random existing node to another random existing node.
      const from = d.nodes[Math.floor(rand() * d.nodes.length)]!;
      const to = d.nodes[Math.floor(rand() * d.nodes.length)]!;
      const mutated: GraphDocument = {
        ...d,
        nodes: d.nodes.map((nd) => (nd.id === from.id ? { ...nd, deps: [...nd.deps, to.id] } : nd)),
      };
      const after = computeCriticalPath(mutated, "n0");

      if (before.found) {
        expect(after.found).toBe(true);
        for (const id of before.nodeIds) expect(after.nodeIds).toContain(id);
      }
      // The new edge's target is now on the path whenever its source already was.
      if (after.nodeIds.includes(from.id)) {
        expect(after.nodeIds).toContain(to.id);
      }
    });
  }
});
