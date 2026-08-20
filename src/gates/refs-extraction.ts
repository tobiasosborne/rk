// ROLE: Gate 3's answer to "WHICH bytes does a claimed quote get matched against?" (bead rk-we5i,
// P1; extended by rk-r0j3). The answer is always "the bytes that were ADOPTED": every payload,
// whatever its kind, must resolve to exactly one sources.lock.json entry whose pin it satisfies
// before any text is handed back. For an ordinary text payload that adopted text is the payload
// itself. For a PDF payload the raw bytes are FlateDecode streams in which no sentence of the
// document appears at all, so matching against them can only ever produce a false NOT-FOUND; the
// answer there is the payload's recorded EXTRACTION layer, admitted only when its provenance chain
// to the payload hash is intact. Both of Gate 3's matching sites — the externals half
// (src/gates/refs.ts checks 2-4/6) and the argument-shard half (src/gates/refs-shard-citations.ts
// check 8) — resolve their text through `resolveQuotableText` here, so they can never disagree
// about which bytes are authoritative for a given source.
//
// FAIL-CLOSED, ALWAYS. Every way the extraction layer can be missing, unrecorded, unreadable,
// stale, or tampered with resolves to `{ ok: false }` with a reason — never to "fall back to the
// raw payload bytes" and never to "assume it matched". A caller turns `ok: false` into a counted,
// visible ERROR: the claim lands in the coverage DENOMINATOR and never in the numerator (L2 — a
// skip is always visible with a count). Admitting a quote on a PDF whose extraction is stale would
// be strictly worse than the bug this module fixes: it would verify a citation against text the
// current source no longer contains.
//
// PURITY: pure — no fs/network/clock (L3). Payload text, extraction text, and raw-byte hashes all
// arrive via RepoSnapshot; nothing here reads a file or shells out to an extractor.

import { fileSha256, type RepoSnapshot } from "./snapshot";
import { isPdfText } from "../refs/pdf";
import type { ExtractionRecord } from "../types";

export const LOCK_PATH = "refs/manifest/sources.lock.json";
const FULL_SHA256_RE = /^[0-9a-fA-F]{64}$/;

export interface LockEntryFacts {
  /** Lock-relative path, exactly as recorded (`sources/paper.pdf`). */
  path: string;
  sha256: string;
  /** `files[].source_id` when the lock records one (rk-5lzf B1). The ONLY mechanical answer to
   * "which source owns this payload path": a notation translation row names a source-id and an
   * anchored path, and without this the two are unrelated strings, so a genuine quote from paper
   * A could be filed under paper B's name with every byte check still passing. Absent is a real
   * state (older locks) and is FAIL-CLOSED at the consumer: ownership unproven is not ownership. */
  sourceId?: string;
  extraction?: ExtractionRecord;
}

export interface LockFacts {
  entries: LockEntryFacts[];
  /** Set iff the lock is absent/unparseable/malformed. Any consumer must treat a set `error` as
   * "nothing is hash-pinned" — never as "no constraints apply". */
  error?: string;
}

/** Reads `refs/manifest/sources.lock.json` out of the snapshot into the flat facts Gate 3 needs.
 * Structural strictness is deliberate and total: one bad `files[]` entry invalidates the WHOLE
 * lock rather than being skipped, because a partially-read hash authority cannot distinguish "this
 * source has no pin" from "this source's pin was in the part we could not read". */
export function readLockFacts(snapshot: RepoSnapshot): LockFacts {
  const raw = snapshot.get(LOCK_PATH);
  if (raw === undefined) return { entries: [], error: `${LOCK_PATH} absent` };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || !Array.isArray((parsed as { files?: unknown }).files)) {
      return { entries: [], error: `${LOCK_PATH} malformed (expected an object with files[])` };
    }
    const entries: LockEntryFacts[] = [];
    for (const entry of (parsed as { files: unknown[] }).files) {
      if (entry === null || typeof entry !== "object") {
        return { entries: [], error: `${LOCK_PATH} malformed (non-object files[] entry)` };
      }
      const row = entry as { path?: unknown; sha256?: unknown; source_id?: unknown; extraction?: unknown };
      if (typeof row.path !== "string" || typeof row.sha256 !== "string") {
        return { entries: [], error: `${LOCK_PATH} malformed (each entry needs string path and sha256)` };
      }
      const extraction = readExtractionRecord(row.extraction);
      entries.push({
        path: row.path,
        sha256: row.sha256,
        ...(typeof row.source_id === "string" && row.source_id.length > 0 ? { sourceId: row.source_id } : {}),
        ...(extraction ? { extraction } : {}),
      });
    }
    return { entries };
  } catch (error) {
    return { entries: [], error: `${LOCK_PATH} unparseable: ${(error as Error).message}` };
  }
}

/** A `files[].extraction` object is accepted only when all four fields are present strings —
 * mirrors `src/refs/lock.ts`'s `parseExtraction`. A partial record is dropped, which for a PDF
 * payload lands on the fail-closed "no extraction recorded" branch rather than on a comparison
 * against `undefined`. */
function readExtractionRecord(raw: unknown): ExtractionRecord | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.path !== "string" || typeof r.sha256 !== "string") return undefined;
  if (typeof r.payload_sha256 !== "string" || typeof r.tool !== "string") return undefined;
  return { path: r.path, sha256: r.sha256, payload_sha256: r.payload_sha256, tool: r.tool };
}

export type QuotableLayer = "raw" | "extraction";

export type ResolvedText =
  | { ok: true; text: string; layer: QuotableLayer; /** repo-relative path of the bytes matched against */ path: string }
  | { ok: false; reason: string };

/** Resolves the repo-relative `refs/<...>` path a citation names to the text its quote must match.
 *
 * Decision order (each step fails closed):
 *  1. payload absent from the snapshot            -> not resolvable (the caller's pre-existing
 *     ABSENT wording is preserved: this is the aism-dbq 19/19 check, unchanged).
 *  2. path outside `refs/`                        -> not resolvable (no lock entry can pin it).
 *  3. lock unreadable/absent/malformed            -> not resolvable — the payload is NOT
 *     HASH-PINNED, whatever its kind (bead rk-r0j3; see the pin block below).
 *  4. no / ambiguous lock entry for the payload   -> not resolvable, same reason.
 *  5. payload has no raw-byte hash fact           -> not resolvable (the pin cannot be checked;
 *     cannot happen for a present file at the real edge, but never assumed).
 *  6. payload's hash != `entry.sha256`, the ADOPTED PIN -> not resolvable. The payload-swap case
 *     (2026-08-14 review P1-1 for PDFs; rk-r0j3 for every other kind).
 *  7. payload is not a PDF                        -> the payload's own text, layer `raw`. Reached
 *     only once steps 2-6 have established that these bytes are the ADOPTED bytes.
 *  8. no `extraction` recorded                    -> not resolvable — THE headline state: a PDF
 *     source is quotable only once an extraction layer exists.
 *  9. extraction file absent from the snapshot    -> not resolvable.
 * 10. chain broken (`extraction.payload_sha256` != payload's CURRENT hash) -> not resolvable. The
 *     stale-extraction case: the payload moved and the extraction did not.
 * 11. extraction file's own hash != `extraction.sha256` -> not resolvable. The tampered/rewritten-
 *     extraction case: the payload never moved, the derived text did.
 * 12. otherwise                                   -> the extraction's text, layer `extraction`.
 *
 * Note on 6/10/11: every digest is compared case-insensitively and BOTH sides must be well-formed
 * 64-hex; a malformed digest (in the record OR in the pin) is a broken chain, never a skipped
 * comparison. */
export function resolveQuotableText(snapshot: RepoSnapshot, lock: LockFacts, refsPath: string): ResolvedText {
  const payloadText = snapshot.get(refsPath);
  if (payloadText === undefined) {
    return { ok: false, reason: `refs file ${refsPath} ABSENT — a claimed VERBATIM refs quote cannot be byte-verified` };
  }
  const isPdf = isPdfText(payloadText);
  // `subject` is kind-neutral (the pin block below applies to every payload kind); `label` adds the
  // PDF qualifier where the message is about the extraction layer, which only PDFs have.
  const subject = `refs file ${refsPath}`;
  const label = isPdf ? `${subject} is a PDF payload` : subject;

  // ---------------------------------------------------------------------------------------------
  // THE ADOPTED PIN — checked for EVERY payload kind, before the PDF/non-PDF split (bead rk-r0j3,
  // P1/Tier A; extends the 2026-08-14 Tier A review's finding P1-1 from PDFs to all payloads).
  //
  // Until rk-r0j3 this function returned `{ ok: true, layer: "raw" }` for any non-PDF payload
  // WITHOUT consulting the lock at all, and Gate 3's externals half (src/gates/refs.ts) performs no
  // pin check of its own — so a text source could be replaced after adoption, or never adopted at
  // all, and its quotes would still "byte-verify" against whatever bytes happened to be on disk.
  // That is the same exploit refs-20 pins for PDFs, one payload kind over (corpus refs-21), plus
  // the weaker no-lock-at-all case (refs-22).
  //
  // The rule is the one the PDF branch and Gate 3's shard-citation half already applied, now
  // stated once for everything: a quote is verified against the text of the bytes that were
  // ADOPTED, so an absent/unreadable lock, a missing or ambiguous entry, a malformed pin, or a pin
  // the payload does not satisfy each resolve to `ok: false` — never to a raw-bytes fallback. A
  // green verdict must mean "matched the adopted source", not "matched today's file".
  // ---------------------------------------------------------------------------------------------
  if (!refsPath.startsWith("refs/")) {
    return { ok: false, reason: `${subject} lies outside refs/ — no ${LOCK_PATH} entry can pin it` };
  }
  if (lock.error !== undefined) {
    return {
      ok: false,
      reason:
        `${subject} is not hash-pinned: ${lock.error} — a claimed VERBATIM quote cannot be verified ` +
        `against bytes no adoption pinned`,
    };
  }
  const relative = refsPath.slice("refs/".length);
  const matches = lock.entries.filter((e) => e.path === relative);
  if (matches.length !== 1) {
    const reason = matches.length === 0 ? "has no entry" : `has ${matches.length} ambiguous entries`;
    return { ok: false, reason: `${subject} is not hash-pinned: ${LOCK_PATH} ${reason} for ${relative}` };
  }
  const entry = matches[0]!;

  const payloadSha = fileSha256(snapshot, refsPath);
  if (payloadSha === undefined) {
    return { ok: false, reason: `${subject} is present but carries no raw-byte sha256 fact — its adopted pin cannot be checked` };
  }
  if (!sameDigest(entry.sha256, payloadSha)) {
    // The re-chaining sentence is PDF-only: it names the specific repair a reader might reach for
    // on a swapped PDF (regenerate the sidecar) and explains why it does not help. On a text
    // payload there is no sidecar, so saying it would be noise.
    const rechain = isPdf ? "Re-chaining an extraction to the replacement bytes cannot repair this. " : "";
    return {
      ok: false,
      reason:
        `${label} whose bytes VIOLATE their adopted pin in ${LOCK_PATH}: the lock pins sha256 ` +
        `${entry.sha256} but the payload on disk hashes ${payloadSha}. ${rechain}The quotable text of a ` +
        `source is the text of the bytes that were ADOPTED, so restore the pinned payload or re-adopt ` +
        `it ('rk refs adopt') and re-verify every quote that cited it`,
    };
  }

  // Only now: these bytes ARE the adopted bytes. A non-PDF payload is its own quotable text (the
  // pre-rk-we5i layer decision, unchanged — what rk-r0j3 changed is WHETHER we get here, not what
  // is returned once we do).
  if (!isPdf) return { ok: true, text: payloadText, layer: "raw", path: refsPath };

  const extraction = entry.extraction;
  if (extraction === undefined) {
    return {
      ok: false,
      reason:
        `${label} with NO extraction layer recorded in ${LOCK_PATH} — a compressed PDF stores its text ` +
        `in binary streams, so no quote can ever be byte-verified against its raw bytes. Run 'rk refs ` +
        `quote' with marker or pdftotext installed to produce and record ${relative}.extracted.txt, or ` +
        `keep the shard at 'stated'`,
    };
  }

  const extractionPath = `refs/${extraction.path}`;
  const extractionText = snapshot.get(extractionPath);
  if (extractionText === undefined) {
    return { ok: false, reason: `${label} whose recorded extraction layer ${extractionPath} is ABSENT — nothing to byte-verify against` };
  }
  if (!sameDigest(extraction.payload_sha256, payloadSha)) {
    return {
      ok: false,
      reason:
        `${label} whose extraction layer ${extractionPath} is STALE: it was produced from payload ` +
        `sha256 ${extraction.payload_sha256}, but the payload's current sha256 is ${payloadSha}. A quote ` +
        `verified against a stale extraction would be checked against text the current source may no ` +
        `longer contain — re-run the extraction`,
    };
  }
  const extractionSha = fileSha256(snapshot, extractionPath);
  if (extractionSha === undefined || !sameDigest(extraction.sha256, extractionSha)) {
    return {
      ok: false,
      reason:
        `${label} whose extraction layer ${extractionPath} does not match its recorded sha256 ` +
        `(recorded ${extraction.sha256}, on disk ${extractionSha ?? "unhashed"}) — the derived text was ` +
        `edited or rewritten after it was recorded`,
    };
  }
  return { ok: true, text: extractionText, layer: "extraction", path: extractionPath };
}

/** Case-insensitive equality of two digests, both of which must be well-formed 64-hex. A malformed
 * digest never compares equal — it is a broken chain, not a skipped check. */
function sameDigest(a: string, b: string): boolean {
  if (!FULL_SHA256_RE.test(a) || !FULL_SHA256_RE.test(b)) return false;
  return a.toLowerCase() === b.toLowerCase();
}
