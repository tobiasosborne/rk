// Unit tests for src/graph/query-taint.ts's `computeTaintTrace` (M2.5, PRD C5 "campaign-wide
// taint trace"). Ground truth: the module's own doc comment, transplanting ../vibefeld's own
// `af taint-trace` priority order (unresolved > self_admitted/tainted (own) > tainted
// (propagated) > clean) onto the registry requirement graph.

import { describe, expect, test } from "bun:test";
import { computeTaintTrace, taintedNodes } from "../../src/graph/query-taint";
import type { AfEdge, AfTaintState, GraphDocument, RegistryNode } from "../../src/graph/types";
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

function resolvedAf(nodeId: string, workspace: string, taintState: AfTaintState): AfEdge {
  return {
    nodeId,
    workspace,
    workspaceResolved: true,
    afSchemaVersion: "1",
    afRootNodeId: "1",
    contractMatch: true,
    epistemicState: "validated",
    taintState,
    nodeCount: 1,
  };
}

function unresolvedAf(nodeId: string, workspace: string): AfEdge {
  return { nodeId, workspace, workspaceResolved: false };
}

function doc(nodes: RegistryNode[], af: AfEdge[] = []): GraphDocument {
  return {
    schema_version: GRAPH_SCHEMA_VERSION,
    nodes,
    edges: { af, bd: [], fr: [], report: [] },
    unresolved: [],
    conflicts: [],
  };
}

describe("computeTaintTrace", () => {
  test("af:none, no requirements: clean, not a source", () => {
    const d = doc([node("a")]);
    const trace = computeTaintTrace(d);
    expect(trace.get("a")).toEqual({ id: "a", taint: "clean", reason: "no af workspace and no tainted requirement", isSource: false });
  });

  test("own af edge clean: clean", () => {
    const d = doc([node("a", { af: "validated", workspace: "proofs/a" })], [resolvedAf("a", "proofs/a", "clean")]);
    const trace = computeTaintTrace(d);
    expect(trace.get("a")!.taint).toBe("clean");
  });

  test("own af edge self_admitted: self_admitted, is a source", () => {
    const d = doc([node("a", { af: "validated", workspace: "proofs/a" })], [resolvedAf("a", "proofs/a", "self_admitted")]);
    const trace = computeTaintTrace(d);
    expect(trace.get("a")).toMatchObject({ taint: "self_admitted", isSource: true });
  });

  test("af flag set but workspace unresolved: unresolved, is a source", () => {
    const d = doc([node("a", { af: "seeded", workspace: "proofs/a" })], [unresolvedAf("a", "proofs/a")]);
    const trace = computeTaintTrace(d);
    expect(trace.get("a")).toMatchObject({ taint: "unresolved", isSource: true });
  });

  test("propagation: a dependent of a tainted node inherits 'tainted' (not 'self_admitted'), is NOT a source", () => {
    const d = doc(
      [
        node("a", { deps: ["b"] }),
        node("b", { af: "validated", workspace: "proofs/b" }),
      ],
      [resolvedAf("b", "proofs/b", "self_admitted")],
    );
    const trace = computeTaintTrace(d);
    expect(trace.get("b")).toMatchObject({ taint: "self_admitted", isSource: true });
    expect(trace.get("a")).toMatchObject({ taint: "tainted", isSource: false });
    expect(trace.get("a")!.reason).toContain("b");
  });

  test("propagation: unresolved outranks tainted -- a dependent of BOTH an unresolved and a tainted requirement reports unresolved", () => {
    const d = doc(
      [
        node("a", { deps: ["unresolved-dep", "tainted-dep"] }),
        node("unresolved-dep", { af: "seeded", workspace: "proofs/u" }),
        node("tainted-dep", { af: "validated", workspace: "proofs/t" }),
      ],
      [unresolvedAf("unresolved-dep", "proofs/u"), resolvedAf("tainted-dep", "proofs/t", "tainted")],
    );
    const trace = computeTaintTrace(d);
    expect(trace.get("a")!.taint).toBe("unresolved");
  });

  test("af:none node with a tainted dep still propagates (campaign-wide, not af-tracked-only)", () => {
    const d = doc(
      [
        node("a", { deps: ["b"], af: "none" }),
        node("b", { af: "validated", workspace: "proofs/b" }),
      ],
      [resolvedAf("b", "proofs/b", "tainted")],
    );
    const trace = computeTaintTrace(d);
    expect(trace.get("a")!.taint).toBe("tainted");
  });

  test("OR-routes: a tainted route member taints the parent even when the OTHER route is clean (over-inclusion)", () => {
    const d = doc(
      [
        node("a", { routes: [["clean-route"], ["tainted-route"]] }),
        node("clean-route", { af: "validated", workspace: "proofs/clean" }),
        node("tainted-route", { af: "validated", workspace: "proofs/tainted" }),
      ],
      [resolvedAf("clean-route", "proofs/clean", "clean"), resolvedAf("tainted-route", "proofs/tainted", "tainted")],
    );
    const trace = computeTaintTrace(d);
    expect(trace.get("a")!.taint).toBe("tainted");
  });

  test("a cycle degrades to unresolved rather than infinite-looping", () => {
    const d = doc([node("a", { deps: ["b"] }), node("b", { deps: ["a"] })]);
    const trace = computeTaintTrace(d);
    expect(trace.get("a")!.taint).toBe("unresolved");
    expect(trace.get("b")!.taint).toBe("unresolved");
  });

  test("taintedNodes: filters to non-clean, sorted by id", () => {
    const d = doc(
      [
        node("z", { af: "validated", workspace: "proofs/z" }),
        node("a", { af: "validated", workspace: "proofs/a" }),
        node("m"),
      ],
      [resolvedAf("z", "proofs/z", "tainted"), resolvedAf("a", "proofs/a", "clean")],
    );
    const trace = computeTaintTrace(d);
    const tainted = taintedNodes(trace);
    expect(tainted.map((e) => e.id)).toEqual(["z"]);
  });
});
