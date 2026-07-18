// EDGE — fs. Reads `<root>/.rk/config.json` if present and merges it over DEFAULT_GATE_CONFIG
// (src/gates/config.ts); falls back to the defaults untouched when the file is absent or
// unparseable. docs/gate-contracts.md names no repo as required to carry this file — a fresh
// checkout with no `.rk/config.json` is a legitimate default-config state, not an error.
//
// rk-bdd (2026-07-18 M0.3 re-review, finding 6) assessed this file for the same relocation as
// src/gates/{corpus-run,corpus-discovery}.ts (moved to src/corpus/ that same session — both were
// impure files silently exempt from the purity grep inside a PURE directory). Deliberately NOT
// moved in that pass: this file (and load.ts) is imported by more real call sites (src/cli/
// check.ts, several test files) AND cited by path in prose across Tier-A files (framework.ts,
// docs/gate-contracts.md) and two immutable review records — a correctly-scoped move needs its
// own WP with time for the full doc sweep, not a same-session tack-on. Filed as rk-7uc.

import { join } from "node:path";
import type { GateConfig } from "./config";
import { mergeGateConfig } from "./config";

export async function loadGateConfig(root: string): Promise<GateConfig> {
  const path = join(root, ".rk", "config.json");
  const file = Bun.file(path);
  if (!(await file.exists())) return mergeGateConfig(undefined);

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    // A corrupt config.json degrades to defaults rather than crashing `rk check` outright — the
    // same "absent/unparseable input becomes a visible degraded state, never a hard crash"
    // pattern every gate follows for its own inputs (docs/gate-contracts.md's shared
    // philosophy). `rk check` itself may choose to surface this via its own diagnostics later;
    // this function's contract is just "never throw on a bad config file".
    return mergeGateConfig(undefined);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return mergeGateConfig(undefined);
  }
  return mergeGateConfig(parsed as Partial<GateConfig>);
}
