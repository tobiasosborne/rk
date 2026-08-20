// rk-nsex step 1: the canonical byte form every record hash is taken over. `card_sha256` (a
// review record) and `record_sha256:` (a Layer 1 shard's frontmatter) are both sha256 of
// `canonicalRecordBytes(record)`, so this function IS the hash domain — if it were sensitive to
// key order or indentation, reformatting a record would silently invalidate an honest review, and
// if it were insensitive to a value change, an edited record would keep its approval.
//
// L1 red-green: written before src/gates/canonical-json.ts existed (import error = RED); each
// assertion re-reddened afterwards by perturbing the implementation (drop the sort, drop the
// trailing newline, switch the indent) and observing exactly this file go red.

import { describe, expect, test } from "bun:test";
import { canonicalRecordBytes, canonicalRecordSha256, scanCanonicalJson } from "../../src/gates/canonical-json";
import { sha256Hex } from "../../src/gates/sha256";

describe("canonicalRecordBytes", () => {
  test("sorts keys recursively, indents by 2, ends with exactly one newline", () => {
    const bytes = canonicalRecordBytes({ b: 1, a: { d: [3, { f: 1, e: 2 }], c: "x" } });
    expect(bytes).toBe(
      ['{', '  "a": {', '    "c": "x",', '    "d": [', "      3,", "      {", '        "e": 2,', '        "f": 1', "      }", "    ]", "  },", '  "b": 1', "}", ""].join("\n"),
    );
  });

  test("key ORDER in the source object never changes the bytes", () => {
    const one = canonicalRecordBytes({ z: 1, a: { y: 2, b: 3 } });
    const two = canonicalRecordBytes({ a: { b: 3, y: 2 }, z: 1 });
    expect(one).toBe(two);
  });

  test("a changed VALUE changes the bytes (the binding is not vacuous)", () => {
    const one = canonicalRecordBytes({ statement: "for all n" });
    const two = canonicalRecordBytes({ statement: "for all n >= 2" });
    expect(one).not.toBe(two);
  });

  test("array ORDER is preserved (arrays are data, not key sets)", () => {
    expect(canonicalRecordBytes(["b", "a"])).not.toBe(canonicalRecordBytes(["a", "b"]));
  });

  test("round-trips through JSON.parse unchanged", () => {
    const record = { schema_version: "1", hypotheses: [{ text: "t", anchor: "refs/s.txt:2" }], n: 3, ok: true, nil: null };
    expect(JSON.parse(canonicalRecordBytes(record))).toEqual(record);
  });
});

describe("canonicalRecordSha256", () => {
  test("is the sha256 of the canonical bytes, not of any other serialization", () => {
    const record = { b: 2, a: 1 };
    const want = sha256Hex(new TextEncoder().encode(canonicalRecordBytes(record)));
    expect(canonicalRecordSha256(record)).toBe(want);
    // The naive JSON.stringify hash is a DIFFERENT digest — pinned so a future "optimization"
    // back to it cannot pass silently.
    expect(canonicalRecordSha256(record)).not.toBe(sha256Hex(new TextEncoder().encode(JSON.stringify(record))));
  });

  test("is stable across reformatting of the same record", () => {
    const a = JSON.parse('{"a":1,"b":{"d":2,"c":3}}');
    const b = JSON.parse('{\n  "b": {\n    "c": 3,\n    "d": 2\n  },\n  "a": 1\n}\n');
    expect(canonicalRecordSha256(a)).toBe(canonicalRecordSha256(b));
  });
});

// ---------------------------------------------------------------------------------------
// BL5 (Tier A review, 2026-08-20): "Canonical hashing is lossy for unsafe JSON numbers.
// Changing a signature value from 9007199254740992 to 9007199254740993 leaves the canonical
// digest unchanged after JSON.parse; the old review and shard hash therefore carry forward and
// Checks 11-12 pass." JSON.parse also silently drops duplicate keys, so two different documents
// canonicalize to one. Both are now rejected BEFORE hashing, by a lossless scan of the raw text.
// ---------------------------------------------------------------------------------------
describe("scanCanonicalJson — the pre-hash lossless check", () => {
  test("accepts an ordinary record-shaped document", () => {
    expect(scanCanonicalJson('{"a": 1, "b": [1.5, -2, "x", true, null], "c": {"d": 0}}')).toEqual({ ok: true });
  });

  test("REJECTS the reviewer's exact pair: neither 2^53 nor 2^53+1 may be hashed", () => {
    expect(scanCanonicalJson('{"n": 9007199254740992}').ok).toBe(false);
    expect(scanCanonicalJson('{"n": 9007199254740993}').ok).toBe(false);
    // The defect the rejection prevents: through JSON.parse they are the SAME number, so the two
    // documents would have carried one digest and one review between them.
    expect(JSON.parse('{"n": 9007199254740992}').n).toBe(JSON.parse('{"n": 9007199254740993}').n);
  });

  test("accepts the largest safe integer and rejects the first unsafe one", () => {
    expect(scanCanonicalJson('{"n": 9007199254740991}')).toEqual({ ok: true });
    expect(scanCanonicalJson('{"n": -9007199254740992}').ok).toBe(false);
  });

  test("rejects a fraction that does not survive a round trip, and accepts one that does", () => {
    expect(scanCanonicalJson('{"n": 0.1}')).toEqual({ ok: true });
    expect(scanCanonicalJson('{"n": 1.0000000000000000001}').ok).toBe(false);
    expect(scanCanonicalJson('{"n": 1e3}').ok).toBe(false);
  });

  test("rejects a non-finite magnitude", () => {
    expect(scanCanonicalJson('{"n": 1e400}').ok).toBe(false);
  });

  test("REJECTS duplicate keys, which JSON.parse silently drops", () => {
    const r = scanCanonicalJson('{"statement_blessed": "weak", "statement_blessed": "strong"}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("statement_blessed");
    expect(Object.keys(JSON.parse('{"a": 1, "a": 2}'))).toEqual(["a"]);
  });

  test("duplicate keys are detected at every depth, and named by path", () => {
    const r = scanCanonicalJson('{"signature": {"pre": [{"obj": "a", "obj": "b"}]}}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("signature.pre[0].obj");
  });

  test("the same key in SIBLING objects is not a duplicate", () => {
    expect(scanCanonicalJson('{"a": {"k": 1}, "b": {"k": 2}}')).toEqual({ ok: true });
  });

  test("malformed JSON is reported, never thrown", () => {
    expect(scanCanonicalJson("{not json").ok).toBe(false);
    expect(scanCanonicalJson('{"a": 1} trailing').ok).toBe(false);
  });

  test("handles escapes and unicode in strings without false positives", () => {
    expect(scanCanonicalJson('{"a": "he said \\"x\\" \\u00e9\\n", "b": "\\\\"}')).toEqual({ ok: true });
  });
});
