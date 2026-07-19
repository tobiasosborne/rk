// PURITY: pure — no fs/network/clock (L3). M3.7: the L5 verdict store's ON-DISK RECORD shape and
// its pure line-level codec — one JSONL line per record, appended to `.rk/l5-verdicts.jsonl` in
// the campaign repo (the fs edge that actually opens that file is src/drive/l5-store-io.ts; this
// module never touches fs). A record is built from a driver-constructed `VerdictDocument`
// (schemas/verdict.v1.json / src/drive/verdict-schema.ts) restricted to `tier:"l5"` — the hard
// tier has its own ledger seam (../vibefeld's `af verdicts apply`, src/drive/batch-plan.ts's
// `VerdictFileSkeleton`), not this store.
//
// FIELD PROVENANCE (every field traces back to something already landed, never reinvented):
// - `itemId`/`l5ContentHash`/`justification`/`verdict`/`correction` come straight off the bound
//   `VerdictDocument`'s single `verdicts[0]` item (docs/worker-contract.md's pinned l5 hash
//   domain, section (f): raw shard-file bytes, no normalization — this module trusts the document
//   already carries that hash; it never recomputes or re-verifies it).
// - `verifierSeam` is `src/drive/identity.ts`'s `encodeVerifierSeam(document.verifier)` — the ONE
//   canonical `family|backend|model|sessionId` encoding this codebase already uses to cross the
//   ../vibefeld free-text seam. Reusing it here (rather than storing the structured object) keeps
//   exactly one encoding of verifier identity in the whole system, not a second, competing one.
// - `batchId` passes through unmodified (optional, present iff the document's own `batchId` is).
// - `ordinal`/`appendedAt` are NOT on `VerdictDocument` at all — they are ledger-position metadata
//   the STORE assigns at append time (`buildL5StoredVerdict`'s caller passes them in), never
//   derived from worker or driver dispatch state. `ordinal` is the identity-relevant field
//   (staleness/latest-wins logic in src/drive/l5-store.ts sorts and compares by it); `appendedAt`
//   is edge-supplied ISO-8601 wall-clock metadata, explicitly NON-IDENTITY (L3: this pure module
//   never reads the system clock itself) — present for human/audit legibility only, never read by
//   any freshness or
//   latest-wins decision. A record missing it (or carrying a bogus value) still round-trips and
//   still participates in staleness/promotion queries correctly.

import { encodeVerifierSeam } from "./identity";
import type { VerdictDocument } from "./verdict-schema";
import { L5_VERDICTS, SHA256_HEX_RE, isNonBlankString, type L5Verdict } from "./vocab";

export const L5_STORE_SCHEMA_VERSION = "1";

export interface L5StoredCorrection {
  description: string;
  correctedContentHash: string;
}

/** One line of `.rk/l5-verdicts.jsonl`, once parsed. `ordinal` is assigned by the writer edge at
 * append time (0-based, monotonically increasing, never reused) — it is the ONLY field this
 * store's query logic (src/drive/l5-store.ts) uses to break ties between multiple records for the
 * same `itemId`; `appendedAt` is informational only (see file header). */
export interface L5StoredVerdict {
  schemaVersion: "1";
  ordinal: number;
  itemId: string;
  l5ContentHash: string;
  verdict: L5Verdict;
  justification: string;
  correction?: L5StoredCorrection;
  verifierSeam: string;
  batchId?: string;
  /** ISO-8601, edge-supplied, non-identity metadata (see file header). Optional so a pure caller
   * (a test constructing a record directly) is never forced to fabricate a timestamp. */
  appendedAt?: string;
}

export type BuildL5RecordResult = { ok: true; record: L5StoredVerdict } | { ok: false; reason: string };

/** Builds the store's own record from a driver-constructed `VerdictDocument` (already validated by
 * `validateVerdictDocument` / produced by `bindVerdicts`) plus the ledger-position metadata the
 * writer edge assigns. Rejects (never throws) a document that is not a single-item `tier:"l5"`
 * document, or whose verifier identity cannot be losslessly seam-encoded (`encodeVerifierSeam`'s
 * own failure mode — a `|`-containing component). This is the ONE place a `VerdictDocument`
 * becomes a store record; nothing else in this module tree hand-rolls the projection. */
export function buildL5StoredVerdict(document: VerdictDocument, ordinal: number, appendedAt?: string): BuildL5RecordResult {
  const item = document.verdicts[0];
  if (item === undefined) return { ok: false, reason: "document.verdicts is empty" };
  if (item.tier !== "l5") return { ok: false, reason: `document item tier is '${item.tier}', not 'l5' — the L5 store never records hard-tier verdicts` };

  const seam = encodeVerifierSeam(document.verifier);
  if (!seam.ok) return { ok: false, reason: `verifier identity cannot be seam-encoded: ${seam.reason}` };

  const record: L5StoredVerdict = {
    schemaVersion: L5_STORE_SCHEMA_VERSION,
    ordinal,
    itemId: item.itemId,
    l5ContentHash: item.contentHash,
    verdict: item.verdict,
    justification: item.justification,
    verifierSeam: seam.value,
    ...(document.batchId !== undefined ? { batchId: document.batchId } : {}),
    ...(appendedAt !== undefined ? { appendedAt } : {}),
    ...(item.verdict === "VALID-WITH-CORRECTION" ? { correction: item.correction } : {}),
  };
  return { ok: true, record };
}

/** Serializes one record as a single JSONL line (no trailing newline — the writer edge owns line
 * termination). Field order is whatever `JSON.stringify` produces for the object literal above;
 * this store never relies on key order for anything (parsing is by key name, not position). */
export function serializeL5StoredVerdict(record: L5StoredVerdict): string {
  return JSON.stringify(record);
}

export interface L5LineIssue {
  line: number;
  message: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parses and validates one raw JSONL line against `L5StoredVerdict`'s full shape. Returns
 * `{ok:false}` (never throws) for anything malformed — garbage JSON, a truncated/short write, a
 * bad hash shape, an unrecognized verdict, a `correction` on a non-correction verdict, etc. This
 * is what makes a corrupted-tail line (src/drive/l5-store.ts's `parseL5Log`) a reported issue
 * rather than a thrown exception that would abort reading the earlier, good lines. */
export function parseL5StoredVerdictLine(raw: string, line: number): { ok: true; record: L5StoredVerdict } | { ok: false; issue: L5LineIssue } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, issue: { line, message: `not valid JSON (${e instanceof Error ? e.message : String(e)}) — likely a truncated/corrupted append` } };
  }
  if (!isPlainObject(parsed)) return { ok: false, issue: { line, message: "must be a JSON object" } };

  const fail = (message: string) => ({ ok: false as const, issue: { line, message } });
  if (parsed.schemaVersion !== L5_STORE_SCHEMA_VERSION) return fail(`schemaVersion must be '${L5_STORE_SCHEMA_VERSION}', got ${JSON.stringify(parsed.schemaVersion)}`);
  if (typeof parsed.ordinal !== "number" || !Number.isInteger(parsed.ordinal) || parsed.ordinal < 0) return fail("ordinal must be a non-negative integer");
  if (!isNonBlankString(parsed.itemId)) return fail("itemId must be a non-blank string");
  if (typeof parsed.l5ContentHash !== "string" || !SHA256_HEX_RE.test(parsed.l5ContentHash)) return fail("l5ContentHash must be a 64-character lowercase hex SHA-256 digest");
  if (typeof parsed.verdict !== "string" || !L5_VERDICTS.has(parsed.verdict as L5Verdict)) return fail(`verdict must be one of ${[...L5_VERDICTS].join(", ")}`);
  if (!isNonBlankString(parsed.justification)) return fail("justification must be a non-blank string");
  if (!isNonBlankString(parsed.verifierSeam)) return fail("verifierSeam must be a non-blank string");
  if (parsed.batchId !== undefined && !isNonBlankString(parsed.batchId)) return fail("batchId must be a non-blank string when present");
  if (parsed.appendedAt !== undefined && typeof parsed.appendedAt !== "string") return fail("appendedAt must be a string when present");

  if (parsed.verdict === "VALID-WITH-CORRECTION") {
    const c = parsed.correction;
    if (!isPlainObject(c)) return fail("correction is required when verdict is 'VALID-WITH-CORRECTION'");
    if (!isNonBlankString(c.description)) return fail("correction.description must be a non-blank string");
    if (typeof c.correctedContentHash !== "string" || !SHA256_HEX_RE.test(c.correctedContentHash)) return fail("correction.correctedContentHash must be a 64-character lowercase hex SHA-256 digest");
  } else if (parsed.correction !== undefined) {
    return fail(`correction is forbidden on a '${parsed.verdict}' verdict`);
  }

  return { ok: true, record: parsed as unknown as L5StoredVerdict };
}
