// PURITY: pure — no fs/network/clock (L3). Parsing/formatting/merging the `rk refs snowball`
// triage ledger table (refs/triage.md): one row per paper in a citation closure, `| id | title |
// year | depth | via | triage | reason |`. The generated columns (title/year/depth/via) are
// always refreshed from the latest closure computation; the two AUTHORED columns (triage/reason,
// an operator's own judgement) are preserved verbatim across reruns — CLAUDE.md rule 9,
// "generated vs authored, never mixed." A row for a paper that has fallen out of the current
// closure (a smaller depth/seed-set on a later run) is NEVER deleted — it is kept, unchanged, at
// the end of the table.

import type { ClosureEntry } from "./snowball-closure";

export interface TriageRow {
  id: string;
  title: string;
  year: string;
  depth: string;
  via: string;
  triage: string;
  reason: string;
}

const TABLE_HEADER_MARKER = "| id |";

export const TRIAGE_TABLE_HEADER = [
  "| id | title | year | depth | via | triage | reason |",
  "|----|-------|------|-------|-----|--------|--------|",
];

function splitRow(line: string): string[] {
  return line
    .split("|")
    .map((c) => c.trim())
    .slice(1, -1);
}

/** Parses the triage table out of an existing refs/triage.md. Returns `[]` if the file has no
 * such table (including a brand-new/empty file — a legitimate, non-error state). */
export function parseTriageTable(text: string): TriageRow[] {
  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => l.startsWith(TABLE_HEADER_MARKER));
  if (headerIdx === -1) return [];
  const rows: TriageRow[] = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith("|")) break; // table ends at the first non-table line
    const cells = splitRow(line);
    if (cells.length !== 7) break;
    const [id, title, year, depth, via, triage, reason] = cells as [string, string, string, string, string, string, string];
    rows.push({ id, title, year, depth, via, triage, reason });
  }
  return rows;
}

function formatRow(r: TriageRow): string {
  return `| ${r.id} | ${r.title} | ${r.year} | ${r.depth} | ${r.via} | ${r.triage} | ${r.reason} |`;
}

function fromClosureEntry(e: ClosureEntry, triage: string, reason: string): TriageRow {
  return {
    id: e.id,
    title: e.title ?? "",
    year: e.year !== undefined ? String(e.year) : "",
    depth: String(e.depth),
    via: e.via.join(", "),
    triage,
    reason,
  };
}

/** Merges a freshly computed closure into any pre-existing triage rows: generated columns
 * refresh from `entries`, triage/reason survive from `existing`, and nothing is ever deleted — a
 * stale row (an id no longer in `entries`) is appended verbatim at the end, in its original
 * relative order. `newCount` is how many rows had no prior entry at all (a brand-new discovery),
 * for the CLI's count line. */
export function mergeTriageRows(entries: ClosureEntry[], existing: TriageRow[]): { rows: TriageRow[]; newCount: number } {
  const existingById = new Map(existing.map((r) => [r.id, r] as const));
  const seen = new Set<string>();
  let newCount = 0;
  const rows: TriageRow[] = entries.map((e) => {
    seen.add(e.id);
    const prior = existingById.get(e.id);
    if (prior) return fromClosureEntry(e, prior.triage, prior.reason);
    newCount++;
    return fromClosureEntry(e, e.direction === "seed" ? "seed" : "", "");
  });
  for (const r of existing) {
    if (!seen.has(r.id)) rows.push(r); // stale row from a prior run — never deleted
  }
  return { rows, newCount };
}

/** Serializes the full triage.md document: ROLE/UPDATE-POLICY/TRIGGER header (rule 9) + the
 * table, one row per `rows` entry. */
export function formatTriageDocument(rows: TriageRow[]): string {
  return (
    [
      "<!--",
      "ROLE: triage ledger for `rk refs snowball`'s citation closure — one row per paper reachable",
      "from the seed set within the configured depth. `triage` and `reason` are AUTHORED: an",
      "operator fills them in (e.g. `in | out | context`) and reruns never overwrite them.",
      "UPDATE POLICY: generated-and-merged — every `rk refs snowball` run regenerates the",
      "title/year/depth/via columns from the current closure and merges them with whatever",
      "triage/reason values already exist for each id; a row is never deleted, even if a later",
      "run's seeds/depth no longer reach it.",
      "TRIGGER: `rk refs snowball --seeds <file> [--depth N] [--out refs/triage.md]`.",
      "-->",
      "",
      "# refs/triage.md — citation-closure triage ledger",
      "",
      ...TRIAGE_TABLE_HEADER,
      ...rows.map(formatRow),
    ].join("\n") + "\n"
  );
}
