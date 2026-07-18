// PURITY: pure — no fs/network/clock (L3). A dependency-free (L4) SHA-256 (FIPS 180-4) over raw
// bytes, byte-IDENTICAL to the edge hasher in `src/refs/hash.ts` (which wraps the runtime's native
// CryptoHasher) — verified against shared test vectors in test/gates/sha256.test.ts, including NIST
// "abc" and the empty string. It exists ONLY so the pure test/probe builder `snapshotFromFiles`
// (src/gates/snapshot.ts) can synthesize a COHERENT snapshot — every modeled-present file carries
// a hash fact, exactly as the real edge `loadSnapshot` (src/store/snapshot-load.ts) guarantees — without importing the native
// crypto primitive a `PURITY: pure` module is forbidden to touch (the purity grep, being a dumb
// line scanner, rejects the native-hasher call by name even inside a comment, so this file names
// it only obliquely).
// Review N2 / M0.3 round-3 landing-blocker 2: `snapshotFromFiles` previously defaulted `sha256`
// to EMPTY while marking every file present+tracked, an impossible edge state Gate 4 read as
// genuine disk-absence. The edge never produces {present, no-hash}; neither may the builder.
//
// This is deliberately NOT the production hash path: `loadSnapshot` and `src/refs/` hash real file
// bytes via the fast native hasher at the edge. This pure reimplementation is only reached by the
// in-memory builder, so its cost (small test/probe file maps) is irrelevant.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
const hex8 = (x: number): string => (x >>> 0).toString(16).padStart(8, "0");

/** Full lowercase hex SHA-256 digest of `bytes` — byte-identical to `sha256Bytes` in
 * `src/refs/hash.ts`. Pure: no fs/network/clock/native-crypto. */
export function sha256Hex(bytes: Uint8Array): string {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const l = bytes.length;
  const bitLen = l * 8;
  // padding: 0x80, then zeros, so that (len % 64) === 56, then 8-byte big-endian bit length.
  const withOne = l + 1;
  const k = (56 - (withOne % 64) + 64) % 64;
  const total = withOne + k + 8;
  const msg = new Uint8Array(total);
  msg.set(bytes);
  msg[l] = 0x80;
  const dv = new DataView(msg.buffer);
  dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000)); // high 32 bits (big-endian)
  dv.setUint32(total - 4, bitLen >>> 0); // low 32 bits

  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return hex8(h0) + hex8(h1) + hex8(h2) + hex8(h3) + hex8(h4) + hex8(h5) + hex8(h6) + hex8(h7);
}
