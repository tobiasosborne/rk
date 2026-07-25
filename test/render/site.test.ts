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
import type { FrResidualData } from "../../src/render/fr-edge";
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

  // rk-50v RENDER-EDGE option: fr export's own residual/reason text threads through to the
  // graveyard section when supplied, with no graph-schema change.
  test("frResiduals threads through to the graveyard section (rk-50v RENDER-EDGE option)", () => {
    const frResiduals: FrResidualData = {
      byCycle: new Map([[2, { residual: "induction fails at n=5", reason: "counterexample found", killedByWave: "w3" }]]),
    };
    const html = indexHtml(renderSite(doc, { frResiduals }));
    expect(html).toContain("induction fails at n=5");
  });

  test("frResiduals omitted: the graveyard section is byte-identical to today's disclaim-only output", () => {
    const withOption = indexHtml(renderSite(doc, { frResiduals: { byCycle: new Map() } }));
    const without = indexHtml(renderSite(doc));
    expect(withOption).toBe(without);
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

  // rk-iup: cross-link node ids on the dashboard/DAG/node-panel to their definitions-index entry,
  // wired end to end through renderSite (the same `defsById` map already fed to the provenance
  // view). "n-conflict" is a real node id in the rigour-ladder fixture and appears on the
  // dashboard (conflicts + contradicted-status sections), the DAG, and its own node panel.
  describe("rk-iup: definitions-index cross-links wired through the whole site", () => {
    const defsData: DefsData = {
      defs: [{ id: "n-conflict", path: "definitions/n-conflict.md", term: "Conflict Node", kind: "cited", status: "locked", aliases: [] }],
    };

    test("the dashboard, the DAG, and the node's own panel all carry a one-click link to the defs entry", () => {
      const html = indexHtml(renderSite(doc, { defsData }));
      const linkCount = (html.match(/href="#def-n-conflict"/g) ?? []).length;
      // at least: dashboard's conflicts row, dashboard's contradicted-status row, the DAG marker,
      // and the node panel's own heading — never zero, never a dead anchor.
      expect(linkCount).toBeGreaterThanOrEqual(3);
      expect(html).toContain('id="def-n-conflict"'); // the actual anchor target exists on the page
    });

    test("a node id with no matching def gets no glossary decoration anywhere on the site", () => {
      const html = indexHtml(renderSite(doc)); // no defsData at all
      // NOTE: the page's static <style> block always DECLARES the `.rk-glossary-link`/
      // `.rk-dag-glossary` CSS rules (they're part of BASE_CSS regardless of content) — the
      // honesty claim under test is that no element ever USES either class, so this asserts
      // absence of the class ATTRIBUTE value, not absence of the bare substring.
      expect(html).not.toContain('class="rk-glossary-link"');
      expect(html).not.toContain('class="rk-dag-glossary"');
    });

    test("deterministic with a matching defsData too (no non-determinism sneaks in through the new cross-links)", () => {
      const a = indexHtml(renderSite(doc, { defsData }));
      const b = indexHtml(renderSite(doc, { defsData }));
      expect(a).toBe(b);
    });
  });

  // rk-iup: the hash router previously assumed every internal link points straight at a
  // route-target's OWN id (true of every link before this WP). The new glossary links point at an
  // id NESTED inside the `#defs` section (one definitions-index entry) — a case that used to fall
  // back to `#dashboard` silently (the link would resolve to nothing, exactly the failure mode
  // this WP's brief calls out). This test runs the ACTUAL emitted router script (not a
  // reimplementation) against a small fake DOM to prove the fix, and that pre-existing direct
  // route-target links keep their old behaviour unchanged.
  describe("rk-iup: router fix — nested-anchor hashes resolve to their enclosing route-target section", () => {
    function extractRouterJs(html: string): string {
      const m = html.match(/<script>([\s\S]*)<\/script>/);
      if (!m) throw new Error("no inline <script> found in rendered site");
      return m[1]!;
    }

    interface FakeEl {
      id: string;
      classes: Set<string>;
      parentId?: string;
      style: { display: string };
      classList: { contains(c: string): boolean };
      parentElement: FakeEl | null;
      scrollIntoView?: () => void;
    }

    function runRouter(js: string, hash: string, defs: Record<string, { classes?: string[]; parent?: string }>) {
      const calls = { scrollIntoView: [] as string[], scrollTo: false };
      const nodes = new Map<string, FakeEl>();
      for (const [id, def] of Object.entries(defs)) {
        const classes = new Set(def.classes ?? []);
        const el: FakeEl = {
          id,
          classes,
          parentId: def.parent,
          style: { display: "none" },
          classList: { contains: (c: string) => classes.has(c) },
          parentElement: null,
          scrollIntoView: () => calls.scrollIntoView.push(id),
        };
        nodes.set(id, el);
      }
      for (const el of nodes.values()) {
        Object.defineProperty(el, "parentElement", {
          get: () => (el.parentId ? nodes.get(el.parentId) ?? null : null),
        });
      }
      const fakeDocument = {
        getElementById: (id: string) => nodes.get(id) ?? null,
        querySelectorAll: (sel: string) => {
          if (sel !== ".rk-route-target") throw new Error(`unexpected selector ${sel}`);
          return [...nodes.values()].filter((el) => el.classes.has("rk-route-target"));
        },
      };
      const fakeWindow = {
        addEventListener: () => {},
        scrollTo: () => {
          calls.scrollTo = true;
        },
      };
      // eslint-disable-next-line no-new-func -- deliberately executing the REAL shipped router text
      const fn = new Function("document", "window", "location", js);
      fn(fakeDocument, fakeWindow, { hash: `#${hash}` });
      return { nodes, calls };
    }

    test("a hash pointing at a nested glossary anchor shows the enclosing route-target section, not the dashboard fallback", () => {
      const html = indexHtml(renderSite(doc, { defsData: { defs: [] } }));
      const js = extractRouterJs(html);
      const { nodes, calls } = runRouter(js, "def-n-conflict", {
        dashboard: { classes: ["rk-route-target"] },
        defs: { classes: ["rk-route-target"] },
        "def-n-conflict": { parent: "defs" },
      });
      expect(nodes.get("defs")!.style.display).toBe("");
      expect(nodes.get("dashboard")!.style.display).toBe("none");
      // it scrolls to the specific entry, not just to the top of the page.
      expect(calls.scrollIntoView).toContain("def-n-conflict");
      expect(calls.scrollTo).toBe(false);
    });

    test("RED CASE (pre-fix behaviour): a direct route-target hash still resolves to itself, scrolling to top as before", () => {
      const html = indexHtml(renderSite(doc));
      const js = extractRouterJs(html);
      const { nodes, calls } = runRouter(js, "dashboard", {
        dashboard: { classes: ["rk-route-target"] },
        dag: { classes: ["rk-route-target"] },
      });
      expect(nodes.get("dashboard")!.style.display).toBe("");
      expect(nodes.get("dag")!.style.display).toBe("none");
      expect(calls.scrollTo).toBe(true);
      expect(calls.scrollIntoView).toEqual([]);
    });

    test("an unknown hash (no matching element at all) still falls back to the dashboard", () => {
      const html = indexHtml(renderSite(doc));
      const js = extractRouterJs(html);
      const { nodes } = runRouter(js, "no-such-anchor-anywhere", {
        dashboard: { classes: ["rk-route-target"] },
        dag: { classes: ["rk-route-target"] },
      });
      expect(nodes.get("dashboard")!.style.display).toBe("");
      expect(nodes.get("dag")!.style.display).toBe("none");
    });
  });
});
