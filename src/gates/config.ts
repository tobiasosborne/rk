// PURITY: pure — no fs/network/clock (L3). GateConfig: the per-repo parameters
// docs/gate-contracts.md carves out explicitly (Shared conventions, "Per-repo parameters (this
// WP's scope)"; Gate 4's provenance-11 divergence; Gate 6's PREFIX/MAX_LINES divergence).
// src/store/config-load.ts is the impure edge that reads `.rk/config.json` and merges it over
// DEFAULT_GATE_CONFIG via `mergeGateConfig` below — kept in a separate file so this one stays
// purity-grep clean (scripts/selftest.ts).
//
// rk-xbm (M1 review B1, docs/reviews/2026-07-18-m1-milestone-review-codex.md L1): `.rk/config.json`
// is untrusted, untyped JSON — the `as Partial<GateConfig>` cast at src/store/config-load.ts:39
// used to hand a malformed field straight through: `phase: "typo"` silently read as
// non-consolidation (src/gates/phase.ts:40's old `if (phase === "consolidation")` treated ANY
// other value, typo included, as exploration — a silent severity demotion) and
// `shardsMaxLines: "garbage"` made src/gates/shards.ts:152's `>` comparison always false (a
// false-green on the per-shard line-cap check). `validateConfigOverrides` below is the ONE place
// every field from the raw parsed JSON is runtime-checked (enum membership for `phase`,
// type+range for the four numeric/string fields, unknown-key detection) before it ever reaches
// `mergeGateConfig` — an invalid or unknown value is NEVER silently accepted and NEVER silently
// substituted; it produces one loud, `structural: true` (so phase can never demote it — see
// phase.ts) config ERROR finding AND the field falls back to `DEFAULT_GATE_CONFIG`'s strict
// value, so no gate downstream (including ones outside this WP's file scope: linker/refs/
// provenance) can ever observe the malformed raw value. `configGate` surfaces those findings
// through the normal per-gate Finding/CoverageLine pipeline (`src/gates/index.ts`) instead of
// requiring a change to `src/cli/check.ts`'s composition loop — see its own doc comment below.
// Decision (this WP): invalid config is a BLOCKING ERROR (`rk check` exits 1), not a soft
// degrade — a phase/severity change is exactly the kind of validity-semantics drift CLAUDE.md L6
// says must never happen silently, so surfacing it as an ordinary ERROR (which already fails the
// whole composed run per gate-contracts.md's exit-code rule) is the natural, no-new-mechanism way
// to make it blocking.
//
// src/gates/phase.ts's `applyPhase` and src/gates/shards.ts's Check 7 ALSO harden themselves
// directly against a raw/invalid `phase`/`shardsMaxLines` value reaching them (defense in depth:
// neither function trusts that every caller went through this validator — corpus fixtures and
// unit tests can and do construct a `GateConfig` directly). Both fixes are independent of, and
// redundant with, the central validation here; either one alone would already close the two
// specific incidents this bead names.

import type { Finding, Gate, GateResult } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import type { Phase } from "./phase";
import { DEFAULT_PHASE } from "./phase";
// M3.2: `workers` (rk verify's backend registry, per-role×tier assignment + fallbacks) is
// validated by src/drive/backend-registry.ts's own `validateWorkersConfig` — that module is pure
// (no fs/network/clock) and does NOT import backend-claude.ts/backend-codex.ts (the actual
// subprocess-spawning adapters), so importing it here does not drag edge code into the gates
// layer. Same rk-xbm discipline as every other field below: malformed input drops the WHOLE field.
import { validateWorkersConfig, type WorkersConfig } from "../drive/backend-registry";

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
  /** Report-shards gate's shard-id prefix. docs/gate-contracts.md Gate 6 Inputs: AISM hardcodes
   * `PREFIX = "AISM"`; rk carries NO default (R12, bead rk-psm, M1 landing-blocker — a general
   * tool must never default a shard-id prefix to a specific campaign name). Required-when-
   * consumed: absent/empty when the shards gate needs to validate a SHARD-ID header ⇒ one loud,
   * counted config-missing ERROR (src/gates/shards.ts), never a silent AISM-shaped default and
   * never a crash. `undefined` is the correct "not configured" state — never coerce it to `""`
   * or any other sentinel string. */
  shardsPrefix?: string;
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
  /** M2.5 (`rk graph --critical-path`/`--blocks`, src/cli/graph.ts): the campaign's north-star
   * contract's registry id — PRD C1's constitution slot, made mechanically readable here rather
   * than only living in stamped prose. Optional, same "no default" stance as `shardsPrefix`: a
   * general tool must never guess which registry id is a specific campaign's north star.
   * Required-when-consumed: absent means `rk graph --critical-path`/`--blocks` fall back to an
   * explicit `--north-star <id>` argument, one loud message, never a silent guess; an explicit
   * `--north-star` flag always overrides this field when both are given. */
  northStarId?: string;
  /** M3.2 (`rk verify`'s backend registry, src/drive/backend-registry.ts): per-(role,tier) backend
   * assignment + ordered fallbacks. Optional, same "no default" stance as `shardsPrefix`/
   * `northStarId` — a general tool must never guess which backend fronts which role/tier.
   * Malformed input (at ANY nesting level) drops the WHOLE field — never a partial or
   * silently-guessed assignment — with one loud ERROR (see `validateConfigOverrides` below);
   * `BackendRegistry.chainFor`/`resolve` treat an absent (role,tier) entry as "nothing configured,"
   * never a silent default backend choice. */
  workers?: WorkersConfig;
  /** INTERNAL — not a per-repo parameter, never set in `.rk/config.json`, never read by any of
   * the six M0 gates. rk-xbm: the side channel `src/store/config-load.ts` uses to carry
   * `validateConfigOverrides`'s findings (plus a checked/total pair) from the point they're
   * computed (the edge, which alone sees the raw parsed JSON and its unknown keys) to
   * `configGate.run` below (which only ever receives an already-merged `GateConfig`, the same as
   * every other gate — L3 pure core, no gate touches fs itself). Always present with a
   * `{findings: [], checked: 0, total: 0}` default when `loadGateConfig` had nothing to validate
   * (no `.rk/config.json`, or one that failed to parse as JSON at all — that failure mode is
   * unchanged by this bead, see config-load.ts), so `configGate` never has to special-case
   * `undefined`. */
  _configValidation?: ConfigValidationSummary;
}

export const DEFAULT_GATE_CONFIG: GateConfig = {
  phase: DEFAULT_PHASE,
  linkerBrittlenessSoftCap: 26,
  provenanceStatusTableFile: "report/sections/13_discussion.tex",
  // shardsPrefix: deliberately NO default (R12) — omitted, never set to "" or any other sentinel.
  shardsMaxLines: 280,
  refsMinRunReportingLength: 40,
};

/** Merges a partial config over the defaults — every key independently optional. Pure: takes and
 * returns plain data, never touches fs itself. Trusted-input merge ONLY: callers here (tests,
 * `src/scaffold/config-stub.ts`, `src/corpus/run.ts`'s `expected.config_override` comparison) all
 * pass a compile-time-typed `Partial<GateConfig>`, so there is nothing to runtime-validate. The
 * ONE untrusted-input path — `.rk/config.json`, arbitrary parsed JSON — goes through
 * `validateConfigOverrides` below FIRST (src/store/config-load.ts); by the time its sanitized
 * output reaches this function, every field is already a well-typed, in-range `GateConfig` value
 * or simply absent (falls back to `DEFAULT_GATE_CONFIG` here, same as always). Do not call this
 * directly on raw JSON — that is exactly the rk-xbm bug (an unvalidated `as Partial<GateConfig>`
 * cast spread straight through). */
export function mergeGateConfig(overrides: Partial<GateConfig> | undefined | null): GateConfig {
  if (!overrides) return { ...DEFAULT_GATE_CONFIG };
  return { ...DEFAULT_GATE_CONFIG, ...overrides };
}

/** The set of real `GateConfig` fields `.rk/config.json` may configure — everything else is an
 * unknown key (rk-xbm: loud ERROR, dropped, never silently applied). `_configValidation` is
 * deliberately excluded: it is this module's own internal side channel, never a user-writable
 * field. */
const KNOWN_CONFIG_KEYS: ReadonlySet<string> = new Set([
  "phase",
  "linkerBrittlenessSoftCap",
  "provenanceStatusTableFile",
  "shardsPrefix",
  "shardsMaxLines",
  "refsMinRunReportingLength",
  "northStarId",
  "workers",
]);

const CONFIG_PATH = ".rk/config.json";

function configError(message: string): Finding {
  // structural: true -- a config validation failure is a validity-semantics fault about the
  // checking apparatus itself (CLAUDE.md L6), not an ordinary completeness/freshness finding; it
  // must never be silently demoted to WARN by src/gates/phase.ts's exploration matrix (the exact
  // shape of drift this bead exists to close).
  return { severity: "ERROR", path: CONFIG_PATH, line: 1, message, structural: true };
}

function isPositiveFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

export interface ConfigValidationSummary {
  findings: Finding[];
  /** Present config fields (known + unknown) that passed validation. */
  checked: number;
  /** Present config fields (known + unknown), the validation denominator. */
  total: number;
}

export interface ConfigValidationResult extends ConfigValidationSummary {
  /** Only the known fields that validated cleanly — ready to hand to `mergeGateConfig`. An
   * invalid or unknown field is simply absent here (never the malformed raw value, never a
   * fabricated sentinel), so the merge's own `DEFAULT_GATE_CONFIG` fallback applies. */
  overrides: Partial<GateConfig>;
}

/** Runtime-validates every field of a `.rk/config.json`-shaped object BEFORE it is ever spread
 * over `DEFAULT_GATE_CONFIG` (rk-xbm). Pure: `raw` is already-parsed JSON data, not a file path.
 * Per field: enum membership for `phase`, positive-finite-number for the three numeric fields,
 * non-empty-string for the two string fields (`shardsPrefix` optional — absent is legal, per R12
 * its own "no default" contract; only a PRESENT-but-malformed value is an error). Any key not in
 * `KNOWN_CONFIG_KEYS` is an unknown-key ERROR. Every malformed/unknown field is dropped from
 * `overrides` (never coerced, never silently kept) and produces exactly one `configError` finding
 * — CLAUDE.md L2: loud and counted, never a silent skip. */
export function validateConfigOverrides(raw: Record<string, unknown>): ConfigValidationResult {
  const findings: Finding[] = [];
  const overrides: Partial<GateConfig> = {};
  let checked = 0;
  let total = 0;

  for (const key of Object.keys(raw)) {
    if (!KNOWN_CONFIG_KEYS.has(key)) {
      total++;
      findings.push(
        configError(
          `unknown config key "${key}" in ${CONFIG_PATH} -- not a recognized GateConfig field ` +
            `(known: ${[...KNOWN_CONFIG_KEYS].sort().join(", ")}); ignored rather than silently applied`,
        ),
      );
    }
  }

  if ("phase" in raw) {
    total++;
    const v = raw.phase;
    if (v === "exploration" || v === "consolidation") {
      overrides.phase = v;
      checked++;
    } else {
      findings.push(
        configError(
          `phase: invalid value ${JSON.stringify(v)} -- must be "exploration" or "consolidation"; ` +
            `falling back to the strict default "${DEFAULT_PHASE}" rather than silently demoting ` +
            `gate severities (a typo must never weaken validity checking, CLAUDE.md L2/L6)`,
        ),
      );
    }
  }

  if ("linkerBrittlenessSoftCap" in raw) {
    total++;
    const v = raw.linkerBrittlenessSoftCap;
    if (isPositiveFiniteNumber(v)) {
      overrides.linkerBrittlenessSoftCap = v;
      checked++;
    } else {
      findings.push(
        configError(
          `linkerBrittlenessSoftCap: invalid value ${JSON.stringify(v)} -- must be a positive ` +
            `number; falling back to default ${DEFAULT_GATE_CONFIG.linkerBrittlenessSoftCap}`,
        ),
      );
    }
  }

  if ("provenanceStatusTableFile" in raw) {
    total++;
    const v = raw.provenanceStatusTableFile;
    if (isNonEmptyString(v)) {
      overrides.provenanceStatusTableFile = v;
      checked++;
    } else {
      findings.push(
        configError(
          `provenanceStatusTableFile: invalid value ${JSON.stringify(v)} -- must be a non-empty ` +
            `string; falling back to default ${JSON.stringify(DEFAULT_GATE_CONFIG.provenanceStatusTableFile)}`,
        ),
      );
    }
  }

  if ("shardsPrefix" in raw) {
    total++;
    const v = raw.shardsPrefix;
    if (isNonEmptyString(v)) {
      overrides.shardsPrefix = v;
      checked++;
    } else {
      findings.push(
        configError(
          `shardsPrefix: invalid value ${JSON.stringify(v)} -- must be a non-empty string when ` +
            `set; treating as unconfigured (R12's own "no default" contract, never a malformed ` +
            `sentinel)`,
        ),
      );
    }
  }

  if ("shardsMaxLines" in raw) {
    total++;
    const v = raw.shardsMaxLines;
    if (isPositiveFiniteNumber(v)) {
      overrides.shardsMaxLines = v;
      checked++;
    } else {
      findings.push(
        configError(
          `shardsMaxLines: invalid value ${JSON.stringify(v)} -- must be a positive number; ` +
            `falling back to default ${DEFAULT_GATE_CONFIG.shardsMaxLines} (an unvalidated value ` +
            `here made Gate 6 Check 7's line-count comparison always false -- a false-green, ` +
            `rk-xbm)`,
        ),
      );
    }
  }

  if ("refsMinRunReportingLength" in raw) {
    total++;
    const v = raw.refsMinRunReportingLength;
    if (isPositiveFiniteNumber(v)) {
      overrides.refsMinRunReportingLength = v;
      checked++;
    } else {
      findings.push(
        configError(
          `refsMinRunReportingLength: invalid value ${JSON.stringify(v)} -- must be a positive ` +
            `number; falling back to default ${DEFAULT_GATE_CONFIG.refsMinRunReportingLength}`,
        ),
      );
    }
  }

  if ("northStarId" in raw) {
    total++;
    const v = raw.northStarId;
    if (isNonEmptyString(v)) {
      overrides.northStarId = v;
      checked++;
    } else {
      findings.push(
        configError(
          `northStarId: invalid value ${JSON.stringify(v)} -- must be a non-empty string when ` +
            `set; treating as unconfigured (M2.5's own "no default" contract, never a malformed ` +
            `sentinel)`,
        ),
      );
    }
  }

  if ("workers" in raw) {
    total++;
    const v = validateWorkersConfig(raw.workers);
    if (v.ok) {
      overrides.workers = v.config;
      checked++;
    } else {
      findings.push(
        configError(
          `workers: invalid value -- ${v.issues.map((i) => `${i.path}: ${i.message}`).join("; ")} -- ` +
            `dropping the whole field rather than applying a partial or silently-guessed assignment`,
        ),
      );
    }
  }

  return { overrides, findings, checked, total };
}

/** Synthetic seventh gate (rk-xbm): surfaces `validateConfigOverrides`' findings through the
 * ordinary per-gate Finding/CoverageLine pipeline every caller of `GATES` (src/cli/check.ts,
 * src/corpus/run.ts) already drives — no change to that composition loop required. `snapshot` is
 * unused (config validity does not depend on repo content) but kept in the signature to satisfy
 * the shared `Gate` interface (src/gates/framework.ts). Ignoring `config._configValidation`
 * entirely (e.g. `undefined`) degrades to a clean zero-finding pass, never a crash, matching every
 * other gate's "absent input is a legitimate state" convention. */
export const configGate: Gate = {
  name: "config",
  run(_snapshot: RepoSnapshot, config: GateConfig): GateResult {
    const summary = config._configValidation ?? { findings: [], checked: 0, total: 0 };
    return {
      findings: summary.findings,
      coverage: [
        {
          gate: "config",
          unit: "config field(s) in .rk/config.json valid (enum/type/range, no unknown keys)",
          checked: summary.checked,
          total: summary.total,
        },
      ],
    };
  },
};
