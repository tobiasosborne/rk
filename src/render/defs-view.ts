// PURITY: pure — no fs/network/clock (L3). The definitions-index + conventions-ledger render half
// (PRD C6). Takes `DefsData` (src/render/defs-edge.ts's EDGE output); this file itself never
// touches fs.
//
// Conventions ledger stance (this WP's brief, characterized against templates/CONVENTIONS.md.tmpl):
// CONVENTIONS.md is AUTHORED, append-only prose with no machine-readable schema — there is no
// structured "convention record" to group/query the way definitions have kind/status/aliases.
// This view therefore renders it VERBATIM as an authored-content block (escaped, never parsed or
// scraped for facts) when present, and states plainly when it is absent — never a speculative
// prose-scrape.

import { esc } from "./html";
import type { DefRecord, DefsData } from "./defs-edge";

const KIND_ORDER = ["cited", "consensus", "original"] as const;
const STATUS_ORDER = ["locked", "draft"] as const;

/** Stable anchor id for one definition's own entry on the defs-index page — the analogue of
 * node-view.ts's `nodePanelId`. Lets any other surface (dashboard/DAG/node panel — rk-iup) link
 * directly at a term's own definition instead of only the page-level `#defs` route. `id` values
 * are frontmatter-declared filename stems (safe), but escape defensively at every call site
 * anyway, same discipline `nodePanelId` documents. */
export function defAnchorId(id: string): string {
  return `def-${id}`;
}

/** rk-iup: an inline decoration linking a bare node/term id to its definitions-index entry, for
 * use from the dashboard/DAG/node-panel (SC5: a stranger meeting an unfamiliar id must reach its
 * definition in ONE click, not a scroll through the index). Exact id match ONLY — deliberately no
 * prefix/fuzzy matching: a wrong match is a worse failure than no match (L6's "default to the
 * stricter validity semantics"), and node-id-prefix conventions are campaign-specific prose
 * (CONVENTIONS.md), not machine-checkable data this view can safely generalise from. Renders
 * NOTHING — not even a disabled-looking placeholder — when `defsById` is absent (definitions data
 * not loaded for this render) or `id` has no matching record: the id's own existing text/link
 * elsewhere on the page is left exactly as it already renders. Never a dead anchor, never a
 * decoration implying a definition that does not exist. */
export function glossaryLink(id: string, defsById: ReadonlyMap<string, DefRecord> | undefined): string {
  if (!defsById) return "";
  const rec = defsById.get(id);
  if (!rec) return "";
  const label = rec.term ?? rec.id;
  return ` <a class="rk-glossary-link" href="#${esc(defAnchorId(rec.id))}" title="glossary: ${esc(label)}">[def]</a>`;
}

function defRow(d: DefRecord): string {
  const term = d.term !== undefined ? esc(d.term) : `<span class="rk-none">(no term declared)</span>`;
  const aliases = d.aliases.length > 0
    ? `<span class="rk-muted"> — aka ${d.aliases.map((a) => esc(a)).join(", ")}</span>`
    : "";
  const status = d.status ?? "unset";
  const provenance = d.kind === "cited"
    ? `<span class="rk-tier">source=${esc(d.source ?? "(none declared)")}, sha256=${esc(d.sha256 ?? "(none declared)")}</span>`
    : "";
  return (
    `<li id="${esc(defAnchorId(d.id))}"><code>${esc(d.id)}</code> ${term}${aliases} ` +
    `<span class="rk-tier">[status: ${esc(status)}]</span> ${provenance} ` +
    `<span class="rk-muted">(${esc(d.path)})</span></li>`
  );
}

function groupKey(d: DefRecord): string {
  return d.kind ?? "unset";
}

/** Groups by kind (declared order first, then any other kind alphabetically, "unset" last), and
 * within each kind by status (declared order first, then any other status, "unset" last) — never
 * drops a def with a missing/unrecognized kind or status; it renders under its own honest "unset"
 * (or literal, unrecognized-value) bucket instead. */
function groupedSections(defs: readonly DefRecord[]): string {
  const kinds = [...new Set(defs.map(groupKey))].sort((a, b) => {
    const ia = KIND_ORDER.indexOf(a as (typeof KIND_ORDER)[number]);
    const ib = KIND_ORDER.indexOf(b as (typeof KIND_ORDER)[number]);
    if (a === "unset") return 1;
    if (b === "unset") return -1;
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  return kinds
    .map((kind) => {
      const inKind = defs.filter((d) => groupKey(d) === kind);
      const statuses = [...new Set(inKind.map((d) => d.status ?? "unset"))].sort((a, b) => {
        const ia = STATUS_ORDER.indexOf(a as (typeof STATUS_ORDER)[number]);
        const ib = STATUS_ORDER.indexOf(b as (typeof STATUS_ORDER)[number]);
        if (a === "unset") return 1;
        if (b === "unset") return -1;
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
      const statusBlocks = statuses
        .map((status) => {
          const rows = inKind.filter((d) => (d.status ?? "unset") === status).sort((a, b) => a.id.localeCompare(b.id));
          return `<h4>status: ${esc(status)} (${rows.length})</h4><ul>${rows.map(defRow).join("")}</ul>`;
        })
        .join("");
      return `<section class="rk-defs-kind"><h3>kind: ${esc(kind)} (${inKind.length})</h3>${statusBlocks}</section>`;
    })
    .join("");
}

function conventionsBlock(conventions: string | undefined): string {
  if (conventions === undefined) {
    return (
      `<section class="rk-conventions"><h2>conventions ledger</h2>` +
      `<p class="rk-none">no CONVENTIONS.md found at the repo root — there is no machine-readable ` +
      `conventions source to group or query, and this view does not scrape markdown prose ` +
      `speculatively; showing the definitions index only.</p></section>`
    );
  }
  return (
    `<section class="rk-conventions"><h2>conventions ledger</h2>` +
    `<p class="rk-muted">authored content, verbatim from CONVENTIONS.md — not parsed, not scraped.</p>` +
    `<pre class="rk-conventions-body">${esc(conventions)}</pre></section>`
  );
}

/** rk-38f (2): a campaign's node-id prefixes (dtr, icap, hx, conj-rh, ...) are undefined anywhere
 * else on a render — rk cannot know campaign vocabulary, but each def's own `id` IS the literal
 * prefix the campaign uses elsewhere (dashboard links, DAG labels), and `term` is its plain-English
 * meaning; that pairing already exists in `data.defs`, it was just never framed as the glossary a
 * reader needs. Renders ONLY when there is something to gloss (day-1 vacuity: no defs, no note). */
function glossaryFramingNote(defCount: number): string {
  if (defCount === 0) return "";
  return (
    `<p class="rk-defs-glossary-note">This index doubles as this campaign's node-id glossary: ` +
    `each entry's <code>id</code> is a literal node-id/term prefix used elsewhere on this site ` +
    `(dashboard links, DAG labels) — consult it before assuming a plain-English reading of an ` +
    `unfamiliar id (a false-cognate trap: an id need not mean what it looks like).</p>`
  );
}

/** Renders the full definitions index (grouped by kind, then status, alias lists shown) plus the
 * conventions ledger section. */
export function renderDefsIndex(data: DefsData): string {
  const index = data.defs.length === 0
    ? `<p class="rk-none">no definitions found under definitions/.</p>`
    : groupedSections(data.defs);
  return (
    `<div class="rk-defs"><h2>definitions index (${data.defs.length})</h2>` +
    glossaryFramingNote(data.defs.length) +
    index +
    conventionsBlock(data.conventions) +
    `</div>`
  );
}
