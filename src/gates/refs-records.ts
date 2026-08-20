// PURITY: pure — no fs/network/clock (L3). Gate 3 Check 11, HALF ONE: discovery and shape
// validation of the extraction records and review records under `refs/records/` (bead rk-nsex;
// docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md section 4; schemas/extraction-record.v1.json,
// schemas/card-review.v1.json). The anchor/range/review VERIFICATION lives next door in
// ./refs-records-verify.ts; this module only answers "what records exist and are they shaped like
// records?" so a malformed file is one named ERROR rather than an exception inside a verifier.
//
// FAIL-CLOSED DISCOVERY. Every `.json` file under `refs/records/` must be classifiable as an L0
// record, an L1 record, or an L1 review record. A file that is not (a typo'd name, a stray
// scratch file, `L1-2.reviewed.json`) is an ERROR, never silently ignored: an unclassified file
// is indistinguishable from a review record the gate failed to notice, and "the review was
// there, we just didn't read it" is precisely the false green this check exists to prevent.

import type { Finding } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import {
  RECORDS_PREFIX,
  isObject,
  recordError,
  validateL0,
  validateL1,
  validateReview,
  type L0Record,
  type L1Record,
  type ReviewRecord,
} from "./refs-records-schema";

export { RECORDS_PREFIX, RANGE_ANCHOR_RE, LINE_ANCHOR_RE, recordError } from "./refs-records-schema";
export type { Hypothesis, L0Record, L1Record, ReviewClause, ReviewRecord } from "./refs-records-schema";

const L1_PATH_RE = /^refs\/records\/([^/]+)\/(L1-[1-9][0-9]*)\.json$/;
const L0_PATH_RE = /^refs\/records\/([^/]+)\/(L0)\.json$/;
const REVIEW_PATH_RE = /^refs\/records\/([^/]+)\/(L1-[1-9][0-9]*)\.review\.json$/;

export interface RecordSet {
  l1: L1Record[];
  l0: Map<string, L0Record>;
  reviews: Map<string, ReviewRecord>;
  findings: Finding[];
  /** Every L1 record path whose file was discovered, INCLUDING ones that failed shape validation —
   * the honest denominator for the coverage line (a record too malformed to verify is still a
   * record the campaign wrote). */
  discoveredL1: string[];
}

type ParseResult = { ok: true; value: Record<string, unknown> } | { ok: false; finding: Finding };

/** Parses one record/review file into an object, or returns the named finding for it. A `Finding`
 * is itself an object, so this is a TAGGED result rather than a `T | Finding` union: `isObject`
 * cannot tell the two apart and a union here would silently treat a parse failure as a record. */
function parseJsonObject(path: string, raw: string, code: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, finding: recordError(path, code, `not valid JSON (${(e as Error).message}) — a record that cannot be parsed backs nothing`) };
  }
  if (!isObject(parsed)) {
    const shape = parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed;
    return { ok: false, finding: recordError(path, code, `expected a JSON object, got ${shape}`) };
  }
  return { ok: true, value: parsed };
}

/** Discovers and shape-validates every record under `refs/records/`. Never throws; every
 * malformation is one named, structural ERROR and the offending file is dropped from the typed
 * result (never half-trusted). */
export function collectRecords(snapshot: RepoSnapshot): RecordSet {
  const findings: Finding[] = [];
  const l1: L1Record[] = [];
  const l0 = new Map<string, L0Record>();
  const reviews = new Map<string, ReviewRecord>();
  const discoveredL1: string[] = [];

  for (const path of [...snapshot.keys()].sort()) {
    if (!path.startsWith(RECORDS_PREFIX)) continue;
    const base = path.slice(path.lastIndexOf("/") + 1);
    if (base === "README.md" || base === ".gitkeep") continue;

    const reviewMatch = REVIEW_PATH_RE.exec(path);
    const l1Match = L1_PATH_RE.exec(path);
    const l0Match = L0_PATH_RE.exec(path);
    if (!reviewMatch && !l1Match && !l0Match) {
      findings.push(
        recordError(
          path,
          "record-unrecognized",
          `file under ${RECORDS_PREFIX} matches no record name — expected <source-id>/L0.json, ` +
            "<source-id>/L1-<n>.json or <source-id>/L1-<n>.review.json. An unclassified file is " +
            "indistinguishable from a review record this gate failed to read",
        ),
      );
      continue;
    }

    const raw = snapshot.get(path)!;
    if (reviewMatch) {
      const recordPath = `${RECORDS_PREFIX}${reviewMatch[1]!}/${reviewMatch[2]!}.json`;
      const parsed = parseJsonObject(path, raw, "review-malformed");
      if (!parsed.ok) {
        findings.push(parsed.finding);
        continue;
      }
      const review = validateReview(path, recordPath, parsed.value);
      if ("severity" in review) findings.push(review as Finding);
      else reviews.set(recordPath, review);
      continue;
    }
    if (l1Match) {
      discoveredL1.push(path);
      const parsed = parseJsonObject(path, raw, "record-unparseable");
      if (!parsed.ok) {
        findings.push(parsed.finding);
        continue;
      }
      const record = validateL1(path, l1Match[1]!, l1Match[2]!, parsed.value);
      if ("severity" in record) findings.push(record as Finding);
      else l1.push(record);
      continue;
    }
    const parsed = parseJsonObject(path, raw, "record-unparseable");
    if (!parsed.ok) {
      findings.push(parsed.finding);
      continue;
    }
    const record = validateL0(path, l0Match![1]!, parsed.value);
    if ("severity" in record) findings.push(record as Finding);
    else l0.set(l0Match![1]!, record);
  }

  return { l1, l0, reviews, findings, discoveredL1 };
}
