// PURITY: pure — no fs/network/clock (L3). THE HASH DOMAIN for extraction records and card
// review records (bead rk-nsex; docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md section 4,
// schemas/extraction-record.v1.json, schemas/card-review.v1.json).
//
// Every hash of a record — a review record's `card_sha256`, a Layer 1 shard's `record_sha256:` —
// is the sha256 of `canonicalRecordBytes(record)`: the PARSED JSON re-serialized with recursively
// sorted object keys, two-space indent, and exactly one trailing newline. Never the file's bytes
// as they happen to sit on disk.
//
// WHY CANONICAL RATHER THAN ON-DISK BYTES. The binding must be sensitive to exactly one thing:
// whether any VALUE of the record changed since it was reviewed. Hashing on-disk bytes would also
// make it sensitive to key order, indentation and trailing whitespace, so a formatter run would
// invalidate an honest review and train a campaign to re-stamp `card_sha256` mechanically —
// which is precisely how a real edit slips through under cover of a reformat. Sorting the keys
// and fixing the layout removes every difference that is not a content difference, and leaves
// every difference that is (test/gates/canonical-json.test.ts pins both directions).
//
// Arrays are NOT sorted: their order is data (the order hypotheses are listed in, the order of a
// signature's predicates), and sorting them would make two genuinely different records hash equal.

import { sha256Hex } from "./sha256";

/** Recursively rebuilds `value` with every object's keys in ascending code-unit order. Arrays keep
 * their order and are rebuilt element-wise; scalars (including `null`) are returned as-is. Input is
 * expected to be the output of `JSON.parse` — no `undefined`, no functions, no cycles. */
export function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value === null || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) out[key] = canonicalJsonValue(source[key]);
  return out;
}

/** The canonical text of a record: sorted keys, 2-space indent, one trailing newline. */
export function canonicalRecordBytes(value: unknown): string {
  return `${JSON.stringify(canonicalJsonValue(value), null, 2)}\n`;
}

/** Lowercase 64-hex sha256 of `canonicalRecordBytes(value)`'s UTF-8 bytes — the digest
 * `card_sha256` and `record_sha256:` must equal. */
export function canonicalRecordSha256(value: unknown): string {
  return sha256Hex(new TextEncoder().encode(canonicalRecordBytes(value)));
}
