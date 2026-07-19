// src/render/site.ts — assembles the self-contained static site (PRD C6: "Self-contained static
// site, no server, no external CDN"). Golden-ish identity: timestamp-free, deterministic bytes for
// unchanged input (the canonical-serializer discipline extends to the rendered site). Asserts
// self-containment (no external hrefs/scripts), that every node gets a pre-rendered drill-down
// panel, and that hash routing is wired.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphDocument } from "../../src/graph/types";
import { renderSite } from "../../src/render/site";
import { nodePanelId } from "../../src/render/node-view";
import type { DefsData } from "../../src/render/defs-edge";
import type { RunGalleryData } from "../../src/render/runs-edge";

const FIXTURE = join(import.meta.dir, "..", "..", "corpus", "render", "rigour-ladder", "graph.json");
const doc = JSON.parse(readFileSync(FIXTURE, "utf8")) as GraphDocument;

function indexHtml(site: { files: { path: string; contents: string }[] }): string {
  const f = site.files.find((x) => x.path === "index.html");
  if (!f) throw new Error("no index.html");
  return f.contents;
}

describe("render/site", () => {
  test("produces a single self-contained index.html", () => {
    const html = indexHtml(renderSite(doc));
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<style>");
    expect(html).toContain("</html>");
  });

  test("is self-contained: no external stylesheet, script src, or http(s) resource", () => {
    const html = indexHtml(renderSite(doc));
    expect(html).not.toContain("<link");
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
    expect(html).not.toContain("cdn");
  });

  test("pre-renders a drill-down panel for every node (hash-routed drill-down state)", () => {
    const html = indexHtml(renderSite(doc));
    for (const nd of doc.nodes) {
      expect(html).toContain(`id="${nodePanelId(nd.id)}"`);
    }
    expect(html).toContain("hashchange");
    expect(html).toContain("rk-route-target");
  });

  test("embeds the dashboard and the per-status CSS from the single styling source", () => {
    const html = indexHtml(renderSite(doc));
    expect(html).toContain("rk-dashboard");
    expect(html).toContain(".rk-s-proved{");
    expect(html).toContain(".rk-s-stated{");
  });

  test("deterministic: byte-identical across two renders of the same document (no timestamps)", () => {
    expect(indexHtml(renderSite(doc))).toBe(indexHtml(renderSite(doc)));
  });

  test("deterministic with runGallery/defsData supplied too (M2.4 pass 2 views)", () => {
    const runGallery: RunGalleryData = {
      bundles: [{ name: "2026-07-10-x", path: "runs/2026-07-10-x", readmePresent: true, readmeExcerpt: "h", referencedInIndex: true }],
      findings: [],
      coverage: { checked: 1, total: 1 },
    };
    const defsData: DefsData = {
      defs: [{ id: "def-foo", path: "definitions/def-foo.md", term: "Foo", kind: "cited", status: "locked", aliases: [] }],
      conventions: "# CONVENTIONS\n\n## Ledger\n[2026-01-01] x.",
    };
    const a = indexHtml(renderSite(doc, { runGallery, defsData }));
    const b = indexHtml(renderSite(doc, { runGallery, defsData }));
    expect(a).toBe(b);
  });

  test("threads the north star through to the dashboard's what-blocks summary", () => {
    const html = indexHtml(renderSite(doc, { northStarId: "n-open" }));
    expect(html).toContain("what blocks the north star (n-open)");
  });

  test("no `sources` option: no banner element, no evidence-sources section (M2 boundary review blocker #2)", () => {
    const html = indexHtml(renderSite(doc));
    expect(html).not.toContain('class="rk-banner');
    expect(html).not.toContain("evidence sources");
  });

  test("degraded `sources`: a site-level banner OUTSIDE the hash-routed sections, plus a dashboard row", () => {
    const html = indexHtml(renderSite(doc, { sources: { af: "ledger-fallback", fr: "export", bd: "read" } }));
    expect(html).toContain('class="rk-banner');
    expect(html).toContain("ledger fallback (reduced fidelity)");
    expect(html).toContain("evidence sources");
    // the banner sits between the header and <main>, i.e. before the hash-routed dashboard div.
    const bannerIdx = html.indexOf('class="rk-banner');
    const mainIdx = html.indexOf("<main>");
    expect(bannerIdx).toBeGreaterThan(0);
    expect(bannerIdx).toBeLessThan(mainIdx);
  });

  test("fully authoritative `sources`: evidence-sources section renders but no banner element", () => {
    const html = indexHtml(renderSite(doc, { sources: { af: "export", fr: "export", bd: "read" } }));
    expect(html).not.toContain('class="rk-banner');
    expect(html).toContain("evidence sources");
    expect(html).toContain("af: export");
  });

  test("wires the dead-route graveyard as its own hash-routed section, linked from the nav", () => {
    const html = indexHtml(renderSite(doc));
    expect(html).toContain('href="#graveyard"');
    expect(html).toContain('id="graveyard" class="rk-route-target"');
    expect(html).toContain("dead-route graveyard");
  });

  test("wires runs/provenance/defs as their own hash-routed sections, all linked from the nav", () => {
    const html = indexHtml(renderSite(doc));
    expect(html).toContain('href="#runs"');
    expect(html).toContain('id="runs" class="rk-route-target"');
    expect(html).toContain('href="#provenance"');
    expect(html).toContain('id="provenance" class="rk-route-target"');
    expect(html).toContain('href="#defs"');
    expect(html).toContain('id="defs" class="rk-route-target"');
    expect(html).toContain("per-claim provenance chains");
  });

  test("runGallery/defsData omitted: each route degrades honestly, never a silent blank", () => {
    const html = indexHtml(renderSite(doc));
    expect(html).toContain("run-bundle data not loaded for this render");
    expect(html).toContain("definitions data not loaded for this render");
  });

  test("runGallery/defsData supplied: threaded through to their routes, and defsData feeds provenance's refs step", () => {
    const runGallery: RunGalleryData = {
      bundles: [{ name: "2026-07-10-x", path: "runs/2026-07-10-x", readmePresent: true, readmeExcerpt: "Hypothesis. y", referencedInIndex: true }],
      findings: [],
      coverage: { checked: 1, total: 1 },
    };
    const defsData: DefsData = {
      defs: [{ id: "def-foo", path: "definitions/def-foo.md", term: "Foo", kind: "cited", status: "locked", aliases: [] }],
    };
    const html = indexHtml(renderSite(doc, { runGallery, defsData }));
    expect(html).toContain("2026-07-10-x");
    expect(html).toContain("def-foo");
    // n-cited's chain block (fixture cites def-foo) resolves the term via defsData.
    const idx = html.indexOf('id="chain-n-cited"');
    expect(idx).toBeGreaterThan(-1);
  });

  test("all-absent `sources` (nothing adopted yet): named on the dashboard, but NO alarm banner", () => {
    const html = indexHtml(renderSite(doc, { sources: { af: "absent", fr: "absent", bd: "absent" } }));
    expect(html).not.toContain('class="rk-banner');
    expect(html).toContain("evidence sources");
    expect(html).toContain("af: absent");
  });
});
