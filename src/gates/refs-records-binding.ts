// PURITY: pure — no fs/network/clock (L3). Gate 3 Check 11, clauses (d) and (e) — the two
// BINDINGS an extraction record carries beyond its own anchors (bead rk-nsex):
//
//   (e) the SOURCE binding — `payload_sha256` / `extraction_sha256` against what
//       refs/manifest/sources.lock.json currently adopts. A record is a set of claims about
//       specific bytes at specific line numbers; when the paper is re-acquired or its text
//       re-extracted, those line numbers silently point somewhere else. Neither `stale-record` nor
//       `stale-extraction` says the record is WRONG — it says nothing in it can be trusted until
//       it is re-checked against the bytes now adopted.
//   (d) the REVIEW binding — an independent review record exists, is bound to THESE canonical
//       bytes, says VALID, and does not contradict its own four clauses.
//
// Split out of ./refs-records-verify.ts at the 280-line shard cap; the driver there calls both.

import type { Finding } from "./framework";
import { canonicalRecordSha256 } from "./canonical-json";
import type { LockFacts } from "./refs-extraction";
import { recordError, type L1Record, type RecordSet } from "./refs-records";
import type { Range } from "./refs-records-verify";

export function checkStaleness(record: L1Record, range: Range | undefined, lock: LockFacts): Finding[] {
  // The payload a record's staleness is measured against is the payload its OWN statement range
  // names — the record's `source` is a source-id and the lock is keyed by path, so the anchor is
  // the only honest join between them.
  if (!range || lock.error !== undefined) return [];
  const relative = range.sourcePath.slice("refs/".length);
  const pins = lock.entries.filter((e) => e.path === relative);
  if (pins.length !== 1) return []; // the anchor check already reports an unpinned/ambiguous payload
  const pin = pins[0]!;
  const findings: Finding[] = [];
  if (pin.sha256.toLowerCase() !== record.payloadSha256.toLowerCase()) {
    findings.push(
      recordError(
        record.path,
        "stale-record",
        `record was extracted from payload sha256 ${record.payloadSha256}, but ${relative} is now adopted at ` +
          `${pin.sha256} — the paper was re-acquired or re-adopted after this record was written, so every ` +
          "line number and every quote in it is a claim about bytes that are no longer the adopted bytes. " +
          "Re-extract and re-review; do not repin the record by hand",
      ),
    );
  }
  const lockExtraction = pin.extraction?.sha256;
  if (lockExtraction === undefined && record.extractionSha256 !== undefined) {
    findings.push(
      recordError(
        record.path,
        "stale-extraction",
        `record names extraction_sha256 ${record.extractionSha256} but ${relative} declares NO extraction layer ` +
          "in refs/manifest/sources.lock.json — the sidecar the anchors were taken against is not the one the " +
          "gate would read",
      ),
    );
  } else if (lockExtraction !== undefined && record.extractionSha256 === undefined) {
    findings.push(
      recordError(
        record.path,
        "stale-extraction",
        `${relative} is quotable only through its extraction layer (sha256 ${lockExtraction}) and the record ` +
          "does not say which extraction it was written against — re-extraction silently renumbers every line, " +
          "so an unrecorded extraction is an unverifiable one",
      ),
    );
  } else if (lockExtraction !== undefined && record.extractionSha256 !== undefined && lockExtraction.toLowerCase() !== record.extractionSha256.toLowerCase()) {
    findings.push(
      recordError(
        record.path,
        "stale-extraction",
        `record was written against extraction sha256 ${record.extractionSha256}, but ${relative}'s adopted ` +
          `extraction layer is now ${lockExtraction} — the text was re-extracted after this record was written ` +
          "and every recorded line number indexes the old sidecar",
      ),
    );
  }
  return findings;
}

export function checkReview(record: L1Record, records: RecordSet): { findings: Finding[]; valid: boolean } {
  const review = records.reviews.get(record.path);
  if (!review) {
    return {
      valid: false,
      findings: [
        recordError(
          record.path,
          "review-absent",
          `no review record at ${record.path.replace(/\.json$/, ".review.json")} — an extraction nobody independently ` +
            "read is an unreviewed translation of a paper, and the card rendered from it would be trusted as if it " +
            "had been reviewed (schemas/card-review.v1.json)",
        ),
      ],
    };
  }
  const digest = canonicalRecordSha256(record.value);
  if (review.cardSha256.toLowerCase() !== digest.toLowerCase()) {
    return {
      valid: false,
      findings: [
        recordError(
          record.path,
          "review-stale",
          `${review.path} is bound to card_sha256 ${review.cardSha256}, but this record's canonical bytes hash ` +
            `${digest} — the record was edited after it was reviewed, so the verdict is about bytes nobody now has. ` +
            "Re-review; do not restamp the hash",
        ),
      ],
    };
  }
  if (review.verdict !== "VALID") {
    return {
      valid: false,
      findings: [
        recordError(record.path, "review-invalid", `${review.path} records verdict ${review.verdict}, not VALID — the record does not back a cited claim`),
      ],
    };
  }
  if (review.falseClauses.length > 0) {
    return {
      valid: false,
      findings: [
        recordError(
          record.path,
          "review-inconsistent",
          `${review.path} says VALID while answering false to: ${review.falseClauses.join(", ")} — a verdict may not ` +
            "be more generous than the reviewer's own clauses",
        ),
      ],
    };
  }
  return { valid: true, findings: [] };
}

