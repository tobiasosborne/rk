// src/render/graveyard-view.ts — the dead-route graveyard (PRD C6: "dead-route graveyard").
// Reads `GraphDocument.edges.fr` directly (no new store reader — this data already crosses the
// M2.2 join): a "dead route" is an fr edge whose `outcome` is "died" or "refuted"
// (../knowledge-frontier/src/types.ts's `Outcome`). Truthfulness invariant this file exists to
// prove: a SUPERSEDED dead route (another edge's `supersedes` names its cycle — the ONLY way
// supersession is derivable, per types-edges.ts's `FrEdgeBase.supersedes` doc comment) must be
// visibly marked "superseded" and must NEVER appear in the live/current list — presenting stale
// evidence as live is exactly the corpus's forbidden case (fixture: corpus/render/rigour-ladder,
// cycle 1 superseded by cycle 2, both targeting n-obstruction).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphDocument } from "../../src/graph/types";
import { computeGraveyard, renderGraveyard } from "../../src/render/graveyard-view";

const FIXTURE = join(import.meta.dir, "..", "..", "corpus", "render", "rigour-ladder", "graph.json");
const doc = JSON.parse(readFileSync(FIXTURE, "utf8")) as GraphDocument;

describe("render/graveyard-view", () => {
  test("computeGraveyard finds only died/refuted outcomes, never a banked/progress edge", () => {
    const entries = computeGraveyard(doc);
    const cycles = entries.map((e) => e.cycle).sort((a, b) => a - b);
    expect(cycles).toEqual([1, 2, 3, 4]);
    expect(entries.every((e) => e.outcome === "died" || e.outcome === "refuted")).toBe(true);
  });

  test("cycle 1 (superseded by cycle 2) is marked superseded; cycle 2 is not", () => {
    const entries = computeGraveyard(doc);
    const c1 = entries.find((e) => e.cycle === 1)!;
    const c2 = entries.find((e) => e.cycle === 2)!;
    expect(c1.superseded).toBe(true);
    expect(c1.supersededByCycle).toBe(2);
    expect(c2.superseded).toBe(false);
    expect(c2.supersededByCycle).toBeUndefined();
  });

  test("an unresolved dead route (cycle 4) carries no resolvedNodeId and is never dropped", () => {
    const entries = computeGraveyard(doc);
    const c4 = entries.find((e) => e.cycle === 4)!;
    expect(c4.resolvedNodeId).toBeUndefined();
    expect(c4.resolutionMethod).toBe("unresolved");
  });

  test("RED CASE: a superseded dead route never renders in the live section, only the superseded one", () => {
    const html = renderGraveyard(doc);
    const liveSection = html.slice(0, html.indexOf('id="rk-graveyard-superseded"'));
    // cycle 1 (superseded) must not appear as a live entry ...
    expect(liveSection).not.toContain("cycle 1<");
    // ... but IS still visible, in the superseded section, never a silent drop (CLAUDE.md L2).
    expect(html).toContain("cycle 1<");
    expect(html).toContain("superseded");
  });

  test("every dead route is visibly present somewhere on the page (never a silent drop)", () => {
    const html = renderGraveyard(doc);
    for (const cycle of [1, 2, 3, 4]) {
      expect(html).toContain(`cycle ${cycle}<`);
    }
  });

  test("honestly notes that fr's own residual/death-certificate text is not carried into the graph projection", () => {
    const html = renderGraveyard(doc);
    expect(html.toLowerCase()).toContain("residual");
    expect(html.toLowerCase()).toContain("not carried");
  });

  test("day-1 vacuity: a document with no fr edges at all renders a plain, honest empty state", () => {
    const empty: GraphDocument = { ...doc, edges: { ...doc.edges, fr: [] } };
    const html = renderGraveyard(empty);
    expect(html).toContain("no dead routes");
  });
});
