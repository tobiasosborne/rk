// PURITY: pure — no fs/network/clock (L3). One registry node's drill-down fragment (PRD C6:
// "node -> contract -> af proof tree -> ledger events -> verdicts"). Reuses the M2.5 query cores
// (computeFocusView, computeTaintTrace) so the HTML view and the terminal view (`rk graph --focus`)
// read the SAME projected facts — a divergence between them would be a truthfulness bug, avoided by
// sharing the core rather than re-deriving. The status badge is styled ONLY through
// src/render/styling.ts (styleForOptional), so a node's rendered rigour matches its declared status
// by construction.

import { computeFocusView, type DepStatus } from "../graph/query-focus";
import type { TaintEntry } from "../graph/query-taint";
import type { AfEdge, FrEdge, GraphDocument } from "../graph/types";
import type { DefRecord } from "./defs-edge";
import { glossaryLink } from "./defs-view";
import { esc } from "./html";
import { effectivePresentation } from "./styling";

type DefsById = ReadonlyMap<string, DefRecord>;

/** Stable DOM id for a node's pre-rendered panel — the hash router (src/render/site.ts) shows the
 * `#node-<id>` section. `id` values are filename stems (safe), but escape defensively anyway. */
export function nodePanelId(id: string): string {
  return `node-${id}`;
}

function depItem(d: DepStatus, defsById?: DefsById): string {
  const state = d.unresolved ? "unresolved" : d.available ? "available" : "not available";
  const cls = d.unresolved ? "rk-dep-unresolved" : d.available ? "rk-dep-available" : "rk-dep-blocked";
  const link = d.unresolved ? esc(d.id) : `<a href="#${esc(nodePanelId(d.id))}">${esc(d.id)}</a>`;
  return `<li class="${cls}">${link}${glossaryLink(d.id, defsById)} <span class="rk-dep-state">[${state}]</span></li>`;
}

function afBlock(af: AfEdge | undefined): string {
  if (!af) return `<p class="rk-none">no af workspace (af: none)</p>`;
  if (!af.workspaceResolved) {
    return (
      `<p class="rk-defect">af workspace <code>${esc(af.workspace)}</code> did not resolve ` +
      `(unresolved-reference bucket).</p>`
    );
  }
  const taintCls = af.taintState === "clean" ? "rk-ok" : "rk-defect";
  const matchCls = af.contractMatch ? "rk-ok" : "rk-defect";
  return (
    `<dl class="rk-af">` +
    `<dt>workspace</dt><dd><code>${esc(af.workspace)}</code></dd>` +
    `<dt>af schema</dt><dd>${esc(af.afSchemaVersion)}</dd>` +
    `<dt>root node</dt><dd>${esc(af.afRootNodeId)}</dd>` +
    `<dt>contract match</dt><dd class="${matchCls}">${af.contractMatch}</dd>` +
    `<dt>epistemic</dt><dd>${esc(af.epistemicState)}</dd>` +
    `<dt>taint</dt><dd class="${taintCls}">${esc(af.taintState)}</dd>` +
    `<dt>nodes</dt><dd>${af.nodeCount}</dd>` +
    `</dl>`
  );
}

function frItem(e: FrEdge): string {
  const bits = [`cycle ${e.cycle}`, e.resolutionMethod];
  if (e.outcome) bits.push(`outcome=${e.outcome}`);
  if (e.verdict) bits.push(`verdict=${e.verdict}${e.verdictFresh === false ? " (STALE)" : ""}`);
  const stale = e.verdict !== undefined && e.verdictFresh === false;
  return `<li class="${stale ? "rk-defect" : ""}">${esc(bits.join(", "))} — <code>${esc(e.artifact)}</code></li>`;
}

/** Renders the full drill-down panel for `id`. Returns a `<section>` the site pre-renders once per
 * node; the hash router toggles visibility. `taintEntry` is this node's precomputed taint (from the
 * doc-wide `computeTaintTrace`) — passed in so the whole trace is computed once per render, not
 * once per node. `defsById` (optional, rk-iup) is definitions data keyed by id
 * (src/render/defs-edge.ts's EDGE output) — every node id shown on this panel (this node's own
 * heading, its deps, its route members, its dependents) gets a one-click glossary link when an
 * exact id match exists; omitted, or no match, leaves the id exactly as it already renders. */
export function renderNodePanel(
  doc: GraphDocument,
  id: string,
  taintEntry: TaintEntry | undefined,
  defsById?: DefsById,
): string {
  const view = computeFocusView(doc, id);
  if (!view.found || !view.node) {
    return `<section id="${esc(nodePanelId(id))}" class="rk-node"><p class="rk-defect">no node '${esc(id)}'.</p></section>`;
  }
  const n = view.node;
  // The effective presentation (M2 boundary review, blocker #1): a conflict naming this node OR a
  // non-clean computed taint overrides the declared status's face-value styling — the declared
  // claim stays visible in `st.label`'s "declared X; evidence Y" form, it just never paints or
  // counts as rigorous/available on its own say-so.
  const st = effectivePresentation(n.status, view.conflicts.length > 0, taintEntry?.taint ?? "clean");

  const badge =
    `<span class="rk-badge ${st.cssClass} ${st.tierClass}" style="--rk-status-colour:${st.colour}">` +
    `${esc(st.label)}</span> <span class="rk-tier">${st.isDefect ? "defect" : st.rigorous ? "rigorous" : "not rigorous"}</span>`;

  const routes = view.routes.length === 0
    ? `<p class="rk-none">no routes (deps-only shard)</p>`
    : `<ol class="rk-routes">` + view.routes.map((r) =>
        `<li class="${r.satisfied ? "rk-route-sat" : "rk-route-unsat"}">` +
        `${r.satisfied ? "satisfied" : "not satisfied"}: <ul class="rk-deps">${r.members.map((d) => depItem(d, defsById)).join("")}</ul></li>`,
      ).join("") + `</ol>`;

  const deps = view.deps.length === 0
    ? `<p class="rk-none">none</p>`
    : `<ul class="rk-deps">${view.deps.map((d) => depItem(d, defsById)).join("")}</ul>`;

  const dependents = view.dependents.length === 0
    ? `<p class="rk-none">none</p>`
    : `<ul class="rk-dependents">${view.dependents.map((d) => `<li><a href="#${esc(nodePanelId(d))}">${esc(d)}</a>${glossaryLink(d, defsById)}</li>`).join("")}</ul>`;

  const conflicts = view.conflicts.length === 0
    ? ``
    : `<div class="rk-conflicts rk-defect"><h4>conflicts (${view.conflicts.length})</h4><ul>` +
      view.conflicts.map((c) => `<li><strong>${esc(c.kind)}</strong>: ${esc(c.message)}</li>`).join("") + `</ul></div>`;

  const taint = taintEntry && taintEntry.taint !== "clean"
    ? `<p class="rk-defect">taint: ${esc(taintEntry.taint)} — ${esc(taintEntry.reason)}</p>`
    : taintEntry
      ? `<p class="rk-ok">taint: clean</p>`
      : ``;

  const bd = view.bdEdge
    ? `<p>bd: issue ${esc(view.bdEdge.issueId ?? "none")}, status ${esc(view.bdEdge.status ?? "unset")}, resolved ${view.bdEdge.resolved}</p>`
    : `<p class="rk-none">no bd issue</p>`;
  const fr = view.frEdges.length === 0
    ? `<p class="rk-none">no fr evidence</p>`
    : `<ul class="rk-fr">${view.frEdges.map(frItem).join("")}</ul>`;

  // EFFECTIVE availability (blocker #1): a defect node must never read as "available" even when
  // the monotone-trust predicate (query-shared.ts's `isNodeAvailable`, reflected in
  // `view.available`) would say so on the raw af flag/status alone — its own evidence contradicts
  // the declared status, so the overclaim stops here rather than at the graph layer.
  const effectiveAvailable = st.isDefect ? false : view.available;
  const availLine = st.isDefect
    ? `<p class="rk-avail rk-defect">available (monotone-trust): ${effectiveAvailable} ` +
      `(monotone-trust rule alone would say ${view.available}; overridden — evidence conflicted/tainted, see above); ` +
      `own requirements met: ${view.requirementsMet}</p>`
    : `<p class="rk-avail">available (monotone-trust): ${effectiveAvailable}; own requirements met: ${view.requirementsMet}</p>`;

  return (
    `<section id="${esc(nodePanelId(id))}" class="rk-node ${st.tierClass}">` +
    `<h2>${esc(id)}${glossaryLink(id, defsById)} <span class="rk-kind">(${esc(n.kind)})</span></h2>` +
    `<p class="rk-status-line">status: ${badge}</p>` +
    `<blockquote class="rk-contract">${esc(n.contract)}</blockquote>` +
    conflicts + taint +
    availLine +
    `<h3>af evidence</h3>${afBlock(view.afEdge)}` +
    `<h3>deps (AND)</h3>${deps}` +
    `<h3>routes (OR)</h3>${routes}` +
    `<h3>dependents</h3>${dependents}` +
    `<h3>fr evidence</h3>${fr}` +
    `<h3>bd</h3>${bd}` +
    `</section>`
  );
}
