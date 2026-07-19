// PURITY: pure — no fs/network/clock (L3). The status dashboard (PRD C6): status counts, conflicts,
// the unresolved-reference bucket, and the "what blocks the north star" summary. Reuses the M2.5
// query cores (computeWhatBlocks) so the dashboard and `rk graph --blocks` agree by construction.
// Counts are partitioned by rigour through src/render/styling.ts's RIGOROUS_STATUSES — the same
// single source of truth every other surface reads, so the dashboard's "N rigorous" headline can
// never disagree with a node badge's tier.

import { computeWhatBlocks, type BlockerEntry } from "../graph/query-blocks";
import { computeTaintTrace, type TaintEntry } from "../graph/query-taint";
import { RIGOUR_STATUSES, type GraphDocument, type RigourStatus } from "../graph/types";
import { esc } from "./html";
import { nodePanelId } from "./node-view";
import { effectivePresentation, renderLegend, statusStyle } from "./styling";

export interface StatusCounts {
  /** DECLARED status counts, verbatim — a conflicted/tainted `proved` node still counts under
   * `proved` here; this table is "what was claimed", never adjusted (M2 boundary review
   * blocker #1: the declared claim stays visible). */
  byStatus: Record<RigourStatus, number>;
  unset: number;
  /** EFFECTIVE rigorous count — a conflicted or tainted node is EXCLUDED even when its declared
   * status is one of `RIGOROUS_STATUSES` (the headline this whole fix exists to correct). */
  rigorous: number;
  nonRigorous: number;
  /** Count of nodes whose effective presentation `isDefect` (conflict or non-clean taint) —
   * named separately so the dashboard can call them out regardless of declared status. */
  defect: number;
}

function nodeTaint(id: string, taint: ReadonlyMap<string, TaintEntry>): TaintEntry["taint"] {
  return taint.get(id)?.taint ?? "clean";
}

function conflictedIds(doc: GraphDocument): Set<string> {
  return new Set(doc.conflicts.map((c) => c.nodeId).filter((id): id is string => id !== undefined));
}

export function statusCounts(doc: GraphDocument, taint?: ReadonlyMap<string, TaintEntry>): StatusCounts {
  const t = taint ?? computeTaintTrace(doc);
  const conflicted = conflictedIds(doc);
  const byStatus = Object.fromEntries(RIGOUR_STATUSES.map((s) => [s, 0])) as Record<RigourStatus, number>;
  let unset = 0;
  let rigorous = 0;
  let defect = 0;
  for (const nd of doc.nodes) {
    if (nd.status === undefined) {
      unset++;
    } else {
      byStatus[nd.status]++;
    }
    const pres = effectivePresentation(nd.status, conflicted.has(nd.id), nodeTaint(nd.id, t));
    if (pres.isDefect) defect++;
    if (pres.rigorous) rigorous++;
  }
  return { byStatus, unset, rigorous, nonRigorous: doc.nodes.length - rigorous, defect };
}

function countsBlock(doc: GraphDocument, taint: ReadonlyMap<string, TaintEntry>): string {
  const c = statusCounts(doc, taint);
  const rows = RIGOUR_STATUSES.filter((s) => c.byStatus[s] > 0).map((s) => {
    const st = statusStyle(s);
    return (
      `<tr class="${st.tierClass}"><td><span class="rk-swatch" style="background:${st.colour}"></span>` +
      `${esc(st.label)}</td><td>${c.byStatus[s]}</td><td>${st.rigorous ? "rigorous" : "not"}</td></tr>`
    );
  }).join("");
  const unsetRow = c.unset > 0 ? `<tr><td>unset</td><td>${c.unset}</td><td>not</td></tr>` : "";
  const defectNote = c.defect > 0
    ? ` (${c.defect} declared status contradicted by its own evidence — excluded from the rigorous count above; see "declared status contradicted" below)`
    : "";
  return (
    `<section class="rk-counts"><h2>status counts (${doc.nodes.length} nodes)</h2>` +
    `<p class="rk-headline">${c.rigorous} rigorous, ${c.nonRigorous} not rigorous${esc(defectNote)}</p>` +
    `<table><thead><tr><th>status</th><th>count</th><th>tier</th></tr></thead>` +
    `<tbody>${rows}${unsetRow}</tbody></table></section>`
  );
}

/** Named, first-class callout (M2 boundary review, blocker #1): every node whose effective
 * presentation is a defect (a conflict names it, or its computed taint is non-clean), regardless
 * of its declared status. This is what makes "excluded from the rigorous count" mechanically
 * checkable on the page itself, not just true in the count arithmetic. */
function defectBlock(doc: GraphDocument, taint: ReadonlyMap<string, TaintEntry>): string {
  const conflicted = conflictedIds(doc);
  const rows = doc.nodes
    .map((nd) => ({ nd, pres: effectivePresentation(nd.status, conflicted.has(nd.id), nodeTaint(nd.id, taint)) }))
    .filter((x) => x.pres.isDefect)
    .map(
      (x) =>
        `<li><a href="#${esc(nodePanelId(x.nd.id))}">${esc(x.nd.id)}</a>: ${esc(x.pres.label)}</li>`,
    )
    .join("");
  if (rows.length === 0) {
    return `<section class="rk-defect-nodes"><h2>declared status contradicted by evidence</h2><p class="rk-ok">none</p></section>`;
  }
  return (
    `<section class="rk-defect-nodes rk-defect"><h2>declared status contradicted by evidence</h2>` +
    `<ul>${rows}</ul></section>`
  );
}

function conflictsBlock(doc: GraphDocument): string {
  if (doc.conflicts.length === 0) {
    return `<section class="rk-conflicts"><h2>conflicts</h2><p class="rk-ok">none</p></section>`;
  }
  const rows = doc.conflicts.map((c) => {
    const where = c.nodeId ? `<a href="#${esc(nodePanelId(c.nodeId))}">${esc(c.nodeId)}</a>` : "-";
    return `<li><strong>${esc(c.kind)}</strong> (${esc(c.edge)}, ${where}): ${esc(c.message)}</li>`;
  }).join("");
  return (
    `<section class="rk-conflicts rk-defect"><h2>conflicts (${doc.conflicts.length})</h2>` +
    `<ul>${rows}</ul></section>`
  );
}

function unresolvedBlock(doc: GraphDocument): string {
  if (doc.unresolved.length === 0) {
    return `<section class="rk-unresolved"><h2>unresolved references</h2><p class="rk-ok">none</p></section>`;
  }
  const rows = doc.unresolved.map((u) => {
    const from = u.nodeId ? ` from <a href="#${esc(nodePanelId(u.nodeId))}">${esc(u.nodeId)}</a>` : "";
    const cyc = u.edge === "fr" ? ` (cycle ${u.sourceCycle})` : "";
    return `<li><code>${esc(u.edge)}</code>${cyc}: <code>${esc(u.ref)}</code>${from} — ${esc(u.reason)}</li>`;
  }).join("");
  return (
    `<section class="rk-unresolved rk-defect"><h2>unresolved references (${doc.unresolved.length})</h2>` +
    `<p>every edge kind's failed lookups land here — never a silent drop (PRD C5).</p>` +
    `<ul>${rows}</ul></section>`
  );
}

function blockerLi(e: BlockerEntry): string {
  return (
    `<li><a href="#${esc(nodePanelId(e.id))}">${esc(e.id)}</a> ` +
    `(status=${esc(e.status ?? "unset")}, af=${esc(e.af)}) — ${esc(e.reasons.join("; "))}</li>`
  );
}

function whatBlocksBlock(doc: GraphDocument, northStarId?: string): string {
  if (!northStarId) {
    return (
      `<section class="rk-blocks"><h2>what blocks the north star</h2>` +
      `<p class="rk-none">no north star given (pass --north-star &lt;id&gt; or set northStarId in .rk/config.json).</p></section>`
    );
  }
  const r = computeWhatBlocks(doc, northStarId);
  if (!r.found) {
    return (
      `<section class="rk-blocks"><h2>what blocks the north star</h2>` +
      `<p class="rk-defect">north star '${esc(northStarId)}' names no node.</p></section>`
    );
  }
  const frontier = r.frontier.length === 0 ? `<p class="rk-none">none</p>` : `<ul>${r.frontier.map(blockerLi).join("")}</ul>`;
  const blocked = r.blocked.length === 0 ? `<p class="rk-none">none</p>` : `<ul>${r.blocked.map(blockerLi).join("")}</ul>`;
  return (
    `<section class="rk-blocks"><h2>what blocks the north star (${esc(northStarId)})</h2>` +
    `<p>${r.satisfiedCount}/${r.pathSize} critical-path nodes already available.</p>` +
    `<h3>frontier (actionable now, ${r.frontier.length})</h3>${frontier}` +
    `<h3>blocked (${r.blocked.length})</h3>${blocked}</section>`
  );
}

/** The full dashboard fragment. `northStarId` (optional) drives the what-blocks summary; absent, it
 * degrades honestly to a note rather than fabricating a path. `taint` (optional) is the doc-wide
 * taint trace — pass the one `render/site.ts` already computed once per render; when omitted this
 * recomputes it (kept optional so every pre-existing unit test call site keeps working). */
export function renderDashboard(
  doc: GraphDocument,
  northStarId?: string,
  taint?: ReadonlyMap<string, TaintEntry>,
): string {
  const t = taint ?? computeTaintTrace(doc);
  return (
    `<div class="rk-dashboard">` +
    countsBlock(doc, t) +
    conflictsBlock(doc) +
    defectBlock(doc, t) +
    unresolvedBlock(doc) +
    whatBlocksBlock(doc, northStarId) +
    `<section class="rk-legend-section"><h2>rigour ladder legend</h2>${renderLegend()}</section>` +
    `</div>`
  );
}
