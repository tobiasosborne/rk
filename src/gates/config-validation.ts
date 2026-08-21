// PURITY: pure — no fs/network/clock (L3). Runtime validation of untrusted `.rk/config.json`
// fields. The public facade remains src/gates/config.ts.

import { validateWorkersConfig } from "../drive/backend-registry";
import type { Finding } from "./framework";
import { DEFAULT_PHASE } from "./phase";
import {
  DEFAULT_GATE_CONFIG, SIGNATURES_MODES, type ConfigValidationResult, type GateConfig,
  type SignaturesMode,
} from "./config";

const KNOWN_CONFIG_KEYS: ReadonlySet<string> = new Set([
  "phase", "linkerBrittlenessSoftCap", "provenanceStatusTableFile", "shardsPrefix",
  "shardsMaxLines", "refsMinRunReportingLength", "refsLocusToleranceLines", "northStarId",
  "workers", "signatures", "conventionProfile",
]);

export const CONFIG_PATH = ".rk/config.json";

export function configError(message: string): Finding {
  return { severity: "ERROR", path: CONFIG_PATH, line: 1, message, structural: true };
}

function isPositiveFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** Validates every present field before it can be merged. Invalid and unknown fields produce a
 * structural ERROR and are absent from `overrides`, so strict defaults apply downstream. */
export function validateConfigOverrides(raw: Record<string, unknown>): ConfigValidationResult {
  const findings: Finding[] = [];
  const overrides: Partial<GateConfig> = {};
  let checked = 0;
  let total = 0;

  for (const key of Object.keys(raw)) {
    if (!KNOWN_CONFIG_KEYS.has(key)) {
      total++;
      findings.push(configError(
        `unknown config key "${key}" in ${CONFIG_PATH} -- not a recognized GateConfig field ` +
        `(known: ${[...KNOWN_CONFIG_KEYS].sort().join(", ")}); ignored rather than silently applied`,
      ));
    }
  }

  if ("phase" in raw) {
    total++;
    const v = raw.phase;
    if (v === "exploration" || v === "consolidation") {
      overrides.phase = v;
      checked++;
    } else {
      findings.push(configError(
        `phase: invalid value ${JSON.stringify(v)} -- must be "exploration" or "consolidation"; ` +
        `falling back to the strict default "${DEFAULT_PHASE}" rather than silently demoting ` +
        `gate severities (a typo must never weaken validity checking, CLAUDE.md L2/L6)`,
      ));
    }
  }

  if ("linkerBrittlenessSoftCap" in raw) {
    total++;
    const v = raw.linkerBrittlenessSoftCap;
    if (isPositiveFiniteNumber(v)) {
      overrides.linkerBrittlenessSoftCap = v;
      checked++;
    } else {
      findings.push(configError(
        `linkerBrittlenessSoftCap: invalid value ${JSON.stringify(v)} -- must be a positive ` +
        `number; falling back to default ${DEFAULT_GATE_CONFIG.linkerBrittlenessSoftCap}`,
      ));
    }
  }

  if ("provenanceStatusTableFile" in raw) {
    total++;
    const v = raw.provenanceStatusTableFile;
    if (isNonEmptyString(v)) {
      overrides.provenanceStatusTableFile = v;
      checked++;
    } else {
      findings.push(configError(
        `provenanceStatusTableFile: invalid value ${JSON.stringify(v)} -- must be a non-empty ` +
        `string; falling back to default ${JSON.stringify(DEFAULT_GATE_CONFIG.provenanceStatusTableFile)}`,
      ));
    }
  }

  if ("shardsPrefix" in raw) {
    total++;
    const v = raw.shardsPrefix;
    if (isNonEmptyString(v)) {
      overrides.shardsPrefix = v;
      checked++;
    } else {
      findings.push(configError(
        `shardsPrefix: invalid value ${JSON.stringify(v)} -- must be a non-empty string when ` +
        `set; treating as unconfigured (R12's own "no default" contract, never a malformed sentinel)`,
      ));
    }
  }

  if ("shardsMaxLines" in raw) {
    total++;
    const v = raw.shardsMaxLines;
    if (isPositiveFiniteNumber(v)) {
      overrides.shardsMaxLines = v;
      checked++;
    } else {
      findings.push(configError(
        `shardsMaxLines: invalid value ${JSON.stringify(v)} -- must be a positive number; ` +
        `falling back to default ${DEFAULT_GATE_CONFIG.shardsMaxLines} (an unvalidated value ` +
        `here made Gate 6 Check 7's line-count comparison always false -- a false-green, rk-xbm)`,
      ));
    }
  }

  if ("refsMinRunReportingLength" in raw) {
    total++;
    const v = raw.refsMinRunReportingLength;
    if (isPositiveFiniteNumber(v)) {
      overrides.refsMinRunReportingLength = v;
      checked++;
    } else {
      findings.push(configError(
        `refsMinRunReportingLength: invalid value ${JSON.stringify(v)} -- must be a positive ` +
        `number; falling back to default ${DEFAULT_GATE_CONFIG.refsMinRunReportingLength}`,
      ));
    }
  }

  if ("refsLocusToleranceLines" in raw) {
    total++;
    const v = raw.refsLocusToleranceLines;
    if (isPositiveFiniteNumber(v)) {
      overrides.refsLocusToleranceLines = v;
      checked++;
    } else {
      findings.push(configError(
        `refsLocusToleranceLines: invalid value ${JSON.stringify(v)} -- must be a positive ` +
        `number; falling back to default ${DEFAULT_GATE_CONFIG.refsLocusToleranceLines} (an ` +
        `unvalidated value here would widen or invert Gate 3's quote-at-locus window -- a ` +
        `verdict threshold, not a message-only one)`,
      ));
    }
  }

  if ("northStarId" in raw) {
    total++;
    const v = raw.northStarId;
    if (isNonEmptyString(v)) {
      overrides.northStarId = v;
      checked++;
    } else {
      findings.push(configError(
        `northStarId: invalid value ${JSON.stringify(v)} -- must be a non-empty string when ` +
        `set; treating as unconfigured (M2.5's own "no default" contract, never a malformed sentinel)`,
      ));
    }
  }

  if ("signatures" in raw) {
    total++;
    const v = raw.signatures;
    if (typeof v === "string" && (SIGNATURES_MODES as readonly string[]).includes(v)) {
      overrides.signatures = v as SignaturesMode;
      checked++;
    } else {
      findings.push(configError(
        `signatures: invalid value ${JSON.stringify(v)} -- must be ${SIGNATURES_MODES.map((m) => `"${m}"`).join(" or ")}; ` +
        `treating as unconfigured (signatures NOT adopted) rather than guessing an adoption ` +
        `state, which would silently decide whether a missing signature ERRORs or is ignored`,
      ));
    }
  }

  if ("conventionProfile" in raw) {
    total++;
    const v = raw.conventionProfile;
    if (isNonEmptyString(v)) {
      overrides.conventionProfile = v;
      checked++;
    } else {
      findings.push(configError(
        `conventionProfile: invalid value ${JSON.stringify(v)} -- must be a non-empty string ` +
        `naming a profile under .rk/conventions/ (e.g. "qpcp.v1"); treating as unconfigured ` +
        `(Check 17 then fails closed on any signature it finds, never guesses a lattice)`,
      ));
    }
  }

  if ("workers" in raw) {
    total++;
    const v = validateWorkersConfig(raw.workers);
    if (v.ok) {
      overrides.workers = v.config;
      checked++;
    } else {
      findings.push(configError(
        `workers: invalid value -- ${v.issues.map((i) => `${i.path}: ${i.message}`).join("; ")} -- ` +
        `dropping the whole field rather than applying a partial or silently-guessed assignment`,
      ));
    }
  }

  return { overrides, findings, checked, total };
}
