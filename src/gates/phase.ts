// PURITY: pure — no fs/network/clock (L3). The M1.3 FIXED phase matrix for
// `rk phase exploration|consolidation` (docs/gate-contracts.md "Phase matrix";
// ../research-workflows/IMPLEMENTATION_PLAN.md M1.3; PRD.md sec 2 "Two phases" + resolved
// question 4). No per-gate override flags: the matrix is exactly two fixed severity policies,
// selected by ONE config field (GateConfig.phase, src/gates/config.ts); the only escape valve is
// a committed, logged edit to THIS file's classification — never a runtime flag (PRD resolved
// question 4: "Fixed matrix; escape valve is a committed, logged config edit only. A mis-phased
// gate is a template bug fixed upstream via D6.").
//
// Each gate marks the findings it believes are STRUCTURAL — parse errors, dependency cycles,
// duplicate ids/aliases, broken cross-shard references (`Finding.structural`, framework.ts) — at
// the point the finding is constructed. Every other ERROR (the default: field omitted or false)
// is a completeness/provenance/freshness-class check and demotes to advisory WARN in exploration.
// `applyPhase` below is the ONE place that reads the flag and rewrites severity; no gate decides
// blocking status itself. See docs/gate-contracts.md "Phase matrix" for the full per-gate
// rationale (the cft-anyons-v1 lesson: mandatory-everywhere ceremony on exploratory motion kills
// campaigns — gates bind at promotion boundaries, never on exploratory motion).

import type { Finding } from "./framework";

export type Phase = "exploration" | "consolidation";

/** Strictest default (CLAUDE.md L2 / this WP's brief: "a fresh clone without config must never
 * silently run loose"). Absent or missing `phase` in `.rk/config.json` resolves to this — the
 * full, currently-shipped severity set — never the weaker exploration set by silent omission.
 * Consolidation is also the phase every pre-M1.3 repo (and every M0-era corpus fixture) has
 * always run under, so this default keeps `rk check`'s byte-identical-by-default promise. */
export const DEFAULT_PHASE: Phase = "consolidation";

/** Demotes every non-structural ERROR finding to WARN when `phase === "exploration"`; a no-op
 * (identity) in consolidation — today's behavior, byte-identical, since consolidation is the
 * default every existing fixture and test already assumes. Findings are NEVER removed, reordered,
 * or skipped (CLAUDE.md L2: "a demoted finding is still counted and printed as WARN," never a
 * silent skip) — this only rewrites `severity` (and appends one clause to `message` so a reader
 * can tell a WARN is a phase-demoted ERROR, not an ordinary advisory). Structural ERROR findings
 * and every WARN (already advisory, nothing to demote) pass through completely unchanged in both
 * phases. Called exactly once per gate result, from `src/cli/check.ts` — never inside a gate
 * itself (gates stay phase-unaware; L3 pure core, one composition-layer policy). */
export function applyPhase(findings: Finding[], phase: Phase): Finding[] {
  if (phase === "consolidation") return findings;
  return findings.map((f) => {
    if (f.severity !== "ERROR" || f.structural) return f;
    return {
      ...f,
      severity: "WARN",
      message: `${f.message} [advisory in exploration phase -- would ERROR in consolidation]`,
    };
  });
}
