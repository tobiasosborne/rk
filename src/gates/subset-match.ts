// PURITY: pure — no fs/network/clock (L3). The corpus subset-matcher: decides whether a
// fixture's expected findings are all present among a gate's actual findings. Ground truth:
// corpus/README.md's `expected.json` convention — "M0.3's harness must assert each listed
// finding is PRESENT among the gate's actual output (subset match on severity + path + message
// substring), not that the output equals this list exactly. An empty findings array is legal
// for a clean golden case."
//
// This function decides every future corpus verdict (test/corpus.test.ts) — see
// test/subset-match.test.ts's mutation-proof (perturb substring-match to equality, and to
// always-true, RED both ways, then restore) before changing it.

import type { Finding, Severity } from "./framework";

export interface ExpectedFinding {
  severity: Severity;
  path_pattern: string;
  message_pattern: string;
}

const GLOB_SPECIAL = /[.+^${}()|[\]\\]/;

/** `fnmatch`-style glob match: `*` any run of characters (including none), `?` any one
 * character. A pattern with no glob metacharacters matches only the identical literal string
 * (corpus/README.md: "a literal path (no glob metacharacters) matches exactly"). */
export function globMatch(pattern: string, value: string): boolean {
  let re = "^";
  for (const ch of pattern) {
    if (ch === "*") re += ".*";
    else if (ch === "?") re += ".";
    else re += GLOB_SPECIAL.test(ch) ? `\\${ch}` : ch;
  }
  re += "$";
  return new RegExp(re).test(value);
}

/** True iff `actual` satisfies one `expected` entry: exact severity match, glob-matched path,
 * and `expected.message_pattern` present as a case-sensitive SUBSTRING of `actual.message` (not
 * equal to it — corpus/README.md: "a case-sensitive substring that must appear in the finding's
 * message text"). */
export function findingMatchesExpected(actual: Finding, expected: ExpectedFinding): boolean {
  return (
    actual.severity === expected.severity &&
    globMatch(expected.path_pattern, actual.path) &&
    actual.message.includes(expected.message_pattern)
  );
}

/** True iff every entry in `expected` has at least one matching entry in `actual` — subset
 * match, not exact-output equality. An empty `expected` array is vacuously satisfied (a legal
 * golden case per corpus/README.md). */
export function subsetMatch(actual: Finding[], expected: ExpectedFinding[]): boolean {
  return expected.every((exp) => actual.some((act) => findingMatchesExpected(act, exp)));
}

/** Same test as `subsetMatch`, but returns the `expected` entries that had no match — for a
 * readable test failure (which target finding is missing), rather than a bare boolean. */
export function unmatchedExpectations(actual: Finding[], expected: ExpectedFinding[]): ExpectedFinding[] {
  return expected.filter((exp) => !actual.some((act) => findingMatchesExpected(act, exp)));
}
