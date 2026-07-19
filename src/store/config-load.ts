// EDGE — fs. Reads `<root>/.rk/config.json` if present and merges it over DEFAULT_GATE_CONFIG
// (src/gates/config.ts); falls back to the defaults untouched when the file is absent or
// unparseable. docs/gate-contracts.md names no repo as required to carry this file — a fresh
// checkout with no `.rk/config.json` is a legitimate default-config state, not an error.
//
// rk-bdd (2026-07-18 M0.3 re-review, finding 6) assessed this file for the same relocation as
// src/gates/{corpus-run,corpus-discovery}.ts (moved to src/corpus/ that same session — both were
// impure files silently exempt from the purity grep inside a PURE directory). Deferred to its own
// WP at the time (fan-out + Tier-A prose citations + two immutable review records citing the old
// path by line number). rk-7uc (2026-07-18) carried out that move: this file relocated from
// src/gates/config-load.ts to src/store/config-load.ts, `loadGateConfig`'s name unchanged, every
// real import site updated; the two immutable review records under docs/reviews/ still cite the
// old src/gates/config-load.ts path (frozen by their own UPDATE POLICY, never corrected). The
// src/gates/ purity allowlist that carried this file's exemption is now empty.

import { join } from "node:path";
import type { GateConfig } from "../gates/config";
import { mergeGateConfig, validateConfigOverrides } from "../gates/config";

function noValidation(): NonNullable<GateConfig["_configValidation"]> {
  return { findings: [], checked: 0, total: 0 };
}

export async function loadGateConfig(root: string): Promise<GateConfig> {
  const path = join(root, ".rk", "config.json");
  const file = Bun.file(path);
  if (!(await file.exists())) {
    const config = mergeGateConfig(undefined);
    config._configValidation = noValidation();
    return config;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    // A corrupt config.json degrades to defaults rather than crashing `rk check` outright — the
    // same "absent/unparseable input becomes a visible degraded state, never a hard crash"
    // pattern every gate follows for its own inputs (docs/gate-contracts.md's shared
    // philosophy). Deliberately UNCHANGED by rk-xbm (below): malformed JSON *syntax* is a
    // distinct failure mode from a malformed *field value* -- out of this bead's named scope
    // (CLAUDE.md L11). `rk check` itself may choose to surface this via its own diagnostics
    // later; this function's contract is just "never throw on a bad config file".
    const config = mergeGateConfig(undefined);
    config._configValidation = noValidation();
    return config;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    const config = mergeGateConfig(undefined);
    config._configValidation = noValidation();
    return config;
  }

  // rk-xbm (M1 review B1): the ONE unsafe boundary named in the finding -- `parsed` is untyped,
  // untrusted JSON, and the old `parsed as Partial<GateConfig>` cast took the compiler's word for
  // a shape it never actually checked (`{"phase": "typo"}`, `{"shardsMaxLines": "garbage"}` sailed
  // straight through). `validateConfigOverrides` (src/gates/config.ts) runtime-checks every field
  // (enum membership, type/range, unknown-key detection) BEFORE anything reaches
  // `mergeGateConfig`; a rejected field is dropped (falls back to `DEFAULT_GATE_CONFIG`, never the
  // raw malformed value) and produces one loud, counted config ERROR finding, carried on
  // `config._configValidation` for `configGate` (src/gates/index.ts) to surface.
  const { overrides, findings, checked, total } = validateConfigOverrides(parsed as Record<string, unknown>);
  const config = mergeGateConfig(overrides);
  config._configValidation = { findings, checked, total };
  return config;
}
