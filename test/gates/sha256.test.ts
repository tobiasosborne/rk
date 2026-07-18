// Proves the pure SHA-256 (src/gates/sha256.ts) is BYTE-IDENTICAL to the edge hasher
// (src/refs/hash.ts's Bun.CryptoHasher). The whole reason the pure impl exists is so the pure
// builder `snapshotFromFiles` can synthesize hash facts a Gate 4 test can compare against a
// recorded manifest sha; if the two hashers ever diverged, a builder-produced snapshot would
// silently disagree with a real `loadSnapshot` snapshot, defeating the coherence guarantee
// (M0.3 round-3 landing-blocker 2). So this file is the shared-test-vector cross-check the
// landing-blocker disposition requires.

import { describe, expect, test } from "bun:test";
import { sha256Hex } from "../../src/gates/sha256";
import { sha256Bytes } from "../../src/refs/hash";

const enc = (s: string) => new TextEncoder().encode(s);

describe("sha256Hex — pure, byte-identical to the edge hasher", () => {
  test("known NIST / RFC vectors", () => {
    // FIPS 180-4 / RFC 6234 published digests.
    expect(sha256Hex(enc(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(enc("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(enc("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  test("matches sha256Bytes across a spread of inputs (ASCII, multibyte UTF-8, boundary lengths)", () => {
    const inputs: Uint8Array[] = [
      enc(""),
      enc("a"),
      enc("abc"),
      enc("The quick brown fox jumps over the lazy dog"),
      enc("héllo — naïve façade Ω≈ç√∫  \u{1F600}"), // multibyte UTF-8 incl. astral emoji
      enc("x".repeat(55)), // one byte short of a padding boundary
      enc("x".repeat(56)), // exactly forces a second padded block
      enc("x".repeat(64)), // exactly one block of message
      enc("y".repeat(1000)),
      new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0x80, 0xa0]), // raw non-UTF-8 bytes
      new Uint8Array(0),
    ];
    for (const bytes of inputs) {
      expect(sha256Hex(bytes)).toBe(sha256Bytes(bytes));
    }
  });

  test("64-char lowercase hex shape", () => {
    const h = sha256Hex(enc("shape check"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
