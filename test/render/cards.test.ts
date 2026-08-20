// rk-nsex step 5: the GENERATED card. `refs/cards/<source-id>/L1-<n>.md` is rendered
// deterministically from the extraction record plus its review record, declared in
// `.rk/generated.json` with generator `cards-v1`, and byte-diffed by Gate 7 — so a hand-edited
// card is a freshness failure rather than a quietly authoritative document. Ground truth:
// docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md section 4 ("Generated cards"),
// docs/gate-contracts.md Gate 3 Check 11 / Gate 7.
//
// L1 red-green: written before src/render/cards.ts existed (import error = RED).

import { describe, expect, test } from "bun:test";
import { renderCard, renderCardForPath, cardPathForRecord, recordPathForCard } from "../../src/render/cards";
import { collectRecords } from "../../src/gates/refs-records";
import { canonicalRecordSha256 } from "../../src/gates/canonical-json";
import { freshnessGate } from "../../src/gates/freshness";
import { DEFAULT_GATE_CONFIG } from "../../src/gates/config";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { sha256Hex } from "../../src/gates/sha256";

const PAPER = ["Section 2. Preliminaries", "Theorem 1.1. Every widget is round,", "where the widget is d-regular.", "Proof. Omitted.", ""].join("\n");
const hashOf = (t: string) => sha256Hex(new TextEncoder().encode(t));

const RECORD = {
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

function review(overrides: Record<string, unknown> = {}): string {
  const clause = (note: string) => ({ value: true, note });
  return JSON.stringify({
    schema_version: "1",
    card_sha256: canonicalRecordSha256(RECORD),
    verdict: "VALID",
    reviewer: { family: "gpt", backend: "codex", model: "gpt-5.6-sol", session: "s1" },
    checked: {
      statement_complete: clause("read lines 2-3 against the record"),
      hypotheses_complete: clause("one hypothesis"),
      translation_faithful: clause("faithful"),
      signature_faithful: clause("faithful"),
    },
    findings: ["the label is 1.1 in v2 of the preprint"],
    ...overrides,
  });
}

function files(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "refs/sources/widget.txt": PAPER,
    "refs/manifest/sources.lock.json": JSON.stringify({ files: [{ path: "sources/widget.txt", sha256: hashOf(PAPER) }] }),
    "refs/records/widget-2026/L1-1.json": JSON.stringify(RECORD, null, 2),
    "refs/records/widget-2026/L1-1.review.json": review(),
    ...extra,
  };
}

function cardBytes(extra: Record<string, string> = {}): string {
  const result = renderCardForPath(snapshotFromFiles(files(extra)), "refs/cards/widget-2026/L1-1.md");
  if (!result.ok) throw new Error(result.reason);
  return result.bytes;
}

describe("card paths", () => {
  test("record <-> card path round trip", () => {
    expect(cardPathForRecord("refs/records/widget-2026/L1-1.json")).toBe("refs/cards/widget-2026/L1-1.md");
    expect(recordPathForCard("refs/cards/widget-2026/L1-1.md")).toBe("refs/records/widget-2026/L1-1.json");
    expect(recordPathForCard("refs/cards/widget-2026/notes.md")).toBeUndefined();
  });
});

describe("renderCard", () => {
  test("is deterministic: the same record renders the same bytes every time", () => {
    expect(cardBytes()).toBe(cardBytes());
  });

  test("carries no clock-shaped content (no timestamp, no date)", () => {
    expect(cardBytes()).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
  });

  test("shows the printed statement, the blessed statement, every hypothesis anchor and the review seam", () => {
    const card = cardBytes();
    expect(card).toContain("Theorem 1.1. Every widget is round,");
    expect(card).toContain("Every widget is round when d-regular.");
    expect(card).toContain("refs/sources/widget.txt:3");
    expect(card).toContain("gpt-5.6-sol");
    expect(card).toContain(canonicalRecordSha256(RECORD));
    expect(card).toContain("the label is 1.1 in v2 of the preprint");
  });

  test("names the record as the authored truth and itself as generated", () => {
    expect(cardBytes()).toContain("refs/records/widget-2026/L1-1.json");
    expect(cardBytes()).toContain("cards-v1");
  });
});

describe("renderCard — the refusal stub", () => {
  test("a record with NO review renders an empty NOT ADMISSIBLE card, never the statement", () => {
    const snap = snapshotFromFiles(files());
    const withoutReview = new Map(snap);
    withoutReview.delete("refs/records/widget-2026/L1-1.review.json");
    const result = renderCardForPath(snapshotFromFiles(withoutReview), "refs/cards/widget-2026/L1-1.md");
    if (!result.ok) throw new Error(result.reason);
    expect(result.bytes).toContain("NOT ADMISSIBLE");
    expect(result.bytes).not.toContain("Every widget is round when d-regular.");
  });

  test("an INVALID review renders the refusal stub naming the verdict", () => {
    const card = cardBytes({ "refs/records/widget-2026/L1-1.review.json": review({ verdict: "INVALID" }) });
    expect(card).toContain("NOT ADMISSIBLE");
    expect(card).toContain("INVALID");
    expect(card).not.toContain("Every widget is round when d-regular.");
  });

  test("a review bound to other bytes renders the refusal stub (the record was edited after review)", () => {
    const card = cardBytes({ "refs/records/widget-2026/L1-1.review.json": review({ card_sha256: "a".repeat(64) }) });
    expect(card).toContain("NOT ADMISSIBLE");
    expect(card).not.toContain("Every widget is round when d-regular.");
  });

  test("a card path with no record behind it cannot be regenerated (never an empty pass)", () => {
    const result = renderCardForPath(snapshotFromFiles(files()), "refs/cards/widget-2026/L1-9.md");
    expect(result.ok).toBe(false);
  });
});

describe("Gate 7 adoption (generator cards-v1)", () => {
  const manifest = JSON.stringify({
    schema_version: "1",
    entries: [{ path: "refs/cards/widget-2026/L1-1.md", generator: "cards-v1" }],
  });

  test("a card matching its record is clean and counted", () => {
    const snap = snapshotFromFiles(files({ ".rk/generated.json": manifest, "refs/cards/widget-2026/L1-1.md": cardBytes() }));
    const result = freshnessGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(result.findings).toEqual([]);
    expect(result.coverage[0]!.checked).toBe(1);
  });

  test("a hand-edited card is STALE", () => {
    const edited = cardBytes().replace("Every widget is round when d-regular.", "Every widget is round, no conditions.");
    const snap = snapshotFromFiles(files({ ".rk/generated.json": manifest, "refs/cards/widget-2026/L1-1.md": edited }));
    const result = freshnessGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(result.findings.map((f) => f.message).join(" ")).toContain("STALE");
  });

  test("a declared card whose record is gone cannot be regenerated — a named ERROR, never a pass", () => {
    const base = files({ ".rk/generated.json": manifest, "refs/cards/widget-2026/L1-1.md": cardBytes() });
    delete base["refs/records/widget-2026/L1-1.json"];
    const result = freshnessGate.run(snapshotFromFiles(base), DEFAULT_GATE_CONFIG);
    expect(result.findings.map((f) => f.message).join(" ")).toContain("cannot be regenerated for verification");
  });
});

describe("collectRecords is the one parser both the gate and the renderer use", () => {
  test("the renderer reads the same record the gate does", () => {
    const records = collectRecords(snapshotFromFiles(files()));
    expect(records.l1).toHaveLength(1);
    expect(renderCard(records.l1[0]!, records.reviews.get("refs/records/widget-2026/L1-1.json"))).toBe(cardBytes());
  });
});
