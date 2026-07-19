// PURITY: pure — no fs/network/clock (L3). The run-bundle gallery's render half (PRD C6:
// "run-bundle gallery with embedded figures/demos"). Takes `RunGalleryData`
// (src/render/runs-edge.ts's EDGE output — already loaded off disk) and renders HTML; this file
// itself never touches fs. A bundle the runs gate (src/gates/runs.ts, reused verbatim by the edge)
// flagged is never presented as an ordinary clean card — its finding renders right on the card, so
// a broken bundle can never look indistinguishable from a valid one.

import type { Finding } from "../gates/framework";
import { esc } from "./html";
import type { RunBundleSummary, RunGalleryData } from "./runs-edge";

function findingsFor(name: string, findings: readonly Finding[]): Finding[] {
  return findings.filter((f) => f.path === name || f.path.startsWith(`${name}/`) || f.path.startsWith(`runs/${name}`));
}

function findingLine(f: Finding): string {
  return `<li class="rk-defect">${esc(f.severity)}: ${esc(f.message)} (${esc(f.path)})</li>`;
}

function bundleCard(b: RunBundleSummary, findings: readonly Finding[]): string {
  const own = findingsFor(b.name, findings);
  const readme = b.readmePresent
    ? `<blockquote class="rk-contract">${esc(b.readmeExcerpt ?? "")}</blockquote>`
    : `<p class="rk-defect">no README.md — missing hypothesis/command/finding/next.</p>`;
  const indexLine = b.referencedInIndex
    ? `<p class="rk-ok">referenced in INDEX.md</p>`
    : `<p class="rk-defect">NOT referenced in INDEX.md (orphan bundle)</p>`;
  const findingsBlock = own.length === 0 ? `` : `<ul class="rk-run-findings">${own.map(findingLine).join("")}</ul>`;
  const cls = own.length > 0 ? "rk-run-card rk-defect" : "rk-run-card";
  return (
    `<article class="${cls}"><h3>${esc(b.name)}</h3><p class="rk-tier"><code>${esc(b.path)}</code></p>` +
    readme + indexLine + findingsBlock + `</article>`
  );
}

/** Renders the full gallery. Every bundle from `data.bundles` renders (never a silent drop); a
 * bundle the runs gate flagged carries its OWN finding(s) directly on the card so it can never be
 * mistaken for an ordinary clean one. */
export function renderRunGallery(data: RunGalleryData): string {
  const coverageLine = `<p class="rk-tier">${data.coverage.checked}/${data.coverage.total} run bundle(s)</p>`;
  if (data.bundles.length === 0) {
    return (
      `<div class="rk-run-gallery"><h2>run-bundle gallery</h2>${coverageLine}` +
      `<p class="rk-none">no run bundles found under runs/.</p></div>`
    );
  }
  const cards = data.bundles.map((b) => bundleCard(b, data.findings)).join("");
  return (
    `<div class="rk-run-gallery"><h2>run-bundle gallery (${data.bundles.length})</h2>${coverageLine}` +
    `<div class="rk-run-cards">${cards}</div></div>`
  );
}
