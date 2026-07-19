import { describe, expect, test } from "bun:test";
import { buildBdEdges } from "../../src/graph/from-bd";
import type { RegistryNode } from "../../src/graph/types";

function node(id: string): RegistryNode {
  return {
    id,
    kind: "lemma",
    path: `argument/lemmas/${id}.md`,
    contract: "c",
    af: "none",
    deps: [],
    routes: [],
    defs: [],
    balloons: { count: 0, classifications: [] },
  };
}

describe("buildBdEdges — registry id IS the bd issue key, no hazard on record", () => {
  test("a matching issue id resolves", () => {
    const edges = buildBdEdges([node("lem-x")], [{ id: "lem-x", status: "open" }]);
    expect(edges).toEqual([{ nodeId: "lem-x", issueId: "lem-x", status: "open", resolved: true }]);
  });

  test("an unrelated bd issue (no matching registry node) produces no edge at all", () => {
    const edges = buildBdEdges([node("lem-x")], [{ id: "aism-047", status: "closed" }]);
    expect(edges).toEqual([]);
  });

  test("a node with no bd issue at all produces no edge and no unresolved-bucket entry (PRD C5: no hazard on this edge)", () => {
    const edges = buildBdEdges([node("lem-x"), node("lem-y")], [{ id: "lem-x" }]);
    expect(edges).toEqual([{ nodeId: "lem-x", issueId: "lem-x", status: undefined, resolved: true }]);
  });
});
