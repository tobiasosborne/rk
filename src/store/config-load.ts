// EDGE — fs. Reads `<root>/.rk/config.json` if present and merges it over DEFAULT_GATE_CONFIG
// (src/gates/config.ts); falls back to the defaults, UNTOUCHED VALUES ONLY, when the file is
// absent, unparseable, or not shaped like a config object. docs/gate-contracts.md names no repo
// as required to carry this file — a fresh checkout with no `.rk/config.json` is a legitimate
// default-config state, not an error; that ONE case (file absent) is silent by design (CLAUDE.md
// SC1: cold start must never require a config file). The other two whole-file failure modes below
// are never silent — see rk-45m.
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
//
// rk-45m: residual from rk-xbm (M1 repair wave) -- `validateConfigOverrides` (src/gates/config.ts)
// already turns a malformed/unknown FIELD into a loud, structural, non-demotable ERROR finding
// (rk-xbm). But the two whole-file failure modes below -- the bytes are not valid JSON at all, or
// the JSON parses but its top-level shape is not an object -- never reached that validator; both
// silently fell back to defaults with an EMPTY `_configValidation` summary, no finding at all. A
// misplaced comma silently reverted an entire repo's gate config to strict defaults with zero
// signal -- worse than a crash, because it renders as a green run. Both branches below now build a
// loud finding via `configError` (src/gates/config.ts) -- the exact same `structural: true`,
// never-demotable-by-phase.ts finding shape `validateConfigOverrides` already produces for a
// malformed field (docs/gate-contracts.md's Phase matrix "Mechanism" section names "parse errors"
// as one of the four canonical STRUCTURAL classes outright, so this is not a new policy, just
// closing a gap in an already-decided one). The gate CONFIG VALUES themselves still degrade to
// `DEFAULT_GATE_CONFIG`, unchanged, never a partial/garbled parse -- `rk check` never crashes on a
// bad `.rk/config.json`, it fails LOUD instead of failing SILENT.

import { join } from "node:path";
import type { GateConfig } from "../gates/config";
import { CONFIG_PATH, configError, mergeGateConfig, validateConfigOverrides } from "../gates/config";

function noValidation(): NonNullable<GateConfig["_configValidation"]> {
  return { findings: [], checked: 0, total: 0 };
}

/** rk-45m: the shared shape for both whole-file failure modes below -- one loud finding, `checked:
 * 0` (nothing could even be checked field-by-field), `total: 1` (the file itself is the one thing
 * that failed), mirroring how a single malformed field is counted by `validateConfigOverrides`. */
function wholeFileFailure(message: string): NonNullable<GateConfig["_configValidation"]> {
  return { findings: [configError(message)], checked: 0, total: 1 };
}

function describeTopLevelShape(parsed: unknown): string {
  if (parsed === null) return "null";
  if (Array.isArray(parsed)) return "an array";
  return `a ${typeof parsed}`;
}

export async function loadGateConfig(root: string): Promise<GateConfig> {
  const path = join(root, ".rk", "config.json");
  const file = Bun.file(path);
  if (!(await file.exists())) {
    // Case (a) -- file ABSENT. Legitimate cold-start path (SC1): silent, defaults apply, no
    // finding. Must stay this way -- do not conflate with the two cases below.
    const config = mergeGateConfig(undefined);
    config._configValidation = noValidation();
    return config;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch (e) {
    // Case (b) -- file PRESENT but UNPARSEABLE JSON syntax (rk-45m). Never silent: one loud,
    // structural ERROR naming the file and carrying the underlying JSON.parse SyntaxError text
    // (the specific token/position complaint the runtime already computed, when the runtime
    // provides one -- Bun/JavaScriptCore's JSON.parse does not expose a line/column, only a
    // reason string; there is no "line" to report beyond the whole-file sentinel `line: 1`
    // `configError` already uses for every other config finding). Gate config VALUES still
    // degrade to strict defaults -- `rk check` never crashes on a bad config file -- but the run
    // is never silently green about it.
    const detail = e instanceof Error ? e.message : String(e);
    const config = mergeGateConfig(undefined);
    config._configValidation = wholeFileFailure(
      `${CONFIG_PATH} is not valid JSON -- ${detail} -- using the strict defaults ` +
        `(DEFAULT_GATE_CONFIG) rather than silently discarding your configuration; a single ` +
        `syntax error must never produce a silently-green run (rk-45m)`,
    );
    return config;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    // Same whole-file principle as case (b): the JSON is syntactically valid but is not usable as
    // a config object at all (e.g. a bare array, string, number, or `null`) -- there are no
    // per-field problems to enumerate because there are no fields, so this is reported the same
    // way as an unparseable file rather than silently defaulted (rk-45m).
    const config = mergeGateConfig(undefined);
    config._configValidation = wholeFileFailure(
      `${CONFIG_PATH} must be a JSON object at the top level, got ${describeTopLevelShape(parsed)} ` +
        `-- using the strict defaults (DEFAULT_GATE_CONFIG) rather than silently discarding your ` +
        `configuration (rk-45m)`,
    );
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
