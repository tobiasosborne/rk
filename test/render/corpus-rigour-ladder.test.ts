// Rendering-truthfulness corpus (M2.4, PRD C6): the fixture corpus/render/rigour-ladder/graph.json
// carries one node per rigour-ladder status (PRD §5) plus taint, conflict, and unresolved-bucket
// cases. This test renders each node's drill-down panel and asserts the EMITTED MARKUP: the correct
// per-status class and label, the correct rigour tier, and — the load-bearing invariant — that a
// non-rigorous node (e.g. `stated`) is NEVER painted with a rigorous class or the rigorous tier.
// "A `stated` node styled as `proved` is a corpus failure, not a cosmetic bug." Mutation evidence:
// swapping any non-rigorous status's colour/tier to a rigorous one in src/render/styling.ts (or
// making styleForOptional default to a rigorous style) turns this test RED — see the WP report.
//
// A distinct harness from src/corpus/run.ts's Gate runner, same footing as corpus/graph/ (see
// corpus/README.md "Graph fixtures"): a hand-written test over a repo-shaped-on-disk fixture, not
// discovered by the six-gate corpus runner and not counted in `bun run selftest`'s gate-fixture
// line.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RIGOUR_STATUSES, type GraphDocument } from "../../src/graph/types";
import { computeTaintTrace } from "../../src/graph/query-taint";
import { renderNodePanel, nodePanelId } from "../../src/render/node-view";
import {
  RIGOROUS_TIER_CLASS, NONRIGOROUS_TIER_CLASS, isRigorous, statusStyle,
} from "../../src/render/styling";

const FIXTURE = join(import.meta.dir, "..", "..", "corpus", "render", "rigour-ladder", "graph.json");
const doc = JSON.parse(readFileSync(FIXTURE, "utf8")) as GraphDocument;
const taint = computeTaintTrace(doc);

/** The class-token list of the node BADGE span in a rendered panel — the element whose classes
 * decide the visual status identity. Token membership, never substring, so `rk-rigorous` can never
 * accidentally "match" inside `rk-nonrigorous`. */
function badgeClasses(panel: string): string[] {
  const m = panel.match(/<span class="(rk-badge[^"]*)"/);
  if (!m) throw new Error("no badge span in panel");
  return m[1]!.split(/\s+/);
}

describe("corpus/render/rigour-ladder — one node per status, asserted against emitted markup", () => {
  test("the fixture actually carries one node per rigour-ladder status", () => {
    for (const s of RIGOUR_STATUSES) {
      expect(doc.nodes.some((n) => n.id === `n-${s}` && n.status === s)).toBe(true);
    }
  });

  for (const status of RIGOUR_STATUSES) {
    test(`'${status}' renders with its OWN class + label + correct rigour tier, never another status's`, () => {
      const id = `n-${status}`;
      const panel = renderNodePanel(doc, id, taint.get(id));
      const st = statusStyle(status);
      const classes = badgeClasses(panel);

      // Its own identity is present.
      expect(classes).toContain(st.cssClass);
      expect(panel).toContain(st.label);

      // The tier class is exactly the one PRD §5 dictates, and ONLY that one.
      const expectedTier = isRigorous(status) ? RIGOROUS_TIER_CLASS : NONRIGOROUS_TIER_CLASS;
      const wrongTier = isRigorous(status) ? NONRIGOROUS_TIER_CLASS : RIGOROUS_TIER_CLASS;
      expect(classes).toContain(expectedTier);
      expect(classes).not.toContain(wrongTier);

      // No OTHER status's per-status class ever leaks onto this badge.
      for (const other of RIGOUR_STATUSES) {
        if (other === status) continue;
        expect(classes).not.toContain(statusStyle(other).cssClass);
      }

      // The human-readable tier word matches too (badge span carries "rigorous"/"not rigorous").
      expect(panel).toContain(isRigorous(status) ? "rigorous" : "not rigorous");
    });
  }

  test("the exact forbidden case: a 'stated' node is never painted with 'proved' styling", () => {
    const panel = renderNodePanel(doc, "n-stated", taint.get("n-stated"));
    const classes = badgeClasses(panel);
    expect(classes).toContain(statusStyle("stated").cssClass);
    expect(classes).not.toContain(statusStyle("proved").cssClass);
    expect(classes).not.toContain(RIGOROUS_TIER_CLASS);
  });

  test("taint renders as a first-class DEFECT, never hidden (n-tainted)", () => {
    const panel = renderNodePanel(doc, "n-tainted", taint.get("n-tainted"));
    expect(panel).toContain("rk-defect");
    expect(panel).toContain("tainted");
  });

  test("a conflict renders as a first-class DEFECT on its node (n-conflict)", () => {
    const panel = renderNodePanel(doc, "n-conflict", taint.get("n-conflict"));
    expect(panel).toContain("rk-conflicts");
    expect(panel).toContain("contract-mismatch");
    expect(panel).toContain("rk-defect");
  });

  test("an unresolved af workspace renders as a defect, never a silent drop (n-orphan)", () => {
    const panel = renderNodePanel(doc, "n-orphan", taint.get("n-orphan"));
    expect(panel).toContain("did not resolve");
    expect(panel).toContain("rk-defect");
  });

  test("panel ids are hash-routable and stable", () => {
    expect(nodePanelId("n-open")).toBe("node-n-open");
    expect(renderNodePanel(doc, "n-open", taint.get("n-open"))).toContain('id="node-n-open"');
  });
});
