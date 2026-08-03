// Unit tests for src/graph/query-blocks.ts's `computeWhatBlocks` (M2.5, PRD C5 "what blocks the
// north star"). Ground truth: the module's own doc comment -- `frontier` = path nodes whose own
// prerequisites (deps + at least one route) are met but whose own status/af is not yet
// available; `blocked` = path nodes whose own prerequisites are NOT yet met either.

import { describe, expect, test } from "bun:test";
import { computeWhatBlocks } from "../../src/graph/query-blocks";
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

describe("computeWhatBlocks", () => {
  test("unknown north star: found false, zero everything", () => {
    const d = doc([node("a")]);
    const r = computeWhatBlocks(d, "nope");
    expect(r).toEqual({ northStarId: "nope", found: false, pathSize: 0, satisfiedCount: 0, frontier: [], blocked: [] });
  });

  test("a fully satisfied north star: 1/1 satisfied, empty frontier and blocked", () => {
    const d = doc([node("a", { af: "validated" })]);
    const r = computeWhatBlocks(d, "a");
    expect(r).toEqual({ northStarId: "a", found: true, pathSize: 1, satisfiedCount: 1, frontier: [], blocked: [] });
  });

  test("a leaf north star with no deps and no af/cited status: it IS the frontier (own prerequisites vacuously met)", () => {
    const d = doc([node("a", { status: "conjecture" })]);
    const r = computeWhatBlocks(d, "a");
    expect(r.satisfiedCount).toBe(0);
    expect(r.frontier).toHaveLength(1);
    expect(r.frontier[0]!.id).toBe("a");
    expect(r.blocked).toEqual([]);
  });

  test("a dep chain: the north star is blocked (its own dep is not yet available), the dep is the frontier", () => {
    const d = doc([
      node("a", { deps: ["b"], status: "conjecture" }),
      node("b", { status: "open" }),
    ]);
    const r = computeWhatBlocks(d, "a");
    expect(r.pathSize).toBe(2);
    expect(r.satisfiedCount).toBe(0);
    expect(r.frontier.map((e) => e.id)).toEqual(["b"]);
    expect(r.blocked.map((e) => e.id)).toEqual(["a"]);
    expect(r.blocked[0]!.reasons.some((m) => m.includes("unmet dep(s): b"))).toBe(true);
  });

  test("OR-routes: no route satisfied is reported as a reason and keeps the node off the frontier if its own deps also unmet", () => {
    const d = doc([
      node("a", { routes: [["b"], ["c"]], status: "conjecture" }),
      node("b", { status: "open" }),
      node("c", { status: "open" }),
    ]);
    const r = computeWhatBlocks(d, "a");
    // a's own routes are unmet -> a is blocked (its own prerequisites not satisfied); b and c are
    // each independently their own frontier entries (leaves, vacuously self-satisfying).
    expect(r.blocked.map((e) => e.id)).toEqual(["a"]);
    expect(r.frontier.map((e) => e.id).sort()).toEqual(["b", "c"]);
    expect(r.blocked[0]!.reasons.some((m) => m.includes("no route fully satisfied"))).toBe(true);
  });

  test("a satisfied route makes the node's own prerequisites met -- it becomes frontier, not blocked", () => {
    const d = doc([
      node("a", { routes: [["b"], ["c"]], status: "conjecture" }),
      node("b", { af: "validated" }),
      node("c", { status: "open" }),
    ]);
    const r = computeWhatBlocks(d, "a");
    expect(r.satisfiedCount).toBe(1); // b
    // "a" is frontier (its own route through "b" is satisfied); "c" is ALSO on the path
    // (over-inclusion: the unsatisfied route counts too) and is itself a leaf frontier entry.
    expect(r.frontier.map((e) => e.id).sort()).toEqual(["a", "c"]);
    expect(r.blocked).toEqual([]);
  });
});
