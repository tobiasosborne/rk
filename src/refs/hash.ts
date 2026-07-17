// EDGE — touches fs. SHA256 hashing of refs/ payload bytes via Bun's built-in CryptoHasher (no
// runtime dependency: L4). Ground truth for what gets hashed: fetch-refs.py's `sha256_bytes`/
// `sha256_file` (fetch-refs.py:47-52) — full lowercase hex digest of the raw file bytes, no
// normalization.

/** Full lowercase hex sha256 digest of `bytes`. */
export function sha256Bytes(bytes: Uint8Array): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(bytes);
  return hasher.digest("hex");
}

/** Full lowercase hex sha256 digest of the file at `path`. */
export async function sha256File(path: string): Promise<string> {
  const buf = await Bun.file(path).arrayBuffer();
  return sha256Bytes(new Uint8Array(buf));
}
