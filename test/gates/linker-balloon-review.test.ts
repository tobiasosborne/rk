// 1:1 test file for src/gates/linker-balloon-review.ts (split from linker-parse.ts, rk-c83). Same
// assertions as the pre-split "isMandatoryReview (M3 blocker 7c predicate)" describe block that
// used to live in test/gates/linker-graph.test.ts against the `../../src/gates/linker-parse`
// re-export — copied here verbatim, importing directly from the new module, to prove the moved
// function's behavior is unchanged. linker-graph.test.ts keeps its own copy (unedited, out of this
// split's file scope) covering the same predicate via linker-parse.ts's back-compat re-export.

import { describe, expect, test } from "bun:test";
import { isMandatoryReview } from "../../src/gates/linker-balloon-review";

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
