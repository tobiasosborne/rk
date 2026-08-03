// rk-0ehr / P1, semantics (b) — THE RENDER VETO: "no render surface may present validated/proved
// for an item with a live retraction". Asserted against EMITTED MARKUP from the real render
// surfaces (node panel + dashboard), driven by the real end-to-end fixture
// corpus/graph/conflict-retraction-vs-status/ — not against `effectivePresentation` in isolation
// (that unit is already pinned by test/render/styling.test.ts; what this file proves is that the
// veto actually reaches the page).
//
// The veto is implemented WITHOUT touching src/render/styling.ts: a live retraction always produces
// a mandatory `retraction-vs-status` ConflictRecord naming the node, and `effectivePresentation`'s
// pre-existing `hasConflict` defect path then handles presentation identically at all five call
// sites. That is why this test asserts markup rather than a new API — there is no new API.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildGraphDocument } from "../../src/store/build-graph";
import { computeTaintTrace } from "../../src/graph/query-taint";
import { renderDashboard, statusCounts } from "../../src/render/dashboard";
import { renderNodePanel } from "../../src/render/node-view";
import { DEFECT_COLOUR, DEFECT_TIER_CLASS, RIGOROUS_TIER_CLASS } from "../../src/render/styling";

const REPO = join(import.meta.dir, "..", "..", "corpus", "graph", "conflict-retraction-vs-status", "repo");
const ABSENT = ["definitely-not-a-real-binary-xyz"];
const RETRACTED = "lem-stage1-approximate-group-laws";

const { doc } = buildGraphDocument(REPO, { afCommand: ABSENT, frCommand: ABSENT });
const taint = computeTaintTrace(doc);

describe("render veto — the node panel", () => {
  const html = renderNodePanel(doc, RETRACTED, taint.get(RETRACTED));

  test("the retracted node is painted as a DEFECT, never as its declared rung", () => {
    expect(html).toContain(DEFECT_TIER_CLASS);
    expect(html).toContain(DEFECT_COLOUR);
    expect(html).not.toContain(RIGOROUS_TIER_CLASS);
    expect(html).toContain(">defect<");
    expect(html).not.toContain(">rigorous<");
  });

  test("the declared claim stays VISIBLE alongside the contradiction (truthfulness, not suppression)", () => {
    expect(html).toContain("declared proved-mod-audit; evidence conflicted, tainted");
  });

  test("the retraction itself is named on the panel, with who and why", () => {
    expect(html).toContain("retraction-vs-status");
    expect(html).toContain("retracted (l5-shard-bytes, ordinal 0)");
  });

  test("the DEPENDENT is also vetoed — it inherits the taint with no retraction of its own", () => {
    const downstream = renderNodePanel(doc, "lem-downstream", taint.get("lem-downstream"));
    expect(downstream).toContain(DEFECT_TIER_CLASS);
    expect(downstream).toContain("declared stated; evidence tainted");
  });
});

describe("render veto — the dashboard", () => {
  test("a retracted node is excluded from the EFFECTIVE rigorous count while its declared status stands", () => {
    const counts = statusCounts(doc, taint);
    expect(counts.byStatus["proved-mod-audit"]).toBe(1); // declared, never adjusted
    expect(counts.rigorous).toBe(0); // ...and never counted as rigorous
    expect(counts.defect).toBe(2); // the retracted node and its dependent
  });

  test("the conflict is surfaced as a first-class defect section, never hidden", () => {
    const html = renderDashboard(doc);
    expect(html).toContain("conflicts (1)");
    expect(html).toContain("<strong>retraction-vs-status</strong>");
    expect(html).toContain("retracted (l5-shard-bytes, ordinal 0)");
    expect(html).toContain("declared proved-mod-audit; evidence conflicted, tainted");
    // The headline itself is corrected, not just the detail sections.
    expect(html).toContain("0 rigorous, 2 not rigorous");
  });
});
