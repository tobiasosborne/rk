// src/render/node-view.ts — the per-node drill-down panel (PRD C6: "node -> contract -> af proof
// tree -> ledger events -> verdicts"). rk-iup: every node id shown on a panel (its own heading, its
// AND-deps, its OR-route members, its dependents) gets a one-click link to the id's matching
// definitions-index entry when one exists (src/render/defs-view.ts's `glossaryLink`) — never a
// dead anchor, never a decoration for an id with no matching def. Status/rigour-styling coverage
// itself lives in corpus-rigour-ladder.test.ts; this file is scoped to the new cross-link behaviour
// and stays out of that fixture's way.

import { describe, expect, test } from "bun:test";
import type { DefRecord } from "../../src/render/defs-edge";
import { nodePanelId, renderNodePanel } from "../../src/render/node-view";
import type { GraphDocument, RegistryNode } from "../../src/graph/types";

const B = { count: 0, classifications: [] as [] };
function n(id: string, status: RegistryNode["status"], deps: string[], routes: string[][] = []): RegistryNode {
  return { id, kind: "lemma", path: `argument/${id}.md`, contract: `c ${id}`, status, af: "none", deps, routes, defs: [], balloons: B };
}

// leaf -> mid (AND dep); mid is also a route member (OR) of "alt-goal"; "mid" has a dependent "goal".
const doc: GraphDocument = {
  schema_version: "1",
  nodes: [
    n("leaf", "cited", []),
    n("mid", "proved", ["leaf"]),
    n("goal", "open", ["mid"]),
    n("alt-goal", "open", [], [["mid"]]),
  ],
  edges: { af: [], bd: [], fr: [], report: [] },
  unresolved: [],
  conflicts: [],
};

function defsWith(id: string, term: string): ReadonlyMap<string, DefRecord> {
  return new Map([[id, { id, path: `definitions/${id}.md`, term, kind: "cited", status: "locked", aliases: [] }]]);
}

describe("render/node-view — rk-iup glossary cross-links", () => {
  test("the panel's own heading gets a one-click link when the node id has a matching def", () => {
    const panel = renderNodePanel(doc, "mid", undefined, defsWith("mid", "Middle Term"));
    expect(panel).toContain('href="#def-mid"');
    expect(panel).toContain("Middle Term");
  });

  test("an AND-dep id with a matching def gets its own glossary link, alongside its existing panel link", () => {
    const panel = renderNodePanel(doc, "mid", undefined, defsWith("leaf", "Leaf Term"));
    expect(panel).toContain(`href="#${nodePanelId("leaf")}"`); // existing dep -> panel link, untouched
    expect(panel).toContain('href="#def-leaf"');
    expect(panel).toContain("Leaf Term");
  });

  test("an OR-route member id with a matching def gets its own glossary link", () => {
    const panel = renderNodePanel(doc, "alt-goal", undefined, defsWith("mid", "Middle Term"));
    expect(panel).toContain('href="#def-mid"');
  });

  test("a dependent id with a matching def gets its own glossary link", () => {
    // "goal" depends on "mid" -> "mid"'s panel lists "goal" as a dependent.
    const panel = renderNodePanel(doc, "mid", undefined, defsWith("goal", "Goal Term"));
    expect(panel).toContain('href="#def-goal"');
  });

  test("RED CASE: an id with NO matching def renders no glossary link at all — never a dead anchor", () => {
    const panel = renderNodePanel(doc, "mid", undefined, defsWith("no-such-id", "Unrelated"));
    expect(panel).not.toContain("rk-glossary-link");
  });

  test("no defsById supplied at all: the panel renders exactly as before, no glossary markup anywhere", () => {
    const panel = renderNodePanel(doc, "mid", undefined);
    expect(panel).not.toContain("rk-glossary-link");
  });

  test("a matched def's term containing markup-significant characters is escaped, never raw", () => {
    const panel = renderNodePanel(doc, "mid", undefined, defsWith("mid", "<script>alert(1)</script>"));
    expect(panel).not.toContain("<script>alert(1)</script>");
    expect(panel).toContain("&lt;script&gt;");
  });
});
