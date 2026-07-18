// PURITY: pure — no fs/network/clock (L3). Gate 4 (provenance) report/-file parsers:
// `report/PROVENANCE.md`'s two tables (check-provenance.py:155-201), `report/UNWIRED.md`'s
// fenced whitelist (check-provenance.py:325-346), and the configured tab:status table
// (check-provenance.py:204-225). Sibling to provenance-parse.ts (registry + `\label{}` scanning),
// split out to stay under the ~200-line shard target (CLAUDE.md Rule 4).

import type { RepoSnapshot } from "./snapshot";
import { LABEL_FULL_RE, stripTexComment } from "./provenance-parse";

function stripBackticks(s: string): string {
  return s.replace(/^`+/, "").replace(/`+$/, "");
}

function mdCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/** A markdown `|`-line that is neither the column header nor a `|---|` separator
 * (check-provenance.py:150-152 `_is_data_row`). */
function isDataRow(cells: string[], headerFirstCell: string): boolean {
  const first = cells[0];
  if (!first) return false;
  if (first === headerFirstCell) return false;
  return ![...first].every((ch) => "-: ".includes(ch));
}

export interface SourceRow {
  key: string;
  path: string;
  sha: string;
}
export interface ClaimRow {
  label: string;
  sourceCell: string;
}

export interface ProvenanceMd {
  /** last-wins key -> {path, sha} — claim-source membership (check-provenance.py:157,186). */
  sourceRegistry: Map<string, { path: string; sha: string }>;
  /** EVERY row, including a reused key twice — hash-freshness hashes both (check-provenance.py:
   * 158,187). */
  sourceRows: SourceRow[];
  claimRows: ClaimRow[];
  /** WARN-worthy parse issues: an unparseable data row, a duplicate source key, or a malformed
   * per-claim label — surfaced, never a silent drop (check-provenance.py:180-181,185-186,200). */
  parseWarnings: string[];
}

const PROVENANCE_PATH = "report/PROVENANCE.md";
const SOURCE_HEADER = "## Ground-truth source registry";
const CLAIM_HEADER = "## Per-claim ledger";

/** Parses `report/PROVENANCE.md` (check-provenance.py:155-201). Both section headers are matched
 * as exact literal substrings (check-provenance.py:169,189); an absent file or absent section
 * yields empty results, never a finding here — the caller decides what (if anything) an empty
 * table implies. */
export function parseProvenanceMd(snapshot: RepoSnapshot): ProvenanceMd {
  const out: ProvenanceMd = { sourceRegistry: new Map(), sourceRows: [], claimRows: [], parseWarnings: [] };
  const text = snapshot.get(PROVENANCE_PATH);
  if (text === undefined) return out;

  const sourceIdx = text.indexOf(SOURCE_HEADER);
  if (sourceIdx !== -1) {
    let blk = text.slice(sourceIdx + SOURCE_HEADER.length);
    const nextHeader = blk.indexOf("\n## ");
    if (nextHeader !== -1) blk = blk.slice(0, nextHeader);
    for (const raw of blk.split("\n")) {
      const line = raw.trim();
      if (!line.startsWith("|")) continue;
      const cells = mdCells(line);
      if (!isDataRow(cells, "Key") || cells.length < 3) continue;
      const km = /`([^`]+)`/.exec(cells[0]!);
      const pm = /`([^`]+)`/.exec(cells[1]!);
      const sm = /`?([0-9a-f]{6,})`?/.exec(cells[2]!);
      if (!km || !pm || !sm) {
        out.parseWarnings.push(`unparseable source-registry row: ${line.slice(0, 70)}`);
        continue;
      }
      const key = km[1]!.trim();
      const path = pm[1]!.trim();
      const sha = sm[1]!.trim();
      const existing = out.sourceRegistry.get(key);
      if (existing && (existing.path !== path || existing.sha !== sha)) {
        out.parseWarnings.push(`source key '${key}' is defined twice (both rows are hashed)`);
      }
      out.sourceRegistry.set(key, { path, sha });
      out.sourceRows.push({ key, path, sha });
    }
  }

  const claimIdx = text.indexOf(CLAIM_HEADER);
  if (claimIdx !== -1) {
    const blk = text.slice(claimIdx + CLAIM_HEADER.length);
    for (const raw of blk.split("\n")) {
      const line = raw.trim();
      if (!line.startsWith("|")) continue;
      const cells = mdCells(line);
      if (!isDataRow(cells, "Report label") || cells.length < 2) continue;
      if (LABEL_FULL_RE.test(cells[0]!)) {
        out.claimRows.push({ label: cells[0]!, sourceCell: cells[1]! });
      } else {
        out.parseWarnings.push(`per-claim row label not a clean label, row skipped: '${cells[0]}'`);
      }
    }
  }
  return out;
}

/** claim-source Source-cell token splitter, with backtick stripping — check-provenance.py:274-275
 * (`re.split(r"[\s/,;()|]+", src)`, then `.strip().strip("\`")`). Exported so check 3's token
 * filters can be unit-tested against the exact split independent of the whole-row check. */
export function splitSourceTokens(sourceCell: string): string[] {
  return sourceCell
    .split(/[\s/,;()|]+/)
    .map((t) => stripBackticks(t.trim()))
    .filter((t) => t.length > 0);
}

/** Parses `report/UNWIRED.md` — the set of registry ids intentionally OUT of the paper track
 * (check-provenance.py:325-346). An id is any non-blank, non-`#`-comment line inside a fenced
 * ``` block; prose/headers outside fences are ignored. Absent file -> empty set. */
export function parseUnwired(snapshot: RepoSnapshot): Set<string> {
  const ids = new Set<string>();
  const text = snapshot.get("report/UNWIRED.md");
  if (text === undefined) return ids;
  let inFence = false;
  for (const raw of text.split("\n")) {
    if (raw.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) continue;
    const tok = raw.trim();
    if (!tok || tok.startsWith("#")) continue;
    ids.add(tok.split(/\s+/)[0]!);
  }
  return ids;
}

export interface StatusRow {
  statusCell: string;
  labels: string[];
}

/** Parses the `tab:status` table in the CONFIGURED status-table file (docs/gate-contracts.md
 * Gate 4 Divergences, `provenance-11`: a per-repo config parameter, default byte-identical to
 * AISM's own hardcoded `report/sections/13_discussion.tex`, check-provenance.py:206,204-225).
 * Returns `[]` — silently, no finding — whenever the file is absent, or present but carries
 * neither `\label{tab:status}` nor `\midrule` (check-provenance.py:207-211); the caller's coverage
 * line is what makes this visible (Gate 4 Divergences, "coverage line ... S rendered even when
 * 0"), never a finding from this parser itself. */
export function statusTableRows(snapshot: RepoSnapshot, tabStatusFile: string): StatusRow[] {
  const text = snapshot.get(tabStatusFile);
  if (text === undefined) return [];
  if (!text.includes("\\label{tab:status}") || !text.includes("\\midrule")) return [];

  let body = text.split("\\label{tab:status}")[0]!;
  const lastMidrule = body.lastIndexOf("\\midrule");
  body = body.slice(lastMidrule + "\\midrule".length);
  body = body.split("\\bottomrule")[0]!;
  body = body
    .split("\n")
    .map(stripTexComment)
    .join("\n");

  const rows: StatusRow[] = [];
  for (const raw of body.split("\\\\")) {
    const cols = raw.split(/(?<!\\)&/);
    if (cols.length < 2) continue;
    const statusCell = cols[1]!.trim().toLowerCase();
    const labels = [...raw.matchAll(/\\(?:Cref|ref)\{([a-z]+:[A-Za-z0-9-]+)\}/g)].map((m) => m[1]!);
    if (labels.length > 0) rows.push({ statusCell, labels });
  }
  return rows;
}
