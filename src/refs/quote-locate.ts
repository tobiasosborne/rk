// EDGE — fs. Resolves a `rk refs quote <source-id> <pattern>` request against the repo's
// sources.lock.json and dispatches to the pure locator (src/refs/quote.ts). No network: quote
// location only ever reads an already-acquired local payload — `rk refs status`/`add` are what
// put bytes there.
//
// PDF PAYLOADS (bead rk-we5i). A compressed PDF holds its text in FlateDecode streams, so
// searching its raw bytes returns pattern-not-found for sentences that are plainly in the
// document (observed on RVW math/0406038, RV TR05-092, JMRW 2209.07024 — even "spectral gap"
// missed). For a PDF payload this module therefore searches the payload's EXTRACTION layer, which
// it produces on demand (`marker`/`pdftotext -layout`) and records in sources.lock.json chained to
// the payload hash. The emitted anchor still names the PAYLOAD path — that is the hash-pinned
// artifact Gate 3 verifies against — with the line number indexing the extraction layer, which is
// exactly how `src/gates/refs-extraction.ts` resolves it back. Emitting the sidecar's own path
// instead would anchor the citation to an unpinned derived file.

import { join } from "node:path";
import { locateQuote } from "./quote";
import { parseLockFile } from "./lock";
import { assertSafeRelPath } from "./path-safety";
import { isPdfBytes } from "./pdf";
import { ensureExtraction } from "./extraction-store";
import { sha256Bytes } from "./hash";
import type { Which } from "./extract";
import type { LockFileEntry, QuoteResult, SourceId } from "../types";

/** One payload's searchable text, or the visible reason there is none. */
type Searchable = { text: string; extraction?: { path: string; regenerated: boolean } } | { skipReason: string };

async function searchableText(repoRoot: string, lockPath: string, entry: LockFileEntry, bytes: Uint8Array, which?: Which): Promise<Searchable> {
  if (!isPdfBytes(bytes)) return { text: new TextDecoder().decode(bytes) };
  const result = await ensureExtraction(repoRoot, lockPath, entry, sha256Bytes(bytes), which);
  if (result.status === "skipped") return { skipReason: `refs/${entry.path}: ${result.reason}` };
  return { text: result.text, extraction: { path: result.path, regenerated: result.regenerated } };
}

/** Locates `pattern` in the local payload(s) recorded for `sourceId` in
 * `<repoRoot>/refs/manifest/sources.lock.json`. Returns null if the source-id is known and its
 * payload is present but the pattern is not found in it. Throws (not a silent null) when the
 * source-id is unknown to the manifest, when it is known but no payload file for it exists
 * on disk yet, or when every present payload is a PDF that could not be extracted — all three are
 * actionable-by-the-user states, not "no match" states. That last case is the L2 rule applied
 * here: a payload rk could not read is never allowed to look like a payload that does not contain
 * the pattern. */
export async function locateQuoteInRepo(
  repoRoot: string,
  sourceId: SourceId,
  pattern: string,
  which?: Which,
): Promise<QuoteResult | null> {
  const lockPath = join(repoRoot, "refs", "manifest", "sources.lock.json");
  // rk-p1p4a: no manifest at all is still a FAILED quote (a byte-verifiable quote was asked for and
  // cannot be produced) — but the reason an operator gets must be the actionable one, not the raw
  // ENOENT string this line used to surface from `.text()`.
  if (!(await Bun.file(lockPath).exists())) {
    throw new Error(
      `refs are not adopted in this repo — no refs/manifest/sources.lock.json, so no source-id ` +
        `(including '${sourceId}') is registered. Run 'rk refs add <locator> --id <source-id>', or ` +
        `'rk refs adopt <path-under-refs/> --source <locator>' for a payload already on disk.`,
    );
  }
  const lock = parseLockFile(await Bun.file(lockPath).text());
  const entries = lock.files.filter((f) => f.source_id === sourceId);
  if (entries.length === 0) {
    throw new Error(
      `rk refs quote: unknown source-id '${sourceId}' — not found in refs/manifest/sources.lock.json. ` +
        `Run 'rk refs add <locator>' to register it, or 'rk refs status' to list known source-ids.`,
    );
  }
  let anyPresent = false;
  let anySearched = false;
  const skipped: string[] = [];
  for (const entry of entries) {
    // rk-correct divergence from fetch-refs.py (see src/refs/path-safety.ts header).
    assertSafeRelPath(entry.path);
    const relPath = `refs/${entry.path}`;
    const absPath = join(repoRoot, relPath);
    const file = Bun.file(absPath);
    if (!(await file.exists())) continue;
    anyPresent = true;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const searchable = await searchableText(repoRoot, lockPath, entry, bytes, which);
    if ("skipReason" in searchable) {
      skipped.push(searchable.skipReason);
      continue;
    }
    anySearched = true;
    const located = locateQuote(searchable.text, pattern);
    if (located !== null) {
      return {
        sourceId,
        path: relPath,
        line: located.line,
        quote: located.quote,
        ...(searchable.extraction ? { extraction: searchable.extraction } : {}),
      };
    }
  }
  if (!anyPresent) {
    throw new Error(
      `rk refs quote: source-id '${sourceId}' is known but its payload is absent locally ` +
        `(${entries.map((e) => `refs/${e.path}`).join(", ")}). Run 'rk refs status' then ` +
        `'rk refs add' or set RK_REFS_CACHE to restore it before quoting.`,
    );
  }
  // Reached only when NO payload yielded a match. If any payload could not be searched at all, a
  // bare "pattern not found" would be a claim about the source when it is really a fact about the
  // toolchain — L2's "a skip is always visible" applied to the acquisition side. Note `anySearched`
  // is deliberately not consulted: one unsearchable payload poisons the negative answer even when
  // its siblings searched cleanly.
  if (skipped.length > 0) {
    throw new Error(
      `rk refs quote: '${sourceId}' has ${skipped.length} payload(s) that could not be searched, so ` +
        `'pattern not found' would be a statement about rk's toolchain, not about the source` +
        `${anySearched ? ` (the other payload(s) were searched and did not contain it)` : ""}. ` +
        `Install 'pdftotext' (poppler-utils) or 'marker', then re-run. Details: ${skipped.join("; ")}`,
    );
  }
  return null;
}
