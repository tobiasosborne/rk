// PURITY: pure — no fs/network/clock (L3). Mechanical PRE-triage of a citation-closure ledger
// (`rk refs triage --auto`, campaign-E phase 0a, 2026-08-21): the cheap, deterministic first cut
// of the funnel that turns ~6k depth-1 neighbours into a few hundred rows worth a model's (or a
// human's) attention. Two signals, both already in the ledger: how many SEEDS a paper is linked
// to (`via` — bibliographic coupling / co-citation against a curated seed set) and whether its
// title hits a campaign-supplied keyword list.
//
// Bands (per row, thresholds configurable):
//   candidate — links >= inLinks, or links >= 2 with a keyword hit. Triage LEFT EMPTY: the
//               operator (or a model lane) still decides `in | context`.
//   review    — everything between. Triage LEFT EMPTY.
//   out       — links <= outLinks and no keyword hit. The ONLY band that writes the triage column.
//
// Authored-vs-generated (CLAUDE.md rule 9): only a row whose triage AND reason are both empty is
// touched; seed rows never. Every reason this module writes starts with `auto:` and names its
// evidence (`links=N, kw=K: <terms>`), so a mechanical `out` is never mistaken for a human one
// and a rerun is idempotent (the reason is no longer empty). False `out`s are recoverable: the
// dependency-closure exception (campaign plan section 3) re-admits anything a record's proof
// cites regardless of triage, so every threshold here is biased toward `out`.

import type { TriageRow } from "./snowball-triage";

export interface AutoTriageOptions {
  /** Seed-link count at or above which a row is a `candidate` (default 3). */
  inLinks?: number;
  /** Seed-link count at or below which a keyword-less row is `out` (default 1). */
  outLinks?: number;
  /** Title keywords; matched case-insensitively as whole words (a term may be multi-word). */
  keywords?: string[];
}

export type AutoBand = "candidate" | "review" | "out";

export interface AutoTriageCounts {
  candidate: number;
  review: number;
  out: number;
  /** Rows left byte-identical: seeds, and anything with an authored triage or reason. */
  untouched: number;
}

export interface AutoTriageResult {
  rows: TriageRow[];
  counts: AutoTriageCounts;
}

const DEFAULT_IN_LINKS = 3;
const DEFAULT_OUT_LINKS = 1;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word, case-insensitive: `gap` matches "Gap amplification" but not "gapless"; a
 * multi-word term matches with any single whitespace run between its words. */
function keywordHits(title: string, keywords: readonly string[]): string[] {
  const hits: string[] = [];
  for (const kw of keywords) {
    const pattern = kw.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
    if (pattern.length === 0) continue;
    if (new RegExp(`(^|[^A-Za-z0-9])${pattern}(?![A-Za-z0-9])`, "i").test(title)) hits.push(kw);
  }
  return hits;
}

function linkCount(via: string): number {
  return via
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

export function classifyRow(row: TriageRow, opts: AutoTriageOptions): { band: AutoBand; links: number; hits: string[] } {
  const inLinks = opts.inLinks ?? DEFAULT_IN_LINKS;
  const outLinks = opts.outLinks ?? DEFAULT_OUT_LINKS;
  const links = linkCount(row.via);
  const hits = keywordHits(row.title, opts.keywords ?? []);
  if (links >= inLinks || (links >= 2 && hits.length > 0)) return { band: "candidate", links, hits };
  if (links <= outLinks && hits.length === 0) return { band: "out", links, hits };
  return { band: "review", links, hits };
}

function reasonFor(band: AutoBand, links: number, hits: string[]): string {
  const kw = hits.length === 0 ? "kw=0" : `kw=${hits.length}: ${hits.join(", ")}`;
  return `auto: ${band} (links=${links}, ${kw})`;
}

/** Applies the bands to every untouched row; returns new row objects for touched rows and the
 * SAME objects for untouched ones, plus per-band counts for the CLI's coverage line. */
export function autoTriage(rows: readonly TriageRow[], opts: AutoTriageOptions): AutoTriageResult {
  const counts: AutoTriageCounts = { candidate: 0, review: 0, out: 0, untouched: 0 };
  const outRows = rows.map((row) => {
    if (row.triage !== "" || row.reason !== "") {
      counts.untouched++;
      return row;
    }
    const { band, links, hits } = classifyRow(row, opts);
    counts[band]++;
    return { ...row, triage: band === "out" ? "out" : "", reason: reasonFor(band, links, hits) };
  });
  return { rows: outRows, counts };
}

/** Keyword file: one term per line; `#` starts a comment (whole-line or trailing); blank lines
 * dropped; order preserved. Same grammar as the seeds file. */
export function parseKeywordsFile(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const hash = raw.indexOf("#");
    const term = (hash === -1 ? raw : raw.slice(0, hash)).trim();
    if (term.length > 0) out.push(term);
  }
  return out;
}
