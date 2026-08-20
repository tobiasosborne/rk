// PURITY: pure — no fs/network/clock (L3). Gate 3 Check 11, SHAPE HALF: the runtime validator
// for schemas/extraction-record.v1.json and schemas/card-review.v1.json (bead rk-nsex). Split out
// of ./refs-records.ts (the discovery half) at the 280-line shard cap; the two are one job read
// together — this file decides what a record IS, that one decides which files are records.
//
// Field-by-field rather than a generic JSON-schema interpreter (L4: zero runtime deps): every
// violation is reported by NAME in one finding, so an author sees the whole list at once instead
// of fixing one field per run. test/gates/refs-records.test.ts pins this key set against the
// schema files themselves, so the two cannot drift.

import type { Finding } from "./framework";

export const RECORDS_PREFIX = "refs/records/";
export const RANGE_ANCHOR_RE = /^(refs\/[A-Za-z0-9_./-]+):([1-9][0-9]*)-([1-9][0-9]*)$/;
export const LINE_ANCHOR_RE = /^(refs\/[A-Za-z0-9_./-]+):([1-9][0-9]*)$/;
const SHA256_RE = /^[0-9a-fA-F]{64}$/;

export interface Hypothesis {
  text: string;
  anchor: string;
}

/** A shape-valid L1 extraction record. `value` is the PARSED JSON, kept so
 * `canonicalRecordSha256(value)` hashes exactly what the reviewer signed. */
export interface L1Record {
  path: string;
  sourceId: string;
  label: string;
  value: Record<string, unknown>;
  source: string;
  payloadSha256: string;
  extractionSha256?: string;
  resultLabel: string;
  statementRange: string;
  statementVerbatim: string;
  statementBlessed: string;
  hypotheses: Hypothesis[];
  conclusion: string;
  proofLocus: string;
  profile: string;
}

export interface L0Record {
  path: string;
  sourceId: string;
  standingAssumptionsRange?: string;
}

export interface ReviewClause {
  name: string;
  value: boolean;
  note: string;
}

export interface ReviewRecord {
  path: string;
  /** The L1 record path this review is bound to by name (`L1-<n>.review.json` -> `L1-<n>.json`). */
  recordPath: string;
  cardSha256: string;
  verdict: string;
  /** Clause names answered `false`. A non-empty list alongside `verdict: "VALID"` is
   * `[review-inconsistent]`. */
  falseClauses: string[];
  /** The reviewer seam, verbatim — carried so the GENERATED card can name who reviewed it
   * (src/render/cards.ts) without re-parsing the review file. */
  reviewer: { family: string; backend: string; model: string; session: string };
  clauses: ReviewClause[];
  findings: string[];
}

/** Every record finding is STRUCTURAL (docs/gate-contracts.md "Phase matrix"): admission of a
 * cited claim is a phase-independent transaction (campaign memo section 2a), so these never
 * demote to WARN in exploration. */
export function recordError(path: string, code: string, message: string): Finding {
  return { severity: "ERROR", path, line: 1, message: `[${code}] ${message}`, structural: true };
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function str(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** The four review clauses schemas/card-review.v1.json requires, in schema order. */
export const REVIEW_CLAUSES = ["statement_complete", "hypotheses_complete", "translation_faithful", "signature_faithful"] as const;

export function validateL1(path: string, sourceId: string, label: string, o: Record<string, unknown>): L1Record | Finding {
  const missing: string[] = [];
  if (o.schema_version !== "1") missing.push('schema_version (must be the string "1")');
  if (o.record_kind !== "L1") missing.push('record_kind (must be "L1")');
  const source = str(o, "source");
  if (!source) missing.push("source");
  const payloadSha256 = str(o, "payload_sha256");
  if (!payloadSha256 || !SHA256_RE.test(payloadSha256)) missing.push("payload_sha256 (64-hex)");
  const resultLabel = str(o, "result_label");
  if (!resultLabel) missing.push("result_label");
  const statementVerbatim = typeof o.statement_verbatim === "string" ? o.statement_verbatim : undefined;
  if (statementVerbatim === undefined) missing.push("statement_verbatim");
  const statementBlessed = str(o, "statement_blessed");
  if (!statementBlessed) missing.push("statement_blessed");
  const conclusion = str(o, "conclusion");
  if (!conclusion) missing.push("conclusion");
  if (!isObject(o.signature)) missing.push("signature (an object; schemas/signature.v1.json is rk-8805)");
  const profile = str(o, "profile");
  if (!profile) missing.push("profile");
  const proofLocus = str(o, "proof_locus");
  if (!proofLocus) missing.push("proof_locus");

  const statementRange = str(o, "statement_range");
  const rawHypotheses = Array.isArray(o.hypotheses) ? o.hypotheses : undefined;
  if (rawHypotheses === undefined) missing.push("hypotheses (an array)");

  // The zero-anchor case is checked BEFORE the field list so it gets its own name: a record with
  // neither a statement range nor a single hypothesis anchor is not merely missing a field, it
  // anchors nothing to the source at all and is prose wearing a record's filename.
  if (statementRange === undefined && (rawHypotheses === undefined || rawHypotheses.length === 0)) {
    return recordError(
      path,
      "zero-anchor-record",
      "extraction record carries NO anchors at all (no statement_range, no hypothesis anchor) — nothing in it " +
        "is bound to the source, so no reviewer and no gate can check it against the paper",
    );
  }
  if (statementRange === undefined) missing.push("statement_range");
  else if (!RANGE_ANCHOR_RE.test(statementRange)) {
    missing.push(`statement_range (must be refs/<path>:<from>-<to>, got ${JSON.stringify(statementRange)})`);
  }

  const hypotheses: Hypothesis[] = [];
  for (const [i, h] of (rawHypotheses ?? []).entries()) {
    if (!isObject(h) || typeof h.text !== "string" || h.text.length === 0 || typeof h.anchor !== "string") {
      missing.push(`hypotheses[${i}] (must be {text: non-empty string, anchor: "refs/<path>:<line>"})`);
      continue;
    }
    if (!LINE_ANCHOR_RE.test(h.anchor)) {
      missing.push(`hypotheses[${i}].anchor (must be refs/<path>:<line>, got ${JSON.stringify(h.anchor)})`);
      continue;
    }
    hypotheses.push({ text: h.text, anchor: h.anchor });
  }

  const extractionSha256 = str(o, "extraction_sha256");
  if (extractionSha256 !== undefined && !SHA256_RE.test(extractionSha256)) missing.push("extraction_sha256 (64-hex)");

  if (missing.length > 0) {
    return recordError(
      path,
      "record-malformed",
      `extraction record violates schemas/extraction-record.v1.json: ${missing.join("; ")}`,
    );
  }
  if (source !== sourceId) {
    return recordError(
      path,
      "record-misfiled",
      `extraction record declares source ${JSON.stringify(source)} but is filed under ${RECORDS_PREFIX}${sourceId}/ — ` +
        "a record filed under another paper's directory would let one source's review vouch for another's bytes",
    );
  }
  return {
    path,
    sourceId,
    label,
    value: o,
    source: source!,
    payloadSha256: payloadSha256!,
    ...(extractionSha256 !== undefined ? { extractionSha256 } : {}),
    resultLabel: resultLabel!,
    statementRange: statementRange!,
    statementVerbatim: statementVerbatim!,
    statementBlessed: statementBlessed!,
    hypotheses,
    conclusion: conclusion!,
    proofLocus: proofLocus!,
    profile: profile!,
  };
}

export function validateL0(path: string, sourceId: string, o: Record<string, unknown>): L0Record | Finding {
  const missing: string[] = [];
  if (o.schema_version !== "1") missing.push('schema_version (must be the string "1")');
  if (o.record_kind !== "L0") missing.push('record_kind (must be "L0")');
  if (!str(o, "source")) missing.push("source");
  if (!str(o, "payload_sha256")) missing.push("payload_sha256");
  if (!str(o, "regime")) missing.push("regime");
  if (!Array.isArray(o.objects)) missing.push("objects (an array)");
  if (!Array.isArray(o.results)) missing.push("results (an array)");
  if (!str(o, "profile")) missing.push("profile");
  const range = str(o, "standing_assumptions_range");
  if (range !== undefined && !RANGE_ANCHOR_RE.test(range)) {
    missing.push(`standing_assumptions_range (must be refs/<path>:<from>-<to>, got ${JSON.stringify(range)})`);
  }
  if (missing.length > 0) {
    return recordError(path, "record-malformed", `L0 record violates schemas/extraction-record.v1.json: ${missing.join("; ")}`);
  }
  return { path, sourceId, ...(range !== undefined ? { standingAssumptionsRange: range } : {}) };
}

export function validateReview(path: string, recordPath: string, o: Record<string, unknown>): ReviewRecord | Finding {
  const missing: string[] = [];
  if (o.schema_version !== "1") missing.push('schema_version (must be the string "1")');
  const cardSha256 = str(o, "card_sha256");
  if (!cardSha256 || !SHA256_RE.test(cardSha256)) missing.push("card_sha256 (64-hex)");
  const verdict = str(o, "verdict");
  if (verdict !== "VALID" && verdict !== "INVALID") missing.push('verdict (must be "VALID" or "INVALID")');
  const reviewer = o.reviewer;
  if (!isObject(reviewer) || !str(reviewer, "family") || !str(reviewer, "backend") || !str(reviewer, "model") || !str(reviewer, "session")) {
    missing.push("reviewer ({family, backend, model, session}, every component non-blank)");
  }
  const checked = o.checked;
  const falseClauses: string[] = [];
  const clauses: ReviewClause[] = [];
  if (!isObject(checked)) missing.push("checked (the four review clauses)");
  else {
    for (const clause of REVIEW_CLAUSES) {
      const c = checked[clause];
      if (!isObject(c) || typeof c.value !== "boolean" || !str(c, "note")) {
        missing.push(`checked.${clause} ({value: boolean, note: non-empty string})`);
        continue;
      }
      clauses.push({ name: clause, value: c.value, note: c.note as string });
      if (c.value === false) falseClauses.push(clause);
    }
  }
  if (!Array.isArray(o.findings) || o.findings.some((f) => typeof f !== "string")) missing.push("findings (an array of strings)");
  if (missing.length > 0) {
    return recordError(path, "review-malformed", `review record violates schemas/card-review.v1.json: ${missing.join("; ")}`);
  }
  const r = reviewer as Record<string, string>;
  return {
    path,
    recordPath,
    cardSha256: cardSha256!,
    verdict: verdict!,
    falseClauses,
    reviewer: { family: r.family!, backend: r.backend!, model: r.model!, session: r.session! },
    clauses,
    findings: o.findings as string[],
  };
}

