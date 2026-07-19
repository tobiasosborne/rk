// src/render/dashboard.ts — the status dashboard (PRD C6): status counts, conflicts, unresolved
// bucket, and the "what blocks the north star" summary, all reusing the M2.5 query cores. Asserts
// the dashboard tells the truth about the rigour-ladder fixture: counts partitioned by rigour,
// conflicts and unresolved refs surfaced as first-class defects (never hidden), never a silent
// zero.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphDocument } from "../../src/graph/types";
import { renderDashboard, statusCounts } from "../../src/render/dashboard";

const FIXTURE = join(import.meta.dir, "..", "..", "corpus", "render", "rigour-ladder", "graph.json");
const doc = JSON.parse(readFileSync(FIXTURE, "utf8")) as GraphDocument;

describe("render/dashboard", () => {
  test("statusCounts partitions nodes by status and by rigour, totalling every node", () => {
    const counts = statusCounts(doc);
    // n-proved AND n-conflict are both status:proved -> proved count is 2.
    expect(counts.byStatus.proved).toBe(2);
    expect(counts.byStatus.cited).toBe(1);
    // n-stated + n-tainted are both status:stated -> 2.
    expect(counts.byStatus.stated).toBe(2);
    const total = Object.values(counts.byStatus).reduce((a, b) => a + b, 0) + counts.unset;
    expect(total).toBe(doc.nodes.length);
    // rigorous = cited(1)+proved(2)+consensus(1) = 4.
    expect(counts.rigorous).toBe(4);
    expect(counts.nonRigorous).toBe(doc.nodes.length - 4);
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
});
