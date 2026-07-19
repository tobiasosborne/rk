// PURITY: pure — no fs/network/clock (L3). THE single source of truth for how an rk render maps a
// rigour-ladder status (PRD §5) to visual identity. Every surface — the dashboard status counts,
// a node drill-down badge, the DAG node fill, the legend, the inline CSS — reads status -> class/
// label/colour/tier from HERE and nowhere else. This is the WP's reason to exist (PRD C6): "the
// renderer is itself a trust surface: a bug that paints a `stated` node with `proved` styling
// defeats the whole artifact silently." Concentrating the map in one module makes that class of
// bug a single-file, corpus-covered edit rather than a drift spread across templates.
//
// Three invariants are load-bearing and pinned by test/render/styling.test.ts +
// corpus/render/rigour-ladder:
//   1. The rigorous/non-rigorous partition equals PRD §5's "rigorous" column EXACTLY
//      (cited/proved/consensus rigorous; everything else not) — encoded in `RIGOROUS_STATUSES`.
//   2. A non-rigorous status NEVER shares a `tierClass` or a `colour` with a rigorous one, so
//      "is this claim actually rigorous" is answerable from the emitted markup alone.
//   3. (M2 boundary review, landing-blocker #1) A DECLARED status is never the last word: every
//      surface (dashboard headline/counts, DAG node fill, node-panel badge, "available" line)
//      MUST read a node's visual identity through `effectivePresentation`, not `statusStyle`/
//      `styleForOptional` directly, once a conflict or non-clean taint is in play. A node whose
//      status says "proved" but whose af contract mismatches or whose taint is non-clean is
//      painted with `DEFECT_TIER_CLASS`, excluded from every rigorous/available count, and
//      labelled "declared <status>; evidence conflicted"/"...tainted" — the declared claim stays
//      VISIBLE (truthfulness means showing both the claim and the contradiction), it is just
//      never allowed to pass as unqualified rigorous/available.

import { RIGOUR_STATUSES, type AfTaintState, type RigourStatus } from "../graph/types";

/** The tier class is a two-valued partition stamped on every rendered node; a reader (or a test)
 * can answer "is this claim rigorous?" from the class list alone, never needing to re-derive it
 * from the status string. Kept deliberately coarse (exactly two values) — the per-status class
 * carries the finer identity. */
export const RIGOROUS_TIER_CLASS = "rk-rigorous";
export const NONRIGOROUS_TIER_CLASS = "rk-nonrigorous";

/** PRD §5's "rigorous" column, verbatim: only these three statuses are rigorous. `proved-mod-audit`
 * (paper-proved, not re-verified here), `numerical` (a permanent ceiling), and the frontier/
 * graveyard statuses are all explicitly NOT rigorous. */
export const RIGOROUS_STATUSES: ReadonlySet<RigourStatus> = new Set<RigourStatus>([
  "cited", "proved", "consensus",
]);

export function isRigorous(status: RigourStatus): boolean {
  return RIGOROUS_STATUSES.has(status);
}

export interface StatusStyle {
  status: RigourStatus;
  /** Unique per-status CSS class (`rk-s-<status>`) — the fine-grained visual identity. */
  cssClass: string;
  /** Coarse two-valued tier class (`RIGOROUS_TIER_CLASS` | `NONRIGOROUS_TIER_CLASS`). */
  tierClass: string;
  rigorous: boolean;
  /** Human-readable badge/legend label (ASCII only — CLAUDE.md rule 6, no emoji). */
  label: string;
  /** Fill/accent colour. Rigorous statuses draw from a palette disjoint from the non-rigorous
   * one (invariant 2 above), so no non-rigorous node can ever borrow a rigorous colour. */
  colour: string;
  /** One-line meaning, straight from PRD §5 — shown in the legend and node panel. */
  meaning: string;
}

function mk(
  status: RigourStatus, label: string, colour: string, meaning: string,
): StatusStyle {
  return {
    status,
    cssClass: `rk-s-${status}`,
    tierClass: isRigorous(status) ? RIGOROUS_TIER_CLASS : NONRIGOROUS_TIER_CLASS,
    rigorous: isRigorous(status),
    label,
    colour,
    meaning,
  };
}

// Rigorous palette: blues/greens/teal. Non-rigorous palette: ambers/purples/greys/reds. The two
// sets share no colour (test/render/styling.test.ts asserts it), so a rigorous fill can never be
// reused for a non-rigorous status by a copy-paste slip.
export const STATUS_STYLES: Record<RigourStatus, StatusStyle> = {
  cited: mk("cited", "cited", "#1d4ed8", "byte-matched to a hashed local source (C7)"),
  proved: mk("proved", "proved", "#15803d", "af-validated: root validated, taint clean"),
  consensus: mk("consensus", "consensus", "#0f766e", "recorded human sign-off"),
  "proved-mod-audit": mk("proved-mod-audit", "proved (mod audit)", "#b45309", "paper-proved, not yet re-verified here"),
  stated: mk("stated", "stated", "#a16207", "honestly labeled non-result"),
  conjecture: mk("conjecture", "conjecture", "#9333ea", "honestly labeled non-result"),
  heuristic: mk("heuristic", "heuristic", "#7c3aed", "honestly labeled non-result"),
  numerical: mk("numerical", "numerical", "#c2410c", "evidence bundle with invariant; a ceiling, never a rung"),
  open: mk("open", "open", "#64748b", "frontier: not yet attempted or in progress"),
  obstruction: mk("obstruction", "obstruction", "#b91c1c", "graveyard: a recorded barrier"),
  disproved: mk("disproved", "disproved", "#7f1d1d", "graveyard: shown false"),
};

export function statusStyle(status: RigourStatus): StatusStyle {
  return STATUS_STYLES[status];
}

/** The style for a node whose `status` frontmatter field is absent — rendered as its own visibly
 * distinct "unset" identity, NEVER silently folded into any real status (that would be the exact
 * truthfulness failure this module exists to prevent). Not part of the rigour ladder, so it is not
 * in `STATUS_STYLES`; kept here so every surface renders "unset" identically. */
export const UNSET_STYLE = {
  cssClass: "rk-s-unset",
  tierClass: NONRIGOROUS_TIER_CLASS,
  rigorous: false,
  label: "unset",
  colour: "#94a3b8",
  meaning: "no status declared on this shard",
} as const;

/** Resolves a possibly-absent status to a renderable style — the ONE place "unset" is decided, so
 * no caller ever defaults an absent status to a rigorous one. */
export function styleForOptional(status: RigourStatus | undefined): {
  cssClass: string; tierClass: string; rigorous: boolean; label: string; colour: string; meaning: string;
} {
  return status === undefined ? UNSET_STYLE : statusStyle(status);
}

// ---------------------------------------------------------------------------------------
// Effective presentation state (M2 boundary review, landing-blocker #1) — THE single place a
// declared status, a conflict, and a computed taint state combine into what a reader actually
// SEES. Every render surface (dashboard, DAG, node panel) MUST go through `effectivePresentation`
// once it has a node's conflicts/taint in hand, rather than styling straight off `statusStyle`/
// `styleForOptional`. Kept in this module (not query-taint.ts / dashboard.ts) because "one node,
// one visual truth" is exactly this file's job (see module header).
// ---------------------------------------------------------------------------------------

/** A THIRD tier class, disjoint from both `RIGOROUS_TIER_CLASS` and `NONRIGOROUS_TIER_CLASS` —
 * a defect is never "just non-rigorous" (that would silently look identical to an honestly
 * labelled `stated`/`conjecture` node); it gets its own visual identity so "this claim is
 * contradicted by its own evidence" is answerable from the class list alone, same discipline as
 * invariant 2 above. */
export const DEFECT_TIER_CLASS = "rk-defect-tier";

/** Distinct from every `STATUS_STYLES` colour and from `UNSET_STYLE.colour` (asserted by
 * test/render/styling.test.ts) — a defect must never visually pass for any real status, rigorous
 * or not. */
export const DEFECT_COLOUR = "#e11d48";

export interface EffectivePresentation {
  /** The declared status, verbatim, exactly as frontmatter said it — NEVER hidden even when
   * `isDefect`. `undefined` for an actually-unset status (never folded into a real one). */
  declaredStatus: RigourStatus | undefined;
  /** true iff a conflict record names this node OR its computed taint is non-clean
   * (`tainted`/`self_admitted`/`unresolved`) — the two inputs the review named explicitly. */
  isDefect: boolean;
  /** The declared status's own per-status class (or `UNSET_STYLE`'s) — kept even when `isDefect`
   * so the underlying claim is still identifiable in markup, not erased. */
  cssClass: string;
  /** `DEFECT_TIER_CLASS` when `isDefect`; otherwise the declared status's own tier class. */
  tierClass: string;
  /** EFFECTIVE rigour: always `false` when `isDefect`, regardless of whether the declared status
   * is one of `RIGOROUS_STATUSES` — this is the value every rigorous COUNT/headline must use. */
  rigorous: boolean;
  /** `DEFECT_COLOUR` when `isDefect`; otherwise the declared status's own colour. */
  colour: string;
  /** Declared status's own label when clean; `"declared <status>; evidence <reasons>"` when
   * `isDefect` — reasons is "conflicted", "tainted", or "conflicted, tainted". Never suppresses
   * the declared claim, per this module's truthfulness stance. */
  label: string;
  meaning: string;
}

/** Derives the ONE effective presentation for a node from its declared status plus the two
 * defect-bearing signals a caller has already computed: whether a `ConflictRecord` names this
 * node (`doc.conflicts.some(c => c.nodeId === id)`), and its computed taint
 * (`computeTaintTrace(doc).get(id)?.taint`, default `"clean"` for a node with no taint opinion of
 * its own and nothing tainted upstream). Every render surface funnels through here rather than
 * re-deriving "is this actually trustworthy" locally — the single-file guarantee this module
 * exists for (PRD C6). */
export function effectivePresentation(
  status: RigourStatus | undefined,
  hasConflict: boolean,
  taint: AfTaintState,
): EffectivePresentation {
  const base = styleForOptional(status);
  const taintNonClean = taint !== "clean";
  const isDefect = hasConflict || taintNonClean;

  if (!isDefect) {
    return { declaredStatus: status, isDefect: false, ...base };
  }

  const reasons: string[] = [];
  if (hasConflict) reasons.push("conflicted");
  if (taintNonClean) reasons.push("tainted");
  const declaredWord = status === undefined ? "unset" : status;

  return {
    declaredStatus: status,
    isDefect: true,
    cssClass: base.cssClass,
    tierClass: DEFECT_TIER_CLASS,
    rigorous: false,
    colour: DEFECT_COLOUR,
    label: `declared ${declaredWord}; evidence ${reasons.join(", ")}`,
    meaning: base.meaning,
  };
}

/** CSS rules for every status class + the two tier classes — generated FROM the map above, so the
 * stylesheet and the class names a node carries can never disagree. Inlined into the site's
 * `<style>` (CSP-safe, no external sheet). */
export function renderStatusCss(): string {
  const rules: string[] = [];
  for (const s of RIGOUR_STATUSES) {
    const st = statusStyle(s as RigourStatus);
    rules.push(`.${st.cssClass}{--rk-status-colour:${st.colour};}`);
  }
  rules.push(`.${UNSET_STYLE.cssClass}{--rk-status-colour:${UNSET_STYLE.colour};}`);
  rules.push(`.${RIGOROUS_TIER_CLASS} .rk-badge{border-left:4px solid var(--rk-status-colour);}`);
  rules.push(`.${NONRIGOROUS_TIER_CLASS} .rk-badge{border-left:4px dashed var(--rk-status-colour);}`);
  rules.push(`.${DEFECT_TIER_CLASS} .rk-badge{border:2px dashed ${DEFECT_COLOUR};background:rgba(225,29,72,.14);}`);
  return rules.join("\n");
}

/** The rigour-ladder legend as an HTML fragment: one row per status naming its swatch (coloured
 * from the map), class, label, tier word, and meaning. Rendered on the dashboard so a reader can
 * decode every node colour without leaving the page. Rigorous rows are grouped before
 * non-rigorous ones and labelled as such. */
export function renderLegend(): string {
  const rows = (title: string, statuses: RigourStatus[]): string => {
    const items = statuses.map((s) => {
      const st = statusStyle(s);
      return (
        `<li class="rk-legend-item ${st.tierClass} ${st.cssClass}">` +
        `<span class="rk-swatch" style="background:${st.colour}"></span>` +
        `<span class="rk-legend-label">${st.label}</span>` +
        `<span class="rk-legend-meaning">${st.meaning}</span>` +
        `</li>`
      );
    }).join("");
    return `<div class="rk-legend-group"><h4>${title}</h4><ul>${items}</ul></div>`;
  };
  const rigorous = RIGOUR_STATUSES.filter(isRigorous);
  const nonrigorous = RIGOUR_STATUSES.filter((s) => !isRigorous(s));
  return (
    `<div class="rk-legend">` +
    rows("rigorous (PRD §5)", rigorous) +
    rows("not rigorous", nonrigorous) +
    `</div>`
  );
}
