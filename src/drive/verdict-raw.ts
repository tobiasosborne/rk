// PURITY: pure — no fs/network/clock (L3). Shape (a) of the M3.1 repair wave's two-shape data
// flow (Tier A review landing-blocker 1): what a WORKER actually returns for one turn — verdict +
// justification + optional structured correction detail, and NOTHING driver-owned (no itemId, no
// contentHash, no tier, no batchId, no verifier identity, no sessionId). The driver never trusts
// any of those fields from worker output because none of them appear in this shape's own
// `additionalProperties:false` surface — a worker that tries to smuggle one in is rejected
// outright by `checkNoExtraKeys`, not silently stripped. src/drive/bind-verdicts.ts is what
// injects the driver-owned fields from immutable dispatch state to build shape (b)
// (`schemas/verdict.v1.json`, enforced by src/drive/verdict-schema.ts).
//
// Which of the two raw shapes (l5 vs hard) to validate `raw` against is decided by the CALLER
// from its own immutable dispatch state's `tier` (never a self-declared field inside `raw` — see
// docs/worker-contract.md's data-flow section): a worker cannot claim to have answered at a tier
// it was never asked about.

import { L5_VERDICTS, SEVERITIES, CATEGORIES, SHA256_HEX_RE, isNonBlankString, type Severity, type Category, type Tier } from "./vocab";

export interface CorrectionDetail {
  /** What changed, in the worker's own words — worker-authored content, not driver-owned. */
  description: string;
  /** SHA-256 hex of the corrected bytes (same domain as the tier's own `contentHash` — see
   * docs/worker-contract.md section (d)'s pinned hash domains). Promotion on a
   * VALID-WITH-CORRECTION verdict is FORBIDDEN until a fresh dispatch re-verifies and re-binds
   * against THIS hash (review blocker 6) — that re-verification is M3.7's job, not this WP's;
   * this module only enforces the field's presence and shape. */
  correctedContentHash: string;
}

export type RawL5Output =
  | { verdict: "VALID" | "INVALID"; justification: string }
  | { verdict: "VALID-WITH-CORRECTION"; justification: string; correction: CorrectionDetail };

export type RawHardOutcome =
  | { outcome: "accept"; note?: string }
  | { outcome: "challenge"; target: string; severity: Severity; reason: string; category?: Category };

export interface RawHardOutput {
  verdict: RawHardOutcome;
  justification: string;
}

export interface RawIssue {
  path: string;
  message: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkNoExtraKeys(obj: Record<string, unknown>, allowed: readonly string[], path: string, issues: RawIssue[]): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key)) issues.push({ path: `${path}.${key}`, message: `unknown property '${key}' — driver-owned fields (itemId/contentHash/tier/batchId/identity) never belong in raw worker output` });
  }
}

/** Exported so src/drive/verdict-schema.ts (shape (b), the driver-constructed document) can
 * validate a `correction` field with the identical rule set — the field's shape does not change
 * between raw worker output and the enriched document (it is worker-authored content that passes
 * through `bindVerdicts` unmodified), so there is exactly one implementation of its shape check. */
export function validateCorrectionDetail(v: unknown, path: string, issues: RawIssue[]): void {
  if (!isPlainObject(v)) {
    issues.push({ path, message: "correction must be an object" });
    return;
  }
  checkNoExtraKeys(v, ["description", "correctedContentHash"], path, issues);
  if (!("description" in v)) issues.push({ path: `${path}.description`, message: "missing required property 'description'" });
  else if (!isNonBlankString(v.description)) issues.push({ path: `${path}.description`, message: "must be a non-blank string" });
  if (!("correctedContentHash" in v)) issues.push({ path: `${path}.correctedContentHash`, message: "missing required property 'correctedContentHash'" });
  else if (typeof v.correctedContentHash !== "string" || !SHA256_HEX_RE.test(v.correctedContentHash)) {
    issues.push({ path: `${path}.correctedContentHash`, message: "must be a 64-character lowercase hex SHA-256 digest" });
  }
}

function validateRawL5(v: Record<string, unknown>, path: string, issues: RawIssue[]): void {
  const verdict = v.verdict;
  if (verdict === "VALID-WITH-CORRECTION") {
    checkNoExtraKeys(v, ["verdict", "justification", "correction"], path, issues);
    if (!("correction" in v)) issues.push({ path: `${path}.correction`, message: "VALID-WITH-CORRECTION requires 'correction' (review blocker 6)" });
    else validateCorrectionDetail(v.correction, `${path}.correction`, issues);
  } else if (verdict === "VALID" || verdict === "INVALID") {
    checkNoExtraKeys(v, ["verdict", "justification"], path, issues);
    if ("correction" in v) issues.push({ path: `${path}.correction`, message: `'correction' is forbidden on a '${verdict}' verdict (only VALID-WITH-CORRECTION carries one)` });
  } else {
    checkNoExtraKeys(v, ["verdict", "justification", "correction"], path, issues);
    issues.push({ path: `${path}.verdict`, message: `must be one of ${[...L5_VERDICTS].join(", ")}` });
  }
  if (!("justification" in v)) issues.push({ path: `${path}.justification`, message: "missing required property 'justification'" });
  else if (!isNonBlankString(v.justification)) issues.push({ path: `${path}.justification`, message: "must not be blank or whitespace-only" });
}

function validateRawHardOutcome(v: unknown, path: string, issues: RawIssue[]): void {
  if (!isPlainObject(v)) {
    issues.push({ path, message: "hard-tier verdict must be an object" });
    return;
  }
  if (v.outcome !== "accept" && v.outcome !== "challenge") {
    issues.push({ path: `${path}.outcome`, message: "must be 'accept' or 'challenge'" });
    return;
  }
  if (v.outcome === "accept") {
    checkNoExtraKeys(v, ["outcome", "note"], path, issues);
    if ("note" in v && typeof v.note !== "string") issues.push({ path: `${path}.note`, message: "must be a string" });
    return;
  }
  checkNoExtraKeys(v, ["outcome", "target", "severity", "reason", "category"], path, issues);
  if (!("target" in v) || !isNonBlankString(v.target)) issues.push({ path: `${path}.target`, message: "must be a non-blank string" });
  if (!("severity" in v)) issues.push({ path: `${path}.severity`, message: "missing required property 'severity'" });
  else if (typeof v.severity !== "string" || !SEVERITIES.has(v.severity as Severity)) issues.push({ path: `${path}.severity`, message: `must be one of ${[...SEVERITIES].join(", ")}` });
  if (!("reason" in v) || !isNonBlankString(v.reason)) issues.push({ path: `${path}.reason`, message: "must be a non-blank string" });
  if ("category" in v && (typeof v.category !== "string" || !CATEGORIES.has(v.category as Category))) {
    issues.push({ path: `${path}.category`, message: `must be one of ${[...CATEGORIES].join(", ")}` });
  }
}

/** Validates untrusted worker output against the shape (a) appropriate to `tier` — the caller's
 * OWN immutable dispatch record, never a field read from `raw` itself. Returns `[]` iff `raw` is
 * a valid raw worker verdict for that tier. Never throws. */
export function validateRawWorkerOutput(tier: Tier, raw: unknown): RawIssue[] {
  const issues: RawIssue[] = [];
  if (!isPlainObject(raw)) {
    issues.push({ path: "$", message: "raw worker output must be an object" });
    return issues;
  }
  if (tier === "l5") {
    validateRawL5(raw, "$", issues);
  } else {
    checkNoExtraKeys(raw, ["verdict", "justification"], "$", issues);
    if (!("verdict" in raw)) issues.push({ path: "$.verdict", message: "missing required property 'verdict'" });
    else validateRawHardOutcome(raw.verdict, "$.verdict", issues);
    if (!("justification" in raw)) issues.push({ path: "$.justification", message: "missing required property 'justification'" });
    else if (!isNonBlankString(raw.justification)) issues.push({ path: "$.justification", message: "must not be blank or whitespace-only" });
  }
  return issues;
}
