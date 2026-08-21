// PURITY: pure — no fs/network/clock (L3). Gate 3 Check 11, exact runtime enforcement for
// schemas/extraction-record.v1.json and schemas/card-review.v1.json (rk-nsex Tier A repair BL6).
// The field/type validator remains in refs-records-schema.ts; this shard owns the schema clauses
// that were previously omitted: closed key sets, optional-field shapes, L0 array items and the
// source-directory equality shared by both record kinds.

const SHA256_RE = /^[0-9a-fA-F]{64}$/;
const RANGE_RE = /^refs\/[A-Za-z0-9_./-]+:[1-9][0-9]*-[1-9][0-9]*$/;

export const L1_EXACT_KEYS = [
  "schema_version",
  "record_kind",
  "source",
  "payload_sha256",
  "extraction_sha256",
  "result_label",
  "statement_range",
  "statement_verbatim",
  "statement_blessed",
  "hypotheses",
  "conclusion",
  "signature",
  "profile",
  "proof_locus",
] as const;
export const L0_EXACT_KEYS = [
  "schema_version",
  "record_kind",
  "source",
  "payload_sha256",
  "extraction_sha256",
  "regime",
  "objects",
  "results",
  "standing_assumptions_range",
  "ends_at_eof",
  "profile",
] as const;
export const REVIEW_EXACT_KEYS = ["schema_version", "card_sha256", "verdict", "reviewer", "checked", "findings"] as const;
export const REVIEWER_EXACT_KEYS = ["family", "backend", "model", "session"] as const;
export const CHECKED_EXACT_KEYS = ["statement_complete", "hypotheses_complete", "translation_faithful", "signature_faithful"] as const;
export const CLAUSE_EXACT_KEYS = ["value", "note"] as const;
export const HYPOTHESIS_EXACT_KEYS = ["text", "anchor"] as const;

const L1_KEYS = new Set<string>(L1_EXACT_KEYS);
const L0_KEYS = new Set<string>(L0_EXACT_KEYS);
const REVIEW_KEYS = new Set<string>(REVIEW_EXACT_KEYS);
const REVIEWER_KEYS = new Set<string>(REVIEWER_EXACT_KEYS);
const CHECKED_KEYS = new Set<string>(CHECKED_EXACT_KEYS);
const CLAUSE_KEYS = new Set<string>(CLAUSE_EXACT_KEYS);
const HYPOTHESIS_KEYS = new Set<string>(HYPOTHESIS_EXACT_KEYS);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extras(value: Record<string, unknown>, allowed: Set<string>, prefix = ""): string[] {
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .sort()
    .map((key) => `${prefix}${key} (unexpected property)`);
}

/** Clauses from the L1 schema not already checked by validateL1's required/type pass. */
export function exactL1Problems(value: Record<string, unknown>): string[] {
  const problems = extras(value, L1_KEYS);
  if (Object.hasOwn(value, "extraction_sha256") &&
      (typeof value.extraction_sha256 !== "string" || !SHA256_RE.test(value.extraction_sha256))) {
    problems.push("extraction_sha256 (64-hex when present)");
  }
  if (Array.isArray(value.hypotheses)) {
    for (const [index, hypothesis] of value.hypotheses.entries()) {
      if (isObject(hypothesis)) problems.push(...extras(hypothesis, HYPOTHESIS_KEYS, `hypotheses[${index}].`));
    }
  }
  return problems;
}

/** Every L0 property/type/pattern clause, including the optional BL2 EOF declaration. */
export function exactL0Problems(value: Record<string, unknown>): string[] {
  const problems = extras(value, L0_KEYS);
  if (typeof value.payload_sha256 !== "string" || !SHA256_RE.test(value.payload_sha256)) {
    problems.push("payload_sha256 (64-hex)");
  }
  if (Object.hasOwn(value, "extraction_sha256") &&
      (typeof value.extraction_sha256 !== "string" || !SHA256_RE.test(value.extraction_sha256))) {
    problems.push("extraction_sha256 (64-hex when present)");
  }
  if (Array.isArray(value.objects)) {
    for (const [index, item] of value.objects.entries()) {
      if (typeof item !== "string") problems.push(`objects[${index}] (must be a string)`);
    }
  }
  if (Array.isArray(value.results)) {
    for (const [index, item] of value.results.entries()) {
      if (typeof item !== "string") problems.push(`results[${index}] (must be a string)`);
    }
  }
  if (Object.hasOwn(value, "standing_assumptions_range") &&
      (typeof value.standing_assumptions_range !== "string" || !RANGE_RE.test(value.standing_assumptions_range))) {
    problems.push("standing_assumptions_range (must be refs/<path>:<from>-<to> when present)");
  }
  if (Object.hasOwn(value, "ends_at_eof") &&
      (!isObject(value.ends_at_eof) || Object.values(value.ends_at_eof).some((item) => item !== true))) {
    problems.push('ends_at_eof (an object mapping result_label -> true, e.g. {"Lemma 4.2": true})');
  }
  return problems;
}

/** additionalProperties:false at the review's four closed object levels. */
export function exactReviewProblems(value: Record<string, unknown>): string[] {
  const problems = extras(value, REVIEW_KEYS);
  if (isObject(value.reviewer)) problems.push(...extras(value.reviewer, REVIEWER_KEYS, "reviewer."));
  if (isObject(value.checked)) {
    problems.push(...extras(value.checked, CHECKED_KEYS, "checked."));
    for (const name of CHECKED_KEYS) {
      const clause = value.checked[name];
      if (isObject(clause)) problems.push(...extras(clause, CLAUSE_KEYS, `checked.${name}.`));
    }
  }
  return problems;
}

export function sourceDirectoryProblem(declared: string, directory: string): string | undefined {
  return declared === directory
    ? undefined
    : `extraction record declares source ${JSON.stringify(declared)} but is filed under refs/records/${directory}/`;
}
