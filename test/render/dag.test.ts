// src/render/dag.ts — the interactive AND/OR DAG (PRD C6: "zoomable AND/OR DAG with rigour-colour
// coding and drill-down"). Layout is vendored dagre (rk-fhd swap, see dag.ts header). Asserts:
// rigour-coloured nodes from the ONE styling source, AND-deps visually distinct from OR-route
// edges, every node click-through to its drill-down panel. Layer/coordinate assertions below are
// deliberately relative (a node sits after all its requirements), never a pinned dagre number —
// dagre's specific rank/x/y values are an internal detail of the layout engine, not a contract.

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
  test("computeLayers is a layering: a node sits below (later than) all its requirements", () => {
    // Relative only — the exact rank numbers are dagre's internal ranker's business, not a
    // contract (rk-fhd: dagre's default ranker pulls a source toward its consumer to shorten
    // edges, so an isolated leaf does NOT necessarily land at layer 0 the way the old pure
    // longest-path-from-sources algorithm guaranteed it would).
    const layers = computeLayers(doc);
    expect(layers.get("leaf")!).toBeLessThan(layers.get("mid")!);
    expect(layers.get("mid")!).toBeLessThan(layers.get("goal")!);
    expect(layers.get("alt")!).toBeLessThan(layers.get("goal")!);
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

  test("determinism: renderDag output is byte-identical across shuffled node/dep/route array orders (rk-fhd)", () => {
    // dagre's layered layout is insertion-order-sensitive (verified empirically feeding the
    // same logical graph in different insertion orders — see dag.ts header). The doc-array
    // order (nodes, a node's deps, a node's routes, a route's members) must never leak into the
    // rendered bytes; `edgeRefs`/`buildDagreGraph` guard this by sorting before ever touching
    // dagre. This property-tests that guard across 12 independent shuffles of a 5-node graph.
    const base: GraphDocument = {
      schema_version: "1",
      nodes: [
        n("a", "stated", []),
        n("b", "stated", []),
        n("c", "stated", []),
        n("d", "proved", ["a", "b"]),
        n("e", "cited", ["c"], [["a", "b"]]),
      ],
      edges: { af: [], bd: [], fr: [], report: [] },
      unresolved: [],
      conflicts: [],
    };
    const canonical = renderDag(base);

    function shuffle<T>(arr: readonly T[], seed: number): T[] {
      const out = [...arr];
      let s = seed;
      for (let i = out.length - 1; i > 0; i--) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const j = s % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    }

    for (let seed = 1; seed <= 12; seed++) {
      const shuffled: GraphDocument = {
        ...base,
        nodes: shuffle(base.nodes, seed).map((nd) => ({
          ...nd,
          deps: shuffle(nd.deps, seed + 1),
          routes: shuffle(
            nd.routes.map((r) => shuffle(r, seed + 2)),
            seed + 3,
          ),
        })),
      };
      expect(renderDag(shuffled)).toBe(canonical);
    }
  });

  test("crossing-count improvement: dagre's layout has fewer straight-line crossings than the pre-dagre layered layout on a reversal fixture (rk-fhd)", () => {
    // Three independent roots, each feeding exactly one of three dependents, wired as a
    // reversal (r1->t3, r2->t2, r3->t1). The pre-dagre algorithm stacked each rank in id-sorted
    // order with no reordering freedom, so every pair of these three edges crossed (3/3
    // pairs, confirmed below). dagre's ordering step is free to reorder within a rank and finds
    // a zero-crossing arrangement for this fixture. Numbers were captured empirically (see WP
    // report), re-derived live here — not restated as bare constants.
    const reversal: GraphDocument = {
      schema_version: "1",
      nodes: [
        n("r1", "stated", []),
        n("r2", "stated", []),
        n("r3", "stated", []),
        n("t1", "stated", ["r3"]),
        n("t2", "stated", ["r2"]),
        n("t3", "stated", ["r1"]),
      ],
      edges: { af: [], bd: [], fr: [], report: [] },
      unresolved: [],
      conflicts: [],
    };

    const newCrossings = countCrossings(extractLines(renderDag(reversal)));
    const oldCrossings = countCrossings(oldLayoutEdges(reversal));

    expect(oldCrossings).toBe(3);
    expect(newCrossings).toBe(0);
    expect(newCrossings).toBeLessThanOrEqual(oldCrossings);
  });
});

// --- crossing-count demonstration helpers (test-only; not part of the production module) ---

type Line = readonly [number, number, number, number];

function extractLines(svg: string): Line[] {
  return [...svg.matchAll(/<line[^>]*x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)].map(
    (m) => [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as const,
  );
}

function ccw(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (cy - ay) * (bx - ax) - (by - ay) * (cx - ax);
}

function segmentsCross(a: Line, b: Line): boolean {
  const [ax1, ay1, ax2, ay2] = a;
  const [bx1, by1, bx2, by2] = b;
  const d1 = ccw(bx1, by1, bx2, by2, ax1, ay1);
  const d2 = ccw(bx1, by1, bx2, by2, ax2, ay2);
  const d3 = ccw(ax1, ay1, ax2, ay2, bx1, by1);
  const d4 = ccw(ax1, ay1, ax2, ay2, bx2, by2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function countCrossings(lines: readonly Line[]): number {
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) if (segmentsCross(lines[i], lines[j])) n++;
  }
  return n;
}

/** Frozen copy of the ALGORITHM this milestone replaced (pure longest-path-from-sources layering
 * + id-sorted row stacking + straight edges — verbatim from 11bf7af:src/render/dag.ts's
 * computeLayers/place/edge), kept ONLY so the crossing-count demo test above has a live baseline
 * to compare against instead of a bare asserted constant. Never imported by production code. */
function oldLayoutEdges(doc: GraphDocument): Line[] {
  const OLD_COL = 210;
  const OLD_ROW = 66;
  const OLD_NW = 168;
  const OLD_NH = 34;
  const OLD_PAD = 16;
  const byId = new Map(doc.nodes.map((nd) => [nd.id, nd]));
  const layer = new Map<string, number>();
  const inProgress = new Set<string>();
  function resolve(id: string): number {
    const cached = layer.get(id);
    if (cached !== undefined) return cached;
    if (inProgress.has(id)) return 0;
    const nd = byId.get(id);
    if (!nd) return 0;
    inProgress.add(id);
    let max = -1;
    for (const req of [...nd.deps, ...nd.routes.flat()]) if (byId.has(req)) max = Math.max(max, resolve(req));
    inProgress.delete(id);
    const value = max + 1;
    layer.set(id, value);
    return value;
  }
  for (const nd of doc.nodes) resolve(nd.id);

  const rows = new Map<number, RegistryNode[]>();
  for (const nd of [...doc.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    const l = layer.get(nd.id) ?? 0;
    (rows.get(l) ?? rows.set(l, []).get(l)!).push(nd);
  }
  const cx = new Map<string, number>();
  const cy = new Map<string, number>();
  for (const [l, group] of rows) {
    group.forEach((nd, i) => {
      cx.set(nd.id, OLD_PAD + l * OLD_COL + OLD_NW / 2);
      cy.set(nd.id, OLD_PAD + i * OLD_ROW + OLD_NH / 2);
    });
  }

  const edges: Line[] = [];
  for (const nd of doc.nodes) {
    for (const d of nd.deps) if (byId.has(d)) edges.push([cx.get(d)!, cy.get(d)!, cx.get(nd.id)!, cy.get(nd.id)!]);
    for (const route of nd.routes) for (const m of route) if (byId.has(m)) edges.push([cx.get(m)!, cy.get(m)!, cx.get(nd.id)!, cy.get(nd.id)!]);
  }
  return edges;
}
