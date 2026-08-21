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
import { checkReview, checkSourceBinding, checkStaleness } from "./refs-records-binding";
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
 * stopped. Lowercase-initial continuation is the general rule; these are the capitalised forms of
 * the same thing, which the general rule cannot see. */
const CONTINUATION_WORDS = ["where", "assume", "assuming", "suppose", "such that", "provided", "here", "with the", "moreover", "further", "in addition", "and if", "if in addition"];

/** A line that begins a NEW labelled block, i.e. an accepted terminator for the statement above
 * it: a theorem-environment label, a LaTeX sectioning/environment command, or a numbered heading.
 * Case-sensitive on the words because these are printed labels, and a lowercase `proof.` is
 * caught by the lowercase-continuation rule instead — fail-closed, and repaired by extending the
 * range or fixing the extraction. */
const NEW_BLOCK_RE = /^(Proof|Theorem|Lemma|Proposition|Corollary|Definition|Remark|Example|Claim|Fact|Notation|Conjecture|Problem|Question|Algorithm|Table|Figure|Appendix|References|Acknowledg)|^\\(section|subsection|subsubsection|chapter|part|paragraph|begin|end)\b|^\d+(\.\d+)*\.?\s+\S/;

export interface EnvelopeProblem {
  code: string;
  message: string;
}

/** THE STATEMENT ENVELOPE (Tier A review 2026-08-20, landing-blocker BL2). The pre-repair check
 * looked only at the line AFTER the range, so three omissions passed cleanly: a hypothesis printed
 * on the line ABOVE the range's first line ("Theorem 1.2. Assume d-regular." / "Then every widget
 * is round.", ranged from the second line), a CAPITALISED continuation, and a range running to
 * EOF. The envelope now fails closed at both ends.
 *
 * START, and it is mechanical rather than heuristic: the range's first line must contain the
 * record's own `result_label`. A statement begins at its label; a range that begins below the
 * label has, by construction, dropped whatever the label line carried — which in real papers is
 * exactly where the hypotheses live.
 *
 * END, three accepted terminators and nothing else:
 *   1. the next non-empty line begins a new labelled block (NEW_BLOCK_RE) — with or without a
 *      blank line before it;
 *   2. a BLANK line, then a capitalised sentence that is not one of CONTINUATION_WORDS;
 *   3. end of the quotable text, ONLY when the source's L0 record declares `ends_at_eof` for this
 *      exact `result_label` — an author's explicit, reviewable statement that the paper really
 *      does end there, rather than the gate assuming it.
 * Anything else — a lowercase continuation, a capitalised continuation word, a capitalised
 * sentence NOT separated by a blank line, or an undeclared EOF — is an ERROR.
 *
 * REMAINING HEURISTIC RESIDUE, stated honestly. Terminator (2) is the soft one: a genuine
 * continuation that is capitalised, not in the word list, and separated by a blank line still
 * passes (a display equation set off by blank lines, then "Then the conclusion holds", is the
 * realistic shape). Terminator (1) can also be spoofed by a paper whose next block label happens
 * to follow a truncation. The START rule and the EOF rule are mechanical and not heuristic at all;
 * what is left heuristic is strictly less than before, and clause (d)'s reviewer — who is shown
 * the whole range — remains the semantic backstop. `refs-23`, `refs-34`, `refs-35` and `refs-36`
 * pin the four caught shapes. */
export function envelopeProblem(
  lines: string[],
  range: Range,
  resultLabel: string,
  endsAtEofDeclared: boolean,
): EnvelopeProblem | undefined {
  const firstLine = lines[range.from - 1] ?? "";
  if (!firstLine.includes(resultLabel)) {
    return {
      code: "range-start-unlabelled",
      message:
        `statement_range starts at line ${range.from}, which does not contain the record's own ` +
        `result_label ${JSON.stringify(resultLabel)}: ${JSON.stringify(firstLine.slice(0, 60))}. A statement ` +
        "begins at its label, and a range that begins below the label has by construction dropped whatever " +
        "the label line carried — in real papers that is exactly where the hypotheses are printed. Extend " +
        "the range up to the label line and restate statement_verbatim",
    };
  }

  let idx = -1;
  for (let i = range.to; i < lines.length; i++) {
    if (lines[i]!.trim() !== "") {
      idx = i;
      break;
    }
  }
  if (idx === -1) {
    if (endsAtEofDeclared) return undefined;
    return {
      code: "range-ends-at-eof",
      message:
        `statement_range ends at line ${range.to}, the end of the quotable text, and nothing follows it to ` +
        "show the statement ended there — a truncated extraction of a longer document is indistinguishable " +
        "from a complete one at EOF. If the source really does end here (a page-bounded extraction, a final " +
        `result), declare it in the source's L0 record: {"ends_at_eof": {${JSON.stringify(resultLabel)}: true}}, ` +
        "which is an author statement a reviewer can check rather than an assumption this gate makes",
    };
  }

  const line = lines[idx]!.trim();
  if (NEW_BLOCK_RE.test(line)) return undefined;
  const lower = line.toLowerCase();
  const continuationWord = CONTINUATION_WORDS.some((w) => lower.startsWith(w));
  const blankSeparated = idx > range.to;
  if (blankSeparated && !continuationWord && /^[A-Z]/.test(line)) return undefined;

  const why = continuationWord
    ? "begins with a continuation word"
    : /^[a-z]/.test(line)
      ? "begins lowercase"
      : "is not separated from the statement by a blank line and begins no new labelled block";
  return {
    code: "statement-range-truncated",
    message:
      `statement_range appears to stop before the printed statement ends: the next non-empty line ` +
      `(line ${idx + 1}) ${why}: ${JSON.stringify(line.slice(0, 60))}. A range that stops short hides whatever ` +
      "it excludes from both the reviewer and clause (c), which is exactly how a hypothesis goes missing. " +
      "Extend the range to the end of the statement (including its where/assume clauses) and restate " +
      "statement_verbatim. The accepted terminators are a new labelled block, or a blank line followed by a " +
      "capitalised non-continuation sentence; see the Gate 3 contract for what this cannot see",
  };
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
          const declared = records.l0.get(record.sourceId)?.endsAtEof?.[record.resultLabel] === true;
          const problem = envelopeProblem(lines, range, record.resultLabel, declared);
          if (problem !== undefined) {
            findings.push(recordError(record.path, problem.code, `${record.statementRange}: ${problem.message}`));
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

    // BL1: every payload this record anchors — the statement range, every hypothesis anchor, and
    // the L0 standing-assumptions range it leans on — must be attributed by the lock to the
    // record's own source.
    const anchoredPaths: string[] = [];
    if (range) anchoredPaths.push(range.sourcePath);
    for (const hypothesis of record.hypotheses) {
      const hm = LINE_ANCHOR_RE.exec(hypothesis.anchor);
      if (hm) anchoredPaths.push(hm[1]!);
    }
    if (standing) anchoredPaths.push(standing.sourcePath);
    findings.push(...checkSourceBinding(record, anchoredPaths, lock));
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
