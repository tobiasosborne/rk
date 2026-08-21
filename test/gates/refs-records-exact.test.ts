// rk-nsex Tier A repair BL6: schemas/extraction-record.v1.json and
// schemas/card-review.v1.json are enforced at runtime without a JSON-schema dependency.
// This is the 1:1 test for src/gates/refs-records-exact.ts; corpus refs-42/43 prove wiring.

import { describe, expect, test } from "bun:test";
import {
  CHECKED_EXACT_KEYS,
  CLAUSE_EXACT_KEYS,
  HYPOTHESIS_EXACT_KEYS,
  L0_EXACT_KEYS,
  L1_EXACT_KEYS,
  REVIEWER_EXACT_KEYS,
  REVIEW_EXACT_KEYS,
  exactL0Problems,
  exactL1Problems,
  exactReviewProblems,
  sourceDirectoryProblem,
} from "../../src/gates/refs-records-exact";
import extractionSchema from "../../schemas/extraction-record.v1.json";
import reviewSchema from "../../schemas/card-review.v1.json";

const SHA = "a".repeat(64);

const L1: Record<string, unknown> = {
  schema_version: "1",
  record_kind: "L1",
  source: "widget-2026",
  payload_sha256: SHA,
  result_label: "Theorem 1",
  statement_range: "refs/sources/widget.txt:1-2",
  statement_verbatim: "Theorem 1\nEvery widget is round.",
  statement_blessed: "Every widget is round.",
  hypotheses: [{ text: "widget", anchor: "refs/sources/widget.txt:2" }],
  conclusion: "Round.",
  signature: {},
  profile: "qpcp.v1",
  proof_locus: "refs/sources/widget.txt:3-3",
};

const L0: Record<string, unknown> = {
  schema_version: "1",
  record_kind: "L0",
  source: "widget-2026",
  payload_sha256: SHA,
  regime: "widgets",
  objects: ["def-widget"],
  results: ["Theorem 1"],
  standing_assumptions_range: "refs/sources/widget.txt:1-1",
  ends_at_eof: { "Theorem 1": true },
  profile: "qpcp.v1",
};

const REVIEW: Record<string, unknown> = {
  schema_version: "1",
  card_sha256: SHA,
  verdict: "VALID",
  reviewer: { family: "gpt", backend: "codex", model: "gpt-5.6-sol", session: "s1" },
  checked: {
    statement_complete: { value: true, note: "complete" },
    hypotheses_complete: { value: true, note: "complete" },
    translation_faithful: { value: true, note: "faithful" },
    signature_faithful: { value: true, note: "faithful" },
  },
  findings: [],
};

describe("exact record key sets", () => {
  test("runtime closed key sets equal the checked-in schemas", () => {
    expect([...L1_EXACT_KEYS].sort()).toEqual(Object.keys(extractionSchema.$defs.l1Record.properties).sort());
    expect([...L0_EXACT_KEYS].sort()).toEqual(Object.keys(extractionSchema.$defs.l0Record.properties).sort());
    expect([...HYPOTHESIS_EXACT_KEYS].sort()).toEqual(Object.keys(extractionSchema.$defs.hypothesis.properties).sort());
    expect([...REVIEW_EXACT_KEYS].sort()).toEqual(Object.keys(reviewSchema.properties).sort());
    expect([...REVIEWER_EXACT_KEYS].sort()).toEqual(Object.keys(reviewSchema.properties.reviewer.properties).sort());
    expect([...CHECKED_EXACT_KEYS].sort()).toEqual(Object.keys(reviewSchema.properties.checked.properties).sort());
    expect([...CLAUSE_EXACT_KEYS].sort()).toEqual(Object.keys(reviewSchema.$defs.clause.properties).sort());
  });

  test("schema-valid L1, L0, and review objects have no exactness problems", () => {
    expect(exactL1Problems(L1)).toEqual([]);
    expect(exactL0Problems(L0)).toEqual([]);
    expect(exactReviewProblems(REVIEW)).toEqual([]);
  });

  test("L1 rejects extra top-level and hypothesis properties", () => {
    expect(exactL1Problems({ ...L1, extra: true })).toContain("extra (unexpected property)");
    const hypotheses = [{ ...(L1.hypotheses as object[])[0], confidence: "high" }];
    expect(exactL1Problems({ ...L1, hypotheses })).toContain("hypotheses[0].confidence (unexpected property)");
  });

  test("review rejects extras at top, reviewer, checked, and clause levels", () => {
    expect(exactReviewProblems({ ...REVIEW, extra: true })).toContain("extra (unexpected property)");
    expect(exactReviewProblems({ ...REVIEW, reviewer: { ...(REVIEW.reviewer as object), author: "x" } })).toContain(
      "reviewer.author (unexpected property)",
    );
    expect(exactReviewProblems({ ...REVIEW, checked: { ...(REVIEW.checked as object), scope_complete: {} } })).toContain(
      "checked.scope_complete (unexpected property)",
    );
    const checked = structuredClone(REVIEW.checked) as Record<string, Record<string, unknown>>;
    checked.statement_complete!.evidence = "x";
    expect(exactReviewProblems({ ...REVIEW, checked })).toContain("checked.statement_complete.evidence (unexpected property)");
  });
});

describe("exact L0 scalar and collection shapes", () => {
  test("requires full SHA-256 shapes, including the optional extraction digest when present", () => {
    expect(exactL0Problems({ ...L0, payload_sha256: "bad", extraction_sha256: 7 })).toEqual([
      "payload_sha256 (64-hex)",
      "extraction_sha256 (64-hex when present)",
    ]);
    expect(exactL1Problems({ ...L1, extraction_sha256: 7 })).toContain("extraction_sha256 (64-hex when present)");
  });

  test("requires string items in objects/results and rejects L0 extras", () => {
    expect(exactL0Problems({ ...L0, objects: ["ok", 7], results: [null], extra: true })).toEqual([
      "extra (unexpected property)",
      "objects[1] (must be a string)",
      "results[0] (must be a string)",
    ]);
  });

  test("optional range and ends-at-EOF values keep their schema types", () => {
    expect(exactL0Problems({ ...L0, standing_assumptions_range: 7, ends_at_eof: { "Theorem 1": false } })).toEqual([
      "standing_assumptions_range (must be refs/<path>:<from>-<to> when present)",
      'ends_at_eof (an object mapping result_label -> true, e.g. {"Lemma 4.2": true})',
    ]);
  });
});

describe("source-directory equality", () => {
  test("both record kinds must declare their enclosing source id", () => {
    expect(sourceDirectoryProblem("widget-2026", "widget-2026")).toBeUndefined();
    expect(sourceDirectoryProblem("other-2026", "widget-2026")).toContain("other-2026");
  });
});
