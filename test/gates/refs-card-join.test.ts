// rk-nsex: Gate 3 Check 12 — the card->shard hash join. Ground truth: docs/gate-contracts.md
// Gate 3 Check 12, docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md section 4 ("Card -> shard
// hash join"), review finding LB1 ("a status: cited shard can carry one genuine but irrelevant
// quote and an arbitrary contract"). Sibling: test/gates/refs-records.test.ts (Check 11, whose
// fixtures this file reuses through the same helpers).
//
// L1 red-green: written against the UNWIRED gate (no join existed, so every `expectCode` found
// nothing = RED); the structural classification below was then re-reddened by flipping
// `structural: true` off in src/gates/refs-card-join.ts and observing this file go red.

import { describe, expect, test } from "bun:test";
import { refsGate } from "../../src/gates/refs";
import { DEFAULT_GATE_CONFIG } from "../../src/gates/config";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { sha256Hex } from "../../src/gates/sha256";
import { canonicalRecordSha256 } from "../../src/gates/canonical-json";
import { applyPhase } from "../../src/gates/phase";
import type { Finding } from "../../src/gates/framework";

const PAPER = ["Section 2. Preliminaries", "Theorem 1.1. Every widget is round,", "where the widget is d-regular.", "Proof. Omitted.", ""].join("\n");

function hashOf(text: string): string {
  return sha256Hex(new TextEncoder().encode(text));
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

function recordRepo(record: unknown, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "refs/sources/widget.txt": PAPER,
    "refs/manifest/sources.lock.json": JSON.stringify({ files: [{ path: "sources/widget.txt", sha256: hashOf(PAPER), source_id: "widget-2026", fetch: null }] }, null, 2),
    "refs/records/widget-2026/L1-1.json": JSON.stringify(record, null, 2),
    "refs/records/widget-2026/L1-1.review.json": reviewFor(record),
    ...extra,
  };
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

describe("Check 12 — the card->shard hash join", () => {
  const shard = (fm: string[]) => ["---", ...fm, "---", "", "# Widget", "", "    refs/sources/widget.txt:2", '    "Theorem 1.1. Every widget is round,"', ""].join("\n");

  const joined = [
    "id: thm-widget",
    "kind: theorem",
    "status: cited",
    "af: none",
    `contract: ${BASE_RECORD.statement_blessed}`,
    "record: refs/records/widget-2026/L1-1.json",
    `record_sha256: ${canonicalRecordSha256(BASE_RECORD)}`,
  ];

  test("a correctly joined cited shard produces no finding", () => {
    const { findings, unit } = run(recordRepo(BASE_RECORD, { "argument/thm-widget.md": shard(joined) }));
    expect(findings.filter((f) => f.severity === "ERROR")).toEqual([]);
    expect(unit).toContain("1/1 shard-record joins");
  });

  test("a contract that is not the record's statement_blessed is [contract-mismatch]", () => {
    const fm = joined.map((l) => (l.startsWith("contract:") ? "contract: Every widget is square." : l));
    expectCode(run(recordRepo(BASE_RECORD, { "argument/thm-widget.md": shard(fm) })).findings, "contract-mismatch");
  });

  test("contract comparison collapses whitespace exactly like Gate 2 Check 9", () => {
    const fm = joined.map((l) => (l.startsWith("contract:") ? `contract:   Every widget is  round when   d-regular.` : l));
    expectNoCode(run(recordRepo(BASE_RECORD, { "argument/thm-widget.md": shard(fm) })).findings, "contract-mismatch");
  });

  test("a record_sha256 that is not the record's canonical digest is [record-sha-mismatch]", () => {
    const fm = joined.map((l) => (l.startsWith("record_sha256:") ? `record_sha256: ${"b".repeat(64)}` : l));
    expectCode(run(recordRepo(BASE_RECORD, { "argument/thm-widget.md": shard(fm) })).findings, "record-sha-mismatch");
  });

  test("a record: pointing at no existing record is [record-missing]", () => {
    const fm = joined.map((l) => (l.startsWith("record:") ? "record: refs/records/widget-2026/L1-9.json" : l));
    expectCode(run(recordRepo(BASE_RECORD, { "argument/thm-widget.md": shard(fm) })).findings, "record-missing");
  });

  test("a record: without record_sha256: is [record-sha-absent]", () => {
    const fm = joined.filter((l) => !l.startsWith("record_sha256:"));
    expectCode(run(recordRepo(BASE_RECORD, { "argument/thm-widget.md": shard(fm) })).findings, "record-sha-absent");
  });

  test("joining a record whose review is INVALID is [record-review-unusable]", () => {
    const files = recordRepo(BASE_RECORD, { "argument/thm-widget.md": shard(joined) });
    files["refs/records/widget-2026/L1-1.review.json"] = reviewFor(BASE_RECORD, { verdict: "INVALID" });
    expectCode(run(files).findings, "record-review-unusable");
  });

  test("proved-mod-audit joins on exactly the same terms", () => {
    const fm = joined.map((l) => (l === "status: cited" ? "status: proved-mod-audit" : l)).map((l) => (l.startsWith("contract:") ? "contract: Every widget is square." : l));
    expectCode(run(recordRepo(BASE_RECORD, { "argument/thm-widget.md": shard(fm) })).findings, "contract-mismatch");
  });

  test("a legacy cited shard with no record: is a WARN, not an ERROR (the migration path)", () => {
    const fm = joined.filter((l) => !l.startsWith("record"));
    const { findings } = run(recordRepo(BASE_RECORD, { "argument/thm-widget.md": shard(fm) }));
    const warn = expectCode(findings, "record-absent");
    expect(warn.severity).toBe("WARN");
    expect(findings.filter((f) => f.severity === "ERROR")).toEqual([]);
  });
});

describe("Phase matrix — Check 12 is STRUCTURAL", () => {
  test("a join ERROR survives applyPhase(exploration) unchanged", () => {
    const fm = [
      "id: thm-widget",
      "kind: theorem",
      "status: cited",
      "af: none",
      "contract: Every widget is square.",
      "record: refs/records/widget-2026/L1-1.json",
      `record_sha256: ${canonicalRecordSha256(BASE_RECORD)}`,
    ];
    const shard = ["---", ...fm, "---", "", "    refs/sources/widget.txt:2", '    "Theorem 1.1. Every widget is round,"', ""].join("\n");
    const { findings } = run(recordRepo(BASE_RECORD, { "argument/thm-widget.md": shard }));
    expect(expectCode(applyPhase(findings, "exploration"), "contract-mismatch").severity).toBe("ERROR");
  });
});
