// src/render/dag.ts — the interactive AND/OR DAG (PRD C6: "zoomable AND/OR DAG with rigour-colour
// coding and drill-down"). Layout is a pure built-in layered algorithm (see the WP report / dag.ts
// header for why not dagre). Asserts: rigour-coloured nodes from the ONE styling source, AND-deps
// visually distinct from OR-route edges, every node click-through to its drill-down panel.

import { describe, expect, test } from "bun:test";
import type { AfEdge, ConflictRecord, GraphDocument, RegistryNode } from "../../src/graph/types";
import { computeLayers, renderDag } from "../../src/render/dag";
import { DEFECT_COLOUR, statusStyle } from "../../src/render/styling";
import { nodePanelId } from "../../src/render/node-view";

const B = { count: 0, classifications: [] as [] };
function n(id: string, status: RegistryNode["status"], deps: string[], routes: string[][] = []): RegistryNode {
  return { id, kind: "lemma", path: `argument/${id}.md`, contract: `c ${id}`, status, af: "none", deps, routes, defs: [], balloons: B };
}

// leaf -> mid (AND); goal depends on mid (AND) and has an OR-route {alt}.
const doc: GraphDocument = {
  schema_version: "1",
  nodes: [
    n("leaf", "cited", []),
    n("mid", "proved", ["leaf"]),
    n("alt", "stated", []),
    n("goal", "open", ["mid"], [["alt"]]),
  ],
  edges: { af: [], bd: [], fr: [], report: [] },
  unresolved: [],
  conflicts: [],
};

describe("render/dag", () => {
  test("computeLayers is a longest-path layering: a node sits below all its requirements", () => {
    const layers = computeLayers(doc);
    expect(layers.get("leaf")).toBe(0);
    expect(layers.get("mid")).toBe(1);
    expect(layers.get("alt")).toBe(0);
    expect(layers.get("goal")).toBeGreaterThan(layers.get("mid")!);
    expect(layers.get("goal")!).toBeGreaterThan(layers.get("alt")!);
  });

  test("computeLayers is cycle-safe (degrades, never loops forever)", () => {
    const cyclic: GraphDocument = {
      ...doc,
      nodes: [n("a", "open", ["b"]), n("b", "open", ["a"])],
    };
    expect(() => computeLayers(cyclic)).not.toThrow();
  });

  test("emits an SVG with a rigour-coloured, click-through node per registry node", () => {
    const svg = renderDag(doc);
    expect(svg).toContain("<svg");
    for (const nd of doc.nodes) {
      expect(svg).toContain(`href="#${nodePanelId(nd.id)}"`);
    }
    // rigour colour comes from the single styling source.
    expect(svg).toContain(statusStyle("proved").colour);
    expect(svg).toContain(statusStyle("cited").colour);
  });

  test("rigorous nodes are stroked distinctly from non-rigorous ones", () => {
    const svg = renderDag(doc);
    expect(svg).toContain("rk-dag-rigorous");
    expect(svg).toContain("rk-dag-nonrigorous");
  });

  test("AND-dep edges are visually distinct from OR-route edges", () => {
    const svg = renderDag(doc);
    expect(svg).toContain("rk-edge-and");
    expect(svg).toContain("rk-edge-or");
  });

  test("an empty graph renders a placeholder, not a crash", () => {
    const empty: GraphDocument = { ...doc, nodes: [], edges: { af: [], bd: [], fr: [], report: [] } };
    expect(renderDag(empty)).toContain("no nodes");
  });

  test("BLOCKER #1: a conflicted 'proved' node gets its own defect class, never rk-dag-rigorous", () => {
    const afEdge: AfEdge = {
      nodeId: "mid", workspace: "proofs/mid", workspaceResolved: true, afSchemaVersion: "1",
      afRootNodeId: "1", contractMatch: false, epistemicState: "validated", taintState: "clean", nodeCount: 1,
    };
    const conflict: ConflictRecord = {
      kind: "contract-mismatch", edge: "af", nodeId: "mid", message: "contractMatch:false",
    };
    const conflicted: GraphDocument = {
      ...doc,
      nodes: doc.nodes.map((nd) => (nd.id === "mid" ? { ...nd, af: "validated" as const, workspace: "proofs/mid" } : nd)),
      edges: { af: [afEdge], bd: [], fr: [], report: [] },
      conflicts: [conflict],
    };
    const svg = renderDag(conflicted);
    expect(svg).toContain("rk-dag-defect");
    expect(svg).toContain(DEFECT_COLOUR);
    // the defective node's own <a> tag must never carry rk-dag-rigorous.
    const midTag = svg.match(new RegExp(`<a href="#${nodePanelId("mid")}"[^>]*>`))?.[0];
    expect(midTag).toBeDefined();
    expect(midTag).not.toContain("rk-dag-rigorous");
  });

  // Mutation evidence: an `effectivePresentation` that ignored conflicts (isDefect = taint-only)
  // would make the previous test's "rk-dag-defect"/DEFECT_COLOUR assertions fail, since this
  // fixture's conflict carries clean taint — verified by hand, restored after (see WP report).
});
