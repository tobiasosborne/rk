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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BdSourceRecord } from "../graph/from-bd";

export interface BdSource {
  present: true;
  totalRecords: number;
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
  let total = 0;
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    total += 1;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue; // an unparseable line is skipped, counted in totalRecords regardless
    }
    if (typeof rec.id !== "string" || typeof rec.issue_type !== "string") continue; // a memory row, or malformed
    issues.push({ id: rec.id, status: typeof rec.status === "string" ? rec.status : undefined });
  }
  return { present: true, totalRecords: total, issues };
}
