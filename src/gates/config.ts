// PURITY: pure — no fs/network/clock (L3). GateConfig: the per-repo parameters
// docs/gate-contracts.md carves out explicitly (Shared conventions, "Per-repo parameters (this
// WP's scope)"; Gate 4's provenance-11 divergence; Gate 6's PREFIX/MAX_LINES divergence).
// src/store/config-load.ts is the impure edge that reads `.rk/config.json` and merges it over
// DEFAULT_GATE_CONFIG via `mergeGateConfig` below — kept in a separate file so this one stays
// purity-grep clean (scripts/selftest.ts).

import type { Phase } from "./phase";
import { DEFAULT_PHASE } from "./phase";

export interface GateConfig {
  /** M1.3 (`rk phase exploration|consolidation`). Missing field = `"consolidation"` (the
   * strictest default — see src/gates/phase.ts's `DEFAULT_PHASE` doc comment). Selects between
   * the two FIXED severity policies in src/gates/phase.ts's `applyPhase`; there is no per-gate
   * override — docs/gate-contracts.md "Phase matrix" is the only place that decision is made. */
  phase: Phase;
  /** Linker gate brittleness soft cap (WARN-only, never blocks the gate) — af_constants'
   * NODE_SOFT_CAP. docs/gate-contracts.md Gate 2 "Per-repo parameters": default 26, no depth
   * check (the aism-s64 incident: a stale 12-node threshold cried REFACTOR on ~20 healthy
   * trees; the fix hoisted this to one shared constant read by both the linker and any future
   * balloon-style guard — a duplicated default here would reopen that exact drift). */
  linkerBrittlenessSoftCap: number;
  /** Provenance gate's `tab:status` source file. docs/gate-contracts.md Gate 4 Divergences,
   * `provenance-11`: was a hardcoded check-provenance.py:206 literal (`report/sections/
   * 13_discussion.tex`) that already caused one real false-green when the ledger was renamed;
   * now a per-repo parameter, default byte-identical to AISM's own value. */
  provenanceStatusTableFile: string;
  /** Report-shards gate's shard-id prefix. docs/gate-contracts.md Gate 6 Inputs: `PREFIX =
   * "AISM"` hardcoded in the source script; per-repo config here (Divergences: message-only —
   * AISM's own default is unchanged by this parameterization). */
  shardsPrefix: string;
  /** Report-shards gate's per-shard line cap. docs/gate-contracts.md Gate 6 Inputs: `MAX_LINES`,
   * default 280 (already an env-var override, `REPORT_SHARD_MAX_LINES`, in AISM). */
  shardsMaxLines: number;
  /** Refs gate's minimum contiguous-run length for the "best matched run: n/m chars" FAIL
   * diagnostic. docs/gate-contracts.md Gate 3 Inputs (`MIN_RUN = 40`) and the Tier-A
   * boundary-review carry-forward: this is a MESSAGE-ONLY threshold, computed in the gate for
   * the finding text only — it must never affect the whole-quote-match verdict itself (that
   * rule lives in `src/refs/quote.ts`'s `wholeQuoteMatch` and must be called, never re-derived,
   * per the carry-forward note in docs/reviews/2026-07-17-tier-a-boundary-review.md). */
  refsMinRunReportingLength: number;
}

export const DEFAULT_GATE_CONFIG: GateConfig = {
  phase: DEFAULT_PHASE,
  linkerBrittlenessSoftCap: 26,
  provenanceStatusTableFile: "report/sections/13_discussion.tex",
  shardsPrefix: "AISM",
  shardsMaxLines: 280,
  refsMinRunReportingLength: 40,
};

/** Merges a partial config (typically parsed from `.rk/config.json`) over the defaults — every
 * key independently optional; unknown keys are ignored (forwards-compatible with a future config
 * schema; docs/gate-contracts.md names no "unknown key" error for this file). Pure: takes and
 * returns plain data, never touches fs itself — see src/store/config-load.ts for the edge that
 * reads the file and calls this. */
export function mergeGateConfig(overrides: Partial<GateConfig> | undefined | null): GateConfig {
  if (!overrides) return { ...DEFAULT_GATE_CONFIG };
  return { ...DEFAULT_GATE_CONFIG, ...overrides };
}
