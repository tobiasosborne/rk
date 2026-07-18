// PURITY: pure — no fs/network/clock (L3). Shared gate-result types + the Gate interface every
// M0.3 gate implements. Ground truth: docs/gate-contracts.md "Shared conventions (all six
// gates)" — finding format, coverage-line format, exit-code rule. Gates are pure: they consume
// an in-memory RepoSnapshot (src/gates/snapshot.ts) and a resolved GateConfig
// (src/gates/config.ts), never touch fs/network/clock themselves — src/store/snapshot-load.ts and
// src/store/config-load.ts are the impure edges that produce those inputs.

import type { RepoSnapshot } from "./snapshot";
import type { GateConfig } from "./config";

export type Severity = "ERROR" | "WARN";

/** One finding, rendered `SEVERITY path:line message` per docs/gate-contracts.md's Shared
 * conventions ("Finding format"). `path` is repo-relative; `line` is 1-indexed, defaulting to 1
 * when the underlying check has no specific source line (a JSON file, a whole-registry check, a
 * cross-shard cycle) — see `formatFinding` below.
 *
 * ONE blessed exception (rk-bdd, 2026-07-18 M0.3 re-review finding 9): the synthetic ERROR
 * `src/cli/check.ts`'s `runGateSafely` crash boundary emits when a gate itself throws is not
 * attributable to any repo-relative source path, so it uses the sentinel `<gate:NAME>` instead —
 * never a bare gate name (which could misread as a truncated real path, or coincidentally collide
 * with an actual file in the checked repo). See docs/gate-contracts.md's Finding format section
 * for the same note. */
export interface Finding {
  severity: Severity;
  path: string;
  line?: number;
  message: string;
}

/** One coverage-line entry. Most gates emit exactly one per run (docs/gate-contracts.md: "every
 * gate emits exactly one final line"); `unit` is a free string so a gate with more than one
 * countable class (e.g. refs' pass/fail/skip-import/skip-noquote split) can compose its own
 * breakdown text into it, still rendered as a single `checked <gate>: <checked>/<total> <unit>`
 * line by the caller (src/cli/check.ts appends the trailing `(<E> errors, <W> warnings)` suffix
 * itself, since that count is derived from the gate's own `findings`, not stored here). */
export interface CoverageLine {
  gate: string;
  unit: string;
  checked: number;
  total: number;
}

export interface GateResult {
  findings: Finding[];
  coverage: CoverageLine[];
  /** Set by a gate that has not been implemented yet (the M0.3 skeleton state, this WP). `rk
   * check` prints a loud "gate <name>: NOT IMPLEMENTED" line for such a gate instead of its
   * (currently always-empty) findings/coverage, and — per this WP's brief — a notImplemented
   * gate never contributes to the composed exit code. */
  notImplemented?: boolean;
}

export interface Gate {
  /** Matches the fixture-id prefix / corpus/<gate>/ directory name — defs, linker, refs,
   * provenance, runs, shards (corpus/README.md's "Fixture directory layout"). */
  name: string;
  run(snapshot: RepoSnapshot, config: GateConfig): GateResult;
}

/** Renders one finding as the shared `SEVERITY path:line message` line (docs/gate-contracts.md
 * Shared conventions, "Finding format"). */
export function formatFinding(f: Finding): string {
  return `${f.severity} ${f.path}:${f.line ?? 1} ${f.message}`;
}

/** Renders one coverage-line entry as `checked <gate>: <checked>/<total> <unit>`, WITHOUT the
 * trailing error/warning-count suffix (the caller, which holds the gate's full findings list,
 * appends that — see the CoverageLine doc comment above). */
export function formatCoverageLine(c: CoverageLine): string {
  return `checked ${c.gate}: ${c.checked}/${c.total} ${c.unit}`;
}
