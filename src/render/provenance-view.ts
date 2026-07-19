// PURITY: pure — no fs/network/clock (L3). Per-claim provenance chains (this WP's brief): for
// each registry node, claim -> provenance field -> report anchor -> af evidence -> refs. Reuses
// `computeFocusView` (src/graph/query-focus.ts, landed M2.5) for the report-anchor/af-evidence
// steps, so this view can never disagree with `rk graph --focus`'s own per-node picture — the
// same "share the core, don't re-derive" discipline src/render/node-view.ts documents.
//
// Chain step 2 (provenance field) is honestly reported ABSENT: `RegistryNode` carries no raw
// `provenance:` frontmatter field (src/graph/types.ts) — only the DERIVED report-anchor join
// result (`ReportEdge.anchor`/`resolved`, step 3) crosses the M2.2 reader boundary
// (src/gates/provenance-parse.ts's `RegistryShard.provenance` stays a Gate-4-only re-parse). This
// view says so plainly rather than fabricating or silently omitting the step.
//
// Chain step 5 (refs) resolves `RegistryNode.defs` ids against an OPTIONAL `defsById` map
// (src/render/defs-edge.ts's EDGE output, keyed by id) — a def id absent from that map (or the
// map itself not supplied) renders an explicit note, never a silent drop (CLAUDE.md L2: "an
// absent link is information").

import { computeFocusView } from "../graph/query-focus";
import type { TaintEntry } from "../graph/query-taint";
import { computeTaintTrace } from "../graph/query-taint";
import type { GraphDocument } from "../graph/types";
import type { DefRecord } from "./defs-edge";
import { esc } from "./html";
import { effectivePresentation } from "./styling";

export interface ProvenanceChainOptions {
  /** Definitions data (src/render/defs-edge.ts), keyed by def id. Omitted when the caller has no
   * definitions data loaded for this render — the refs step then names the cited ids but says so
   * honestly, never silently treating "not loaded" as "cites nothing". */
  defsById?: ReadonlyMap<string, DefRecord>;
  taint?: ReadonlyMap<string, TaintEntry>;
}

const PROVENANCE_FIELD_NOTE =
  `<dd class="rk-none">not carried into the graph projection — <code>RegistryNode</code> keeps no ` +
  `raw <code>provenance:</code> frontmatter field, only the DERIVED report-anchor join result ` +
  `below crosses the M2.2 join (see the shard's own frontmatter for the raw field).</dd>`;

function reportAnchorStep(reportEdges: readonly { anchor: string; resolved: boolean }[]): string {
  if (reportEdges.length === 0) {
    return `<dd class="rk-none">no report anchor recorded for this node.</dd>`;
  }
  const items = reportEdges
    .map((r) => `<li class="${r.resolved ? "rk-ok" : "rk-defect"}"><code>${esc(r.anchor)}</code> — ${r.resolved ? "resolved" : "UNRESOLVED (no matching \\label{} in report/)"}</li>`)
    .join("");
  return `<dd><ul>${items}</ul></dd>`;
}

function afEvidenceStep(afEdge: ReturnType<typeof computeFocusView>["afEdge"]): string {
  if (!afEdge) return `<dd class="rk-none">no af workspace (af: none).</dd>`;
  if (!afEdge.workspaceResolved) {
    return `<dd class="rk-defect">af workspace <code>${esc(afEdge.workspace)}</code> did not resolve.</dd>`;
  }
  return (
    `<dd><code>workspaceResolved</code>=true, ` +
    `<code>contractMatch</code>=<span class="${afEdge.contractMatch ? "rk-ok" : "rk-defect"}">${afEdge.contractMatch}</span>, ` +
    `<code>epistemicState</code>=${esc(afEdge.epistemicState)}, ` +
    `<code>taintState</code>=<span class="${afEdge.taintState === "clean" ? "rk-ok" : "rk-defect"}">${esc(afEdge.taintState)}</span></dd>`
  );
}

function refDetail(id: string, defsById: ReadonlyMap<string, DefRecord> | undefined): string {
  if (!defsById) {
    return `<li><code>${esc(id)}</code> — <span class="rk-none">definitions data not loaded for this render (link not checked).</span></li>`;
  }
  const rec = defsById.get(id);
  if (!rec) {
    return `<li><code>${esc(id)}</code> — <span class="rk-defect">no matching definitions/*.md record found in this render (absent link).</span></li>`;
  }
  const src = rec.kind === "cited" ? ` — source=${esc(rec.source ?? "(none)")}, sha256=${esc(rec.sha256 ?? "(none)")}` : "";
  return `<li><code>${esc(id)}</code> ${esc(rec.term ?? "(no term)")} [${esc(rec.kind ?? "unset")}]${src}</li>`;
}

function refsStep(defs: readonly string[], defsById: ReadonlyMap<string, DefRecord> | undefined): string {
  if (defs.length === 0) return `<dd class="rk-none">no definitions cited.</dd>`;
  return `<dd><ul>${defs.map((id) => refDetail(id, defsById)).join("")}</ul></dd>`;
}

/** Renders one node's full chain: claim -> provenance field -> report anchor -> af evidence ->
 * refs. `taint`/conflict presence route the claim's own badge through `effectivePresentation`
 * (styling.ts's single source of truth), same as every other status-bearing surface. */
function chainBlock(
  doc: GraphDocument,
  id: string,
  taint: ReadonlyMap<string, TaintEntry>,
  defsById: ReadonlyMap<string, DefRecord> | undefined,
): string {
  const view = computeFocusView(doc, id);
  if (!view.found || !view.node) {
    return `<article id="chain-${esc(id)}" class="rk-chain"><p class="rk-defect">no node '${esc(id)}'.</p></article>`;
  }
  const n = view.node;
  const pres = effectivePresentation(n.status, view.conflicts.length > 0, taint.get(id)?.taint ?? "clean");
  const badge = `<span class="rk-badge ${pres.cssClass} ${pres.tierClass}" style="--rk-status-colour:${pres.colour}">${esc(pres.label)}</span>`;

  return (
    `<article id="chain-${esc(id)}" class="rk-chain">` +
    `<h3>${esc(id)} ${badge}</h3>` +
    `<blockquote class="rk-contract">${esc(n.contract)}</blockquote>` +
    `<dl>` +
    `<dt>1. claim</dt><dd>the contract above.</dd>` +
    `<dt>2. provenance field</dt>${PROVENANCE_FIELD_NOTE}` +
    `<dt>3. report anchor</dt>${reportAnchorStep(view.reportEdges)}` +
    `<dt>4. af evidence</dt>${afEvidenceStep(view.afEdge)}` +
    `<dt>5. refs (definitions cited)</dt>${refsStep(n.defs, defsById)}` +
    `</dl>` +
    `</article>`
  );
}

/** Renders every node's provenance chain, sorted by id for deterministic output regardless of
 * `doc.nodes`'s own order. */
export function renderProvenanceChains(doc: GraphDocument, options: ProvenanceChainOptions = {}): string {
  const taint = options.taint ?? computeTaintTrace(doc);
  const ids = [...doc.nodes].map((n) => n.id).sort();
  const blocks = ids.map((id) => chainBlock(doc, id, taint, options.defsById)).join("");
  return `<div class="rk-provenance-chains"><h2>per-claim provenance chains (${ids.length})</h2>${blocks}</div>`;
}
