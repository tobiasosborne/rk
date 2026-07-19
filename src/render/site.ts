// PURITY: pure — no fs/network/clock (L3). Assembles the self-contained static site (PRD C6): one
// index.html carrying inline CSS + inline JS, a dashboard, an AND/OR DAG, and a pre-rendered
// drill-down panel for every registry node. No server, no external CDN, no timestamps — CSP-safe
// and deterministic (the same GraphDocument renders byte-identically, matching the canonical-
// serializer discipline src/graph/serialize.ts set). The edge (src/cli/render.ts) writes
// `files[].path` under the output dir; the core never touches fs.
//
// Drill-down state in a no-server page is the WP's budgeted hard problem. The chosen mechanism is
// deliberately boring and testable: every top-level view (dashboard, dag, each node panel) is a
// pre-rendered `.rk-route-target` section; a ~12-line inline hash router shows the one matching
// `location.hash` and hides the rest. No framework, no fetch, no build step — a `#node-<id>` link
// anywhere (dashboard, dep list, conflict row) just works.

import { computeTaintTrace } from "../graph/query-taint";
import type { GraphDocument } from "../graph/types";
import { renderDashboard } from "./dashboard";
import { renderDag } from "./dag";
import type { DefRecord, DefsData } from "./defs-edge";
import { renderDefsIndex } from "./defs-view";
import { renderDegradedBanner, renderSourcesBlock, type SourceStatuses } from "./diagnostics-view";
import { renderGraveyard } from "./graveyard-view";
import { esc } from "./html";
import { nodePanelId, renderNodePanel } from "./node-view";
import { renderProvenanceChains } from "./provenance-view";
import { renderRunGallery } from "./run-gallery-view";
import type { RunGalleryData } from "./runs-edge";
import { renderStatusCss } from "./styling";

export interface RenderedFile {
  path: string;
  contents: string;
}
export interface RenderedSite {
  files: RenderedFile[];
}
export interface RenderSiteOptions {
  northStarId?: string;
  /** Shown in the header only — NOT part of node identity, so it never affects determinism of a
   * node's own markup. */
  title?: string;
  /** M2 boundary review blocker #2 (consumer side): per-source build status (af/fr/bd — export,
   * degraded fallback, or absent). Absent means the caller had no diagnostics to report (never
   * treated as "everything was authoritative" — the banner/sources block simply does not render).
   * A degraded/absent source is visibly distinguished from an authoritative-empty one via a
   * site-level banner plus a per-source line on the dashboard, never silently folded together. */
  sources?: SourceStatuses;
  /** M2.4 pass 2 (rk-c2q): run-bundle gallery data (src/render/runs-edge.ts's EDGE output).
   * Omitted degrades to an honest "not loaded for this render" note on the runs route — never
   * silently treated as "no run bundles exist". */
  runGallery?: RunGalleryData;
  /** M2.4 pass 2: definitions + conventions data (src/render/defs-edge.ts's EDGE output). Also
   * feeds the provenance-chains view's "refs" step (keyed by def id) when supplied. Omitted
   * degrades the same honest way as `runGallery`. */
  defsData?: DefsData;
}

const BASE_CSS = `
:root{color-scheme:light dark;--rk-fg:#111;--rk-bg:#fff;--rk-muted:#555;--rk-line:#ddd;--rk-defect:#b91c1c;--rk-ok:#15803d;}
@media (prefers-color-scheme:dark){:root{--rk-fg:#e8e8e8;--rk-bg:#161616;--rk-muted:#aaa;--rk-line:#333;}}
*{box-sizing:border-box}
body{margin:0;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--rk-fg);background:var(--rk-bg)}
header{padding:.6rem 1rem;border-bottom:1px solid var(--rk-line);position:sticky;top:0;background:var(--rk-bg);z-index:2}
header a{margin-right:1rem;text-decoration:none;color:inherit;font-weight:600}
main{padding:1rem;max-width:70rem;margin:0 auto}
h1{font-size:1.2rem;margin:0}
h2{font-size:1.05rem;border-bottom:1px solid var(--rk-line);padding-bottom:.2rem;margin-top:1.6rem}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:.25rem .5rem;border-bottom:1px solid var(--rk-line)}
code{background:rgba(127,127,127,.14);padding:0 .2rem;border-radius:3px}
.rk-swatch{display:inline-block;width:.8rem;height:.8rem;border-radius:2px;margin-right:.35rem;vertical-align:middle}
.rk-badge{padding:.05rem .45rem;border-radius:3px;background:rgba(127,127,127,.1);font-weight:600}
.rk-defect{color:var(--rk-defect)}
.rk-ok{color:var(--rk-ok)}
.rk-none,.rk-muted{color:var(--rk-muted)}
.rk-contract{border-left:3px solid var(--rk-line);margin:.5rem 0;padding:.2rem .8rem;color:var(--rk-muted)}
.rk-tier{font-size:.8rem;color:var(--rk-muted)}
.rk-legend ul{list-style:none;padding-left:0}
.rk-legend-item{margin:.15rem 0}
.rk-legend-meaning{color:var(--rk-muted);margin-left:.4rem;font-size:.9rem}
.rk-banner{padding:.5rem 1rem;font-weight:600;border-bottom:1px solid var(--rk-line)}
.rk-route-target{display:none}
#dashboard{display:block}
.rk-dag-node{cursor:pointer}
.rk-dag text{font:11px sans-serif;fill:var(--rk-fg)}
`;

// The hash router. Kept tiny and dependency-free — see this file's header. `\\n` avoided; single
// line to stay clear of any template-literal escaping surprises.
const ROUTER_JS =
  "function rkRoute(){var h=(location.hash||'').replace(/^#/,'')||'dashboard';" +
  "var t=document.querySelectorAll('.rk-route-target');for(var i=0;i<t.length;i++)t[i].style.display='none';" +
  "var el=document.getElementById(h);if(!el||!el.classList.contains('rk-route-target'))el=document.getElementById('dashboard');" +
  "if(el)el.style.display='';window.scrollTo(0,0);}" +
  "window.addEventListener('hashchange',rkRoute);rkRoute();";

function nav(doc: GraphDocument, title: string): string {
  const nodeLinks = doc.nodes
    .map((nd) => `<li><a href="#${esc(nodePanelId(nd.id))}">${esc(nd.id)}</a></li>`)
    .join("");
  return (
    `<header><h1>${esc(title)}</h1>` +
    `<nav><a href="#dashboard">dashboard</a><a href="#dag">DAG</a>` +
    `<a href="#graveyard">graveyard</a><a href="#runs">runs</a>` +
    `<a href="#provenance">provenance</a><a href="#defs">defs</a>` +
    `<details style="display:inline-block;vertical-align:top"><summary style="cursor:pointer;display:inline">nodes (${doc.nodes.length})</summary>` +
    `<ul style="position:absolute;background:var(--rk-bg);border:1px solid var(--rk-line);max-height:60vh;overflow:auto;padding:.5rem 1.4rem">${nodeLinks}</ul></details>` +
    `</nav></header>`
  );
}

export function renderSite(doc: GraphDocument, options: RenderSiteOptions = {}): RenderedSite {
  const title = options.title ?? "rk campaign report";
  const taint = computeTaintTrace(doc);
  const panels = doc.nodes.map((nd) => renderNodePanel(doc, nd.id, taint.get(nd.id))).join("\n");
  const sourcesBlock = options.sources ? renderSourcesBlock(options.sources) : "";
  const dashboard = `<div id="dashboard" class="rk-route-target">${renderDashboard(doc, options.northStarId, taint)}${sourcesBlock}</div>`;
  const dag = `<section id="dag" class="rk-route-target"><h2>AND/OR dependency graph</h2>${renderDag(doc, taint)}</section>`;
  const graveyard = `<section id="graveyard" class="rk-route-target">${renderGraveyard(doc)}</section>`;

  // M2.4 pass 2 (rk-c2q): run gallery / definitions+conventions / provenance chains. `runGallery`/
  // `defsData` are OPTIONAL edge-supplied data (this core stays pure — see file header); omitted
  // degrades honestly rather than fabricating "no data exists".
  const runsSection = options.runGallery
    ? renderRunGallery(options.runGallery)
    : `<div class="rk-run-gallery"><h2>run-bundle gallery</h2><p class="rk-none">run-bundle data not loaded for this render.</p></div>`;
  const runs = `<section id="runs" class="rk-route-target">${runsSection}</section>`;

  const defsById: ReadonlyMap<string, DefRecord> | undefined = options.defsData
    ? new Map(options.defsData.defs.map((d) => [d.id, d]))
    : undefined;
  const defsSection = options.defsData
    ? renderDefsIndex(options.defsData)
    : `<div class="rk-defs"><h2>definitions index</h2><p class="rk-none">definitions data not loaded for this render.</p></div>`;
  const defs = `<section id="defs" class="rk-route-target">${defsSection}</section>`;

  const provenance = `<section id="provenance" class="rk-route-target">${renderProvenanceChains(doc, { defsById, taint })}</section>`;

  // M2 boundary review blocker #2: the degraded-source banner sits OUTSIDE the hash-routed
  // sections (`.rk-route-target`), so it stays visible no matter which view a reader lands on —
  // never only on the dashboard.
  const banner = options.sources ? renderDegradedBanner(options.sources) : "";

  const contents =
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(title)}</title><style>${BASE_CSS}${renderStatusCss()}</style></head>` +
    `<body>${nav(doc, title)}${banner}<main>${dashboard}${dag}${graveyard}${runs}${provenance}${defs}${panels}</main>` +
    `<script>${ROUTER_JS}</script></body></html>\n`;

  return { files: [{ path: "index.html", contents }] };
}
