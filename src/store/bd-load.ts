// EDGE — fs. Reads `.beads/issues.jsonl` directly (the committed export snapshot bd's own git
// hooks maintain, per CLAUDE.md rule 10: "bd's issues.jsonl shape counts as compat surface too")
// for the registry↔bd join (PRD C5). One JSON object per line; a bd export mixes real issue
// records with `bd remember` memory records (`{"_type":"memory", ...}`, no `id`/`issue_type`) —
// this reader keeps only rows that carry both `id` and `issue_type` (a real issue), silently
// skipping memory rows (they are not, and were never meant to be, part of the registry↔bd join
// surface — a memory row has no analogue on the registry side at all).
//
// Absence of `.beads/issues.jsonl` is a legitimate, distinct state (not every repo this tool
// projects over uses bd) — reported as an empty, present:false result, never conflated with "bd
// is present but has zero issues".
//
// LB4 (2026-08-03 M3-close review): A LINE THAT DOES NOT PARSE IS STRUCTURAL LOSS, NOT A SKIP.
// This reader used to `continue` past a JSON parse failure with no record of it anywhere — a
// truncated `.beads/issues.jsonl` line silently dropped its registry↔bd edge and the build still
// reported `isStructurallyComplete === true`, while `src/store/fr-load.ts`'s IDENTICALLY-SHAPED
// defect (`malformedLines`) has been first-class since M2. Same fault, two different answers. Now
// `malformedLines` mirrors fr's field one-for-one (`{lineNo, snippet}`) and flows into
// `BuildDiagnostics.structuralLoss.bdMalformedLines`, so `rk render`/`rk graph` refuse and name
// it and Gate 7's edge regeneration counts it.
//
// The DELIBERATE skips stay skips and are counted, never conflated with loss: a `bd remember`
// memory row (`{"_type":"memory", ...}`) and any other well-formed row that is not an issue have
// no analogue on the registry side at all. `totalRecords` is the denominator that makes both
// visible — see its own doc comment for the accounting identity it now carries.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BdSourceRecord } from "../graph/from-bd";

export interface BdSource {
  present: true;
  /** Every non-blank line in the file. LOAD-BEARING (LB4): the exact accounting identity
   * `totalRecords === issues.length + skippedNonIssueRows + malformedLines.length` holds by
   * construction and is asserted in test/store/bd-load.test.ts — so no line can be silently
   * dropped into neither bucket, and a reader can always reconcile what the file contained
   * against what the join actually saw (CLAUDE.md L2). Before LB4 this field was written and
   * never read by anything but its own unit test. */
  totalRecords: number;
  /** Well-formed lines that are not issue rows: `bd remember` memory rows, and any other object
   * lacking `id`/`issue_type`. A legitimate, counted skip — never structural loss. */
  skippedNonIssueRows: number;
  /** Lines whose JSON does not parse — STRUCTURAL LOSS, mirroring `src/store/fr-load.ts`'s field
   * of the same name one-for-one (`lineNo` 1-based, `snippet` truncated to 120 chars). */
  malformedLines: { lineNo: number; snippet: string }[];
  issues: BdSourceRecord[];
}
export interface BdAbsent {
  present: false;
  reason: string;
}

export function loadBdSource(root: string): BdSource | BdAbsent {
  let text: string;
  try {
    text = readFileSync(join(root, ".beads", "issues.jsonl"), "utf8");
  } catch {
    return { present: false, reason: "no .beads/issues.jsonl found" };
  }
  const issues: BdSourceRecord[] = [];
  const malformedLines: { lineNo: number; snippet: string }[] = [];
  let total = 0;
  let skippedNonIssueRows = 0;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim().length === 0) continue;
    total += 1;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // LB4: structural loss, not a skip — same shape as fr's malformed log line.
      malformedLines.push({ lineNo: i + 1, snippet: line.slice(0, 120) });
      continue;
    }
    if (typeof rec.id !== "string" || typeof rec.issue_type !== "string") {
      skippedNonIssueRows += 1; // a `bd remember` memory row, or any other non-issue object
      continue;
    }
    issues.push({ id: rec.id, status: typeof rec.status === "string" ? rec.status : undefined });
  }
  return { present: true, totalRecords: total, skippedNonIssueRows, malformedLines, issues };
}
