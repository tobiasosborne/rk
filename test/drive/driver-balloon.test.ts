// 1:1 test for src/drive/driver-balloon.ts (M3.6, THE distinctive piece). Ground truth: PRD C9's
// exact balloon routing table + IMPLEMENTATION_PLAN.md M3.6's acceptance (each classification routes
// correctly; a repeat balloon → mandatory review). Mutation notes accompany the routing assertions.

import { describe, expect, test } from "bun:test";
import {
  DEFAULT_BALLOON_NODE_CAP,
  balloonBdTask,
  balloonLogLine,
  buildBalloonEvent,
  detectBalloon,
  parseClassificationReview,
  routeBalloon,
  routingMarksShard,
} from "../../src/drive/driver-balloon";

describe("detectBalloon — the node-count tripwire", () => {
  test("fires strictly ABOVE the cap", () => {
    // mutation: `>=` instead of `>` → the boundary (== cap) case goes red.
    expect(detectBalloon(DEFAULT_BALLOON_NODE_CAP + 1).ballooned).toBe(true);
    expect(detectBalloon(DEFAULT_BALLOON_NODE_CAP).ballooned).toBe(false);
    expect(detectBalloon(50, 40).ballooned).toBe(true);
  });
});

describe("parseClassificationReview — the classification comes from a real review, never a guess", () => {
  test("accepts a well-formed review", () => {
    const r = parseClassificationReview({ classification: "missing-fact", rationale: "def X never provisioned" });
    expect(r.ok).toBe(true);
  });
  test("rejects an unknown classification (never silently defaults)", () => {
    expect(parseClassificationReview({ classification: "vibes", rationale: "x" }).ok).toBe(false);
    expect(parseClassificationReview({ classification: "missing-fact" }).ok).toBe(false); // no rationale
    expect(parseClassificationReview("not-an-object").ok).toBe(false);
  });
});

describe("routeBalloon — PRD C9's exact routing", () => {
  test("missing-fact (first balloon) → bd-provision", () => {
    expect(routeBalloon("missing-fact", 0)).toBe("bd-provision");
  });
  test("dag-dep (first balloon) → bd-factoring", () => {
    // mutation: return "bd-provision" for dag-dep → red.
    expect(routeBalloon("dag-dep", 0)).toBe("bd-factoring");
  });
  test("genuine-gap → mandatory-review", () => {
    expect(routeBalloon("genuine-gap", 0)).toBe("mandatory-review");
  });
  test("a REPEAT balloon on the same contract → mandatory-review, whatever the classification", () => {
    // mutation: drop the `priorBalloonCount >= 1` clause → these three go red.
    expect(routeBalloon("missing-fact", 1)).toBe("mandatory-review");
    expect(routeBalloon("dag-dep", 2)).toBe("mandatory-review");
    expect(routeBalloon("genuine-gap", 1)).toBe("mandatory-review");
  });
});

describe("routingMarksShard — only mandatory-review marks the shard", () => {
  test("mandatory-review marks; bd routings do not", () => {
    expect(routingMarksShard("mandatory-review")).toBe(true);
    expect(routingMarksShard("bd-provision")).toBe(false);
    expect(routingMarksShard("bd-factoring")).toBe(false);
  });
});

describe("buildBalloonEvent + log line", () => {
  const review = { classification: "genuine-gap" as const, rationale: "hypotheses too weak" };
  test("event carries the PRD-mandated fields and the computed routing", () => {
    const e = buildBalloonEvent({ contractId: "lem-x", nodeCount: 99, cap: 40, review, offendingSubtree: ["1.3", "1.1"], priorBalloonCount: 0 });
    expect(e.contractId).toBe("lem-x");
    expect(e.nodeCount).toBe(99);
    expect(e.classification).toBe("genuine-gap");
    expect(e.routing).toBe("mandatory-review");
    expect(e.offendingSubtree).toEqual(["1.1", "1.3"]); // sorted
  });
  test("log line is stable JSON carrying kind:balloon + the timestamp the edge supplies", () => {
    const e = buildBalloonEvent({ contractId: "lem-x", nodeCount: 99, cap: 40, review, offendingSubtree: ["1.1"], priorBalloonCount: 0 });
    const parsed = JSON.parse(balloonLogLine(e, "2026-07-19T00:00:00Z"));
    expect(parsed.kind).toBe("balloon");
    expect(parsed.at).toBe("2026-07-19T00:00:00Z");
    expect(parsed.routing).toBe("mandatory-review");
  });
  test("bd task title/description reflect the classification and contract", () => {
    const e = buildBalloonEvent({ contractId: "lem-x", nodeCount: 99, cap: 40, review: { classification: "dag-dep", rationale: "shared lemma" }, offendingSubtree: ["1.1"], priorBalloonCount: 0 });
    const task = balloonBdTask(e);
    expect(task.title).toContain("lem-x");
    expect(task.title).toContain("factoring");
    expect(task.description).toContain("dag-dep");
  });
});
