// N1.3 (rk-lmtr): the payout engine — a PURE fold over the append-only reward event log.
// Every expected number below is HAND-COMPUTED from the pre-registered formulas
// (docs/memos/2026-08-08-prereg-autonomy-v1.md §1-§2), never derived by calling the engine's
// own helpers — the S0 smoke criterion is "payout log matches hand-computed values", and a
// test that mirrors the implementation could never fail. Formulas, restated:
//   H_real(spent)  = log2(1 + spent/100k)
//   E[tokens|pred] = 125k*p250k + 625k*(p1m - p250k) + 2M*(1 - p1m)
//   H_pred         = log2(1 + E/100k)
//   CLOSE  = w(tier) * H_real            w: proved 1.0 / proved-mod-audit 0.6 / numerical 0.25
//   REDUCE = max(0, H_pred(O) - sum H_pred(child)); 25% immediate, 75% escrow pro-rata by
//            child H_pred, vesting on that child's CLOSE; expires after 12 rounds without
//            any CLOSE/PRUNE among the children
//   PRUNE  = 0.3 * H_pred(node)
//   REUSE  = 10% of the CLOSE payout, minted extra, equal split over direct citations
//   COMPRESS = 0.1 * H_real(node), requires >= 2 distinct use sites, once per node
import { describe, expect, it } from "bun:test";
import { computePayouts } from "../../src/reward/engine";
import type { RewardEvent } from "../../src/reward/types";

// Hand-computed constants used across cases:
// pred (p250k=0, p1m=1):  E = 625k        -> H = log2(7.25)  = 2.857981
// pred (p250k=1, p1m=1):  E = 125k        -> H = log2(2.25)  = 1.169925
// close spent=300k:       H_real = log2(4) = 2 exactly
const H_SLOW = Math.log2(7.25);
const H_FAST = Math.log2(2.25);

describe("computePayouts", () => {
  it("pays CLOSE at tier-weight x H_real, and mints REUSE trickle to direct citations", () => {
    const events: RewardEvent[] = [
      { type: "close", node: "lem-a", tier: "proved", spentTokens: 300_000, citedDefs: ["def-x"], citedLemmas: ["lem-b"] },
    ];
    const r = computePayouts(events);
    expect(r.balances["lem-a"]).toBeCloseTo(2.0, 6); // 1.0 * log2(1 + 300k/100k)
    expect(r.balances["def-x"]).toBeCloseTo(0.1, 6); // half of 10% of 2.0
    expect(r.balances["lem-b"]).toBeCloseTo(0.1, 6);
    expect(r.diagnostics).toEqual([]);
  });

  it("weights CLOSE by tier: proved-mod-audit 0.6, numerical 0.25", () => {
    const r = computePayouts([
      { type: "close", node: "n1", tier: "proved-mod-audit", spentTokens: 300_000, citedDefs: [], citedLemmas: [] },
      { type: "close", node: "n2", tier: "numerical", spentTokens: 300_000, citedDefs: [], citedLemmas: [] },
    ]);
    expect(r.balances["n1"]).toBeCloseTo(1.2, 6);
    expect(r.balances["n2"]).toBeCloseTo(0.5, 6);
  });

  it("pays REDUCE 25% up front and vests escrow pro-rata as children close", () => {
    const events: RewardEvent[] = [
      { type: "predict", obligation: "goal", estimator: "e1", p250k: 0, p1m: 1 },
      { type: "predict", obligation: "c1", estimator: "e1", p250k: 1, p1m: 1 },
      { type: "predict", obligation: "c2", estimator: "e1", p250k: 1, p1m: 1 },
      { type: "reduce", obligation: "goal", children: ["c1", "c2"] },
    ];
    const V = H_SLOW - 2 * H_FAST; // 0.518131...
    let r = computePayouts(events);
    expect(r.balances["goal"]).toBeCloseTo(0.25 * V, 6);
    expect(r.escrows).toHaveLength(1);
    expect(r.escrows[0].remaining).toBeCloseTo(0.75 * V, 6);
    expect(r.escrows[0].expired).toBe(false);

    // c1 closes: half the escrow (equal child H_pred) vests to goal's balance.
    r = computePayouts([
      ...events,
      { type: "close", node: "c1", tier: "proved", spentTokens: 100_000, citedDefs: [], citedLemmas: [] },
    ]);
    expect(r.balances["goal"]).toBeCloseTo(0.25 * V + 0.375 * V, 6);
    expect(r.balances["c1"]).toBeCloseTo(1.0, 6); // log2(2), its own close
    expect(r.escrows[0].remaining).toBeCloseTo(0.375 * V, 6);
  });

  it("REDUCE with no net hardness reduction pays zero (V clamps at 0)", () => {
    const r = computePayouts([
      { type: "predict", obligation: "goal", estimator: "e1", p250k: 1, p1m: 1 },
      { type: "predict", obligation: "c1", estimator: "e1", p250k: 0, p1m: 1 },
      { type: "reduce", obligation: "goal", children: ["c1"] }, // child predicted HARDER than parent
    ]);
    expect(r.balances["goal"] ?? 0).toBeCloseTo(0, 6);
    expect(r.escrows[0].remaining).toBeCloseTo(0, 6);
  });

  it("expires escrow after 12 rounds with no CLOSE/PRUNE among the children", () => {
    const base: RewardEvent[] = [
      { type: "predict", obligation: "goal", estimator: "e1", p250k: 0, p1m: 1 },
      { type: "predict", obligation: "c1", estimator: "e1", p250k: 1, p1m: 1 },
      { type: "round", n: 1 },
      { type: "reduce", obligation: "goal", children: ["c1"] },
    ];
    const rounds: RewardEvent[] = Array.from({ length: 12 }, (_, i) => ({ type: "round", n: i + 2 }));
    const r = computePayouts([...base, ...rounds]);
    expect(r.escrows[0].expired).toBe(true);
    expect(r.escrows[0].remaining).toBeCloseTo(0, 6);
    expect(r.diagnostics.some((d) => d.code === "escrow-expired")).toBe(true);
    // A close AFTER expiry vests nothing.
    const late = computePayouts([
      ...base, ...rounds,
      { type: "close", node: "c1", tier: "proved", spentTokens: 100_000, citedDefs: [], citedLemmas: [] },
    ]);
    const V = H_SLOW - H_FAST;
    expect(late.balances["goal"]).toBeCloseTo(0.25 * V, 6); // upfront only, no vest
  });

  it("a child CLOSE inside the window keeps the rest of the escrow alive (activity resets the clock)", () => {
    const events: RewardEvent[] = [
      { type: "predict", obligation: "goal", estimator: "e1", p250k: 0, p1m: 1 },
      { type: "predict", obligation: "c1", estimator: "e1", p250k: 1, p1m: 1 },
      { type: "predict", obligation: "c2", estimator: "e1", p250k: 1, p1m: 1 },
      { type: "round", n: 1 },
      { type: "reduce", obligation: "goal", children: ["c1", "c2"] },
      ...Array.from({ length: 8 }, (_, i): RewardEvent => ({ type: "round", n: i + 2 })),
      { type: "close", node: "c1", tier: "proved", spentTokens: 100_000, citedDefs: [], citedLemmas: [] },
      ...Array.from({ length: 8 }, (_, i): RewardEvent => ({ type: "round", n: i + 10 })),
    ];
    const r = computePayouts(events);
    // 16 rounds total since grant, but only 8 since last child activity -> still live.
    expect(r.escrows[0].expired).toBe(false);
  });

  it("pays PRUNE at 0.3 x H_pred with a certificate, and ignores duplicate CLOSEs loudly", () => {
    const r = computePayouts([
      { type: "predict", obligation: "b1", estimator: "e1", p250k: 0, p1m: 1 },
      { type: "prune", node: "b1", certRef: "af:refutation:b1#4" },
      { type: "close", node: "n", tier: "proved", spentTokens: 100_000, citedDefs: [], citedLemmas: [] },
      { type: "close", node: "n", tier: "proved", spentTokens: 900_000, citedDefs: [], citedLemmas: [] },
    ]);
    expect(r.balances["b1"]).toBeCloseTo(0.3 * H_SLOW, 6);
    expect(r.balances["n"]).toBeCloseTo(1.0, 6); // first close only
    expect(r.diagnostics.some((d) => d.code === "duplicate-close" && d.node === "n")).toBe(true);
  });

  it("COMPRESS needs >= 2 distinct use sites and pays once per node", () => {
    const r = computePayouts([
      { type: "close", node: "n", tier: "proved", spentTokens: 300_000, citedDefs: [], citedLemmas: [] },
      { type: "compress", node: "n", useSites: ["a"] },
      { type: "compress", node: "n", useSites: ["a", "b"] },
      { type: "compress", node: "n", useSites: ["a", "b", "c"] },
    ]);
    // 2.0 (close) + 0.1 * 2.0 (one compress) — the 1-site attempt and the repeat both refused.
    expect(r.balances["n"]).toBeCloseTo(2.2, 6);
    expect(r.diagnostics.filter((d) => d.code === "compress-refused")).toHaveLength(2);
  });

  it("a REDUCE without predictions for parent and children is refused, never guessed", () => {
    const r = computePayouts([{ type: "reduce", obligation: "goal", children: ["c1"] }]);
    expect(r.balances["goal"] ?? 0).toBe(0);
    expect(r.escrows).toHaveLength(0);
    expect(r.diagnostics.some((d) => d.code === "reduce-unpredicted")).toBe(true);
  });

  it("averages multiple estimators' predictions for the same obligation", () => {
    const r = computePayouts([
      { type: "predict", obligation: "b1", estimator: "e1", p250k: 0, p1m: 1 },
      { type: "predict", obligation: "b1", estimator: "e2", p250k: 1, p1m: 1 },
      { type: "prune", node: "b1", certRef: "cert" },
    ]);
    // mean E = (625k + 125k)/2 = 375k -> H = log2(4.75)
    expect(r.balances["b1"]).toBeCloseTo(0.3 * Math.log2(4.75), 6);
  });
});
