// 1:1 test for src/drive/parse-diag.ts (rk-d1n, M3.5 live debug). The DIAGNOSTIC-ONLY classifier
// that labels WHY an extraction failed — the attempt-11 incident needed to tell an unterminated
// verbose `reason` string (model stopped mid-object) apart from trailing content after the object,
// which the old 500-char snippet with no parse-error detail could not. Acceptance semantics
// (`extractSingleJsonObject`) are unchanged and re-asserted here alongside.

import { describe, expect, test } from "bun:test";
import { classifyExtractionFailure, extractSingleJsonObject } from "../../src/drive/parse-diag";

describe("classifyExtractionFailure — DIAGNOSTIC failure-mode labels (rk-d1n)", () => {
  test("unterminated: a well-shaped object cut mid-`reason` string -> 'unterminated' + a parse-error message", () => {
    // The attempt-11 shape: a perfectly-formed challenge JSON prefix whose verbose `reason` string is
    // never closed (the model ran out of output budget mid-string).
    const raw = '{"verdict":{"outcome":"challenge","target":"1","severity":"major","reason":"This is a very long verbose explanation that goes on and on and never';
    const r = classifyExtractionFailure(raw);
    expect(r.classification).toBe("unterminated");
    expect(r.parseError.length).toBeGreaterThan(0); // the JSON.parse message is captured, not empty
  });

  test("unterminated: braces still open at end-of-text (no closing brace) -> 'unterminated'", () => {
    expect(classifyExtractionFailure('{"verdict":{"outcome":"accept"}').classification).toBe("unterminated");
  });

  test("trailing-content: a balanced object followed by prose -> 'trailing-content'", () => {
    const r = classifyExtractionFailure('{"verdict":"VALID","justification":"ok"} Hope that helps!');
    expect(r.classification).toBe("trailing-content");
    expect(r.parseError.length).toBeGreaterThan(0);
  });

  test("multiple-objects: two concatenated top-level objects -> 'multiple-objects'", () => {
    expect(classifyExtractionFailure('{"a":1}{"b":2}').classification).toBe("multiple-objects");
  });

  test("multiple-objects: object, whitespace, then another object -> 'multiple-objects'", () => {
    expect(classifyExtractionFailure('{"a":1}\n\n  {"b":2}').classification).toBe("multiple-objects");
  });

  test("no-object: a bare JSON array parses cleanly but is not an object -> 'no-object' (empty parseError)", () => {
    const r = classifyExtractionFailure('[{"a":1},{"b":2}]');
    expect(r.classification).toBe("no-object");
    expect(r.parseError).toBe(""); // parsed cleanly as a non-object value; there was no parse error
  });

  test("no-object: a bare primitive (number) -> 'no-object'", () => {
    expect(classifyExtractionFailure("42").classification).toBe("no-object");
  });

  test("no-object: text with no brace at all -> 'no-object'", () => {
    expect(classifyExtractionFailure("I cannot produce a verdict for this node.").classification).toBe("no-object");
  });

  test("other: leading prose then an embedded object (object present but surrounded) -> 'other'", () => {
    expect(classifyExtractionFailure('Sure! Here is the verdict: {"verdict":"VALID","justification":"ok"}').classification).toBe("other");
  });

  test("other: a balanced object with malformed internals (trailing comma) -> 'other'", () => {
    // Braces balance and nothing follows, but the object's own JSON is invalid.
    expect(classifyExtractionFailure('{"a":1,}').classification).toBe("other");
  });

  test("a brace INSIDE a string never miscounts the balance (string-aware scan)", () => {
    // The `}` is inside the string value, so the object is genuinely unterminated after it.
    const r = classifyExtractionFailure('{"reason":"contains a } brace and keeps going');
    expect(r.classification).toBe("unterminated");
  });

  test("fenced input is unwrapped before classification: inner object unterminated -> 'unterminated'", () => {
    // A closed fence whose INNER object is unterminated (missing a closing brace) — strip the fence,
    // then classify the remainder.
    const r = classifyExtractionFailure('```json\n{"verdict":{"outcome":"challenge","reason":"x"\n```');
    expect(r.classification).toBe("unterminated");
  });

  test("a truncated fenced block with NO closing fence stays wrapped -> 'other' (honest: not a clean object)", () => {
    // Real truncation drops the closing fence, so stripSingleFence leaves it unchanged (same as the
    // acceptance extractor). The candidate begins with ``` and only later contains an object → 'other'.
    expect(classifyExtractionFailure('```json\n{"verdict":{"outcome":"challenge","reason":"cut off').classification).toBe("other");
  });
});

// Acceptance is UNCHANGED (rk-d1n fence): the classifier is diagnostic; the extractor still fails on
// anything but a single balanced object.
describe("extractSingleJsonObject — acceptance rule unchanged", () => {
  test("a single balanced object still passes; ambiguous shapes still fail", () => {
    expect(extractSingleJsonObject('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(extractSingleJsonObject('{"a":1} trailing').ok).toBe(false);
    expect(extractSingleJsonObject('{"a":1}{"b":2}').ok).toBe(false);
    expect(extractSingleJsonObject('[{"a":1}]').ok).toBe(false);
    expect(extractSingleJsonObject('{"a":1').ok).toBe(false); // unterminated
  });
});
