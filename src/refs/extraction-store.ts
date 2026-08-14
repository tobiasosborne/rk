// EDGE — fs + subprocess (via ./extract.ts). Owns the on-disk half of the extraction layer that
// bead rk-we5i introduces: reading an already-recorded extraction, deciding whether it is still
// bound to the payload, and (when it is not) producing one and recording it in
// refs/manifest/sources.lock.json.
//
// The VALIDITY rule lives once, in the pure `src/gates/refs-extraction.ts`
// (`resolveQuotableText`), which is what Gate 3 enforces. This module must agree with it: an
// extraction is usable iff the file exists, its own sha256 matches what the lock recorded, and
// `extraction.payload_sha256` equals the payload's CURRENT sha256. `extractionState` below is that
// same three-part test evaluated against real bytes rather than a snapshot — deliberately phrased
// as a single small function so the two implementations can be read side by side.
//
// Why the edge may WRITE here: the extraction is a derived artifact of a payload rk already owns,
// stored beside it under refs/ and recorded in the same manifest that pins the payload. Producing
// it is the acquisition-side counterpart of `rk refs add`'s hash+manifest write (PRD C7: "hash,
// extract ..., write manifest row ... SHA256 of payload and extraction"), not a new kind of state.

import { join } from "node:path";
import { parseLockFile, serializeLockFile } from "./lock";
import { assertSafeRelPath } from "./path-safety";
import { extractPdfText, type Which } from "./extract";
import { extractionPathFor } from "./pdf";
import { sha256Bytes } from "./hash";
import type { ExtractionRecord, LockFileEntry } from "../types";

export type ExtractionState =
  | { usable: true; text: string }
  | { usable: false; reason: string };

export type PinCheck = { ok: true } | { ok: false; reason: string };

/** THE ADOPTED PIN, shared by both acquisition-side callers (bead rk-o85b for PDFs, extended to
 * every payload kind by the same review follow-up once rk-r0j3 made Gate 3's
 * `resolveQuotableText` bind the pin for ALL kinds, not just PDFs). Before this check existed,
 * `rk refs quote` would search/extract whatever bytes were currently on disk and emit a "found"
 * anchor for them even when those bytes were never adopted — a payload replaced after adoption,
 * without repinning `entry.sha256` in sources.lock.json, would silently pass here and only be
 * caught LATER by Gate 3 at `rk check` time. Checked on the WRITE/SEARCH side so the refusal (and
 * its remediation) is what an operator sees immediately, and so a PDF swap never gets a fresh
 * sidecar chained to the replacement bytes.
 *
 * `refusal` is the caller-specific tail of what is being refused (e.g. "extract or record an
 * extraction sidecar chained to bytes nobody adopted" for the PDF path, "search or emit a quote
 * anchor for bytes nobody adopted" for the raw-text path) — the pin violation and remediation text
 * is identical either way, only the action differs. The reason string deliberately does NOT
 * include the `refs/<path>: ` prefix `locateQuoteInRepo`'s skip-reporting adds uniformly to every
 * skip reason (both this one and the pre-existing "no extractor installed" ones) — adding it here
 * too would double it for this check specifically, since every caller already prefixes. */
export function checkAdoptedPin(entry: LockFileEntry, payloadSha: string, refusal: string): PinCheck {
  if (entry.sha256.toLowerCase() === payloadSha.toLowerCase()) return { ok: true };
  return {
    ok: false,
    reason:
      `payload on disk (sha256 ${payloadSha}) VIOLATES its adopted pin ${entry.sha256} recorded ` +
      `in sources.lock.json — refusing to ${refusal}. Restore the pinned payload or re-adopt it ` +
      `('rk refs adopt') and re-verify every quote that cited it before quoting again`,
  };
}

/** The edge twin of `resolveQuotableText`'s steps 6-9: is this entry's recorded extraction present,
 * intact, and still bound to these payload bytes? `payloadSha` is the payload's CURRENT digest. */
export async function extractionState(repoRoot: string, entry: LockFileEntry, payloadSha: string): Promise<ExtractionState> {
  const record = entry.extraction;
  if (record === undefined) return { usable: false, reason: "no extraction layer recorded in sources.lock.json" };
  assertSafeRelPath(record.path);
  const abs = join(repoRoot, "refs", record.path);
  const file = Bun.file(abs);
  if (!(await file.exists())) return { usable: false, reason: `recorded extraction refs/${record.path} is absent on disk` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const actual = sha256Bytes(bytes);
  if (actual.toLowerCase() !== record.sha256.toLowerCase()) {
    return { usable: false, reason: `extraction refs/${record.path} was edited since it was recorded (sha256 ${actual} != ${record.sha256})` };
  }
  if (record.payload_sha256.toLowerCase() !== payloadSha.toLowerCase()) {
    return { usable: false, reason: `extraction refs/${record.path} is STALE — produced from payload ${record.payload_sha256}, payload is now ${payloadSha}` };
  }
  return { usable: true, text: new TextDecoder().decode(bytes) };
}

export type EnsureResult =
  | { status: "ready"; text: string; path: string; regenerated: boolean }
  | { status: "skipped"; reason: string };

/** Returns the usable extraction text for `entry`'s payload, producing and recording one when the
 * current record is absent, stale, or edited.
 *
 * Never returns a stale extraction and never falls back to raw payload bytes: when no extractor is
 * installed the result is a VISIBLE skip carrying the reason, which the caller must surface with a
 * count (L2) — the citation then simply cannot be produced/verified, which is the honest state.
 *
 * The write is atomic in the order that matters: the sidecar's bytes land first, then the lock
 * entry naming their digest. A crash between the two leaves an unrecorded file (fail-closed: the
 * gate reports "no extraction layer recorded"), never a record pointing at bytes that do not
 * exist. */
export async function ensureExtraction(
  repoRoot: string,
  lockPath: string,
  entry: LockFileEntry,
  payloadSha: string,
  which?: Which,
): Promise<EnsureResult> {
  // THE ADOPTED PIN, checked BEFORE anything else (bead rk-o85b) — see `checkAdoptedPin` above.
  const pin = checkAdoptedPin(entry, payloadSha, "extract or record an extraction sidecar chained to bytes nobody adopted");
  if (!pin.ok) return { status: "skipped", reason: pin.reason };

  const current = await extractionState(repoRoot, entry, payloadSha);
  if (current.usable) {
    return { status: "ready", text: current.text, path: `refs/${entry.extraction!.path}`, regenerated: false };
  }

  assertSafeRelPath(entry.path);
  const payloadAbs = join(repoRoot, "refs", entry.path);
  // `which` is passed through verbatim: an explicit `undefined` re-selects `extractPdfText`'s own
  // `Bun.which` default (TS default parameters apply on `undefined`), so there is no second
  // default to keep in sync here.
  const extracted = await extractPdfText(payloadAbs, which);
  if (extracted.skipped) {
    return { status: "skipped", reason: `${current.reason}; ${extracted.reason}` };
  }

  const relPath = entry.extraction?.path ?? extractionPathFor(entry.path);
  assertSafeRelPath(relPath);
  const bytes = new TextEncoder().encode(extracted.text);
  await Bun.write(join(repoRoot, "refs", relPath), bytes);
  const record: ExtractionRecord = {
    path: relPath,
    sha256: sha256Bytes(bytes),
    payload_sha256: payloadSha,
    tool: extracted.tool,
  };
  await recordExtraction(lockPath, entry.path, record);
  return { status: "ready", text: extracted.text, path: `refs/${relPath}`, regenerated: true };
}

/** Rewrites `lockPath` with `record` attached to the entry whose `path` is `payloadPath`. Reads the
 * file again immediately before writing (rather than trusting a caller-held parse) so a concurrent
 * `rk refs add` in the same repo cannot be clobbered by a stale in-memory copy. Throws when the
 * payload has no entry — silently inventing one would fabricate a pin. */
async function recordExtraction(lockPath: string, payloadPath: string, record: ExtractionRecord): Promise<void> {
  const lock = parseLockFile(await Bun.file(lockPath).text());
  const target = lock.files.filter((f) => f.path === payloadPath);
  if (target.length !== 1) {
    throw new Error(`cannot record an extraction for '${payloadPath}': ${lockPath} has ${target.length} entries for it, expected exactly 1`);
  }
  target[0]!.extraction = record;
  // No trailing newline: matches how `rk refs add`/`adopt` write this file (add.ts:140,
  // adopt.ts:157), so an extraction record never shows up as a spurious whitespace diff.
  await Bun.write(lockPath, serializeLockFile(lock));
}
