// ROLE: Gate 3 — the quote-at-locus window check (docs/gate-contracts.md "Gate 3 — refs",
// Check 6). Split out of src/gates/refs.ts to keep that file inside the 280-line cap (CLAUDE.md
// rule 4); refs.ts calls `checkQuoteAtLocus` exactly once, AFTER `wholeQuoteMatch` has already
// PASSed. This check only ever constrains WHERE a matched quote may fall — it can never rescue a
// quote that failed the whole-quote match, and it never manufactures a finding for a quote it
// cannot locate.
// PURITY: pure — no fs/network/clock (L3).
//
// Incidents (docs/memos/2026-08-03-aism-postmortem/07-refs-report.md §Hallucination/staleness,
// ratified as P2 in docs/memos/2026-08-03-rk-improvement-plan-from-aism.md):
//  - I2: `GT-lee-2ed-thm-21.10` quotes text sitting at line 25202 while claiming locus 25748
//    (a different theorem). check-refs PASSes it because the locus is advisory and the gate only
//    asks whether the string occurs ANYWHERE in the file. Right bytes, wrong passage, permanently
//    green. This module is the check that fails it.
//  - I4: `pdftotext` output carries form feeds (558 of them before line 25748 in the Lee `.txt`).
//    `grep -n`/`wc -l` do NOT count `\x0c` as a line break; Python's `splitlines()` does — the
//    same recorded locus resolves ~546 lines apart depending on which tool wrote it down. So the
//    span is computed under BOTH conventions and a match satisfying EITHER one PASSes. That dual
//    reading, not a giant tolerance, is what makes the check safe against I4.
//
// All line arithmetic runs on the RAW refs text. It can never run on normalized text: `\x0c` is
// `\s` to JS's regex engine, so `normalizeQuoteText` silently eats every form feed — the exact
// signal I4 is about.

import { normalizeQuoteText } from "../refs/quote";

/** 1-indexed, inclusive claimed line range parsed from a locus suffix. */
export interface LocusWindow {
  start: number;
  end: number;
}

/** A single located occurrence's 1-indexed line span, under both line-counting conventions:
 * `lf*` counts `\n` only (grep -n / wc -l); `ff*` counts `\n` AND `\x0c` (Python splitlines). */
export interface LocusSpan {
  lfStart: number;
  lfEnd: number;
  ffStart: number;
  ffEnd: number;
}

export interface LocusCheckResult {
  ok: boolean;
  /** null when the locus carries no parseable line suffix — the check is then VACUOUS (PASS),
   * exactly the pre-P2 behavior for a locus that never claimed a line at all. */
  window: LocusWindow | null;
  /** Every place the normalized quote occurs, in document order. Empty when the quote could not
   * be located at all (defensive: unreachable via the gate, which runs whole-quote-match first). */
  occurrences: LocusSpan[];
  /** Non-null exactly when `ok` is false: the finding message, built here so refs.ts stays thin. */
  message: string | null;
}

/** Parses the `:<lines>` half of a refs locus. Grammar per the AISM locus regex's optional group
 * `(:[\d,-]+)?` (check-refs.py:44): "N" ⇒ N..N, "N-M" ⇒ N..M, "N,M" (a comma list) ⇒ the enclosing
 * SPAN min..max. A locus with no suffix, or a suffix carrying separators but no digits, yields
 * `null` — no window is ever fabricated from a digit-less suffix. */
export function parseLocusWindow(locus: string): LocusWindow | null {
  const suffix = /:([\d,-]+)$/.exec(locus);
  if (!suffix) return null;
  const digits = suffix[1]!.match(/\d+/g);
  if (!digits || digits.length === 0) return null;
  const numbers = digits.map((d) => Number(d));
  return { start: Math.min(...numbers), end: Math.max(...numbers) };
}

/** 1-indexed line number of each raw index under both conventions (see `LocusSpan`). Single
 * left-to-right pass over `raw` regardless of the order `indices` are asked in — bounded by
 * `raw.length + indices.length`, never a per-index rescan (CLAUDE.md rule 13). */
export function lineNumbersAt(raw: string, indices: readonly number[]): Array<{ lf: number; ff: number }> {
  const order = indices.map((_, i) => i).sort((a, b) => indices[a]! - indices[b]!);
  const out = new Array<{ lf: number; ff: number }>(indices.length);
  let lf = 1;
  let ff = 1;
  let pos = 0;
  for (const slot of order) {
    const target = indices[slot]!;
    while (pos < target && pos < raw.length) {
      const code = raw.charCodeAt(pos);
      if (code === 10 /* \n */) {
        lf++;
        ff++;
      } else if (code === 12 /* \x0c, form feed */) {
        ff++;
      }
      pos++;
    }
    out[slot] = { lf, ff };
  }
  return out;
}

const WHITESPACE = /\s/;

export interface NormalizedWithOffsets {
  /** MUST equal `normalizeQuoteText(raw)` — pinned by a fuzz test in test/gates/refs-locus.test.ts.
   * The offsets are only meaningful against the exact text `wholeQuoteMatch` matched against. */
  text: string;
  /** `offsets[i]` is the raw index the normalized character at `i` came from. A collapsed
   * whitespace run maps to the run's FIRST raw character. */
  offsets: number[];
}

/** `normalizeQuoteText` (src/refs/quote.ts:16-22) re-expressed as a single left-to-right scan that
 * also records where every surviving character came from — the map back from a normalized match
 * position to a raw byte position, which is the only way to do line arithmetic on the raw text
 * after matching on the normalized text. The three transforms are applied in the same order and
 * with the same semantics: `\$` → `$`, drop `*`, collapse whitespace runs to one space, then trim.
 * The "never two spaces in a row" rule below is what reproduces the fact that `*` removal happens
 * BEFORE whitespace collapse (so `"a * b"` normalizes to `"a b"`, not `"a  b"`). */
export function normalizeWithOffsets(raw: string): NormalizedWithOffsets {
  const chars: string[] = [];
  const offsets: number[] = [];
  let i = 0;
  while (i < raw.length) {
    const c = raw[i]!;
    if (c === "\\" && raw[i + 1] === "$") {
      chars.push("$");
      offsets.push(i);
      i += 2;
      continue;
    }
    if (c === "*") {
      i++;
      continue;
    }
    if (WHITESPACE.test(c)) {
      const runStart = i;
      while (i < raw.length && WHITESPACE.test(raw[i]!)) i++;
      if (chars[chars.length - 1] !== " ") {
        chars.push(" ");
        offsets.push(runStart);
      }
      continue;
    }
    chars.push(c);
    offsets.push(i);
    i++;
  }
  // Collapse guarantees at most one leading and one trailing space, so trim() is these two shifts.
  if (chars[0] === " ") {
    chars.shift();
    offsets.shift();
  }
  if (chars.length > 0 && chars[chars.length - 1] === " ") {
    chars.pop();
    offsets.pop();
  }
  return { text: chars.join(""), offsets };
}

function formatWindow(w: LocusWindow): string {
  return w.start === w.end ? `${w.start}` : `${w.start}-${w.end}`;
}

/** Gate 3 Check 6. `quote` is the raw claimed quote and `refsText` the raw payload — the SAME two
 * strings `wholeQuoteMatch` was just handed, which must already have MATCHED (this function is
 * never a second chance at the content check, and never rescues a failed one).
 *
 * PASS when: the locus names no line (vacuous), or the quote cannot be located at all (defensive
 * — never accuse on a location we could not compute), or SOME occurrence's line span overlaps the
 * claimed window widened by `toleranceLines` under EITHER counting convention (I4).
 * FAIL only when every occurrence sits outside the widened window under BOTH conventions. */
export function checkQuoteAtLocus(
  locus: string,
  quote: string,
  refsText: string,
  toleranceLines: number,
): LocusCheckResult {
  const window = parseLocusWindow(locus);
  if (window === null) return { ok: true, window: null, occurrences: [], message: null };

  const normalizedQuote = normalizeQuoteText(quote);
  if (normalizedQuote === "") return { ok: true, window, occurrences: [], message: null };

  const { text, offsets } = normalizeWithOffsets(refsText);
  const bounds: number[] = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf(normalizedQuote, from);
    if (at === -1) break;
    bounds.push(offsets[at]!, offsets[at + normalizedQuote.length - 1]!);
    from = at + 1;
  }
  if (bounds.length === 0) return { ok: true, window, occurrences: [], message: null };

  const lines = lineNumbersAt(refsText, bounds);
  const occurrences: LocusSpan[] = [];
  for (let k = 0; k < lines.length; k += 2) {
    occurrences.push({
      lfStart: lines[k]!.lf,
      lfEnd: lines[k + 1]!.lf,
      ffStart: lines[k]!.ff,
      ffEnd: lines[k + 1]!.ff,
    });
  }

  const low = window.start - toleranceLines;
  const high = window.end + toleranceLines;
  const ok = occurrences.some(
    (o) => (o.lfStart <= high && o.lfEnd >= low) || (o.ffStart <= high && o.ffEnd >= low),
  );
  if (ok) return { ok: true, window, occurrences, message: null };

  const first = occurrences[0]!;
  const more = occurrences.length > 1 ? ` (${occurrences.length} occurrences, first shown)` : "";
  return {
    ok: false,
    window,
    occurrences,
    message:
      `claimed VERBATIM quote found in ${locus.replace(/:[\d,-]+$/, "")} but OUTSIDE the claimed ` +
      `locus lines ${formatWindow(window)} (tolerance +/-${toleranceLines} lines): matched at lines ` +
      `${first.lfStart}-${first.lfEnd} counting \\n only, ${first.ffStart}-${first.ffEnd} counting ` +
      `\\n and form feeds (\\x0c)${more} — right bytes, wrong passage (attribution unverified)`,
  };
}
