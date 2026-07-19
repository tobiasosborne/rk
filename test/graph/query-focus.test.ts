// Unit tests for src/graph/query-focus.ts's `computeFocusView` (M2.5, PRD C5 focus view: one
// node's neighborhood -- deps/routes with per-route satisfaction, dependents, af/bd/fr/report
// edges, conflicts).

import { describe, expect, test } from "bun:test";
import { computeFocusView } from "../../src/graph/query-focus";
import type {
  AfEdge, BdEdge, ConflictRecord, FrEdge, GraphDocument, ReportEdge, RegistryNode,
} from "../../src/graph/types";
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

function doc(
  nodes: RegistryNode[],
  edges: { af?: AfEdge[]; bd?: BdEdge[]; fr?: FrEdge[]; report?: ReportEdge[] } = {},
  conflicts: ConflictRecord[] = [],
): GraphDocument {
  return {
    schema_version: GRAPH_SCHEMA_VERSION,
    nodes,
    edges: { af: edges.af ?? [], bd: edges.bd ?? [], fr: edges.fr ?? [], report: edges.report ?? [] },
    unresolved: [],
    conflicts,
  };
}

describe("computeFocusView", () => {
  test("unknown id: found false, everything empty/false", () => {
    const d = doc([node("a")]);
    const view = computeFocusView(d, "nope");
    expect(view.found).toBe(false);
    expect(view.deps).toEqual([]);
    expect(view.dependents).toEqual([]);
  });

  test("a leaf node with no deps/routes: requirementsMet vacuously true", () => {
    const d = doc([node("a")]);
    const view = computeFocusView(d, "a");
    expect(view.found).toBe(true);
    expect(view.requirementsMet).toBe(true);
    expect(view.available).toBe(false); // af:none, no status -- not available
    expect(view.deps).toEqual([]);
    expect(view.routes).toEqual([]);
  });

  test("deps: each annotated with resolved status/af/available, unresolved ids flagged", () => {
    const d = doc([
      node("a", { deps: ["b", "ghost"] }),
      node("b", { af: "validated" }),
    ]);
    const view = computeFocusView(d, "a");
    expect(view.deps).toEqual([
      { id: "b", status: undefined, af: "validated", available: true, unresolved: false },
      { id: "ghost", status: undefined, af: undefined, available: false, unresolved: true },
    ]);
    expect(view.requirementsMet).toBe(false); // "ghost" unmet
  });

  test("routes: per-route satisfaction reported independently", () => {
    const d = doc([
      node("a", { routes: [["b"], ["c"]] }),
      node("b", { af: "validated" }),
      node("c", { status: "open" }),
    ]);
    const view = computeFocusView(d, "a");
    expect(view.routes).toHaveLength(2);
    expect(view.routes[0]).toMatchObject({ satisfied: true });
    expect(view.routes[1]).toMatchObject({ satisfied: false });
    expect(view.requirementsMet).toBe(true); // route 1 alone suffices
  });

  test("dependents: reverse index over both deps and route members", () => {
    const d = doc([
      node("a", { deps: ["shared"] }),
      node("b", { routes: [["shared"]] }),
      node("shared"),
      node("unrelated"),
    ]);
    const view = computeFocusView(d, "shared");
    expect(view.dependents.sort()).toEqual(["a", "b"]);
  });

  test("af/bd/fr/report edges and conflicts all filtered to the requested id only", () => {
    const afEdgeA: AfEdge = { nodeId: "a", workspace: "proofs/a", workspaceResolved: false };
    const afEdgeB: AfEdge = { nodeId: "b", workspace: "proofs/b", workspaceResolved: false };
    const bdEdgeA: BdEdge = { nodeId: "a", issueId: "iss-1", status: "open", resolved: true };
    const frEdgeA: FrEdge = { cycle: 3, artifact: "argument/a.md", resolutionMethod: "path", resolvedNodeId: "a" };
    const frEdgeUnresolved: FrEdge = { cycle: 4, artifact: "nowhere.md", resolutionMethod: "unresolved" };
    const reportEdgeA: ReportEdge = { nodeId: "a", anchor: "sec:a", resolved: true };
    const conflictA: ConflictRecord = { kind: "status-mismatch", edge: "af", nodeId: "a", message: "x" };
    const conflictB: ConflictRecord = { kind: "status-mismatch", edge: "af", nodeId: "b", message: "y" };

    const d = doc(
      [node("a"), node("b")],
      { af: [afEdgeA, afEdgeB], bd: [bdEdgeA], fr: [frEdgeA, frEdgeUnresolved], report: [reportEdgeA] },
      [conflictA, conflictB],
    );
    const view = computeFocusView(d, "a");
    expect(view.afEdge).toEqual(afEdgeA);
    expect(view.bdEdge).toEqual(bdEdgeA);
    expect(view.frEdges).toEqual([frEdgeA]); // the unresolved fr edge (no resolvedNodeId) is excluded
    expect(view.reportEdges).toEqual([reportEdgeA]);
    expect(view.conflicts).toEqual([conflictA]);
  });
});
