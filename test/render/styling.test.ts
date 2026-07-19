// The single-source-of-truth contract for rk render's status styling (M2.4, PRD C6 + §5).
// "The renderer is itself a trust surface: a bug that paints a `stated` node with `proved`
// styling defeats the whole artifact silently." These tests pin the ONE place status ->
// visual-class/label/tier is derived, so any drift (a status sharing a rigorous class, a missing
// status, a rigorous/non-rigorous partition that disagrees with PRD §5) is a RED test, not a
// cosmetic surprise found in a browser.

import { describe, expect, test } from "bun:test";
import { RIGOUR_STATUSES } from "../../src/graph/types";
import {
  RIGOROUS_STATUSES, STATUS_STYLES, isRigorous, statusStyle, renderLegend,
} from "../../src/render/styling";

describe("render/styling — the single styling source of truth", () => {
  test("every rigour-ladder status (PRD §5) has exactly one style entry", () => {
    for (const s of RIGOUR_STATUSES) expect(STATUS_STYLES[s]).toBeDefined();
    expect(Object.keys(STATUS_STYLES).sort()).toEqual([...RIGOUR_STATUSES].sort());
  });

  test("rigorous partition matches PRD §5 exactly (cited/proved/consensus rigorous; rest not)", () => {
    expect([...RIGOROUS_STATUSES].sort()).toEqual(["cited", "consensus", "proved"]);
    for (const s of RIGOUR_STATUSES) {
      expect(statusStyle(s).rigorous).toBe(RIGOROUS_STATUSES.has(s));
    }
  });

  test("each status maps to a DISTINCT css class — no two statuses share visual identity", () => {
    const classes = RIGOUR_STATUSES.map((s) => statusStyle(s).cssClass);
    expect(new Set(classes).size).toBe(classes.length);
  });

  test("non-rigorous statuses NEVER share a tier class OR a colour with a rigorous one", () => {
    const rig = RIGOUR_STATUSES.filter(isRigorous);
    const non = RIGOUR_STATUSES.filter((s) => !isRigorous(s));
    const rigColours = new Set(rig.map((s) => statusStyle(s).colour));
    const rigTiers = new Set(rig.map((s) => statusStyle(s).tierClass));
    for (const s of non) {
      expect(rigColours.has(statusStyle(s).colour)).toBe(false);
      expect(rigTiers.has(statusStyle(s).tierClass)).toBe(false);
    }
    // The tier class is itself a two-valued partition, disjoint by construction.
    expect(rigTiers.size).toBe(1);
  });

  test("the tier class encodes rigour so 'is this node rigorous' is answerable from markup alone", () => {
    expect(statusStyle("proved").tierClass).not.toBe(statusStyle("stated").tierClass);
    expect(statusStyle("cited").tierClass).toBe(statusStyle("proved").tierClass);
    expect(statusStyle("open").tierClass).toBe(statusStyle("stated").tierClass);
  });

  test("labels are present, non-empty, human-readable, and emoji-free (CLAUDE.md rule 6)", () => {
    for (const s of RIGOUR_STATUSES) {
      const label = statusStyle(s).label;
      expect(label.length).toBeGreaterThan(0);
      // no non-ASCII (a coarse emoji/decoration guard).
      expect(/^[\x20-\x7e]+$/.test(label)).toBe(true);
    }
  });

  test("renderLegend emits one entry per status, each naming its class, label, and tier", () => {
    const legend = renderLegend();
    for (const s of RIGOUR_STATUSES) {
      expect(legend).toContain(statusStyle(s).cssClass);
      expect(legend).toContain(statusStyle(s).label);
    }
    expect(legend).toContain("rigorous");
  });
});
