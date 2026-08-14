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

/** The Source registry table's header + separator rows, verbatim in AISM's own column order
 * (refs/manifest/SOURCES.md there). Exported so the seed document below and any future writer can
 * never drift from what `parseManifestTable` reads back. */
export const SOURCES_TABLE_HEADER = [
  "| source-id | citation | locator | retrieved | local path | key file (sha256-16) | role |",
  "|-----------|----------|---------|-----------|------------|----------------------|------|",
];

/** A fresh SOURCES.md with an EMPTY Source registry table. THE canonical seed, used in three
 * places that must never drift: `rk init` stamps it (templates/refs/manifest/SOURCES.md.tmpl is a
 * byte-identical copy, bound by test/templates/templates.test.ts), and `rk refs add` /
 * `rk refs adopt` seed it when a repo has no refs/manifest/ yet (rk-pk8o: the firewalled-librarian
 * case, where the payload arrives before any manifest exists; rk-tyl6: `add` used to throw ENOENT
 * instead, after it had already written the lock). Carries the ROLE/UPDATE-POLICY header CLAUDE.md
 * rule 9 requires of every generated doc, and states the never-fabricate-a-hash policy AISM's own
 * SOURCES.md states, because that policy is exactly what makes an adopted row trustworthy. */
export function emptySourcesDocument(): string {
  return [
    "<!--",
    "ROLE: catalogue of ground-truth reference sources for this repo — citation, local path, role,",
    "integrity hash. Written and appended to by `rk refs add` and `rk refs adopt`; rows may be",
    "edited by hand for citation/role prose only.",
    "UPDATE POLICY: authored-append-only — stamped once as this empty skeleton and grown one row at",
    "a time as sources are added; never re-stamped, never overwritten. Never rewrite a hash without",
    "re-deriving it from the bytes on disk. Authoritative hashes live in",
    "refs/manifest/checksums.sha256; the fetch recipe (when one exists) in",
    "refs/manifest/sources.lock.json. A source is PINNED only once its bytes exist locally and a",
    "real SHA256 was computed — never fabricate a hash.",
    "TRIGGER: `rk init` (stamps this skeleton), `rk refs add`, `rk refs adopt`.",
    "-->",
    "",
    "# SOURCES — ground-truth reference registry",
    "",
    "## Source registry",
    "",
    ...SOURCES_TABLE_HEADER,
    "",
  ].join("\n");
}

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
