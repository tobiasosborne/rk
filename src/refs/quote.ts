// PURITY: pure — no fs/network/clock (L3). Quote location + the whole-quote-match rule that
// `rk refs quote`'s output must satisfy so the (separate, M0.3) refs gate can byte-verify it.
//
// Ground truth for normalization: check-refs.py's `normalize` (check-refs.py:49-60), cited via
// docs/gate-contracts.md Gate 3 check 3 — unescape `\$`, drop `*`, collapse whitespace runs.
//
// Ground truth for the match rule: docs/gate-contracts.md Gate 3 check 4 / ruling #3 — rk
// DEVIATES from AISM's own `longest_run_match` (check-refs.py:77-98), which PASSes a >=40-char
// quote on a merely-partial contiguous run match. rk requires the WHOLE normalized quote to
// match; a partial run is never sufficient. `wholeQuoteMatch` here is that rule's single
// implementation — both `rk refs quote` (self-check on what it emits) and the future refs gate
// (M0.3) must call this function rather than re-deriving the rule, so they cannot drift apart.

/** Port of check-refs.py's `normalize` (check-refs.py:49-60). LaTeX command names and `$` are
 * KEPT — fabrications differ in words, not formatting. */
export function normalizeQuoteText(s: string): string {
  return s
    .replace(/\\\$/g, "$")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface QuoteMatchResult {
  matched: boolean;
  normalizedQuote: string;
}

/** The whole-quote-match rule (ruling #3): the entire normalized quote must appear verbatim as
 * a substring of the normalized source text. No partial-run fallback, regardless of quote
 * length — see the module header for why this deviates from AISM's own script.
 *
 * Guard (correction 1, mirrors check-refs.py:84-85's `if not qn: return False, None`): a quote
 * that normalizes to the empty string (`""`, `"***"`, whitespace-only) never matches, even
 * though `"".includes(...)` is vacuously true for any source — without this guard `"***"`
 * (which survives `extract_quote`'s strip filter) would false-PASS against arbitrary source
 * text. */
export function wholeQuoteMatch(quote: string, sourceText: string): QuoteMatchResult {
  const normalizedQuote = normalizeQuoteText(quote);
  if (normalizedQuote === "") return { matched: false, normalizedQuote };
  const normalizedSource = normalizeQuoteText(sourceText);
  return { matched: normalizedSource.includes(normalizedQuote), normalizedQuote };
}

export interface LocatedQuote {
  /** Byte-verbatim substring of the raw (un-normalized) content — grep -F "<quote>" <path>
   * must find it, so long as the quote does not itself span a newline (grep matches per line
   * by default; a multi-line located quote is a known limitation, not silently handled). */
  quote: string;
  /** 1-indexed line number where the match starts (shared convention, docs/gate-contracts.md:
   * "Finding format" — `line` is 1-indexed). */
  line: number;
}

/** Locates the first literal (case-sensitive, exact byte) occurrence of `pattern` in `content`
 * and returns it verbatim with its path:line anchor. Unlike check-refs.py's `extract_quote`
 * (which pulls a claimed quote OUT of already-written freeform prose for verification), this is
 * the acquisition-side operation: given a pattern an author wants to cite, find its exact bytes
 * in the local refs/ payload so the emitted quote is correct-by-construction — round-tripping it
 * through `wholeQuoteMatch` against the same content always matches (see test suite). Returns
 * null when the pattern is not present at all, or when the pattern is empty/degenerate (its
 * normalized form is `""`, e.g. `""` or `"***"`) — consistent with `wholeQuoteMatch`'s
 * empty-normalized-quote guard above, so a degenerate pattern can never be "located" and then
 * round-trip into a matched quote. (A CLI-level guard rejecting a user-supplied empty `rk refs
 * quote <id> ""` argument before it ever reaches this function is a separate, Tier B/C concern
 * and out of scope here.) */
export function locateQuote(content: string, pattern: string): LocatedQuote | null {
  if (normalizeQuoteText(pattern) === "") return null;
  const idx = content.indexOf(pattern);
  if (idx === -1) return null;
  let line = 1;
  for (let i = 0; i < idx; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) line++;
  }
  return { quote: pattern, line };
}
