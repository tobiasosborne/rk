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

// ---------------------------------------------------------------------------------------
// THE PRE-HASH LOSSLESS SCAN (Tier A review 2026-08-20, landing-blocker BL5)
// ---------------------------------------------------------------------------------------
// `JSON.parse` is LOSSY in two ways that matter to a hash-bound record, and canonicalizing its
// output therefore cannot distinguish documents a reviewer would read as different:
//
//   NUMBERS. `9007199254740992` and `9007199254740993` parse to the SAME double, so editing one
//   into the other left the canonical digest unchanged — the review's `card_sha256` and the
//   shard's `record_sha256:` both carried forward and Checks 11-12 passed on bytes nobody read.
//   That is the reviewer's own repro.
//
//   DUPLICATE KEYS. `{"statement_blessed": "weak", "statement_blessed": "strong"}` parses to a
//   single-key object; the document a human reads and the document the gate hashes are different
//   documents, and which one wins is a parser detail.
//
// So the raw TEXT is scanned before anything is parsed or hashed, and a record that cannot be
// canonicalized losslessly is rejected outright rather than hashed approximately. The number rule
// is deliberately strict and fail-closed: an integer must be a safe integer, and any other number
// must round-trip through `String(Number(literal))` unchanged — i.e. it must already be written in
// the exact form `JSON.stringify` would emit, so canonicalization is a fixed point on it. `1e3` is
// therefore rejected in favour of `1000`, and `-0` in favour of `0`; the remedy is always to write
// the canonical spelling, and the alternative (accepting a spelling whose digest depends on the
// parser's rounding) is the defect itself.
//
// This is a validator, not a parser: it builds no value, so it cannot be the thing that disagrees
// with `JSON.parse` about what a document MEANS. It only decides whether the document is one that
// can be hashed at all.

export type JsonScanResult = { ok: true } | { ok: false; reason: string };

const WS = new Set([" ", "\t", "\n", "\r"]);
const NUMBER_RE = /-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/y;
const INTEGER_LITERAL_RE = /^-?[0-9]+$/;

/** Scans `raw` as JSON, rejecting anything that cannot be canonicalized losslessly (duplicate
 * keys; numbers whose value does not survive `JSON.parse`). Never throws. */
export function scanCanonicalJson(raw: string): JsonScanResult {
  let i = 0;

  const fail = (reason: string): JsonScanResult => ({ ok: false, reason });
  const skipWs = (): void => {
    while (i < raw.length && WS.has(raw[i]!)) i++;
  };

  /** Reads one JSON string starting at a `"`; returns its decoded-enough value (escapes are
   * consumed, not interpreted beyond `\uXXXX` shape) or null on a malformed string. */
  const readString = (): string | null => {
    if (raw[i] !== '"') return null;
    i++;
    let out = "";
    while (i < raw.length) {
      const ch = raw[i]!;
      if (ch === '"') {
        i++;
        return out;
      }
      if (ch === "\\") {
        const esc = raw[i + 1];
        if (esc === undefined) return null;
        if (esc === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(raw.slice(i + 2, i + 6))) return null;
          out += String.fromCharCode(parseInt(raw.slice(i + 2, i + 6), 16));
          i += 6;
          continue;
        }
        if (!'"\\/bfnrt'.includes(esc)) return null;
        out += esc;
        i += 2;
        continue;
      }
      out += ch;
      i++;
    }
    return null;
  };

  const value = (path: string): JsonScanResult => {
    skipWs();
    if (i >= raw.length) return fail(`unexpected end of input at ${path || "the document root"}`);
    const ch = raw[i]!;

    if (ch === "{") {
      i++;
      const seen = new Set<string>();
      skipWs();
      if (raw[i] === "}") {
        i++;
        return { ok: true };
      }
      for (;;) {
        skipWs();
        const key = readString();
        if (key === null) return fail(`expected a quoted key in ${path || "the document root"}`);
        const keyPath = path === "" ? key : `${path}.${key}`;
        if (seen.has(key)) {
          return fail(
            `duplicate key ${keyPath} — JSON.parse silently keeps only the last occurrence, so the document a ` +
              "reviewer reads and the document this gate would hash are different documents",
          );
        }
        seen.add(key);
        skipWs();
        if (raw[i] !== ":") return fail(`expected ':' after ${keyPath}`);
        i++;
        const v = value(keyPath);
        if (!v.ok) return v;
        skipWs();
        if (raw[i] === ",") {
          i++;
          continue;
        }
        if (raw[i] === "}") {
          i++;
          return { ok: true };
        }
        return fail(`expected ',' or '}' after ${keyPath}`);
      }
    }

    if (ch === "[") {
      i++;
      skipWs();
      if (raw[i] === "]") {
        i++;
        return { ok: true };
      }
      let index = 0;
      for (;;) {
        const v = value(`${path}[${index}]`);
        if (!v.ok) return v;
        skipWs();
        if (raw[i] === ",") {
          i++;
          index++;
          continue;
        }
        if (raw[i] === "]") {
          i++;
          return { ok: true };
        }
        return fail(`expected ',' or ']' after ${path}[${index}]`);
      }
    }

    if (ch === '"') {
      return readString() === null ? fail(`malformed string at ${path || "the document root"}`) : { ok: true };
    }

    for (const lit of ["true", "false", "null"]) {
      if (raw.startsWith(lit, i)) {
        i += lit.length;
        return { ok: true };
      }
    }

    NUMBER_RE.lastIndex = i;
    const m = NUMBER_RE.exec(raw);
    if (!m || m.index !== i) return fail(`unexpected token at ${path || "the document root"}: ${JSON.stringify(raw.slice(i, i + 12))}`);
    const literal = m[0];
    i += literal.length;
    const parsed = Number(literal);
    if (!Number.isFinite(parsed)) {
      return fail(`${path || "value"} is ${literal}, whose magnitude is not finite as a JSON number`);
    }
    if (INTEGER_LITERAL_RE.test(literal)) {
      if (!Number.isSafeInteger(parsed)) {
        return fail(
          `${path || "value"} is the integer ${literal}, outside the safe integer range — it and its neighbours ` +
            "parse to the same double, so a record could be edited without changing its canonical digest",
        );
      }
      return { ok: true };
    }
    if (String(parsed) !== literal) {
      return fail(
        `${path || "value"} is ${literal}, which does not survive a JSON round trip (it parses back as ` +
          `${String(parsed)}) — write the number in the exact form JSON.stringify emits, so canonicalization ` +
          "cannot change its value",
      );
    }
    return { ok: true };
  };

  const result = value("");
  if (!result.ok) return result;
  skipWs();
  if (i !== raw.length) return fail(`trailing content after the top-level value: ${JSON.stringify(raw.slice(i, i + 12))}`);
  return { ok: true };
}
