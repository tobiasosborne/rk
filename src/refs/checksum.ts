// PURITY: pure — no fs/network/clock (L3). Checksum comparison + checksums.sha256 parsing.
// Ground truth: fetch-refs.py's `sha256_bytes`/`sha256_file` (fetch-refs.py:47-52) compute the
// hash; this module only compares/parses already-computed hex digests. The actual hashing (an
// IO-adjacent operation over file bytes) lives at the edge, src/refs/hash.ts.

export interface ChecksumRow {
  sha256: string;
  path: string;
}

/** First 16 hex chars of a full sha256 — AISM's "key file (sha256-16)" column convention in
 * SOURCES.md (see refs/manifest/SOURCES.md there). Idempotent on an already-16-char input. */
export function sha16(fullHex: string): string {
  return fullHex.slice(0, 16);
}

/** Exact, case-insensitive hex comparison. Length must match too — a shorter `actual` must
 * never be treated as a valid prefix match against a longer `expected` (or vice versa); that
 * would silently accept a truncated/corrupt hash. */
export function checksumMatches(actualHex: string, expectedHex: string): boolean {
  return actualHex.toLowerCase() === expectedHex.toLowerCase();
}

/** Parses `refs/manifest/checksums.sha256`: `sha256sum -c` format, one row per line,
 * `<64-hex>  ./<relpath>` (two spaces, a `./`-prefixed relative path — verified against a real
 * AISM checksums.sha256; the `.gitignore`d payload files are hashed relative to `refs/`).
 * Blank lines are ignored. */
export function parseChecksumsFile(text: string): ChecksumRow[] {
  const rows: ChecksumRow[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const m = /^([0-9a-fA-F]+)  \.\/(.+)$/.exec(line);
    if (!m) continue;
    rows.push({ sha256: m[1]!, path: m[2]! });
  }
  return rows;
}

/** Inverse of parseChecksumsFile: one `<hex>  ./<path>` line per row, trailing newline. */
export function serializeChecksumsFile(rows: ChecksumRow[]): string {
  return rows.map((r) => `${r.sha256}  ./${r.path}\n`).join("");
}
