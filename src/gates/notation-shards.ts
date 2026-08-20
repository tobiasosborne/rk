// ROLE: the NOTATION REGISTER — `definitions/**/*.md` shards carrying `shard_type: notation`.
// Contract: docs/gate-contracts.md Gate 1, "Notation shards". Parsing only: Gate 1 owns the
// findings (src/gates/defs.ts) and Gate 9 owns the lexical check (src/gates/notation.ts).
// PURITY: pure — no fs/network/clock (L3).
//
// `shard_type` is ORTHOGONAL to `kind` (rk-5lzf, LB5 of
// docs/reviews/2026-08-20-qpcp-plan-tierA-codex.md). The review's finding was that a
// `kind: notation` would REPLACE the provenance enum `cited|consensus|original`, so an anchored
// source-symbol occurrence need not anchor the shard's claimed MEANING. `kind` keeps its full
// provenance meaning on a notation shard — the meaning is what is provenanced, not the symbol's
// occurrence — and `shard_type` says only what shape of shard this is.
//
// WHY THE TRANSLATION ROWS LIVE IN THE BODY, NOT THE FRONTMATTER. A translation row is a
// two-line `rk refs quote` pair — the pointer line and its byte-verbatim quote anchor — and that
// pair is a BODY construct everywhere else in rk (Gate 3 Checks 8-9 read it from argument-shard
// bodies; this module deliberately reuses that verifier rather than forking a second quote
// semantics). It cannot live in the flat `key: value` frontmatter grammar: a bare `"<quote>"`
// line has no `:` and would be reported as a malformed frontmatter line, and
// `parseFrontmatter`'s block-list handling joins `- item` lines into one `;`-separated string,
// which destroys the row/anchor pairing outright. Gate 1 therefore treats a `translations:` key
// appearing IN the frontmatter as an ERROR rather than letting the rows vanish silently.

import { parseFrontmatter, type RepoSnapshot } from "./snapshot";
import { baseName, listFilesRecursive } from "./snapshot";

export const NOTATION_SHARD_TYPE = "notation";
const SKIP_FILES = new Set(["README.md", "INDEX.md"]);

/** A blessed LaTeX macro token, backslash included — the same grammar the convention profile's
 * `symbols` lists use (schemas/convention-profile.v1.json). */
export const SYMBOL_RE = /^\\[A-Za-z]+$/;

/** One `- <source-id>: <their symbol> @ refs/<path>:<line>` row. The leading `- ` is required:
 * the grammar is strict and standalone for exactly the reason Gate 3 Check 8's is (a permissive
 * detector turns arbitrary prose into an unverifiable citation-shaped claim). */
const ROW_RE = /^-\s+([A-Za-z0-9][A-Za-z0-9._-]*):\s*(\S+)\s+@\s+(refs\/[A-Za-z0-9_./-]+):([0-9]+)\s*$/;

export interface TranslationRow {
  /** 1-indexed line of the ROW within the shard file. */
  line: number;
  sourceId: string;
  /** The source's own symbol for the same object, verbatim as written. */
  theirSymbol: string;
  /** `refs/<path>` — the payload the anchor quote is verified against. */
  sourcePath: string;
  /** The line locus, as text (validated by the refs verifier, not here). */
  locusText: string;
  /** The `"<quote>"` anchor on the line immediately after the row; `undefined` when absent. */
  anchorQuote?: string;
}

export interface NotationShard {
  path: string;
  /** Frontmatter fields verbatim (Gate 1 validates them; this module only carries them). */
  fields: Record<string, string>;
  symbol?: string;
  className?: string;
  translations: TranslationRow[];
  /** True when a `translations:` key appears in the FRONTMATTER — always an authoring error (see
   * this file's header): the rows and their anchors cannot survive the flat frontmatter grammar. */
  translationsInFrontmatter: boolean;
}

/** The `"<quote>"` anchor form — the same shape Gate 3's `quotedLine` recognizes. */
function anchorOf(line: string | undefined): string | undefined {
  if (line === undefined) return undefined;
  const trimmed = line.trim();
  if (trimmed.length < 2 || !trimmed.startsWith('"') || !trimmed.endsWith('"')) return undefined;
  return trimmed.slice(1, -1);
}

/** The body of a shard: everything after the frontmatter's closing `---`. Returns the whole text
 * when there is no well-formed frontmatter (Gate 1 has already ERRORed on that; scanning the whole
 * file is the fail-LOUD direction — a row is still seen and still checked). */
function bodyLines(content: string): { line: number; text: string }[] {
  const lines = content.split(/\r?\n/);
  let start = 0;
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() === "---") {
      seen++;
      if (seen === 2) {
        start = i + 1;
        break;
      }
    }
  }
  return lines.slice(start).map((text, i) => ({ line: start + i + 1, text }));
}

/** Every translation row in one shard's body, each carrying the anchor quote on the line
 * immediately following it (or `undefined` when there is none — Gate 1 ERRORs on that). */
export function parseTranslationRows(content: string): TranslationRow[] {
  const body = bodyLines(content);
  const rows: TranslationRow[] = [];
  for (let i = 0; i < body.length; i++) {
    const m = ROW_RE.exec(body[i]!.text.trim());
    if (!m) continue;
    const anchor = anchorOf(body[i + 1]?.text);
    rows.push({
      line: body[i]!.line,
      sourceId: m[1]!,
      theirSymbol: m[2]!,
      sourcePath: m[3]!,
      locusText: m[4]!,
      ...(anchor !== undefined ? { anchorQuote: anchor } : {}),
    });
  }
  return rows;
}

/** Every `definitions/**\/*.md` shard declaring `shard_type: notation`, in path order. A shard
 * whose frontmatter is absent/unterminated is NOT a notation shard here (Gate 1 has already
 * ERRORed on the parse and skipped it) — this module never invents structure from unparseable
 * text. */
export function parseNotationShards(snapshot: RepoSnapshot): NotationShard[] {
  const out: NotationShard[] = [];
  for (const path of listFilesRecursive(snapshot, "definitions", ".md")) {
    if (SKIP_FILES.has(baseName(path))) continue;
    const content = snapshot.get(path);
    if (content === undefined) continue;
    const fm = parseFrontmatter(content);
    if (!fm.present || !fm.terminated) continue;
    if (fm.fields.shard_type?.trim() !== NOTATION_SHARD_TYPE) continue;
    const symbol = fm.fields.symbol?.trim();
    const className = fm.fields.class?.trim();
    out.push({
      path,
      fields: fm.fields,
      ...(symbol ? { symbol } : {}),
      ...(className ? { className } : {}),
      translations: parseTranslationRows(content),
      translationsInFrontmatter: "translations" in fm.fields,
    });
  }
  return out;
}

/** Registered `symbol` -> the notation shard that claims it, first claimant wins (Gate 1 reports
 * the collision separately, as DRIFT). Shards with no `symbol:` register nothing. */
export function registeredSymbols(shards: readonly NotationShard[]): Map<string, NotationShard> {
  const index = new Map<string, NotationShard>();
  for (const shard of shards) {
    if (shard.symbol === undefined) continue;
    if (!index.has(shard.symbol)) index.set(shard.symbol, shard);
  }
  return index;
}
