// ROLE: Gate 3's answer to "WHICH bytes does a claimed quote get matched against?" (bead rk-we5i,
// P1). For an ordinary text payload the answer is unchanged — the payload itself. For a PDF
// payload the raw bytes are FlateDecode streams in which no sentence of the document appears at
// all, so matching against them can only ever produce a false NOT-FOUND; the answer there is the
// payload's recorded EXTRACTION layer, admitted only when its provenance chain to the payload
// hash is intact. Both of Gate 3's matching sites — the externals half (src/gates/refs.ts checks
// 2-4/6) and the argument-shard half (src/gates/refs-shard-citations.ts check 8) — resolve their
// text through `resolveQuotableText` here, so they can never disagree about which layer is
// authoritative for a given source.
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
      const row = entry as { path?: unknown; sha256?: unknown; extraction?: unknown };
      if (typeof row.path !== "string" || typeof row.sha256 !== "string") {
        return { entries: [], error: `${LOCK_PATH} malformed (each entry needs string path and sha256)` };
      }
      const extraction = readExtractionRecord(row.extraction);
      entries.push({ path: row.path, sha256: row.sha256, ...(extraction ? { extraction } : {}) });
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
 *  2. payload is not a PDF                        -> the payload's own text, layer `raw`. This is
 *     the pre-rk-we5i behavior verbatim for every text source.
 *  3. lock unreadable                             -> not resolvable (no chain can be checked).
 *  4. no / ambiguous lock entry for the payload   -> not resolvable.
 *  5. payload has no raw-byte hash fact           -> not resolvable (the chain's left end is
 *     unmeasurable; cannot happen for a present file at the real edge, but never assumed).
 *  6. payload's hash != `entry.sha256`, the ADOPTED PIN -> not resolvable. The payload-swap case
 *     (2026-08-14 review P1-1): checked before anything about the extraction, because a
 *     re-chained sidecar makes every later check pass on bytes nobody adopted.
 *  7. no `extraction` recorded                    -> not resolvable — THE headline state: a PDF
 *     source is quotable only once an extraction layer exists.
 *  8. extraction file absent from the snapshot    -> not resolvable.
 *  9. chain broken (`extraction.payload_sha256` != payload's CURRENT hash) -> not resolvable. The
 *     stale-extraction case: the payload moved and the extraction did not.
 * 10. extraction file's own hash != `extraction.sha256` -> not resolvable. The tampered/rewritten-
 *     extraction case: the payload never moved, the derived text did.
 * 11. otherwise                                   -> the extraction's text, layer `extraction`.
 *
 * Note on 6/9/10: every digest is compared case-insensitively and BOTH sides must be well-formed
 * 64-hex; a malformed digest (in the record OR in the pin) is a broken chain, never a skipped
 * comparison. */
export function resolveQuotableText(snapshot: RepoSnapshot, lock: LockFacts, refsPath: string): ResolvedText {
  const payloadText = snapshot.get(refsPath);
  if (payloadText === undefined) {
    return { ok: false, reason: `refs file ${refsPath} ABSENT — a claimed VERBATIM refs quote cannot be byte-verified` };
  }
  if (!isPdfText(payloadText)) return { ok: true, text: payloadText, layer: "raw", path: refsPath };

  const label = `refs file ${refsPath} is a PDF payload`;
  if (lock.error !== undefined) {
    return { ok: false, reason: `${label}; its extraction layer cannot be resolved: ${lock.error}` };
  }
  if (!refsPath.startsWith("refs/")) {
    return { ok: false, reason: `${label} outside refs/ — no lock entry can pin it` };
  }
  const relative = refsPath.slice("refs/".length);
  const matches = lock.entries.filter((e) => e.path === relative);
  if (matches.length !== 1) {
    const reason = matches.length === 0 ? "has no entry" : `has ${matches.length} ambiguous entries`;
    return { ok: false, reason: `${label} but ${LOCK_PATH} ${reason} for ${relative} — no extraction layer can be chained to it` };
  }
  const entry = matches[0]!;

  // THE ADOPTED PIN, checked HERE and not only in the callers (2026-08-14 Tier A review, finding
  // P1-1). Gate 3's two halves disagreed about this: refs-shard-citations.ts pin-checks a claim
  // before calling this resolver, refs.ts's externals half never does. The reviewer's exploit rides
  // the second path — replace an adopted PDF payload, then run `rk refs quote`, which sees a stale
  // chain and re-chains a FRESH sidecar to the replacement's hash. Every chain check below then
  // passes on bytes that were never adopted, and the externals half byte-verifies a quote against
  // them. A single validity core has to answer "which bytes?" with "the bytes that were ADOPTED",
  // so the comparison lives here too — defense in depth, not a duplicate of the caller's check.
  const payloadSha = fileSha256(snapshot, refsPath);
  if (payloadSha === undefined) {
    return { ok: false, reason: `${label} present but carrying no raw-byte sha256 fact — its extraction chain cannot be checked` };
  }
  if (!sameDigest(entry.sha256, payloadSha)) {
    return {
      ok: false,
      reason:
        `${label} whose bytes VIOLATE their adopted pin in ${LOCK_PATH}: the lock pins sha256 ` +
        `${entry.sha256} but the payload on disk hashes ${payloadSha}. Re-chaining an extraction to ` +
        `the replacement bytes cannot repair this — the quotable text of a source is the text of the ` +
        `bytes that were ADOPTED, so restore the pinned payload or re-adopt it ('rk refs adopt') and ` +
        `re-verify every quote that cited it`,
    };
  }

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
