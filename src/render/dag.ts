// PURITY: pure — no fs/network/clock (L3). The interactive AND/OR dependency DAG (PRD C6):
// rigour-coloured nodes (from the ONE styling source, src/render/styling.ts), AND-deps drawn
// distinctly from OR-route edges, each node a hash link into its own drill-down panel.
//
// LAYOUT ENGINE — vendored dagre (rk-fhd, M2 boundary review, 2026-07-19). The M2.4 first pass
// shipped a small pure built-in longest-path layered layout instead of the plan's resolved
// "dagre vendored at build time" (research-workflows/IMPLEMENTATION_PLAN.md resolved-question 1);
// the review REJECTED that as permanent (no crossing minimisation, no SC5 usability result
// overturns the settled decision) and ordered this swap. `dagre` is a devDependency (package.json
// `dependencies` stays `{}` per L4 — the plan's own text names build-time vendoring, and
// `bun build --compile` bundles it into the single binary same as any other source module; a
// standalone-binary size probe showed a negligible delta against the ~90 MB bun-runtime baseline,
// so the checked-in-browser-dist fallback this header used to flag as a contingency was not
// needed). Layout still happens at RENDER time in TypeScript — positions are baked into the
// static SVG, nothing runs in-browser, so the "self-contained, no CDN" CSP property is unaffected.
//
// DETERMINISM: dagre's layered layout is insertion-order-sensitive (verified empirically — feeding
// the same logical graph in a different node/edge insertion order moved node positions). Byte-
// identical renders (asserted in test/render/site.test.ts) therefore require a canonical,
// content-derived insertion order, not upstream array order: `edgeRefs` and `buildDagreGraph`
// below sort node ids and edge endpoints before ever calling into dagre. See
// test/render/dag.test.ts's shuffled-input-order property test for the proof.

import dagre from "dagre";
import { isNodeAvailable } from "../graph/query-shared";
import { computeTaintTrace, type TaintEntry } from "../graph/query-taint";
import type { GraphDocument, RegistryNode } from "../graph/types";
import type { DefRecord } from "./defs-edge";
import { defAnchorId } from "./defs-view";
import { esc } from "./html";
import { effectivePresentation } from "./styling";
import { nodePanelId } from "./node-view";

const NODE_W = 168;
const NODE_H = 34;
const RANKSEP = 42; // gap between rank (layer) columns — modest, matches the old column gap
const NODESEP = 32; // gap between nodes within the same rank — modest, matches the old row gap
const PAD = 16;

interface DagEdgeRef {
  from: string;
  to: string;
  kind: "and" | "or";
}

/** Every requirement -> dependent precedence pair (an AND-dep, or an OR-route member), sorted by
 * (to, kind, from) so the SAME logical graph yields the SAME edge list regardless of the order
 * doc.nodes / a node's deps / a node's routes happen to be built in. Kept per-occurrence (not
 * deduped) so a requirement referenced from multiple route slots still draws every line, matching
 * the pre-dagre behaviour. A requirement id absent from the document contributes no edge
 * (referential integrity is validate.ts's job, same as before). */
function edgeRefs(doc: GraphDocument): DagEdgeRef[] {
  const byId = new Map(doc.nodes.map((nd) => [nd.id, nd]));
  const refs: DagEdgeRef[] = [];
  for (const nd of doc.nodes) {
    for (const d of nd.deps) if (byId.has(d)) refs.push({ from: d, to: nd.id, kind: "and" });
    for (const route of nd.routes) {
      for (const m of route) if (byId.has(m)) refs.push({ from: m, to: nd.id, kind: "or" });
    }
  }
  refs.sort((a, b) =>
    a.to !== b.to ? a.to.localeCompare(b.to) : a.kind !== b.kind ? a.kind.localeCompare(b.kind) : a.from.localeCompare(b.from),
  );
  return refs;
}

/** Builds a dagre graph deterministically: nodes are inserted in sorted-id order, edges in the
 * order `edgeRefs` already canonicalised (deduped here since dagre's ranker only needs one edge
 * per precedence pair — the per-occurrence list is for drawing, not layout). */
function buildDagreGraph(doc: GraphDocument, refs: DagEdgeRef[]): dagre.graphlib.Graph {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: NODESEP, ranksep: RANKSEP, marginx: PAD, marginy: PAD });
  g.setDefaultEdgeLabel(() => ({}));
  for (const id of [...doc.nodes.map((nd) => nd.id)].sort()) g.setNode(id, { width: NODE_W, height: NODE_H });
  const seen = new Set<string>();
  for (const r of refs) {
    const key = `${r.from} ${r.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    g.setEdge(r.from, r.to);
  }
  return g;
}

/** A node's layer: its rank in dagre's layered layout (0-based, left-to-right), derived from the
 * laid-out x-coordinate (rankdir "LR" places rank on the x-axis). Cycle-safe: dagre's own acyclic
 * step temporarily reverses back-edges before ranking and restores them after, so a cyclic input
 * (acyclicity is Gate 2's job, not this view's to assume) still lays out without throwing.
 *
 * Semantics note: this is no longer the old pure longest-path-from-sources (ASAP) ranking — dagre
 * pulls a node with no predecessors toward its consumer to shorten edges (ALAP-ish), so an
 * isolated leaf feeding only a late node may land at a LATER layer than a leaf feeding an early
 * one. The one invariant that IS still guaranteed (and is the only one validity depends on): a
 * node's layer is always strictly greater than every one of its requirements' layers. */
export function computeLayers(doc: GraphDocument): Map<string, number> {
  const layer = new Map<string, number>();
  if (doc.nodes.length === 0) return layer;
  const refs = edgeRefs(doc);
  const g = buildDagreGraph(doc, refs);
  dagre.layout(g);
  const xs = [...new Set(g.nodes().map((id) => Math.round(g.node(id).x)))].sort((a, b) => a - b);
  const rankOf = new Map(xs.map((x, i) => [x, i]));
  for (const id of g.nodes()) layer.set(id, rankOf.get(Math.round(g.node(id).x))!);
  return layer;
}

interface Placed {
  n: RegistryNode;
  cx: number;
  cy: number;
}

function edge(from: Placed, to: Placed, kind: "and" | "or"): string {
  return (
    `<line class="rk-edge-${kind}" x1="${from.cx}" y1="${from.cy}" x2="${to.cx}" y2="${to.cy}" ` +
    `stroke="${kind === "and" ? "#64748b" : "#9333ea"}" stroke-width="1.5" ` +
    `${kind === "or" ? 'stroke-dasharray="5 4" ' : ""}/>`
  );
}

function nodeSvg(
  p: Placed,
  hasConflict: boolean,
  taint: TaintEntry["taint"],
  defsById?: ReadonlyMap<string, DefRecord>,
): string {
  const st = effectivePresentation(p.n.status, hasConflict, taint);
  const x = p.cx - NODE_W / 2;
  const y = p.cy - NODE_H / 2;
  // Effective rigour drives the visual class, not the raw declared status (M2 boundary review
  // blocker #1) — a defect gets ITS OWN class, never silently folded into "non-rigorous".
  const rigCls = st.isDefect ? "rk-dag-defect" : st.rigorous ? "rk-dag-rigorous" : "rk-dag-nonrigorous";
  const strokeW = st.rigorous ? 2.5 : 1.2;
  const dash = st.rigorous ? "" : 'stroke-dasharray="3 3" ';
  // A defect node is never presented as available, regardless of the monotone-trust predicate —
  // its own evidence contradicts the declared status, so dimming it is the honest default.
  const avail = !st.isDefect && isNodeAvailable(p.n) ? "" : "opacity:.82;";
  const label = p.n.id.length > 22 ? p.n.id.slice(0, 20) + ".." : p.n.id;
  const tierWord = st.isDefect ? " (defect: see title)" : st.rigorous ? " (rigorous)" : " (not rigorous)";
  // rk-iup: a SEPARATE sibling `<a>` (SVG has no reliable nested-anchor support) — a small corner
  // marker linking straight to this id's definitions-index entry, drawn ONLY when an exact id
  // match exists (see defs-view.ts's `glossaryLink` header: exact match only, no marker at all on
  // a miss — never a decoration implying a definition that isn't there).
  const rec = defsById?.get(p.n.id);
  const glossaryMarker = rec
    ? `<a href="#${esc(defAnchorId(rec.id))}" class="rk-dag-glossary" ` +
      `title="glossary: ${esc(rec.term ?? rec.id)}">` +
      `<circle cx="${x + NODE_W}" cy="${y}" r="6" fill="#0ea5e9" stroke="#fff" stroke-width="1"/>` +
      `<text x="${x + NODE_W}" y="${y + 3}" text-anchor="middle" font-size="8" fill="#fff">d</text>` +
      `</a>`
    : "";
  return (
    `<a href="#${esc(nodePanelId(p.n.id))}" class="rk-dag-node ${rigCls}">` +
    `<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="5" fill="${st.colour}" ` +
    `stroke="#111" stroke-width="${strokeW}" ${dash}style="${avail}"/>` +
    `<text x="${p.cx}" y="${p.cy + 4}" text-anchor="middle" fill="#fff">${esc(label)}</text>` +
    `<title>${esc(p.n.id)} — ${esc(st.label)}${tierWord}</title>` +
    `</a>${glossaryMarker}`
  );
}

/** Renders the whole DAG as one inline SVG, laid out by dagre (crossing-minimising layered
 * layout; see the file header for the vendoring rationale and the determinism argument). Edges
 * (AND solid grey, OR dashed purple) drawn first, rigour-coloured node boxes on top, each a hash
 * link to its drill-down panel. `taint` (optional) is the doc-wide taint trace — pass the one
 * `render/site.ts` already computed once per render; recomputed when omitted so existing call
 * sites keep working. `defsById` (optional, rk-iup) is definitions data keyed by id
 * (src/render/defs-edge.ts's EDGE output) — a node id with an exact-matching def gets a small
 * clickable glossary marker at its corner; omitted (or no match) draws nothing extra, never a
 * dead marker. */
export function renderDag(
  doc: GraphDocument,
  taint?: ReadonlyMap<string, TaintEntry>,
  defsById?: ReadonlyMap<string, DefRecord>,
): string {
  if (doc.nodes.length === 0) return `<p class="rk-none">no nodes to graph.</p>`;
  const refs = edgeRefs(doc);
  const g = buildDagreGraph(doc, refs);
  dagre.layout(g);

  const byId = new Map(doc.nodes.map((nd) => [nd.id, nd]));
  const placed = new Map<string, Placed>();
  for (const id of [...doc.nodes.map((nd) => nd.id)].sort()) {
    const pos = g.node(id);
    placed.set(id, { n: byId.get(id)!, cx: pos.x, cy: pos.y });
  }

  const t = taint ?? computeTaintTrace(doc);
  const conflicted = new Set(doc.conflicts.map((c) => c.nodeId).filter((id): id is string => id !== undefined));

  const edges = refs
    .map((r) => {
      const from = placed.get(r.from);
      const to = placed.get(r.to);
      return from && to ? edge(from, to, r.kind) : "";
    })
    .join("");
  const nodes = [...placed.values()]
    .map((p) => nodeSvg(p, conflicted.has(p.n.id), t.get(p.n.id)?.taint ?? "clean", defsById))
    .join("");

  const gAttrs = g.graph();
  const width = gAttrs.width ?? PAD * 2 + NODE_W;
  const height = gAttrs.height ?? PAD * 2 + NODE_H;

  return (
    `<div class="rk-dag-legend rk-muted">solid box + thick border = rigorous; dashed = not; ` +
    `red dashed outline = declared status contradicted by conflict/taint (defect). ` +
    `Grey line = AND-dep; purple dashed = OR-route. Click a node to drill down.</div>` +
    `<div style="overflow:auto"><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ` +
    `role="img" aria-label="AND/OR dependency graph">${edges}${nodes}</svg></div>`
  );
}
