// PURITY: pure — no fs/network/clock (L3). rk-0ehr / P1 (docs/memos/2026-08-03-rk-improvement-
// plan-from-aism.md §P1, ratified 2026-08-03): the RETRACTION ledger's on-disk record shape and
// its pure line-level codec — one JSONL line per record, appended to `.rk/retractions.jsonl` in
// the campaign repo (the fs edge that opens that file is src/drive/retraction-store-io.ts; this
// module never touches fs). Deliberately a SIBLING ledger, never interleaved into
// `.rk/l5-verdicts.jsonl`: a retraction is not a verdict (it carries no verifier identity, no
// tier, no justification-of-a-check) and it must be issuable OUT OF BAND — by a human or an
// audit — without pretending to be a worker turn. The two ledgers therefore have two independent
// ordinal chains and two independent health assessments (src/drive/retraction-store.ts mirrors
// src/drive/l5-store.ts's `l5StoreHealthy` exactly).
//
// WHY THIS RECORD EXISTS (the incident, per L2). AISM 2026-07-28: `lem-stage1-approximate-group-
// laws` and `lem-stage1-smooth-unitary-operations` were af-validated on 2026-07-27, then found
// DEFECTIVE by an independent sweep and retracted — recorded ONLY by editing the shard prose and
// its frontmatter. Every OTHER layer still said pass (af ledger's last event was `node_validated`;
// `export.md` read `**Status:** validated`; the oracle verdict file read `"result":"pass"`), so
// three of four layers rendered "validated" for a retracted proof. See
// docs/memos/2026-08-03-aism-postmortem/03-datamodel.md, "Drift & inconsistency found" item 1.
// The whole reason retraction is a RECORD and not prose is that prose is not a join key.
//
// THE HASH BINDING, AND WHY IT IS THE SAME MECHANISM AS STALENESS. A retraction is issued while
// the artifact bytes are UNCHANGED — that is exactly the state edit-triggered staleness cannot
// see. So the record pins the CURRENT content hash at retraction time, and the retraction is LIVE
// iff the item's current hash still equals it (src/drive/retraction-store.ts's
// `liveRetractionFor`). Edit the artifact and the hash changes: the retraction stops binding and
// ordinary staleness semantics take over — a fresh verification is needed anyway, so nothing is
// lost by releasing the binding. There is no "un-retract" record and no tombstone; like the
// verdict store, state is COMPUTED at read time from a hash comparison, never stored as a flag.
//
// TWO HASH DOMAINS, NEVER COMPARED. `hashDomain` names which of verdict.v1's two PINNED domains
// this record's `contentHash` lives in (schemas/verdict.v1.json's `l5ContentHash` /
// `hardContentHash` — "the two must never be compared to each other"). A retraction binds in
// EXACTLY ONE domain: `l5-shard-bytes` (raw shard-file bytes, no normalization — what Gate 2's
// L5-promotion check re-derives) or `af-canonical` (../vibefeld's own `Node.ComputeContentHash()`
// field-concatenation hash — what the af-tier availability check answers to). A live
// `l5-shard-bytes` retraction demotes L5 promotion; a live `af-canonical` retraction makes the
// item unavailable to the monotone-trust ladder. Neither hash is ever tested against the other's
// current value.

import { SHA256_HEX_RE, isNonBlankString } from "./vocab";

export const RETRACTION_SCHEMA_VERSION = "1";

/** verdict.v1's two pinned hash domains, named. A retraction binds in exactly one of them; see
 * this file's header for why they are never cross-compared. */
export const RETRACTION_HASH_DOMAINS = ["l5-shard-bytes", "af-canonical"] as const;
export type RetractionHashDomain = (typeof RETRACTION_HASH_DOMAINS)[number];

/** What a caller (a human running `rk retract`, an audit script) supplies. `ordinal`/`appendedAt`
 * are NOT here — they are ledger-position metadata the writer edge assigns at append time, the
 * same split src/drive/l5-record.ts makes for `L5StoredVerdict`. */
export interface RetractionInput {
  itemId: string;
  /** The item's content hash AT RETRACTION TIME, in `hashDomain`. */
  contentHash: string;
  hashDomain: RetractionHashDomain;
  /** Free text naming who issued it — e.g. "TJO", "audit:2026-07-28-independent-sweep". Non-blank
   * on purpose: an unattributed retraction is not auditable. */
  retractedBy: string;
  /** Why. Structurally checked (non-blank) exactly as a verdict's `justification` is — a
   * retraction with no stated reason is the prose-only failure mode this record replaces. */
  reason: string;
  /** Optional: the ordinal of the L5 verdict this retraction supersedes, when the issuer knows it.
   * DIAGNOSTIC ONLY — no query in this module tree resolves promotion by chasing it (the live/not-
   * live hash comparison is the whole decision), so a wrong or absent value can never change a
   * validity answer. */
  supersedesVerdictOrdinal?: number;
}

/** One parsed line of `.rk/retractions.jsonl`. `ordinal` is assigned by the writer edge (0-based,
 * contiguous, never reused) and is the ONLY field the store's queries use to break ties between
 * two records for the same item; `appendedAt` is edge-supplied ISO-8601 metadata, explicitly
 * NON-IDENTITY (L3: this pure module never reads a clock) — present for audit legibility only,
 * never read by any liveness decision. */
export interface RetractionRecord extends RetractionInput {
  schemaVersion: "1";
  ordinal: number;
  appendedAt?: string;
}

export type BuildRetractionResult = { ok: true; record: RetractionRecord } | { ok: false; reason: string };

const DOMAIN_SET: ReadonlySet<string> = new Set<string>(RETRACTION_HASH_DOMAINS);

function validateInput(input: RetractionInput): string | undefined {
  if (!isNonBlankString(input.itemId)) return "itemId must be a non-blank string";
  if (typeof input.contentHash !== "string" || !SHA256_HEX_RE.test(input.contentHash)) {
    return "contentHash must be a 64-character lowercase hex SHA-256 digest";
  }
  if (!DOMAIN_SET.has(input.hashDomain)) {
    return `hashDomain must be one of ${RETRACTION_HASH_DOMAINS.join(", ")} — a retraction binds in exactly one pinned domain`;
  }
  if (!isNonBlankString(input.retractedBy)) return "retractedBy must be a non-blank string (an unattributed retraction is not auditable)";
  if (!isNonBlankString(input.reason)) return "reason must be a non-blank string";
  if (input.supersedesVerdictOrdinal !== undefined) {
    const s = input.supersedesVerdictOrdinal;
    if (typeof s !== "number" || !Number.isInteger(s) || s < 0) return "supersedesVerdictOrdinal must be a non-negative integer when present";
  }
  return undefined;
}

/** Builds the store's record from a caller-supplied input plus the ledger-position metadata the
 * writer edge assigns. Rejects (never throws) any shape violation — this is the ONE place an
 * input becomes a record; nothing else hand-rolls the projection. */
export function buildRetractionRecord(input: RetractionInput, ordinal: number, appendedAt?: string): BuildRetractionResult {
  if (typeof ordinal !== "number" || !Number.isInteger(ordinal) || ordinal < 0) {
    return { ok: false, reason: "ordinal must be a non-negative integer" };
  }
  const problem = validateInput(input);
  if (problem !== undefined) return { ok: false, reason: problem };

  const record: RetractionRecord = {
    schemaVersion: RETRACTION_SCHEMA_VERSION,
    ordinal,
    itemId: input.itemId,
    contentHash: input.contentHash,
    hashDomain: input.hashDomain,
    retractedBy: input.retractedBy,
    reason: input.reason,
    ...(input.supersedesVerdictOrdinal !== undefined ? { supersedesVerdictOrdinal: input.supersedesVerdictOrdinal } : {}),
    ...(appendedAt !== undefined ? { appendedAt } : {}),
  };
  return { ok: true, record };
}

/** Serializes one record as a single JSONL line (no trailing newline — the writer edge owns line
 * termination). Key order is never relied on anywhere; parsing is by key name. */
export function serializeRetractionRecord(record: RetractionRecord): string {
  return JSON.stringify(record);
}

export interface RetractionLineIssue {
  line: number;
  message: string;
}

const KNOWN_KEYS: ReadonlySet<string> = new Set([
  "schemaVersion", "ordinal", "itemId", "contentHash", "hashDomain", "retractedBy", "reason",
  "supersedesVerdictOrdinal", "appendedAt",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parses and validates one raw JSONL line against `RetractionRecord`'s full shape, including
 * `additionalProperties:false` (schemas/retraction.v1.json). Returns `{ok:false}` — never throws —
 * for anything malformed, so a corrupted tail line is a REPORTED issue rather than an exception
 * that would abort reading the earlier, good lines. Any such issue poisons the whole store
 * (src/drive/retraction-store.ts's `retractionStoreHealthy`); this function's only job is never to
 * lose one. */
export function parseRetractionRecordLine(
  raw: string,
  line: number,
): { ok: true; record: RetractionRecord } | { ok: false; issue: RetractionLineIssue } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, issue: { line, message: `not valid JSON (${e instanceof Error ? e.message : String(e)}) — likely a truncated/corrupted append` } };
  }
  if (!isPlainObject(parsed)) return { ok: false, issue: { line, message: "must be a JSON object" } };

  const fail = (message: string) => ({ ok: false as const, issue: { line, message } });

  for (const key of Object.keys(parsed)) {
    if (!KNOWN_KEYS.has(key)) return fail(`unknown field '${key}' (schemas/retraction.v1.json is additionalProperties:false)`);
  }
  if (parsed.schemaVersion !== RETRACTION_SCHEMA_VERSION) {
    return fail(`schemaVersion must be '${RETRACTION_SCHEMA_VERSION}', got ${JSON.stringify(parsed.schemaVersion)}`);
  }
  if (typeof parsed.ordinal !== "number" || !Number.isInteger(parsed.ordinal) || parsed.ordinal < 0) {
    return fail("ordinal must be a non-negative integer");
  }
  if (parsed.appendedAt !== undefined && typeof parsed.appendedAt !== "string") return fail("appendedAt must be a string when present");

  const problem = validateInput({
    itemId: parsed.itemId as string,
    contentHash: parsed.contentHash as string,
    hashDomain: parsed.hashDomain as RetractionHashDomain,
    retractedBy: parsed.retractedBy as string,
    reason: parsed.reason as string,
    ...(parsed.supersedesVerdictOrdinal !== undefined
      ? { supersedesVerdictOrdinal: parsed.supersedesVerdictOrdinal as number }
      : {}),
  });
  if (problem !== undefined) return fail(problem);

  return { ok: true, record: parsed as unknown as RetractionRecord };
}
