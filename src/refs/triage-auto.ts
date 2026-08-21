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
  /** Re-band rows this module banded earlier (reason starts with `auto:` and triage is still what
   * the band wrote — empty, or `out`). A row whose triage a human changed afterwards keeps its
   * `auto:` reason but is never re-banded. Default false: reruns are idempotent. */
  redoAuto?: boolean;
}

const AUTO_PREFIX = "auto: ";

function isUntouchedOrRedoable(row: TriageRow, redoAuto: boolean): boolean {
  if (row.triage === "" && row.reason === "") return true;
  if (!redoAuto || !row.reason.startsWith(AUTO_PREFIX)) return false;
  const bandWroteOut = row.reason.startsWith(`${AUTO_PREFIX}out`);
  return bandWroteOut ? row.triage === "out" : row.triage === "";
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
    if (!isUntouchedOrRedoable(row, opts.redoAuto ?? false)) {
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

// ---------------------------------------------------------------------------------------
// applyTriage — guarded application of EXTERNAL verdicts (a model lane's two-vote output, a
// human's batch edits) onto the ledger. The ledger's triage/reason columns are authored; this is
// the one path by which a non-human writer may set them, and it may do so ONLY where nothing
// authored stands yet: an empty row, or a row this module banded (`auto:` reason). A seed row, a
// human value, or an earlier external verdict is never overwritten — re-running a model over a
// triaged ledger must be a no-op, not a second opinion that silently wins.
// ---------------------------------------------------------------------------------------

export const TRIAGE_LABELS = ["in", "context", "out"] as const;
export type TriageLabel = (typeof TRIAGE_LABELS)[number];

export interface TriageUpdate {
  id: string;
  triage: string;
  reason: string;
}

export interface ApplyCounts {
  applied: number;
  skippedHuman: number;
  skippedSeed: number;
  unknownId: number;
  invalidLabel: number;
}

function isWritable(row: TriageRow): boolean {
  return (row.triage === "" && row.reason === "") || row.reason.startsWith(AUTO_PREFIX);
}

export function applyTriage(rows: readonly TriageRow[], updates: readonly TriageUpdate[]): { rows: TriageRow[]; counts: ApplyCounts } {
  const counts: ApplyCounts = { applied: 0, skippedHuman: 0, skippedSeed: 0, unknownId: 0, invalidLabel: 0 };
  const byId = new Map<string, TriageRow>();
  const out = rows.map((r) => ({ ...r }));
  for (const r of out) byId.set(r.id, r);
  for (const u of updates) {
    const row = byId.get(u.id);
    if (row === undefined) {
      counts.unknownId++;
      continue;
    }
    if (!(TRIAGE_LABELS as readonly string[]).includes(u.triage)) {
      counts.invalidLabel++;
      continue;
    }
    if (row.triage === "seed" || row.depth === "0") {
      counts.skippedSeed++;
      continue;
    }
    if (!isWritable(row)) {
      counts.skippedHuman++;
      continue;
    }
    row.triage = u.triage;
    row.reason = u.reason;
    counts.applied++;
  }
  return { rows: out, counts };
}

/** `id<TAB>label<TAB>reason` per line; blank lines and `#` comment lines ignored; a line with
 * fewer than two tab-separated fields is a malformed update and is returned with an empty
 * label so the caller counts it under `invalidLabel` rather than dropping it silently. */
export function parseApplyTsv(text: string): TriageUpdate[] {
  const out: TriageUpdate[] = [];
  for (const raw of text.split("\n")) {
    if (raw.trim() === "" || raw.startsWith("#")) continue;
    const [id = "", triage = "", ...rest] = raw.split("\t");
    out.push({ id: id.trim(), triage: triage.trim(), reason: rest.join("\t").trim() });
  }
  return out;
}
