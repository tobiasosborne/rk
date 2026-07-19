// PURITY: pure — no fs/network/clock (L3). Runtime validator for shape (b) of the M3.1 worker
// contract's two-shape data flow (docs/worker-contract.md's data-flow section; Tier A review
// landing-blocker 1): the DRIVER-CONSTRUCTED verdict document (`schemas/verdict.v1.json`),
// produced by src/drive/bind-verdicts.ts's `bindVerdicts` from raw worker output
// (src/drive/verdict-raw.ts, shape (a)) plus the driver's own immutable dispatch state. This
// module never reads untrusted worker output directly — `bindVerdicts` is the only place that
// happens, and it calls `validateVerdictDocument` on its OWN construction as a belt-and-suspenders
// check (a constructed document should always be valid; this guards against a bug in the
// construction step itself producing something the schema would reject).
//
// M3.1 repair wave changes from the pre-review v1: exactly one verdict per document
// (`minItems`/`maxItems` 1 — review blocker 3 / Q5 ruling: a session turn produces exactly one
// verdict, the batch cap limits TURNS, not verdicts-per-reply); `modelFamily` closed to real
// vendor lineages only, `codex`/`other` removed (blocker 5); `VALID-WITH-CORRECTION` now requires
// a structured `correction` field, forbidden on every other verdict (blocker 6).

import { validateCorrectionDetail, type CorrectionDetail, type RawIssue } from "./verdict-raw";
import { CATEGORIES, L5_VERDICTS, MODEL_FAMILIES, SEVERITIES, SHA256_HEX_RE, isNonBlankString, type Category, type ModelFamily, type Severity } from "./vocab";

export interface VerdictIssue {
  path: string;
  message: string;
}

export interface VerifierIdentityDoc {
  modelFamily: ModelFamily;
  model: string;
  backend: string;
  sessionId: string;
}

export type L5VerdictItem =
  | { itemId: string; tier: "l5"; contentHash: string; justification: string; verdict: "VALID" | "INVALID" }
  | { itemId: string; tier: "l5"; contentHash: string; justification: string; verdict: "VALID-WITH-CORRECTION"; correction: CorrectionDetail };

export type HardOutcomeDoc =
  | { outcome: "accept"; note?: string }
  | { outcome: "challenge"; target: string; severity: Severity; reason: string; category?: Category };

export interface HardVerdictItem {
  itemId: string;
  tier: "hard";
  contentHash: string;
  justification: string;
  verdict: HardOutcomeDoc;
}

export type VerdictItemDoc = L5VerdictItem | HardVerdictItem;

export interface VerdictDocument {
  schema_version: "1";
  batchId?: string;
  verifier: VerifierIdentityDoc;
  verdicts: VerdictItemDoc[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Reports every key on `obj` not in `allowed` — the hand-rolled `additionalProperties: false`
 * enforcement every level of this document needs (there is no JSON Schema library in this
 * dependency-free (L4) codebase; this function IS the enforcement). */
function checkNoExtraKeys(obj: Record<string, unknown>, allowed: readonly string[], path: string, issues: VerdictIssue[]): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key)) issues.push({ path: `${path}.${key}`, message: `unknown property '${key}'` });
  }
}

function requireNonBlankString(v: unknown, path: string, issues: VerdictIssue[]): void {
  if (typeof v !== "string") {
    issues.push({ path, message: `expected a string, got ${v === undefined ? "undefined (missing)" : typeof v}` });
    return;
  }
  if (!isNonBlankString(v)) issues.push({ path, message: "must not be blank or whitespace-only" });
}

function validateVerifier(v: unknown, path: string, issues: VerdictIssue[]): void {
  if (!isPlainObject(v)) {
    issues.push({ path, message: "verifier must be an object" });
    return;
  }
  const allowed = ["modelFamily", "model", "backend", "sessionId"] as const;
  checkNoExtraKeys(v, allowed, path, issues);
  for (const key of allowed) {
    if (!(key in v)) issues.push({ path: `${path}.${key}`, message: `missing required property '${key}'` });
  }
  if ("modelFamily" in v && (typeof v.modelFamily !== "string" || !MODEL_FAMILIES.has(v.modelFamily as ModelFamily))) {
    issues.push({ path: `${path}.modelFamily`, message: `must be one of ${[...MODEL_FAMILIES].join(", ")} (driver-registry value — never worker output; review blocker 5)` });
  }
  for (const key of ["model", "backend", "sessionId"] as const) {
    if (key in v) requireNonBlankString(v[key], `${path}.${key}`, issues);
  }
}

function validateHardVerdictPayload(v: unknown, path: string, issues: VerdictIssue[]): void {
  if (!isPlainObject(v)) {
    issues.push({ path, message: "hard-tier verdict must be an object" });
    return;
  }
  if (typeof v.outcome !== "string" || (v.outcome !== "accept" && v.outcome !== "challenge")) {
    issues.push({ path: `${path}.outcome`, message: "must be 'accept' or 'challenge'" });
    return;
  }
  if (v.outcome === "accept") {
    checkNoExtraKeys(v, ["outcome", "note"], path, issues);
    if ("note" in v && typeof v.note !== "string") issues.push({ path: `${path}.note`, message: "must be a string" });
    return;
  }
  // outcome === "challenge" — per docs/worker-contract.md (blocker 6): NEVER accepts this turn,
  // regardless of `severity` (src/drive/bind-verdicts.ts's `hardChallengeAcceptsThisTurn`).
  checkNoExtraKeys(v, ["outcome", "target", "severity", "reason", "category"], path, issues);
  for (const key of ["target", "reason"] as const) {
    if (!(key in v)) issues.push({ path: `${path}.${key}`, message: `missing required property '${key}'` });
    else requireNonBlankString(v[key], `${path}.${key}`, issues);
  }
  if (!("severity" in v)) issues.push({ path: `${path}.severity`, message: "missing required property 'severity'" });
  else if (typeof v.severity !== "string" || !SEVERITIES.has(v.severity as Severity)) {
    issues.push({ path: `${path}.severity`, message: `must be one of ${[...SEVERITIES].join(", ")}` });
  }
  if ("category" in v && (typeof v.category !== "string" || !CATEGORIES.has(v.category as Category))) {
    issues.push({ path: `${path}.category`, message: `must be one of ${[...CATEGORIES].join(", ")}` });
  }
}

function validateSharedField(key: "itemId" | "contentHash" | "justification", value: unknown, itemPath: string, issues: VerdictIssue[]): void {
  const path = `${itemPath}.${key}`;
  if (key === "contentHash") {
    if (typeof value !== "string" || !SHA256_HEX_RE.test(value)) {
      issues.push({ path, message: "must be a 64-character lowercase hex SHA-256 digest, in the tier's pinned hash domain (docs/worker-contract.md section (d))" });
    }
    return;
  }
  requireNonBlankString(value, path, issues);
}

function validateVerdictItem(v: unknown, path: string, issues: VerdictIssue[]): void {
  if (!isPlainObject(v)) {
    issues.push({ path, message: "verdict item must be an object" });
    return;
  }
  const tier = v.tier;
  if (tier !== "l5" && tier !== "hard") {
    checkNoExtraKeys(v, ["itemId", "tier", "contentHash", "justification", "verdict"], path, issues);
    issues.push({ path: `${path}.tier`, message: "must be 'l5' or 'hard'" });
    for (const key of ["itemId", "contentHash", "justification"] as const) {
      if (key in v) validateSharedField(key, v[key], path, issues);
      else issues.push({ path: `${path}.${key}`, message: `missing required property '${key}'` });
    }
    return;
  }

  const allowsCorrection = tier === "l5" && v.verdict === "VALID-WITH-CORRECTION";
  const allowedKeys = allowsCorrection
    ? (["itemId", "tier", "contentHash", "justification", "verdict", "correction"] as const)
    : (["itemId", "tier", "contentHash", "justification", "verdict"] as const);
  checkNoExtraKeys(v, allowedKeys, path, issues);
  if (tier === "l5" && !allowsCorrection && "correction" in v) {
    issues.push({ path: `${path}.correction`, message: "'correction' is forbidden unless verdict is 'VALID-WITH-CORRECTION'" });
  }

  for (const key of ["itemId", "contentHash", "justification"] as const) {
    if (!(key in v)) issues.push({ path: `${path}.${key}`, message: `missing required property '${key}'` });
    else validateSharedField(key, v[key], path, issues);
  }

  if (!("verdict" in v)) {
    issues.push({ path: `${path}.verdict`, message: "missing required property 'verdict'" });
  } else if (tier === "l5") {
    if (typeof v.verdict !== "string" || !L5_VERDICTS.has(v.verdict as never)) {
      issues.push({ path: `${path}.verdict`, message: `must be one of ${[...L5_VERDICTS].join(", ")}` });
    } else if (v.verdict === "VALID-WITH-CORRECTION") {
      if (!("correction" in v)) {
        issues.push({ path: `${path}.correction`, message: "missing required property 'correction' (required for VALID-WITH-CORRECTION — review blocker 6)" });
      } else {
        validateCorrectionDetail(v.correction, `${path}.correction`, issues as RawIssue[]);
      }
    }
  } else {
    validateHardVerdictPayload(v.verdict, `${path}.verdict`, issues);
  }
}

/** Validates a parsed JSON value against the full `schemas/verdict.v1.json` surface (shape (b),
 * the driver-constructed document — see this file's header). Returns `[]` iff `input` is valid.
 * Never throws. */
export function validateVerdictDocument(input: unknown): VerdictIssue[] {
  const issues: VerdictIssue[] = [];
  if (!isPlainObject(input)) {
    issues.push({ path: "$", message: "verdict document must be an object" });
    return issues;
  }
  checkNoExtraKeys(input, ["schema_version", "batchId", "verifier", "verdicts"], "$", issues);

  if (!("schema_version" in input)) {
    issues.push({ path: "$.schema_version", message: "missing required property 'schema_version'" });
  } else if (input.schema_version !== "1") {
    issues.push({ path: "$.schema_version", message: `must be the const "1", got ${JSON.stringify(input.schema_version)}` });
  }

  if ("batchId" in input) requireNonBlankString(input.batchId, "$.batchId", issues);

  if (!("verifier" in input)) {
    issues.push({ path: "$.verifier", message: "missing required property 'verifier'" });
  } else {
    validateVerifier(input.verifier, "$.verifier", issues);
  }

  if (!("verdicts" in input)) {
    issues.push({ path: "$.verdicts", message: "missing required property 'verdicts'" });
  } else if (!Array.isArray(input.verdicts)) {
    issues.push({ path: "$.verdicts", message: "must be an array" });
  } else if (input.verdicts.length < 1) {
    issues.push({ path: "$.verdicts", message: "must contain at least 1 item (minItems:1) — a call that dispatched an item but returns none is schema-invalid, not an empty success" });
  } else if (input.verdicts.length > 1) {
    issues.push({ path: "$.verdicts", message: `must contain at most 1 item (maxItems:1 — review blocker 3: exactly one verdict per call under the session/turn model), got ${input.verdicts.length}` });
  } else {
    input.verdicts.forEach((item, i) => validateVerdictItem(item, `$.verdicts[${i}]`, issues));
  }

  return issues;
}
