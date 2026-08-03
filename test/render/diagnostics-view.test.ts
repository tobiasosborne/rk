// src/render/diagnostics-view.ts — M2 boundary review, landing-blocker #2 (consumer side). Pins
// the exact wording shared between the terminal (`rk render`/`rk graph`) and the HTML site-level
// banner + dashboard "evidence sources" block: a degraded/absent source (af ledger-fallback, fr
// log-fallback, an absent bd) must be visibly distinguished from an authoritative read, and every
// structural-loss entry (a skipped registry shard, a malformed fr log line) must be nameable, one
// line each — never a bare "something's wrong".
//
// Three-state model, load-bearing: "ok" (export/read), "fallback" (real degradation -- loud), and
// "absent" (legitimate non-adoption -- named, but never alarm-worthy on its own). A source that was
// simply never engaged (no af-tracked node, no `.frontier/`, no `.beads/`) must NOT trigger the
// same loud banner a genuine reduced-fidelity fallback does -- that would false-alarm on the
// overwhelmingly common "no fr/bd adopted yet" case.

import { describe, expect, test } from "bun:test";
import {
  hasDegradedSource, renderDegradedBanner, renderSourcesBlock, sourceStatusLines, structuralLossCount,
  structuralLossLines,
  type SourceStatuses, type StructuralLoss,
} from "../../src/render/diagnostics-view";

const NO_LOSS: StructuralLoss = {
  registrySkips: [], frMalformedLines: [], retractionStoreProblems: [], bdMalformedLines: [],
};

const CLEAN: SourceStatuses = { af: "export", fr: "export", bd: "read" };
const ALL_ABSENT: SourceStatuses = { af: "absent", fr: "absent", bd: "absent" };
const FALLBACK: SourceStatuses = { af: "ledger-fallback", fr: "log-fallback", bd: "absent" };

describe("render/diagnostics-view — structural loss lines (blocker #2)", () => {
  test("names every registrySkip and frMalformedLine, one line each", () => {
    const loss: StructuralLoss = {
      ...NO_LOSS,
      registrySkips: [{ path: "argument/lem-x.md", reason: "missing/invalid kind" }],
      frMalformedLines: [{ lineNo: 7, snippet: "{not json" }],
    };
    const lines = structuralLossLines(loss);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("argument/lem-x.md");
    expect(lines[0]).toContain("missing/invalid kind");
    expect(lines[1]).toContain("line 7");
    expect(lines[1]).toContain("{not json");
  });

  test("no structural loss: no lines", () => {
    expect(structuralLossLines(NO_LOSS)).toEqual([]);
  });

  // LB4 (2026-08-03 M3-close review): the producer (src/store/build-graph.ts) has counted
  // `retractionStoreProblems` toward `isStructurallyComplete` since rk-0ehr, but this view mirrored
  // only TWO of its arrays — so `rk render`/`rk graph`/`rk verify` refused while enumerating ZERO
  // entries, breaking their own "naming every entry" promise. `bdMalformedLines` joined the same
  // shape at the same time.
  test("names every retractionStoreProblem — the third class (LB4: previously enumerated as nothing)", () => {
    const loss: StructuralLoss = {
      ...NO_LOSS,
      retractionStoreProblems: ["line 2: not valid JSON — likely a truncated/corrupted append"],
    };
    const lines = structuralLossLines(loss);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("retraction store:");
    expect(lines[0]).toContain("line 2: not valid JSON");
    expect(structuralLossCount(loss)).toBe(1);
  });

  test("names every bdMalformedLine — the fourth class (LB4)", () => {
    const loss: StructuralLoss = { ...NO_LOSS, bdMalformedLines: [{ lineNo: 12, snippet: '{"id":"rk-a' }] };
    const lines = structuralLossLines(loss);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("bd issues: line 12 malformed");
    expect(lines[0]).toContain('{"id":"rk-a');
  });

  test("all four classes at once: one line each, count agrees with the enumeration", () => {
    const loss: StructuralLoss = {
      registrySkips: [{ path: "argument/lem-x.md", reason: "missing/invalid kind" }],
      frMalformedLines: [{ lineNo: 7, snippet: "{not json" }],
      retractionStoreProblems: ["line 2: not valid JSON"],
      bdMalformedLines: [{ lineNo: 12, snippet: '{"id":"rk-a' }],
    };
    expect(structuralLossLines(loss)).toHaveLength(4);
    expect(structuralLossCount(loss)).toBe(4);
    // The count is DERIVED from the same shape the enumeration walks — a consumer can never print
    // "0 structural-loss entries" while another prints four of them.
    expect(structuralLossCount(loss)).toBe(structuralLossLines(loss).length);
  });
});

describe("render/diagnostics-view — per-source status wording (blocker #2)", () => {
  test("clean sources: exact 'export'/'read' wording, never mentioning fidelity", () => {
    expect(sourceStatusLines(CLEAN)).toEqual(["af: export", "fr: export", "bd: read"]);
  });

  test("absent sources: named plainly, never mentioning fidelity (legitimate non-adoption)", () => {
    expect(sourceStatusLines(ALL_ABSENT)).toEqual(["af: absent", "fr: absent", "bd: absent"]);
  });

  test("fallback sources: the exact 'reduced fidelity' wording the review named", () => {
    expect(sourceStatusLines(FALLBACK)).toEqual([
      "af: ledger fallback (reduced fidelity)",
      "fr: log fallback (reduced fidelity)",
      "bd: absent",
    ]);
  });
});

describe("render/diagnostics-view — hasDegradedSource: fallback is loud, absent alone is not", () => {
  test("fully authoritative: false", () => {
    expect(hasDegradedSource(CLEAN)).toBe(false);
  });

  test("BLOCKER-adjacent guard: all-absent (the common 'nothing adopted yet' case) is NOT degraded", () => {
    expect(hasDegradedSource(ALL_ABSENT)).toBe(false);
  });

  test("any genuine fallback IS degraded, regardless of the other two sources' state", () => {
    expect(hasDegradedSource(FALLBACK)).toBe(true);
    expect(hasDegradedSource({ af: "ledger-fallback", fr: "export", bd: "read" })).toBe(true);
    expect(hasDegradedSource({ af: "export", fr: "log-fallback", bd: "absent" })).toBe(true);
  });
});

describe("render/diagnostics-view — HTML surfaces (banner + dashboard sources block)", () => {
  test("renderDegradedBanner is empty when every source is authoritative -- nothing to warn about", () => {
    expect(renderDegradedBanner(CLEAN)).toBe("");
  });

  test("renderDegradedBanner is ALSO empty when every source is merely absent -- not alarm-worthy alone", () => {
    expect(renderDegradedBanner(ALL_ABSENT)).toBe("");
  });

  test("renderDegradedBanner names every FALLBACK source (never the merely-absent bd), styled as a defect", () => {
    const html = renderDegradedBanner(FALLBACK);
    expect(html).toContain("rk-defect");
    expect(html).toContain("ledger fallback (reduced fidelity)");
    expect(html).toContain("log fallback (reduced fidelity)");
    expect(html).not.toContain("bd:"); // bd is absent, not a fallback -- not named in the loud banner
  });

  test("renderSourcesBlock always renders, one row per source, with three distinct CSS states", () => {
    const clean = renderSourcesBlock(CLEAN);
    expect(clean).toContain("af: export");
    expect(clean).toContain("rk-ok");
    expect(clean).not.toContain("rk-defect");
    expect(clean).not.toContain("rk-muted");

    const allAbsent = renderSourcesBlock(ALL_ABSENT);
    expect(allAbsent).toContain("rk-muted");
    expect(allAbsent).not.toContain("rk-defect"); // absent is informational, not a defect

    const fallback = renderSourcesBlock(FALLBACK);
    expect(fallback).toContain("rk-defect"); // af, fr
    expect(fallback).toContain("rk-muted"); // bd
    expect(fallback).toContain("ledger fallback (reduced fidelity)");
  });
});
