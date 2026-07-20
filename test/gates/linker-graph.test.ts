// M3 blocker 7c (docs/reviews/2026-07-19-m3-milestone-review-codex.md finding 7): the linker must
// surface a shard whose persisted balloon state (Lemma.balloons, M3 blocker 7b) has crossed the
// mandatory-review threshold src/drive/driver-balloon.ts's `routeBalloon` defines. `checkMandatoryReview`
// is the WARN-tier Finding half of that (same tier as checkBrittleness/check 12); it is NOT yet
// wired into linkerGate (src/gates/linker.ts is out of this wave's file scope — see the repair-wave
// return notes for the follow-up wiring bead). `isMandatoryReview` (linker-parse.ts) is the shared
// predicate this also exercises directly.

import { describe, expect, test } from "bun:test";
import type { Lemma } from "../../src/gates/linker-parse";
import { isMandatoryReview } from "../../src/gates/linker-parse";
import { checkMandatoryReview } from "../../src/gates/linker-graph";

function lemma(overrides: Partial<Lemma> = {}): Lemma {
  return {
    id: "lem-x",
    path: "argument/lemmas/lem-x.md",
    kind: "lemma",
    status: "stated",
    af: "none",
    contract: "X holds.",
    defs: [],
    deps: [],
    routes: [],
    balloons: { count: 0, classifications: [] },
    ...overrides,
  };
}

describe("isMandatoryReview (M3 blocker 7c predicate)", () => {
  test("a never-ballooned shard (count 0) is not mandatory-review", () => {
    expect(isMandatoryReview({ count: 0, classifications: [] })).toBe(false);
  });

  test("a first balloon classified missing-fact or dag-dep is NOT mandatory-review on its own", () => {
    expect(isMandatoryReview({ count: 1, classifications: ["missing-fact"] })).toBe(false);
    expect(isMandatoryReview({ count: 1, classifications: ["dag-dep"] })).toBe(false);
  });

  test("a first balloon classified genuine-gap IS mandatory-review even at count 1 (routeBalloon's " +
    "unconditional genuine-gap clause)", () => {
    expect(isMandatoryReview({ count: 1, classifications: ["genuine-gap"] })).toBe(true);
  });

  test("a REPEAT balloon (count >= 2) is mandatory-review regardless of classification " +
    "(routeBalloon's priorBalloonCount >= 1 clause outranks classification)", () => {
    expect(isMandatoryReview({ count: 2, classifications: ["missing-fact", "missing-fact"] })).toBe(true);
    expect(isMandatoryReview({ count: 2, classifications: ["dag-dep", "dag-dep"] })).toBe(true);
  });
});

describe("checkMandatoryReview (board-facing Finding, WARN tier like checkBrittleness)", () => {
  test("no findings when no shard is in mandatory-review state", () => {
    const findings = checkMandatoryReview([lemma(), lemma({ id: "lem-y", path: "argument/lem-y.md", balloons: { count: 1, classifications: ["missing-fact"] } })]);
    expect(findings).toEqual([]);
  });

  test("a repeat-ballooned shard is flagged WARN, naming the count and classification history", () => {
    const findings = checkMandatoryReview([
      lemma({ balloons: { count: 2, classifications: ["missing-fact", "dag-dep"] } }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("WARN");
    expect(findings[0]?.path).toBe("argument/lemmas/lem-x.md");
    expect(findings[0]?.message).toContain("MANDATORY-REVIEW");
    expect(findings[0]?.message).toContain("lem-x");
    expect(findings[0]?.message).toContain("2 times");
    expect(findings[0]?.message).toContain("missing-fact; dag-dep");
  });

  test("a first-balloon genuine-gap shard is flagged too (count 1)", () => {
    const findings = checkMandatoryReview([lemma({ balloons: { count: 1, classifications: ["genuine-gap"] } })]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("1 time ");
  });

  test("mutation guard: only mandatory-review shards are flagged, not every ballooned shard", () => {
    const findings = checkMandatoryReview([
      lemma({ id: "safe", path: "argument/safe.md", balloons: { count: 1, classifications: ["missing-fact"] } }),
    ]);
    expect(findings).toEqual([]);
  });
});
