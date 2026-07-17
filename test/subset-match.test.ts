import { describe, expect, test } from "bun:test";
import { findingMatchesExpected, globMatch, subsetMatch, unmatchedExpectations } from "../src/gates/subset-match";
import type { ExpectedFinding } from "../src/gates/subset-match";
import type { Finding } from "../src/gates/framework";

describe("globMatch", () => {
  test("a literal pattern (no metacharacters) matches only the identical string", () => {
    expect(globMatch("definitions/foo.md", "definitions/foo.md")).toBe(true);
    expect(globMatch("definitions/foo.md", "definitions/foo2.md")).toBe(false);
  });

  test("'*' matches any run of characters, including none", () => {
    expect(globMatch("argument/lemmas/*.md", "argument/lemmas/lem-x.md")).toBe(true);
    expect(globMatch("proofs/*/externals/*.json", "proofs/lem-alpha/externals/GT-1.json")).toBe(true);
    expect(globMatch("a*b", "ab")).toBe(true);
  });

  test("'?' matches exactly one character", () => {
    expect(globMatch("shards-0?", "shards-01")).toBe(true);
    expect(globMatch("shards-0?", "shards-012")).toBe(false);
  });

  test("regex-special characters in the pattern are treated literally", () => {
    expect(globMatch("report/sections/13_discussion.tex", "report/sections/13Xdiscussion.tex")).toBe(false);
    expect(globMatch("report/sections/13_discussion.tex", "report/sections/13_discussion.tex")).toBe(true);
  });
});

describe("findingMatchesExpected / subsetMatch", () => {
  const actual: Finding[] = [
    { severity: "ERROR", path: "definitions/def-x.md", line: 1, message: "DRIFT: name 'foo' claimed by both a and b" },
    { severity: "WARN", path: "definitions/def-x.md", line: 5, message: "status: draft, not yet consensus-gated" },
  ];

  test("matches on severity + glob path + message substring (not equality)", () => {
    const exp: ExpectedFinding = { severity: "ERROR", path_pattern: "definitions/def-x.md", message_pattern: "DRIFT" };
    expect(findingMatchesExpected(actual[0]!, exp)).toBe(true);
  });

  test("a shorter substring pattern still matches a longer real message (this is the whole point of subset match)", () => {
    const exp: ExpectedFinding = { severity: "WARN", path_pattern: "*", message_pattern: "consensus-gated" };
    expect(findingMatchesExpected(actual[1]!, exp)).toBe(true);
  });

  test("severity mismatch never matches, even with an identical message substring", () => {
    const exp: ExpectedFinding = { severity: "WARN", path_pattern: "definitions/def-x.md", message_pattern: "DRIFT" };
    expect(findingMatchesExpected(actual[0]!, exp)).toBe(false);
  });

  test("a message substring absent from the actual message never matches", () => {
    const exp: ExpectedFinding = { severity: "ERROR", path_pattern: "*", message_pattern: "nowhere in the text" };
    expect(subsetMatch(actual, [exp])).toBe(false);
  });

  test("subsetMatch: every expected entry must have a matching actual (true subset, extra actual findings ignored)", () => {
    const expected: ExpectedFinding[] = [
      { severity: "ERROR", path_pattern: "definitions/def-x.md", message_pattern: "DRIFT" },
    ];
    expect(subsetMatch(actual, expected)).toBe(true);
  });

  test("subsetMatch: an empty expected array is vacuously satisfied (legal golden case)", () => {
    expect(subsetMatch(actual, [])).toBe(true);
    expect(subsetMatch([], [])).toBe(true);
  });

  test("subsetMatch: one unmatched expected entry fails the whole match", () => {
    const expected: ExpectedFinding[] = [
      { severity: "ERROR", path_pattern: "definitions/def-x.md", message_pattern: "DRIFT" },
      { severity: "ERROR", path_pattern: "definitions/def-x.md", message_pattern: "this never appears" },
    ];
    expect(subsetMatch(actual, expected)).toBe(false);
  });

  test("unmatchedExpectations reports exactly the missing entries, for a readable failure", () => {
    const missing: ExpectedFinding = { severity: "ERROR", path_pattern: "*", message_pattern: "absent text" };
    const present: ExpectedFinding = { severity: "ERROR", path_pattern: "definitions/def-x.md", message_pattern: "DRIFT" };
    expect(unmatchedExpectations(actual, [present, missing])).toEqual([missing]);
  });
});
