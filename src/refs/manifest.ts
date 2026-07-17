// PURITY: pure — no fs/network/clock (L3). Parsing/serializing the `## Source registry`
// markdown table in refs/manifest/SOURCES.md. Ground truth: a real example at
// almost-idempotent-stochastic-maps/refs/manifest/SOURCES.md — the table columns are
// `source-id | citation | locator | retrieved | local path | key file (sha256-16) | role`.
// No AISM script parses this table (it is human-facing prose, not machine-checked by
// check-defs.py/check-refs.py); this parser/serializer exists so `rk refs add` can append a row
// without hand-editing markdown, and so a round-trip test can assert nothing is lost.

import type { ManifestRow } from "../types";
import { sourceId } from "../types";

const TABLE_HEADER_MARKER = "| source-id |";

/** Strips a single layer of backtick code-span markers from a cell, e.g. `` `foo` `` -> `foo`.
 * Cells that are not wrapped in backticks (free prose like the citation column) pass through
 * unchanged. */
function unbacktick(cell: string): string {
  const m = /^`(.*)`$/.exec(cell);
  return m ? m[1]! : cell;
}

function splitRow(line: string): string[] {
  // A markdown table row is `| a | b | c |`; split on unescaped pipes, drop the leading/
  // trailing empty cells produced by the outer `|` delimiters.
  const cells = line.split("|").map((c) => c.trim());
  return cells.slice(1, -1);
}

/** Parses every data row of the Source registry table. Returns `[]` if no such table exists
 * (a fresh SOURCES.md before any source has been added is a legitimate, non-error state). */
export function parseManifestTable(text: string): ManifestRow[] {
  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => l.startsWith(TABLE_HEADER_MARKER));
  if (headerIdx === -1) return [];
  const rows: ManifestRow[] = [];
  // headerIdx+1 is the `|---|---|...` separator row; data starts at headerIdx+2.
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith("|")) break; // table ends at the first non-table line
    const cells = splitRow(line).map(unbacktick);
    if (cells.length !== 7) break;
    const [sourceIdCell, citation, locator, retrieved, localPath, sha16, role] = cells as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    rows.push({ sourceId: sourceId(sourceIdCell), citation, locator, retrieved, localPath, sha16, role });
  }
  return rows;
}

/** Formats one row as a single markdown table line (no trailing newline). */
export function formatManifestRow(row: ManifestRow): string {
  return (
    `| \`${row.sourceId}\` | ${row.citation} | ${row.locator} | ${row.retrieved} | ` +
    `\`${row.localPath}\` | \`${row.sha16}\` | ${row.role} |`
  );
}

/** Appends `row` as a new data row at the end of the Source registry table, leaving all other
 * text (prose before/after, other tables) untouched. Throws if `text` has no such table — call
 * sites (`rk refs add`) are expected to seed a fresh SOURCES.md from the scaffold template
 * (M1), not fabricate a table structure here. */
export function appendManifestRow(text: string, row: ManifestRow): string {
  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => l.startsWith(TABLE_HEADER_MARKER));
  if (headerIdx === -1) {
    throw new Error("appendManifestRow: no '## Source registry' table found in SOURCES.md text");
  }
  let insertAt = headerIdx + 2;
  while (insertAt < lines.length && lines[insertAt]!.startsWith("|")) insertAt++;
  lines.splice(insertAt, 0, formatManifestRow(row));
  return lines.join("\n");
}
