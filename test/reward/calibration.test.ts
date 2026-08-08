// N1.4 (rk-lmtr): Brier scoring of pre-registered hardness predictions against realized
// outcomes (prereg §2). Hand-computed expectations, same stance as engine.test.ts.
//   Outcome of an obligation: CLOSE with spentTokens <= 250k -> y250=1,y1m=1;
//   <= 1M -> y250=0,y1m=1; > 1M -> y250=0,y1m=0; PRUNE -> y250=y1m=0; else UNRESOLVED (skip).
//   Brier per estimator = mean over its resolved predictions of ((p250k-y250)^2+(p1m-y1m)^2)/2.
//   Weight = clip(0.25/brier, 0.5, 2.0); brier 0 -> 2.0 (cap).
import { describe, expect, it } from "bun:test";
import { computeCalibration } from "../../src/reward/calibration";
import type { RewardEvent } from "../../src/reward/types";

const close = (nodeId: string, spentTokens: number): RewardEvent =>
  ({ type: "close", nodeId, tier: "proved", spentTokens, citedDefs: [], citedLemmas: [] });

describe("computeCalibration", () => {
  it("scores a perfect estimator at brier 0, weight capped at 2.0", () => {
    const r = computeCalibration([
      { type: "predict", obligation: "a", estimator: "good", p250k: 1, p1m: 1 },
      close("a", 200_000), // y250=1, y1m=1 — exactly as predicted
    ]);
    expect(r.estimators).toEqual([{ estimator: "good", resolved: 1, brier: 0, weight: 2.0 }]);
  });

  it("scores a confidently-wrong estimator at brier 1, weight floored at 0.5", () => {
    const r = computeCalibration([
      { type: "predict", obligation: "a", estimator: "bad", p250k: 1, p1m: 1 },
      { type: "prune", nodeId: "a", certRef: "cert" }, // y250=y1m=0
    ]);
    expect(r.estimators[0].brier).toBeCloseTo(1.0, 6);
    expect(r.estimators[0].weight).toBe(0.5);
  });

  it("resolves the mid-band outcome (250k < spent <= 1M) as y250=0, y1m=1", () => {
    const r = computeCalibration([
      { type: "predict", obligation: "a", estimator: "e", p250k: 0.5, p1m: 1 },
      close("a", 600_000),
    ]);
    // brier = ((0.5-0)^2 + (1-1)^2)/2 = 0.125; weight = 0.25/0.125 = 2.0 (at cap)
    expect(r.estimators[0].brier).toBeCloseTo(0.125, 6);
    expect(r.estimators[0].weight).toBe(2.0);
  });

  it("skips unresolved predictions and reports them", () => {
    const r = computeCalibration([
      { type: "predict", obligation: "open-forever", estimator: "e", p250k: 0.5, p1m: 0.5 },
      { type: "predict", obligation: "a", estimator: "e", p250k: 1, p1m: 1 },
      close("a", 100_000),
    ]);
    expect(r.estimators[0].resolved).toBe(1);
    expect(r.unresolved).toBe(1);
  });

  it("averages across an estimator's resolved predictions and sorts estimators by name", () => {
    const r = computeCalibration([
      { type: "predict", obligation: "a", estimator: "z", p250k: 1, p1m: 1 },
      { type: "predict", obligation: "b", estimator: "z", p250k: 1, p1m: 1 },
      { type: "predict", obligation: "a", estimator: "m", p250k: 0, p1m: 0 },
      close("a", 100_000), // y=1,1: z perfect here; m confidently wrong
      { type: "prune", nodeId: "b", certRef: "c" }, // y=0,0: z confidently wrong here
    ]);
    // z: (0 + 1)/2 = 0.5 brier -> weight 0.5; m: brier 1 -> 0.5
    expect(r.estimators.map((e) => e.estimator)).toEqual(["m", "z"]);
    expect(r.estimators[1].brier).toBeCloseTo(0.5, 6);
    expect(r.estimators[1].weight).toBe(0.5);
  });

  it("weight interpolates between the clips for a mediocre estimator", () => {
    const r = computeCalibration([
      { type: "predict", obligation: "a", estimator: "e", p250k: 0.6, p1m: 0.6 },
      { type: "prune", nodeId: "a", certRef: "c" }, // y=0,0: brier = (0.36+0.36)/2 = 0.36
    ]);
    expect(r.estimators[0].brier).toBeCloseTo(0.36, 6);
    expect(r.estimators[0].weight).toBeCloseTo(0.25 / 0.36, 6); // 0.6944, inside [0.5, 2]
  });
});
