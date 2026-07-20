// 1:1 tests for src/drive/driver-stall.ts — the stall-cause legibility helpers (RUN-REPORT-8
// carried P2). Message-only: these prove the classifier collapses node-specific detail so counts
// aggregate, and that the summary names the dominant class deterministically.

import { describe, expect, test } from "bun:test";
import { appendStallCause, stallReasonClass, summarizeStallCauses } from "../../src/drive/driver-stall";

const CROSS_VENDOR_RUN_A =
  "cross-vendor: identity-unparseable on load-bearing node '1' (prover=unknown, verifier=gpt) — fails closed, never conflated with a confirmed same-family violation";
const CROSS_VENDOR_RUN_B =
  "cross-vendor: identity-unparseable on load-bearing node '1' (prover=unknown, verifier=claude) — fails closed, never conflated with a confirmed same-family violation";

describe("stallReasonClass — collapses node/per-turn detail to a stable class", () => {
  test("cross-vendor identity-unparseable → the bare class, regardless of node id / verifier family", () => {
    expect(stallReasonClass(CROSS_VENDOR_RUN_A)).toBe("cross-vendor: identity-unparseable");
    expect(stallReasonClass(CROSS_VENDOR_RUN_B)).toBe("cross-vendor: identity-unparseable");
  });

  test("cross-vendor same-family collapses to its own distinct class", () => {
    const r = "cross-vendor: same-family on load-bearing node '1.2' (prover=verifier=gpt) — promotion to proved requires ...";
    expect(stallReasonClass(r)).toBe("cross-vendor: same-family");
  });

  test("verdict bind failed collapses regardless of the per-turn detail", () => {
    expect(stallReasonClass("verdict bind failed: items.0.verdict: must be a non-blank string")).toBe("verdict bind failed");
  });

  test("reviewer==author drops its parenthetical", () => {
    expect(stallReasonClass("reviewer==author (would be rejected by af)")).toBe("reviewer==author");
  });

  test("an unrecognized shape is returned as-is (still a usable class)", () => {
    expect(stallReasonClass("no worker available")).toBe("no worker available");
  });
});

describe("summarizeStallCauses — dominant class + count", () => {
  test("empty tally → undefined (nothing to append)", () => {
    expect(summarizeStallCauses(new Map())).toBeUndefined();
  });

  test("names the highest-count class with its count", () => {
    const causes = new Map<string, number>([
      ["cross-vendor: identity-unparseable", 3],
      ["worker exit 12", 1],
    ]);
    expect(summarizeStallCauses(causes)).toBe("dominant cause: cross-vendor: identity-unparseable ×3");
  });

  test("ties break lexicographically for determinism", () => {
    const causes = new Map<string, number>([
      ["zeta", 2],
      ["alpha", 2],
    ]);
    expect(summarizeStallCauses(causes)).toBe("dominant cause: alpha ×2");
  });
});

describe("appendStallCause", () => {
  test("appends the summary to a base message when there is a cause", () => {
    const causes = new Map<string, number>([["worker exit 12", 2]]);
    expect(appendStallCause("stuck-no-progress", causes)).toBe("stuck-no-progress — dominant cause: worker exit 12 ×2");
  });
  test("returns the base unchanged when the tally is empty", () => {
    expect(appendStallCause("stuck-no-progress", new Map())).toBe("stuck-no-progress");
  });
});
