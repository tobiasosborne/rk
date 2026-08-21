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
// false-green on the per-shard line-cap check). `config-validation.ts` is the ONE place
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
import type { WorkersConfig } from "../drive/backend-registry";

export { CONFIG_PATH, configError, validateConfigOverrides } from "./config-validation";

/** rk-8805: `.rk/config.json`'s `signatures` adoption states (see `GateConfig.signatures`). */
export const SIGNATURES_MODES = ["required", "optional"] as const;
export type SignaturesMode = (typeof SIGNATURES_MODES)[number];

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
  /** Refs gate's quote-at-locus tolerance, in LINES (rk-wkzh / P2, docs/memos/2026-08-03-rk-
   * improvement-plan-from-aism.md; docs/gate-contracts.md Gate 3 Check 6). A matched quote must
   * fall within the claimed `refs/<path>:<lines>` window widened by this many lines in each
   * direction — absorbing header/front-matter offsets and re-extraction drift without accepting a
   * different passage. Default 50. This is a VERDICT threshold, unlike `refsMinRunReportingLength`
   * above (message-only): the two must never be conflated or repurposed for each other. */
  refsLocusToleranceLines: number;
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
   * silently-guessed assignment — with one loud ERROR (see `config-validation.ts`);
   * `BackendRegistry.chainFor`/`resolve` treat an absent (role,tier) entry as "nothing configured,"
   * never a silent default backend choice.
   *
   * rk-k0m1 (P2, RUN-REPORT-12): `workers` also carries OPTIONAL `turnTimeoutMs`/`sessionTimeoutMs`
   * (positive integer ms), campaign-wide at the `workers` level and overridable per
   * `assignments.<role>.<tier>`; per-field precedence per-assignment > `workers`-level >
   * driver-live.ts's `DEFAULT_*`. Present-but-invalid drops the whole field like any other
   * malformation (fixture `config-05`) — see docs/gate-contracts.md's "Worker timeouts". */
  workers?: WorkersConfig;
  /** rk-8805 (Gate 2 Check 17, docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md section 6): the
   * repo's adoption state for Layer 1 SIGNATURES. THREE states, deliberately, and the third is not
   * a fourth spelling of the second:
   *   - `"required"` — signed kind OR signed status OR seeded/validated af demands a signature;
   *     absence is structural ERROR `signature-missing` (linker-62 closes kind evasion).
   *   - `"optional"` — the same shard is a WARN: the repo has adopted signatures and is still
   *     filling them in.
   *   - ABSENT — the repo has NOT adopted signatures at all: no missing-signature finding is
   *     produced, and the linker's coverage line says `signatures: absent (not adopted)` out loud
   *     (never a silent skip, CLAUDE.md L2). This is the only honest default for a GENERAL tool:
   *     rk is not the qPCP campaign, and a WARN on every result shard of every existing repo would
   *     be noise that buries signal — the aism-s64 lesson.
   * A signature that IS present is always checked, in all three states: adoption governs whether
   * one is DEMANDED, never whether a present one is validated. */
  signatures?: SignaturesMode;
  /** rk-8805: the convention profile Check 17's closed vocabulary comes from, e.g. `"qpcp.v1"` ->
   * `.rk/conventions/qpcp.v1.json` (the `.v<n>` suffix is part of the NAME, so a profile version
   * bump is a different file, never an in-place edit). Optional, same "no default" stance as
   * `shardsPrefix`/`northStarId`: a general tool must never guess a campaign's convention profile.
   * Required-when-consumed and FAIL-CLOSED: a repo with signatures present but no readable profile
   * gets one loud `profile-unreadable` ERROR and no vocabulary/entailment checking — checking a
   * predicate against a guessed lattice is worse than not checking it, because it reports green. */
  conventionProfile?: string;
  /** INTERNAL — not a per-repo parameter, never set in `.rk/config.json`, never read by any of
   * the six M0 gates. rk-xbm: the side channel `src/store/config-load.ts` uses to carry
   * `validateConfigOverrides`'s findings (plus a checked/total pair) from the point they're
   * computed (the edge, which alone sees the raw parsed JSON and its unknown keys) to
   * `configGate.run` below (which only ever receives an already-merged `GateConfig`, the same as
   * every other gate — L3 pure core, no gate touches fs itself). Always present: `{findings: [],
   * checked: 0, total: 0}` when there was nothing to validate at all (no `.rk/config.json`, the
   * legitimate cold-start default state); `{findings: [configError(...)], checked: 0, total: 1}`
   * when the file is present but the WHOLE file is unusable -- unparseable JSON syntax, or valid
   * JSON whose top-level shape is not an object (rk-45m; previously both silently degraded to the
   * empty summary with no finding at all, see config-load.ts's `parseFailureValidation`) -- and
   * the ordinary per-field summary otherwise. `configGate` never has to special-case any of these;
   * it just renders whatever `findings`/`checked`/`total` it is handed. */
  _configValidation?: ConfigValidationSummary;
}

export const DEFAULT_GATE_CONFIG: GateConfig = {
  phase: DEFAULT_PHASE,
  linkerBrittlenessSoftCap: 26,
  provenanceStatusTableFile: "report/sections/13_discussion.tex",
  // shardsPrefix: deliberately NO default (R12) — omitted, never set to "" or any other sentinel.
  shardsMaxLines: 280,
  refsMinRunReportingLength: 40,
  refsLocusToleranceLines: 50,
};

/** Merges a partial config over the defaults — every key independently optional. Pure: takes and
 * returns plain data, never touches fs itself. Trusted-input merge ONLY: callers here (tests,
 * `src/scaffold/config-stub.ts`, `src/corpus/run.ts`'s `expected.config_override` comparison) all
 * pass a compile-time-typed `Partial<GateConfig>`, so there is nothing to runtime-validate. The
 * ONE untrusted-input path — `.rk/config.json`, arbitrary parsed JSON — goes through
 * `validateConfigOverrides` from config-validation.ts FIRST (src/store/config-load.ts); once sanitized
 * output reaches this function, every field is already a well-typed, in-range `GateConfig` value
 * or simply absent (falls back to `DEFAULT_GATE_CONFIG` here, same as always). Do not call this
 * directly on raw JSON — that is exactly the rk-xbm bug (an unvalidated `as Partial<GateConfig>`
 * cast spread straight through). */
export function mergeGateConfig(overrides: Partial<GateConfig> | undefined | null): GateConfig {
  if (!overrides) return { ...DEFAULT_GATE_CONFIG };
  return { ...DEFAULT_GATE_CONFIG, ...overrides };
}

export interface ConfigValidationSummary {
  findings: Finding[];
  /** Present config fields (known + unknown) that passed validation. */
  checked: number;
  /** Present config fields (known + unknown), the validation denominator. */
  total: number;
  /** LB6 (2026-08-03 M3-close review): the KNOWN keys `.rk/config.json` explicitly set AND that
   * validated cleanly — i.e. exactly `Object.keys(ConfigValidationResult.overrides)`, the fact the
   * reviewer noted the validator already knows. A PURE gate cannot otherwise tell "the repo chose
   * this value" from "this is `DEFAULT_GATE_CONFIG`'s value", because the merged `GateConfig` it
   * receives looks identical either way — and for `provenanceStatusTableFile` that difference is
   * the difference between a legitimate day-1 non-finding and a check the repo CONFIGURED that is
   * silently verifying nothing (provenance-22's reasoning, one step further).
   *
   * A field that was PRESENT but malformed is deliberately absent here: it was dropped, the default
   * applies, and `validateConfigOverrides` already emitted its own loud ERROR — treating it as an
   * explicit override would report one fault twice under two descriptions. Absent/empty means "no
   * `.rk/config.json`, or nothing in it applied", the cold-start default state. */
  overriddenKeys?: readonly string[];
}

export interface ConfigValidationResult extends ConfigValidationSummary {
  /** Only the known fields that validated cleanly — ready to hand to `mergeGateConfig`. An
   * invalid or unknown field is simply absent here (never the malformed raw value, never a
   * fabricated sentinel), so the merge's own `DEFAULT_GATE_CONFIG` fallback applies. */
  overrides: Partial<GateConfig>;
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
