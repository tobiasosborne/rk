// 1:1 test file for src/drive/identity.ts — M3.1 repair wave landing-blocker 5's seam encoding:
// the lossless, canonical mapping from a structured VerifierIdentity into ../vibefeld's free-text
// `verified_by`/`raised_by` fields, so M3.8's cross-vendor rule can recover both identities
// without parsing arbitrary strings.

import { describe, expect, test } from "bun:test";
import { encodeVerifierSeam, decodeVerifierSeam, type VerifierIdentity } from "../../src/drive/identity";

describe("encodeVerifierSeam / decodeVerifierSeam — round trip", () => {
  const identities: VerifierIdentity[] = [
    { modelFamily: "claude", backend: "claude", model: "claude-sonnet-5-20260115", sessionId: "sess-abc123" },
    { modelFamily: "gpt", backend: "codex", model: "gpt-5.6-sol-xhigh", sessionId: "sess-xyz789" },
    { modelFamily: "gemini", backend: "codex", model: "gemini-3-pro", sessionId: "sess-000" },
  ];

  for (const identity of identities) {
    test(`round-trips ${identity.modelFamily}/${identity.backend}`, () => {
      const encoded = encodeVerifierSeam(identity);
      expect(encoded.ok).toBe(true);
      if (!encoded.ok) throw new Error("expected ok");
      const decoded = decodeVerifierSeam(encoded.value);
      expect(decoded).toEqual({ ok: true, identity });
    });
  }

  test("the encoding is the documented family|backend|model|sessionId shape", () => {
    const encoded = encodeVerifierSeam({ modelFamily: "claude", backend: "claude", model: "m1", sessionId: "s1" });
    expect(encoded).toEqual({ ok: true, value: "claude|claude|m1|s1" });
  });
});

describe("encodeVerifierSeam — rejection classes", () => {
  test("a component containing the delimiter is rejected, not silently mangled", () => {
    const result = encodeVerifierSeam({ modelFamily: "claude", backend: "claude", model: "model|with|pipes", sessionId: "s1" });
    expect(result.ok).toBe(false);
  });

  test("a blank component is rejected", () => {
    const result = encodeVerifierSeam({ modelFamily: "claude", backend: "", model: "m", sessionId: "s1" });
    expect(result.ok).toBe(false);
  });

  test("encoding never silently drops or truncates a delimiter-bearing value — no successful encode exists for it", () => {
    // If it silently truncated, decoding would "round-trip" to a DIFFERENT value than the
    // original — this test proves that never happens by proving the encode step itself refuses.
    const original: VerifierIdentity = { modelFamily: "gpt", backend: "codex", model: "gpt|5|6", sessionId: "s1" };
    const encoded = encodeVerifierSeam(original);
    expect(encoded.ok).toBe(false);
  });
});

describe("decodeVerifierSeam — rejection classes", () => {
  test("wrong component count (too few) is rejected", () => {
    expect(decodeVerifierSeam("claude|claude|model").ok).toBe(false);
  });

  test("wrong component count (too many) is rejected", () => {
    expect(decodeVerifierSeam("claude|claude|model|sess|extra").ok).toBe(false);
  });

  test("unrecognized modelFamily is rejected — decode never silently accepts an unregistered family", () => {
    expect(decodeVerifierSeam("mistral|codex|model|sess").ok).toBe(false);
  });

  test("removed family 'codex' is rejected by decode too (blocker 5: codex is a backend, not a family)", () => {
    expect(decodeVerifierSeam("codex|codex|model|sess").ok).toBe(false);
  });

  test("removed catch-all 'other' is rejected by decode", () => {
    expect(decodeVerifierSeam("other|codex|model|sess").ok).toBe(false);
  });

  test("a blank decoded component is rejected", () => {
    expect(decodeVerifierSeam("claude||model|sess").ok).toBe(false);
  });

  test("empty string is rejected", () => {
    expect(decodeVerifierSeam("").ok).toBe(false);
  });
});
