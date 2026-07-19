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
    `<li><code>${esc(d.id)}</code> ${term}${aliases} ` +
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

/** Renders the full definitions index (grouped by kind, then status, alias lists shown) plus the
 * conventions ledger section. */
export function renderDefsIndex(data: DefsData): string {
  const index = data.defs.length === 0
    ? `<p class="rk-none">no definitions found under definitions/.</p>`
    : groupedSections(data.defs);
  return (
    `<div class="rk-defs"><h2>definitions index (${data.defs.length})</h2>${index}` +
    conventionsBlock(data.conventions) +
    `</div>`
  );
}
