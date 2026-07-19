// PURITY: pure — no fs/network/clock (L3). Runtime validator for `schemas/verdict.v1.json`, the
// wire contract every `rk verify` backend's response must satisfy (docs/worker-contract.md
// section (c)). This is the M2 freshness-gate lesson applied here: a schema file alone is not
// enforcement — the runtime MUST be able to reject every surface the schema states, including
// the parts JSON Schema expresses awkwardly on its own (discriminated tier/outcome shapes,
// non-blank-string justification, closed enums). Consumes `unknown` (a backend's parsed JSON
// reply is untrusted input, unlike src/graph's already-typed `GraphDocument`), never throws —
// mirrors src/graph/validate.ts's issue-list convention (no exceptions, caller decides policy),
// deliberately not importing anything from src/graph/ (drive and graph stay decoupled, same as
// graph stays decoupled from gates per src/graph/validate.ts's own header note).

export interface VerdictIssue {
  /** A JSON-pointer-ish location, e.g. `verdicts[2].tier` or `verifier.modelFamily`. Root-level
   * issues use `"$"`. */
  path: string;
  message: string;
}

const MODEL_FAMILIES = new Set(["claude", "codex", "gpt", "gemini", "other"]);
const L5_VERDICTS = new Set(["VALID", "VALID-WITH-CORRECTION", "INVALID"]);
const SEVERITIES = new Set(["critical", "major", "minor", "note"]);
const CATEGORIES = new Set(["gap", "missing", "dependency", "incorrect", "unclear", "other"]);
const CONTENT_HASH_RE = /^[0-9a-f]{64}$/;

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
  if (v.trim().length === 0) issues.push({ path, message: "must not be blank or whitespace-only" });
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
  if ("modelFamily" in v) {
    if (typeof v.modelFamily !== "string" || !MODEL_FAMILIES.has(v.modelFamily)) {
      issues.push({ path: `${path}.modelFamily`, message: `must be one of ${[...MODEL_FAMILIES].join(", ")}` });
    }
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
  // outcome === "challenge"
  checkNoExtraKeys(v, ["outcome", "target", "severity", "reason", "category"], path, issues);
  for (const key of ["target", "reason"] as const) {
    if (!(key in v)) issues.push({ path: `${path}.${key}`, message: `missing required property '${key}'` });
    else requireNonBlankString(v[key], `${path}.${key}`, issues);
  }
  if (!("severity" in v)) {
    issues.push({ path: `${path}.severity`, message: "missing required property 'severity'" });
  } else if (typeof v.severity !== "string" || !SEVERITIES.has(v.severity)) {
    issues.push({ path: `${path}.severity`, message: `must be one of ${[...SEVERITIES].join(", ")}` });
  }
  if ("category" in v && (typeof v.category !== "string" || !CATEGORIES.has(v.category))) {
    issues.push({ path: `${path}.category`, message: `must be one of ${[...CATEGORIES].join(", ")}` });
  }
}

function validateVerdictItem(v: unknown, path: string, issues: VerdictIssue[]): void {
  if (!isPlainObject(v)) {
    issues.push({ path, message: "verdict item must be an object" });
    return;
  }
  const common = ["itemId", "tier", "contentHash", "justification", "verdict"] as const;
  const tier = v.tier;
  if (tier !== "l5" && tier !== "hard") {
    // Still check the shared fields + report the discriminant failure — every other bad-shape
    // case below assumes tier is one of the two known values, so this is a hard stop for `tier`.
    checkNoExtraKeys(v, common, path, issues);
    issues.push({ path: `${path}.tier`, message: "must be 'l5' or 'hard'" });
    for (const key of ["itemId", "contentHash", "justification"] as const) {
      if (key in v) validateSharedField(key, v[key], path, issues);
      else issues.push({ path: `${path}.${key}`, message: `missing required property '${key}'` });
    }
    return;
  }
  checkNoExtraKeys(v, common, path, issues);
  for (const key of ["itemId", "contentHash", "justification"] as const) {
    if (!(key in v)) issues.push({ path: `${path}.${key}`, message: `missing required property '${key}'` });
    else validateSharedField(key, v[key], path, issues);
  }
  if (!("verdict" in v)) {
    issues.push({ path: `${path}.verdict`, message: "missing required property 'verdict'" });
  } else if (tier === "l5") {
    if (typeof v.verdict !== "string" || !L5_VERDICTS.has(v.verdict)) {
      issues.push({ path: `${path}.verdict`, message: `must be one of ${[...L5_VERDICTS].join(", ")}` });
    }
  } else {
    validateHardVerdictPayload(v.verdict, `${path}.verdict`, issues);
  }
}

function validateSharedField(key: "itemId" | "contentHash" | "justification", value: unknown, itemPath: string, issues: VerdictIssue[]): void {
  const path = `${itemPath}.${key}`;
  if (key === "contentHash") {
    if (typeof value !== "string" || !CONTENT_HASH_RE.test(value)) {
      issues.push({ path, message: "must be a 64-character lowercase hex SHA-256 digest" });
    }
    return;
  }
  requireNonBlankString(value, path, issues);
}

/** Validates a parsed JSON value against the full `schemas/verdict.v1.json` surface. Returns `[]`
 * iff `input` is a valid verdict document — every constraint the schema states (including the
 * ones expressed only in the schema's prose: mandatory non-blank justification, the tier/outcome
 * discriminated unions, closed enums, unknown-key rejection at every level) is enforced here, not
 * just the parts a generic JSON Schema validator would catch. Never throws. */
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
    issues.push({ path: "$.schema_version", message: `must be the const \"1\", got ${JSON.stringify(input.schema_version)}` });
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
  } else {
    input.verdicts.forEach((item, i) => validateVerdictItem(item, `$.verdicts[${i}]`, issues));
  }

  return issues;
}
