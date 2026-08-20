// PURITY: pure — no fs/network/clock (L3). Gate 3 Check 11, VERIFICATION HALF (bead rk-nsex;
// docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md section 4; docs/gate-contracts.md Gate 3
// Check 11). Given the shape-valid records ./refs-records.ts discovered, this module answers the
// only question that matters about them: does the record actually say what the SOURCE says?
//
// Five clauses, each its own ERROR code (all structural — admission is phase-independent):
//   (a) every anchor verifies under Gate 3 Check 8's exact rule (./refs-anchor.ts, shared with the
//       argument-shard citation check — never re-derived here);
//   (b) `statement_verbatim` equals the bytes of `statement_range`, exactly;
//   (c) every hypothesis anchor lies INSIDE `statement_range`, or inside the L0 record's declared
//       `standing_assumptions_range` (real papers hoist standing hypotheses out of the theorem
//       environment; pretending otherwise would force an author to either lie about the anchor or
//       drop the hypothesis);
//   (d) a review record exists, is bound to THESE bytes (`card_sha256` == the canonical record
//       digest), and says VALID with no self-contradicting clause;
//   (e) the record's `payload_sha256`/`extraction_sha256` still match what the lock adopts —
//       otherwise the paper (or its extraction) moved under the record and every line number in it
//       is suspect (`stale-record` / `stale-extraction`).
//
// WHAT (a)-(c) BUY, HONESTLY. They cannot read mathematics. What they establish is that the
// reviewer of clause (d) was shown the COMPLETE printed statement rather than the author's
// selection from it: an omitted hypothesis is then a visible translation error rather than a
// silent gap. The range-extent heuristic below is the one clause that tries to catch a truncated
// range mechanically; its limits are stated at its own definition and in the Gate 3 contract.

import type { Finding } from "./framework";
import { verifyAnchor } from "./refs-anchor";
import type { LockFacts } from "./refs-extraction";
import { resolveQuotableText } from "./refs-extraction";
import { checkReview, checkStaleness } from "./refs-records-binding";
import { LINE_ANCHOR_RE, RANGE_ANCHOR_RE, recordError, type L1Record, type RecordSet } from "./refs-records";
import type { RepoSnapshot } from "./snapshot";

export interface RecordVerifyResult {
  findings: Finding[];
  /** L1 record files discovered (the denominator). */
  records: number;
  /** Records carrying a hash-matching VALID review. */
  reviewedValid: number;
  /** Anchors byte-verified: one per verified statement range plus one per verified hypothesis. */
  anchorsVerified: number;
  /** Record path -> the record, for every record that passed EVERY clause above. The card->shard
   * join (Check 12) admits a shard only against one of these: a record that failed any clause is
   * not a weaker record, it is not a record. */
  usable: Map<string, L1Record>;
}

export interface Range {
  sourcePath: string;
  from: number;
  to: number;
}

export function parseRange(anchor: string): Range | undefined {
  const m = RANGE_ANCHOR_RE.exec(anchor);
  if (!m) return undefined;
  const from = Number(m[2]!);
  const to = Number(m[3]!);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from > to) return undefined;
  return { sourcePath: m[1]!, from, to };
}

/** Words a following line starts with when the printed statement did NOT end where the range
 * stopped. Lowercase-initial continuation is the general rule; these are the capitalized forms of
 * the same thing, which the general rule cannot see. */
const CONTINUATION_WORDS = ["where", "assume", "assuming", "suppose", "such that", "provided", "here", "with the"];

/** THE RANGE-EXTENT HEURISTIC, AND IT IS A HEURISTIC (campaign memo section 4; residual recorded
 * on bead rk-nsex for the next milestone review). A deliberately short `statement_range` that
 * stops before the statement's "where ..." clause satisfies clauses (a)-(c) perfectly: every
 * anchor is real, the verbatim matches, and the omitted hypothesis is simply outside the range no
 * anchor points into. The only mechanical trace left is the SOURCE TEXT immediately after the
 * range: a statement that ended does not continue "where G is d-regular".
 *
 * The rule: the first non-empty line after the range must not begin with a lowercase letter, and
 * must not begin (case-insensitively) with one of CONTINUATION_WORDS.
 *
 * What it cannot do, stated plainly rather than implied: it does not detect a range truncated at a
 * sentence boundary (a statement whose second sentence is a separate hypothesis), and it will fire
 * on a genuinely complete statement whose next line happens to start lowercase (a wrapped display
 * equation, a lowercase symbol beginning the proof). The false positive is repaired by extending
 * the range and re-stating `statement_verbatim`; the false negative is what clause (d)'s human
 * reviewer is for. It is a tripwire on the cheapest omission, not a proof of completeness. */
function extentProblem(lines: string[], range: Range): string | undefined {
  for (let i = range.to; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "") continue;
    const lower = line.toLowerCase();
    if (/^[a-z]/.test(line)) return `the next non-empty line (line ${i + 1}) begins lowercase: ${JSON.stringify(line.slice(0, 60))}`;
    for (const word of CONTINUATION_WORDS) {
      if (lower.startsWith(word)) return `the next non-empty line (line ${i + 1}) begins ${JSON.stringify(line.slice(0, 60))}`;
    }
    return undefined;
  }
  return undefined;
}

/** Verifies every shape-valid L1 record against its source and its review. */
export function verifyRecords(snapshot: RepoSnapshot, lock: LockFacts, records: RecordSet): RecordVerifyResult {
  const findings: Finding[] = [];
  const usable = new Map<string, L1Record>();
  let reviewedValid = 0;
  let anchorsVerified = 0;

  for (const record of records.l1) {
    const before = findings.length;
    const range = parseRange(record.statementRange);
    const resolved = range ? resolveQuotableText(snapshot, lock, range.sourcePath) : undefined;

    if (!range) {
      findings.push(recordError(record.path, "statement-range-unverified", `statement_range ${record.statementRange} is not a resolvable refs/<path>:<from>-<to> range (from <= to)`));
    } else if (!resolved || !resolved.ok) {
      findings.push(recordError(record.path, "statement-range-unverified", `statement_range ${record.statementRange} cannot be byte-verified: ${resolved && !resolved.ok ? resolved.reason : "unresolved"}`));
    } else {
      const lines = resolved.text.split(/\r?\n/);
      if (range.to > lines.length) {
        findings.push(
          recordError(
            record.path,
            "statement-range-unverified",
            `statement_range ${record.statementRange} ends past the end of ${resolved.path} (${lines.length} lines)`,
          ),
        );
      } else {
        const bytes = lines.slice(range.from - 1, range.to).join("\n");
        if (bytes !== record.statementVerbatim) {
          findings.push(
            recordError(
              record.path,
              "statement-verbatim-mismatch",
              `statement_verbatim does not equal the bytes of ${record.statementRange} (lines ${range.from}-${range.to} of ` +
                `${resolved.path}): the record's copy of the statement is not the source's statement. Recorded ` +
                `${JSON.stringify(record.statementVerbatim.slice(0, 80))}, source has ${JSON.stringify(bytes.slice(0, 80))}`,
            ),
          );
        } else {
          anchorsVerified += 1;
          const problem = extentProblem(lines, range);
          if (problem !== undefined) {
            findings.push(
              recordError(
                record.path,
                "statement-range-truncated",
                `statement_range ${record.statementRange} appears to stop before the printed statement ends: ${problem}. ` +
                  "A range that stops short hides whatever it excludes from both the reviewer and clause (c), which is " +
                  "exactly how a hypothesis goes missing. Extend the range to the end of the statement (including its " +
                  "where/assume clauses) and restate statement_verbatim. This check is a heuristic: see the Gate 3 " +
                  "contract for what it cannot see",
              ),
            );
          }
        }
      }
    }

    const l0 = records.l0.get(record.sourceId);
    const standing = l0?.standingAssumptionsRange ? parseRange(l0.standingAssumptionsRange) : undefined;
    for (const hypothesis of record.hypotheses) {
      const label = `record anchor ${hypothesis.anchor}`;
      const message = verifyAnchor(snapshot, lock, anchorClaim(hypothesis.anchor, hypothesis.text), label);
      if (message !== undefined) {
        findings.push(recordError(record.path, "anchor-unverified", `${message} (hypothesis ${JSON.stringify(hypothesis.text.slice(0, 60))})`));
        continue;
      }
      anchorsVerified += 1;
      const m = LINE_ANCHOR_RE.exec(hypothesis.anchor)!;
      const anchorPath = m[1]!;
      const line = Number(m[2]!);
      const inStatement = range !== undefined && anchorPath === range.sourcePath && line >= range.from && line <= range.to;
      const inStanding = standing !== undefined && anchorPath === standing.sourcePath && line >= standing.from && line <= standing.to;
      if (!inStatement && !inStanding) {
        findings.push(
          recordError(
            record.path,
            "hypothesis-outside-statement",
            `hypothesis anchored at ${hypothesis.anchor} lies outside statement_range ${record.statementRange}` +
              (l0?.standingAssumptionsRange ? ` and outside the L0 standing_assumptions_range ${l0.standingAssumptionsRange}` : " and no L0 standing_assumptions_range is declared") +
              " — a hypothesis the statement does not contain is either mis-anchored or belongs to a different result",
          ),
        );
      }
    }

    findings.push(...checkStaleness(record, range, lock));
    const review = checkReview(record, records);
    findings.push(...review.findings);
    if (review.valid) reviewedValid += 1;
    if (findings.length === before) usable.set(record.path, record);
  }

  return { findings, records: records.discoveredL1.length, reviewedValid, anchorsVerified, usable };
}

function anchorClaim(anchor: string, text: string): { sourcePath: string; locusText: string; quote: string } {
  const m = LINE_ANCHOR_RE.exec(anchor)!;
  return { sourcePath: m[1]!, locusText: m[2]!, quote: text };
}
