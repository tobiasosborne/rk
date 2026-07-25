// src/render/dashboard.ts — the status dashboard (PRD C6): status counts, conflicts, unresolved
// bucket, and the "what blocks the north star" summary, all reusing the M2.5 query cores. Asserts
// the dashboard tells the truth about the rigour-ladder fixture: counts partitioned by rigour,
// conflicts and unresolved refs surfaced as first-class defects (never hidden), never a silent
// zero.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphDocument } from "../../src/graph/types";
import type { DefRecord } from "../../src/render/defs-edge";
import { renderDashboard, statusCounts } from "../../src/render/dashboard";

const FIXTURE = join(import.meta.dir, "..", "..", "corpus", "render", "rigour-ladder", "graph.json");
const doc = JSON.parse(readFileSync(FIXTURE, "utf8")) as GraphDocument;

describe("render/dashboard", () => {
  test("statusCounts partitions nodes by status and by rigour, totalling every node", () => {
    const counts = statusCounts(doc);
    // DECLARED counts: n-proved, n-conflict, n-proved-tainted, n-proved-orphan are all
    // status:proved -> proved count is 4 (the declared claim is never adjusted, blocker #1).
    expect(counts.byStatus.proved).toBe(4);
    expect(counts.byStatus.cited).toBe(1);
    // n-stated + n-tainted are both status:stated -> 2.
    expect(counts.byStatus.stated).toBe(2);
    expect(counts.unset).toBe(1); // n-unset
    const total = Object.values(counts.byStatus).reduce((a, b) => a + b, 0) + counts.unset;
    expect(total).toBe(doc.nodes.length);
    // EFFECTIVE rigorous excludes the three defective "proved" nodes (n-conflict: conflicted;
    // n-proved-tainted: tainted; n-proved-orphan: unresolved workspace -> taint "unresolved") —
    // only cited(1)+proved(1, n-proved only)+consensus(1) = 3 are honestly rigorous.
    expect(counts.rigorous).toBe(3);
    expect(counts.nonRigorous).toBe(doc.nodes.length - 3);
    // defect: n-conflict, n-orphan (workspace unresolved -> taint unresolved), n-tainted,
    // n-proved-tainted, n-proved-orphan = 5.
    expect(counts.defect).toBe(5);
  });

  test("a conflicted or tainted 'proved' node is EXCLUDED from the rigorous headline (blocker #1)", () => {
    const html = renderDashboard(doc);
    expect(html).toContain("3 rigorous");
    expect(html).not.toContain("4 rigorous");
  });

  test("declared-status-contradicted nodes are named on their own dashboard section", () => {
    const html = renderDashboard(doc);
    expect(html).toContain("declared status contradicted by evidence");
    expect(html).toContain("declared proved; evidence conflicted");
    expect(html).toContain("declared proved; evidence tainted");
  });

  test("conflicts render as a first-class defect section, counted, never hidden", () => {
    const html = renderDashboard(doc);
    expect(html).toContain("rk-defect");
    expect(html).toContain("contract-mismatch");
    expect(html).toContain("n-conflict");
  });

  test("the unresolved-reference bucket renders as its own section, counted", () => {
    const html = renderDashboard(doc);
    expect(html).toContain("proofs/missing");
    expect(html).toContain("unresolved");
  });

  test("the legend is embedded so every node colour is decodable on the dashboard", () => {
    const html = renderDashboard(doc);
    expect(html).toContain("rk-legend");
    expect(html).toContain("rigorous (PRD");
  });

  test("what-blocks summary appears when a north star is given, degrades honestly otherwise", () => {
    const withStar = renderDashboard(doc, "n-open");
    expect(withStar).toContain("north star");
    const without = renderDashboard(doc);
    expect(without).toContain("no north star");
  });

  // rk-scy (1): SC5 dry-run — the compact high-value content (summary/legend/north-star) sat
  // BELOW ~400 near-duplicate defect lines. Reorder so a skimming reader hits the summary first.
  test("summary, legend, and the north-star line all precede the long defect lists", () => {
    const html = renderDashboard(doc, "n-open");
    const countsAt = html.indexOf("rk-counts");
    const legendAt = html.indexOf("rk-legend-section");
    const blocksAt = html.indexOf("rk-blocks");
    const defectListAt = html.indexOf("declared status contradicted by evidence");
    const conflictsAt = html.indexOf("rk-conflicts");
    const unresolvedAt = html.indexOf("rk-unresolved");
    expect(countsAt).toBeGreaterThanOrEqual(0);
    expect(legendAt).toBeGreaterThan(countsAt);
    expect(blocksAt).toBeGreaterThan(legendAt);
    expect(defectListAt).toBeGreaterThan(blocksAt);
    expect(conflictsAt).toBeGreaterThan(blocksAt);
    expect(unresolvedAt).toBeGreaterThan(blocksAt);
  });

  // rk-scy (1): long defect lists collapsed behind <details>/<summary> (CSP-safe) rather than
  // dumped inline — a skimmer sees a one-line label, not ~400 <li> rows.
  test("the conflicts, contradicted-status, and unresolved-reference sections are collapsed behind <details>", () => {
    const html = renderDashboard(doc);
    const detailsCount = (html.match(/<details/g) ?? []).length;
    expect(detailsCount).toBe(3);
    expect(html).toContain("<summary>");
    // each collapsed section's own content is still present (never dropped, just collapsed).
    expect(html).toContain("declared status contradicted by evidence");
    expect(html).toContain("contract-mismatch");
    expect(html).toContain("proofs/missing");
  });

  // rk-scy (2): the status table read "proved 147 rigorous" while the headline said 34 — reconciled
  // only via the conflict lists below. Show declared/defect/effective inline in the row itself.
  test("the status table reconciles declared vs effective rigorous counts inline, per row", () => {
    const html = renderDashboard(doc);
    // fixture: status:proved is declared on 4 nodes (n-proved, n-conflict, n-proved-tainted,
    // n-proved-orphan); 3 of those are defects (conflicted or tainted) -> 1 effectively rigorous.
    expect(html).toContain("4 declared, 3 conflicted, 1 rigorous");
    // cited/consensus are declared on 1 node each, no defects -> fully reconciled trivially.
    expect(html).toContain("1 declared, 0 conflicted, 1 rigorous");
  });

  // rk-iup: cross-link node ids on the dashboard to their definitions-index entry (SC5 — a
  // stranger reaching a node id in the conflicts/contradicted-status/unresolved lists must reach
  // its definition in one click). Exact id match only.
  describe("rk-iup: glossary cross-links", () => {
    function defsWith(id: string, term: string): ReadonlyMap<string, DefRecord> {
      return new Map([[id, { id, path: `definitions/${id}.md`, term, kind: "cited", status: "locked", aliases: [] }]]);
    }

    test("a node id with a matching def gets a one-click link to its definitions-index entry (conflicts + contradicted-status sections)", () => {
      const html = renderDashboard(doc, undefined, undefined, defsWith("n-conflict", "Conflict Node"));
      expect(html).toContain('href="#def-n-conflict"');
      expect(html).toContain("Conflict Node");
    });

    test("a node id with a matching def gets a one-click link in the unresolved-references section", () => {
      const html = renderDashboard(doc, undefined, undefined, defsWith("n-orphan", "Orphan Node"));
      expect(html).toContain('href="#def-n-orphan"');
    });

    test("RED CASE: a node id with NO matching def renders no glossary link at all — never a dead anchor", () => {
      const html = renderDashboard(doc, undefined, undefined, defsWith("some-other-id", "Unrelated"));
      expect(html).not.toContain("rk-glossary-link");
    });

    test("no defsById supplied: dashboard renders exactly as before, no glossary markup anywhere", () => {
      const withDefs = renderDashboard(doc);
      expect(withDefs).not.toContain("rk-glossary-link");
    });

    test("existing node-panel-anchor links (nodePanelId) are untouched by the glossary addition", () => {
      const html = renderDashboard(doc, undefined, undefined, defsWith("n-conflict", "Conflict Node"));
      expect(html).toContain('href="#node-n-conflict"');
    });
  });
});
