// PURITY: pure — no fs/network/clock (L3). Stall-cause legibility (carried P2, RUN-REPORT-8):
// a `stuck-no-progress` abort names WHY it stalled by summarizing the dominant node-skipped reason
// class across the aborting rounds, so an operator sees "dominant cause: cross-vendor:
// identity-unparseable ×3" instead of a bare "stuck-no-progress" whose true cause is only visible by
// hand-reading the driver log. Message-only: this changes no abort semantics, no convergence, no
// gate — it only enriches the human-readable stop message the driver already returns.

/** Normalizes one node-skipped `reason` string into a stable CLASS key — a coarse category shared by
 * every skip of the same kind, with the node-specific and per-turn detail stripped so counts
 * aggregate. E.g. `cross-vendor: identity-unparseable on load-bearing node '1' (prover=unknown,
 * verifier=gpt) — fails closed, ...` collapses to `cross-vendor: identity-unparseable`. Deterministic
 * and total (never throws); an unrecognized shape returns its own leading text, which is still a
 * usable class. */
export function stallReasonClass(reason: string): string {
  let s = reason.trim();
  // Drop the trailing rationale after an em-dash separator.
  const dash = s.indexOf(" — ");
  if (dash >= 0) s = s.slice(0, dash);
  // Collapse a "... failed: <detail>" tail (bind/map/other) to just "... failed".
  s = s.replace(/\s+failed:\s.*$/, " failed");
  // Drop a node-id clause: " on load-bearing node '1' (...)", " node '1.2' ...".
  s = s.replace(/\s+on\s+(?:load-bearing\s+)?node\s+'[^']*'.*$/, "");
  s = s.replace(/\s+node\s+'[^']*'.*$/, "");
  // Drop a trailing parenthetical detail.
  s = s.replace(/\s*\([^)]*\)\s*$/, "");
  // Trim any dangling separators left behind.
  s = s.replace(/[:\s]+$/, "");
  return s.trim();
}

/** Summarizes accumulated stall causes (a class→count tally) into a one-line "dominant cause:
 * <class> ×<count>" suffix, or `undefined` when the tally is empty (no skips recorded — nothing to
 * add). The dominant class is the highest count; ties break lexicographically for determinism. */
export function summarizeStallCauses(causes: ReadonlyMap<string, number>): string | undefined {
  if (causes.size === 0) return undefined;
  let bestClass = "";
  let bestCount = -1;
  for (const [cls, count] of [...causes.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    if (count > bestCount) {
      bestCount = count;
      bestClass = cls;
    }
  }
  return `dominant cause: ${bestClass} ×${bestCount}`;
}

/** Appends the dominant-cause summary to a stuck abort's base message when there is one to add,
 * returning the base unchanged when the tally is empty (message-only; the caller's abort semantics
 * are untouched either way). */
export function appendStallCause(base: string, causes: ReadonlyMap<string, number>): string {
  const summary = summarizeStallCauses(causes);
  return summary === undefined ? base : `${base} — ${summary}`;
}
