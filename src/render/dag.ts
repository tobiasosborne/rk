// PURITY: pure — no fs/network/clock (L3). The interactive AND/OR dependency DAG (PRD C6):
// rigour-coloured nodes (from the ONE styling source, src/render/styling.ts), AND-deps drawn
// distinctly from OR-route edges, each node a hash link into its own drill-down panel.
//
// LAYOUT ENGINE — deliberate deviation, flagged for the M2 boundary review. The plan names dagre
// "vendored at build time". This first pass uses a small PURE built-in longest-path layered layout
// instead, for three reasons: (1) it keeps L4 (zero runtime deps) and L3 (a trivially
// grep-verifiable pure core) pristine — dagre is CommonJS + lodash and bundling it under
// `bun build --compile` is real, un-budgeted risk; (2) the layout QUALITY is not validity-bearing
// — the rigour colouring and AND/OR distinction (which ARE the point) come from the styling map
// regardless of engine, so a swap to vendored dagre later is a pure-internal change behind
// `computeLayers`/`renderDag`; (3) rule 11 (don't grind). Trade-off accepted: no edge-routing /
// crossing minimisation (edges are straight lines, may cross on a dense graph). If edge-routing
// quality matters, vendoring dagre behind this same interface is the follow-up.

import { isNodeAvailable, requiredIds } from "../graph/query-shared";
import type { GraphDocument, RegistryNode } from "../graph/types";
import { esc } from "./html";
import { styleForOptional } from "./styling";
import { nodePanelId } from "./node-view";

const COL = 210;
const ROW = 66;
const NW = 168;
const NH = 34;
const PAD = 16;

/** Longest-path layering: a node's layer is 1 + the max layer of its requirements (deps + route
 * members, via query-shared.ts's requiredIds), so every node sits strictly below all it depends
 * on. Memoized depth-first, cycle-safe (an in-progress revisit degrades to layer 0 rather than
 * looping — acyclicity is Gate 2's job, not this view's to assume). A requirement id absent from
 * the document contributes no depth (referential integrity is validate.ts's job). */
export function computeLayers(doc: GraphDocument): Map<string, number> {
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
    for (const req of requiredIds(nd)) {
      if (byId.has(req)) max = Math.max(max, resolve(req));
    }
    inProgress.delete(id);
    const value = max + 1;
    layer.set(id, value);
    return value;
  }

  for (const nd of doc.nodes) resolve(nd.id);
  return layer;
}

interface Placed {
  n: RegistryNode;
  cx: number;
  cy: number;
}

function place(doc: GraphDocument, layers: Map<string, number>): Map<string, Placed> {
  const rows = new Map<number, RegistryNode[]>();
  for (const nd of [...doc.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    const l = layers.get(nd.id) ?? 0;
    (rows.get(l) ?? rows.set(l, []).get(l)!).push(nd);
  }
  const placed = new Map<string, Placed>();
  for (const [l, group] of rows) {
    group.forEach((nd, i) => {
      placed.set(nd.id, { n: nd, cx: PAD + l * COL + NW / 2, cy: PAD + i * ROW + NH / 2 });
    });
  }
  return placed;
}

function edge(from: Placed, to: Placed, kind: "and" | "or"): string {
  return (
    `<line class="rk-edge-${kind}" x1="${from.cx}" y1="${from.cy}" x2="${to.cx}" y2="${to.cy}" ` +
    `stroke="${kind === "and" ? "#64748b" : "#9333ea"}" stroke-width="1.5" ` +
    `${kind === "or" ? 'stroke-dasharray="5 4" ' : ""}/>`
  );
}

function nodeSvg(p: Placed): string {
  const st = styleForOptional(p.n.status);
  const x = p.cx - NW / 2;
  const y = p.cy - NH / 2;
  const rigCls = st.rigorous ? "rk-dag-rigorous" : "rk-dag-nonrigorous";
  const strokeW = st.rigorous ? 2.5 : 1.2;
  const dash = st.rigorous ? "" : 'stroke-dasharray="3 3" ';
  const avail = isNodeAvailable(p.n) ? "" : "opacity:.82;";
  const label = p.n.id.length > 22 ? p.n.id.slice(0, 20) + ".." : p.n.id;
  return (
    `<a href="#${esc(nodePanelId(p.n.id))}" class="rk-dag-node ${rigCls}">` +
    `<rect x="${x}" y="${y}" width="${NW}" height="${NH}" rx="5" fill="${st.colour}" ` +
    `stroke="#111" stroke-width="${strokeW}" ${dash}style="${avail}"/>` +
    `<text x="${p.cx}" y="${p.cy + 4}" text-anchor="middle" fill="#fff">${esc(label)}</text>` +
    `<title>${esc(p.n.id)} — ${esc(st.label)}${st.rigorous ? " (rigorous)" : " (not rigorous)"}</title>` +
    `</a>`
  );
}

/** Renders the whole DAG as one inline SVG. Straight-line edges (AND solid grey, OR dashed purple)
 * drawn first, rigour-coloured node boxes on top, each a hash link to its drill-down panel. */
export function renderDag(doc: GraphDocument): string {
  if (doc.nodes.length === 0) return `<p class="rk-none">no nodes to graph.</p>`;
  const layers = computeLayers(doc);
  const placed = place(doc, layers);

  const edges: string[] = [];
  for (const nd of doc.nodes) {
    const to = placed.get(nd.id)!;
    for (const d of nd.deps) {
      const from = placed.get(d);
      if (from) edges.push(edge(from, to, "and"));
    }
    for (const route of nd.routes) {
      for (const m of route) {
        const from = placed.get(m);
        if (from) edges.push(edge(from, to, "or"));
      }
    }
  }

  const nodes = [...placed.values()].map((p) => nodeSvg(p)).join("");
  const maxLayer = Math.max(0, ...[...layers.values()]);
  const maxRow = Math.max(1, ...[...countRows(doc, layers).values()]);
  const width = PAD * 2 + (maxLayer + 1) * COL;
  const height = PAD * 2 + maxRow * ROW;

  return (
    `<div class="rk-dag-legend rk-muted">solid box + thick border = rigorous; dashed = not. ` +
    `Grey line = AND-dep; purple dashed = OR-route. Click a node to drill down.</div>` +
    `<div style="overflow:auto"><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ` +
    `role="img" aria-label="AND/OR dependency graph">${edges.join("")}${nodes}</svg></div>`
  );
}

function countRows(doc: GraphDocument, layers: Map<string, number>): Map<number, number> {
  const counts = new Map<number, number>();
  for (const nd of doc.nodes) {
    const l = layers.get(nd.id) ?? 0;
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return counts;
}
