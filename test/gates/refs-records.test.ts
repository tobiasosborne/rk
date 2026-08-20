// rk-nsex: Gate 3 Check 11 — extraction-record verification. Ground truth: docs/gate-contracts.md
// Gate 3 Check 11, schemas/extraction-record.v1.json, schemas/card-review.v1.json,
// docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md section 4. The join that consumes these
// records is Check 12, in test/gates/refs-card-join.test.ts.
//
// L1 red-green: every assertion below was written against the UNWIRED gate (refsGate knew nothing
// of refs/records/, so each `expectCode` found no finding = RED) before the wiring landed. The
// corpus fixtures corpus/refs/refs-23..refs-32 carry the same cases as whole-repo trees.

import { describe, expect, test } from "bun:test";
import { refsGate } from "../../src/gates/refs";
import { DEFAULT_GATE_CONFIG } from "../../src/gates/config";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { sha256Hex } from "../../src/gates/sha256";
import { canonicalRecordSha256 } from "../../src/gates/canonical-json";
import { applyPhase } from "../../src/gates/phase";
import type { Finding } from "../../src/gates/framework";
import extractionSchema from "../../schemas/extraction-record.v1.json";
import reviewSchema from "../../schemas/card-review.v1.json";

const PAPER = ["Section 2. Preliminaries", "Theorem 1.1. Every widget is round,", "where the widget is d-regular.", "Proof. Omitted.", ""].join("\n");

function hashOf(text: string): string {
  return sha256Hex(new TextEncoder().encode(text));
}

function lock(entries: unknown[]): string {
  return JSON.stringify({ files: entries }, null, 2);
}

const BASE_RECORD = {
  schema_version: "1",
  record_kind: "L1",
  source: "widget-2026",
  payload_sha256: hashOf(PAPER),
  result_label: "Theorem 1.1",
  statement_range: "refs/sources/widget.txt:2-3",
  statement_verbatim: "Theorem 1.1. Every widget is round,\nwhere the widget is d-regular.",
  statement_blessed: "Every widget is round when d-regular.",
  hypotheses: [{ text: "where the widget is d-regular", anchor: "refs/sources/widget.txt:3" }],
  conclusion: "The widget is round.",
  signature: { schema_version: "1", profile: "qpcp.v1", pre: [], post: [] },
  profile: "qpcp.v1",
  proof_locus: "refs/sources/widget.txt:4-4",
};

function reviewFor(record: unknown, overrides: Record<string, unknown> = {}): string {
  const clause = (note: string) => ({ value: true, note });
  return JSON.stringify({
    schema_version: "1",
    card_sha256: canonicalRecordSha256(record),
    verdict: "VALID",
    reviewer: { family: "gpt", backend: "codex", model: "gpt-5.6-sol", session: "s1" },
    checked: {
      statement_complete: clause("read lines 2-3 of the payload against the record"),
      hypotheses_complete: clause("one hypothesis, the d-regularity clause"),
      translation_faithful: clause("blessed restatement matches the printed statement"),
      signature_faithful: clause("signature matches the regime"),
    },
    findings: [],
    ...overrides,
  });
}

function repo(files: Record<string, string>): Record<string, string> {
  return {
    "refs/sources/widget.txt": PAPER,
    "refs/manifest/sources.lock.json": lock([{ path: "sources/widget.txt", sha256: hashOf(PAPER), source_id: "widget-2026", fetch: null }]),
    ...files,
  };
}

function recordRepo(record: unknown, extra: Record<string, string> = {}): Record<string, string> {
  return repo({
    "refs/records/widget-2026/L1-1.json": JSON.stringify(record, null, 2),
    "refs/records/widget-2026/L1-1.review.json": reviewFor(record),
    ...extra,
  });
}

function run(files: Record<string, string>): { findings: Finding[]; unit: string } {
  const result = refsGate.run(snapshotFromFiles(files), DEFAULT_GATE_CONFIG);
  return { findings: result.findings, unit: result.coverage[0]!.unit };
}

function expectCode(findings: Finding[], code: string): Finding {
  const hit = findings.find((f) => f.message.includes(`[${code}]`));
  if (!hit) throw new Error(`no finding with code [${code}]; got ${JSON.stringify(findings.map((f) => f.message.slice(0, 90)))}`);
  return hit;
}

function expectNoCode(findings: Finding[], code: string): void {
  expect(findings.filter((f) => f.message.includes(`[${code}]`)).map((f) => f.message)).toEqual([]);
}

describe("Check 11 — the golden record", () => {
  test("a complete record with a hash-bound VALID review produces no finding and counts on the coverage line", () => {
    const { findings, unit } = run(recordRepo(BASE_RECORD));
    expect(findings.filter((f) => f.severity === "ERROR")).toEqual([]);
    expect(unit).toContain("checked records: 1 L1 records / 1 reviewed-VALID / 2 anchors verified");
  });

  test("a repo with no refs/records/ at all is a legitimate green, named on the coverage line", () => {
    const { findings, unit } = run(repo({}));
    expect(findings.filter((f) => f.severity === "ERROR")).toEqual([]);
    expect(unit).toContain("checked records: 0 L1 records / 0 reviewed-VALID / 0 anchors verified");
  });
});

describe("Check 11 — clause (a)/(b): the statement range and its bytes", () => {
  test("statement_verbatim that is not the range's bytes is [statement-verbatim-mismatch]", () => {
    const record = { ...BASE_RECORD, statement_verbatim: "Theorem 1.1. Every widget is round." };
    expectCode(run(recordRepo(record)).findings, "statement-verbatim-mismatch");
  });

  test("a range past the end of the source is [statement-range-unverified]", () => {
    const record = { ...BASE_RECORD, statement_range: "refs/sources/widget.txt:2-99" };
    expectCode(run(recordRepo(record)).findings, "statement-range-unverified");
  });

  test("a range whose payload is not pinned by the lock is [statement-range-unverified]", () => {
    const files = recordRepo(BASE_RECORD);
    delete files["refs/manifest/sources.lock.json"];
    expectCode(run(files).findings, "statement-range-unverified");
  });

  test("a range stopping before the printed 'where' clause is [statement-range-truncated]", () => {
    const record = {
      ...BASE_RECORD,
      statement_range: "refs/sources/widget.txt:2-2",
      statement_verbatim: "Theorem 1.1. Every widget is round,",
      hypotheses: [],
    };
    const finding = expectCode(run(recordRepo(record)).findings, "statement-range-truncated");
    expect(finding.message).toContain("where the widget is d-regular");
  });

  test("the extent heuristic does NOT fire when the next line starts a new sentence", () => {
    expectNoCode(run(recordRepo(BASE_RECORD)).findings, "statement-range-truncated");
  });
});

describe("Check 11 — clause (c): hypotheses live inside the statement", () => {
  test("a hypothesis anchored outside the range is [hypothesis-outside-statement]", () => {
    const record = { ...BASE_RECORD, hypotheses: [{ text: "Section 2. Preliminaries", anchor: "refs/sources/widget.txt:1" }] };
    expectCode(run(recordRepo(record)).findings, "hypothesis-outside-statement");
  });

  test("a hypothesis anchored in the L0 standing_assumptions_range is admitted", () => {
    const record = { ...BASE_RECORD, hypotheses: [{ text: "Section 2. Preliminaries", anchor: "refs/sources/widget.txt:1" }] };
    const l0 = {
      schema_version: "1",
      record_kind: "L0",
      source: "widget-2026",
      payload_sha256: hashOf(PAPER),
      regime: "widgets, d-regular",
      objects: [],
      results: ["Theorem 1.1"],
      standing_assumptions_range: "refs/sources/widget.txt:1-1",
      profile: "qpcp.v1",
    };
    const files = recordRepo(record, { "refs/records/widget-2026/L0.json": JSON.stringify(l0, null, 2) });
    expectNoCode(run(files).findings, "hypothesis-outside-statement");
  });

  test("a hypothesis whose text is not on the anchored line is [anchor-unverified]", () => {
    const record = { ...BASE_RECORD, hypotheses: [{ text: "where the widget is 3-regular", anchor: "refs/sources/widget.txt:3" }] };
    expectCode(run(recordRepo(record)).findings, "anchor-unverified");
  });
});

describe("Check 11 — clause (d): the review binding", () => {
  test("no review record at all is [review-absent]", () => {
    const files = recordRepo(BASE_RECORD);
    delete files["refs/records/widget-2026/L1-1.review.json"];
    expectCode(run(files).findings, "review-absent");
  });

  test("a review bound to other bytes (record edited after review) is [review-stale]", () => {
    const files = recordRepo(BASE_RECORD);
    files["refs/records/widget-2026/L1-1.review.json"] = reviewFor({ ...BASE_RECORD, conclusion: "something else" });
    expectCode(run(files).findings, "review-stale");
  });

  test("verdict INVALID is [review-invalid]", () => {
    const files = recordRepo(BASE_RECORD);
    files["refs/records/widget-2026/L1-1.review.json"] = reviewFor(BASE_RECORD, { verdict: "INVALID" });
    expectCode(run(files).findings, "review-invalid");
  });

  test("VALID alongside a false clause is [review-inconsistent]", () => {
    const files = recordRepo(BASE_RECORD);
    const review = JSON.parse(reviewFor(BASE_RECORD));
    review.checked.hypotheses_complete = { value: false, note: "the d-regularity hypothesis is not in the record" };
    files["refs/records/widget-2026/L1-1.review.json"] = JSON.stringify(review, null, 2);
    expectCode(run(files).findings, "review-inconsistent");
  });

  test("the review hash is over CANONICAL bytes, so reformatting the record keeps the review valid", () => {
    const files = recordRepo(BASE_RECORD);
    const reordered: Record<string, unknown> = {};
    for (const key of Object.keys(BASE_RECORD).reverse()) reordered[key] = (BASE_RECORD as Record<string, unknown>)[key];
    files["refs/records/widget-2026/L1-1.json"] = JSON.stringify(reordered);
    expectNoCode(run(files).findings, "review-stale");
  });
});

describe("Check 11 — clause (e): staleness against the lock", () => {
  test("a payload re-adopted at a different digest is [stale-record]", () => {
    const record = { ...BASE_RECORD, payload_sha256: "a".repeat(64) };
    expectCode(run(recordRepo(record)).findings, "stale-record");
  });

  test("a source whose lock declares an extraction the record does not name is [stale-extraction]", () => {
    const pdf = "%PDF-1.7\nbinary\n";
    const extraction = PAPER;
    const files = {
      "refs/sources/widget.txt": pdf,
      "refs/sources/widget.txt.extracted.txt": extraction,
      "refs/manifest/sources.lock.json": lock([
        {
          path: "sources/widget.txt",
          sha256: hashOf(pdf),
          extraction: { path: "sources/widget.txt.extracted.txt", sha256: hashOf(extraction), payload_sha256: hashOf(pdf), tool: "pdftotext" },
        },
      ]),
      "refs/records/widget-2026/L1-1.json": JSON.stringify({ ...BASE_RECORD, payload_sha256: hashOf(pdf) }, null, 2),
      "refs/records/widget-2026/L1-1.review.json": reviewFor({ ...BASE_RECORD, payload_sha256: hashOf(pdf) }),
    };
    expectCode(run(files).findings, "stale-extraction");
  });
});

describe("Check 11 — shape and discovery", () => {
  test("a record with no anchors at all is [zero-anchor-record]", () => {
    const record: Record<string, unknown> = { ...BASE_RECORD, hypotheses: [] };
    delete record.statement_range;
    expectCode(run(recordRepo(record)).findings, "zero-anchor-record");
  });

  test("a record missing a required field is [record-malformed], naming the field", () => {
    const record: Record<string, unknown> = { ...BASE_RECORD };
    delete record.proof_locus;
    expect(expectCode(run(recordRepo(record)).findings, "record-malformed").message).toContain("proof_locus");
  });

  test("a record filed under another source's directory is [record-misfiled]", () => {
    const files = repo({
      "refs/records/other-2026/L1-1.json": JSON.stringify(BASE_RECORD, null, 2),
      "refs/records/other-2026/L1-1.review.json": reviewFor(BASE_RECORD),
    });
    expectCode(run(files).findings, "record-misfiled");
  });

  test("unparseable record JSON is [record-unparseable], never an exception", () => {
    expectCode(run(repo({ "refs/records/widget-2026/L1-1.json": "{not json" })).findings, "record-unparseable");
  });

  test("a file under refs/records/ matching no record name is [record-unrecognized]", () => {
    expectCode(run(recordRepo(BASE_RECORD, { "refs/records/widget-2026/L1-1.reviewed.json": "{}" })).findings, "record-unrecognized");
  });
});

describe("Phase matrix — Check 11 is STRUCTURAL", () => {
  test("a record ERROR survives applyPhase(exploration) unchanged", () => {
    const record = { ...BASE_RECORD, statement_verbatim: "not the source's bytes" };
    const { findings } = run(recordRepo(record));
    const demoted = applyPhase(findings, "exploration");
    const hit = expectCode(demoted, "statement-verbatim-mismatch");
    expect(hit.severity).toBe("ERROR");
    expect(hit.message).not.toContain("advisory in exploration phase");
  });

});

describe("schema anti-drift", () => {
  test("the runtime validator's required L1 fields are exactly schemas/extraction-record.v1.json's", () => {
    const required = (extractionSchema as { $defs: { l1Record: { required: string[] } } }).$defs.l1Record.required;
    // Every required field must produce a [record-malformed] naming it when removed.
    for (const field of required) {
      if (field === "statement_range") continue; // absent + no hypotheses is [zero-anchor-record]; covered above
      const record: Record<string, unknown> = { ...BASE_RECORD };
      delete record[field];
      expect(expectCode(run(recordRepo(record)).findings, "record-malformed").message).toContain(field);
    }
  });

  test("the runtime validator's required review fields are exactly schemas/card-review.v1.json's", () => {
    const required = (reviewSchema as { required: string[] }).required;
    for (const field of required) {
      const review = JSON.parse(reviewFor(BASE_RECORD));
      delete review[field];
      const files = recordRepo(BASE_RECORD);
      files["refs/records/widget-2026/L1-1.review.json"] = JSON.stringify(review, null, 2);
      expectCode(run(files).findings, "review-malformed");
    }
  });
});
