// PURITY: pure — no fs/network/clock (L3). The two facts about PDF payloads that BOTH the pure
// gate side (src/gates/refs-extraction.ts) and the impure edge (src/refs/extraction-store.ts,
// src/refs/quote-locate.ts) have to agree on, in one place: how a PDF is recognized, and where
// its extraction layer lives.
//
// WHY THIS EXISTS (bead rk-we5i, P1). A `refs/` payload that is a compressed PDF stores its text
// inside FlateDecode streams, so the sentence a researcher wants to cite appears NOWHERE in the
// payload's raw bytes. Every raw-byte search — `grep -F`, `rk refs quote`'s payload scan, Gate 3's
// `sourceLine.includes(quote)` — therefore reports "not found" for a quote that is genuinely in
// the document. Real cases: RVW math/0406038, RV TR05-092, JMRW 2209.07024; even "spectral gap"
// misses. Consequence before this module: no shard could carry `status: cited` against a PDF
// source at all (fail-closed, no false green, but the cited rung was unreachable). PRD C7 already
// anticipated the answer — "extract (PDF->text/markdown via marker where available) ... SHA256 of
// payload and extraction" — so quoting and checking run against the EXTRACTION layer, with the
// extraction's provenance chained to the payload hash.

/** PDF files begin with the 5-byte header `%PDF-` (PDF 1.7 spec §7.5.2). Pure ASCII, so it
 * survives the lossy UTF-8 text projection a RepoSnapshot holds for a binary payload — a PURE gate
 * can therefore classify a payload from snapshot TEXT alone, with no byte access. */
export const PDF_MAGIC = "%PDF-";

/** True iff `text` is the (possibly lossy UTF-8) projection of a PDF payload.
 *
 * Deliberately anchored at offset 0 with no leading-whitespace tolerance: the spec requires the
 * header at byte 0, and a permissive scan ("contains %PDF- somewhere") would misclassify an
 * ordinary text/LaTeX source that merely mentions the string — which would send a perfectly
 * quotable payload down the extraction path and turn a valid citation into a fail-closed ERROR. A
 * payload that IS a PDF but violates the spec by prefixing junk is treated as not-a-PDF and
 * matched against its raw bytes: that is the pre-existing behavior (a quote simply will not match),
 * never a false PASS. */
export function isPdfText(text: string): boolean {
  return text.startsWith(PDF_MAGIC);
}

/** Byte-side twin of `isPdfText`, for the edge (`rk refs quote`), which holds real bytes and must
 * not depend on a UTF-8 round-trip to classify them. */
export function isPdfBytes(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (bytes[i] !== PDF_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

/** The extraction sidecar's conventional path for a payload path, in whatever space the caller's
 * path lives (lock-relative `sources/p.pdf` or repo-relative `refs/sources/p.pdf` — the function
 * only appends a suffix, so both work and stay in their own space).
 *
 * Convention: append, never replace, the extension — `p.pdf` -> `p.pdf.extracted.txt`. Appending
 * keeps the payload's own name visibly intact in the sidecar's name (so an operator reading a
 * directory listing can never mistake which payload an extraction belongs to), and makes the map
 * payload->extraction injective even when two payloads differ only by extension. The convention is
 * a DEFAULT, not a constraint: the authoritative extraction path is whatever the lock entry's
 * `extraction.path` records, and the gate reads that field, never this function's output. */
export function extractionPathFor(payloadPath: string): string {
  return `${payloadPath}.extracted.txt`;
}
