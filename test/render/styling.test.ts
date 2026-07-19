// The single-source-of-truth contract for rk render's status styling (M2.4, PRD C6 + §5).
// "The renderer is itself a trust surface: a bug that paints a `stated` node with `proved`
// styling defeats the whole artifact silently." These tests pin the ONE place status ->
// visual-class/label/tier is derived, so any drift (a status sharing a rigorous class, a missing
// status, a rigorous/non-rigorous partition that disagrees with PRD §5) is a RED test, not a
// cosmetic surprise found in a browser.

import { describe, expect, test } from "bun:test";
import { RIGOUR_STATUSES } from "../../src/graph/types";
import {
  DEFECT_COLOUR, DEFECT_TIER_CLASS, NONRIGOROUS_TIER_CLASS, RIGOROUS_STATUSES, RIGOROUS_TIER_CLASS,
  STATUS_STYLES, UNSET_STYLE, effectivePresentation, isRigorous, statusStyle, renderLegend,
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

describe("render/styling — effectivePresentation (M2 boundary review, landing-blocker #1)", () => {
  test("clean status (no conflict, clean taint): identical to statusStyle/styleForOptional", () => {
    for (const s of RIGOUR_STATUSES) {
      const pres = effectivePresentation(s, false, "clean");
      expect(pres.isDefect).toBe(false);
      expect(pres.rigorous).toBe(isRigorous(s));
      expect(pres.cssClass).toBe(statusStyle(s).cssClass);
      expect(pres.tierClass).toBe(statusStyle(s).tierClass);
      expect(pres.colour).toBe(statusStyle(s).colour);
      expect(pres.label).toBe(statusStyle(s).label);
    }
    const unset = effectivePresentation(undefined, false, "clean");
    expect(unset.isDefect).toBe(false);
    expect(unset.cssClass).toBe(UNSET_STYLE.cssClass);
  });

  test("a conflict alone makes a rigorous status a defect: excluded from rigorous, own tier class, labelled", () => {
    const pres = effectivePresentation("proved", true, "clean");
    expect(pres.isDefect).toBe(true);
    expect(pres.rigorous).toBe(false);
    expect(pres.tierClass).toBe(DEFECT_TIER_CLASS);
    expect(pres.tierClass).not.toBe(RIGOROUS_TIER_CLASS);
    expect(pres.tierClass).not.toBe(NONRIGOROUS_TIER_CLASS);
    expect(pres.label).toBe("declared proved; evidence conflicted");
    expect(pres.colour).toBe(DEFECT_COLOUR);
    // the declared claim itself is never hidden.
    expect(pres.declaredStatus).toBe("proved");
  });

  test("non-clean taint alone (no conflict record) also makes a rigorous status a defect", () => {
    for (const taint of ["tainted", "self_admitted", "unresolved"] as const) {
      const pres = effectivePresentation("proved", false, taint);
      expect(pres.isDefect).toBe(true);
      expect(pres.rigorous).toBe(false);
      expect(pres.label).toBe("declared proved; evidence tainted");
    }
  });

  test("conflict AND non-clean taint together: both reasons named, still one defect", () => {
    const pres = effectivePresentation("proved", true, "tainted");
    expect(pres.isDefect).toBe(true);
    expect(pres.label).toBe("declared proved; evidence conflicted, tainted");
  });

  test("a non-rigorous status is ALSO a defect under conflict/taint (never silently exempt)", () => {
    const pres = effectivePresentation("stated", true, "clean");
    expect(pres.isDefect).toBe(true);
    expect(pres.rigorous).toBe(false);
    expect(pres.tierClass).toBe(DEFECT_TIER_CLASS);
    expect(pres.label).toBe("declared stated; evidence conflicted");
  });

  test("an actually-unset status under conflict/taint is labelled 'declared unset', never folded into a real status", () => {
    const pres = effectivePresentation(undefined, true, "clean");
    expect(pres.isDefect).toBe(true);
    expect(pres.label).toBe("declared unset; evidence conflicted");
    expect(pres.declaredStatus).toBeUndefined();
  });

  test("DEFECT_COLOUR is disjoint from every status colour and from UNSET_STYLE's", () => {
    for (const s of RIGOUR_STATUSES) expect(statusStyle(s).colour).not.toBe(DEFECT_COLOUR);
    expect(UNSET_STYLE.colour).not.toBe(DEFECT_COLOUR);
  });

  test("DEFECT_TIER_CLASS is disjoint from both RIGOROUS_TIER_CLASS and NONRIGOROUS_TIER_CLASS", () => {
    expect(DEFECT_TIER_CLASS).not.toBe(RIGOROUS_TIER_CLASS);
    expect(DEFECT_TIER_CLASS).not.toBe(NONRIGOROUS_TIER_CLASS);
  });

  // Mutation evidence (per the review's prescription): an implementation that ignores conflicts
  // -- i.e. computes `isDefect` from taint alone -- would make this test's first assertion fail
  // (a conflicted-but-clean-taint 'proved' node would wrongly stay rigorous). Verified by hand:
  // temporarily changing `effectivePresentation`'s `isDefect` line to `taintNonClean` alone turns
  // this RED; restored immediately after (see WP report).
  test("mutation guard: a conflict with otherwise-clean taint is STILL a defect (conflict is not optional)", () => {
    const pres = effectivePresentation("proved", true, "clean");
    expect(pres.isDefect).toBe(true);
  });
});
