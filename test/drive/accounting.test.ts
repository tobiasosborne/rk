// 1:1 test file for src/drive/accounting.ts (M3.3). Unit tests pin down rollup + the honest
// cache-fraction definition (token-weighted, output EXCLUDED — docs/memos/
// 2026-07-19-m3.0-caching-spike.md); the property test is the CONSERVATION acceptance bar: for any
// random sequence of `recordTurn` calls across random (node, claim, campaign) keys, the sum of
// every individual usage recorded must equal `grandTotal` exactly — no turn silently dropped,
// double-counted, or misattributed by the per-key aggregation.

import { describe, expect, test } from "bun:test";
import {
  allKeys,
  cacheFraction,
  emptyAccountingState,
  grandTotal,
  recordTurn,
  totalsFor,
  type AccountingKey,
  type AccountingState,
} from "../../src/drive/accounting";
import type { WorkerUsage } from "../../src/drive/worker-result";

const KEY_A: AccountingKey = { nodeId: "node-1", claimId: "claim-1", campaignId: "campaign-1" };
const KEY_B: AccountingKey = { nodeId: "node-2", claimId: "claim-1", campaignId: "campaign-1" };

function usage(overrides: Partial<WorkerUsage> = {}): WorkerUsage {
  return { input: 10, output: 5, cache_read: 0, cache_creation: 0, ...overrides };
}

describe("recordTurn / totalsFor / grandTotal", () => {
  test("a single turn rolls into its key's totals", () => {
    const state = recordTurn(emptyAccountingState(), KEY_A, usage({ cache_read: 100 }));
    expect(totalsFor(state, KEY_A)).toEqual({ input: 10, output: 5, cache_read: 100, cache_creation: 0, turns: 1 });
  });

  test("two turns on the SAME key accumulate", () => {
    let state = emptyAccountingState();
    state = recordTurn(state, KEY_A, usage({ cache_read: 100 }));
    state = recordTurn(state, KEY_A, usage({ cache_read: 50, cache_creation: 20 }));
    expect(totalsFor(state, KEY_A)).toEqual({ input: 20, output: 10, cache_read: 150, cache_creation: 20, turns: 2 });
  });

  test("different keys are tracked independently", () => {
    let state = emptyAccountingState();
    state = recordTurn(state, KEY_A, usage({ cache_read: 100 }));
    state = recordTurn(state, KEY_B, usage({ cache_read: 999 }));
    expect(totalsFor(state, KEY_A).cache_read).toBe(100);
    expect(totalsFor(state, KEY_B).cache_read).toBe(999);
  });

  test("an unrecorded key returns zero totals, not undefined", () => {
    expect(totalsFor(emptyAccountingState(), KEY_A)).toEqual({ input: 0, output: 0, cache_read: 0, cache_creation: 0, turns: 0 });
  });

  test("allKeys enumerates every distinct key recorded, and only those", () => {
    let state = emptyAccountingState();
    state = recordTurn(state, KEY_A, usage());
    state = recordTurn(state, KEY_B, usage());
    expect(allKeys(state).sort((a, b) => a.nodeId.localeCompare(b.nodeId))).toEqual([KEY_A, KEY_B]);
  });

  test("recordTurn never mutates the prior state (immutable-record discipline)", () => {
    const before = emptyAccountingState();
    const after = recordTurn(before, KEY_A, usage({ cache_read: 100 }));
    expect(totalsFor(before, KEY_A).cache_read).toBe(0);
    expect(totalsFor(after, KEY_A).cache_read).toBe(100);
  });

  test("grandTotal sums every key's totals", () => {
    let state = emptyAccountingState();
    state = recordTurn(state, KEY_A, usage({ cache_read: 100 }));
    state = recordTurn(state, KEY_B, usage({ cache_read: 50, cache_creation: 30 }));
    expect(grandTotal(state)).toEqual({ input: 20, output: 10, cache_read: 150, cache_creation: 30, turns: 2 });
  });
});

describe("cacheFraction — token-weighted, output EXCLUDED", () => {
  test("a mostly-cached turn (Finding 2 shape): high fraction", () => {
    const totals = { input: 10, output: 40, cache_read: 40972, cache_creation: 174, turns: 1 };
    const fraction = cacheFraction(totals);
    expect(fraction).toBeCloseTo(40972 / (40972 + 174 + 10), 10);
    expect(fraction).toBeGreaterThan(0.99);
  });

  test("output tokens do NOT affect the fraction at all", () => {
    const low = cacheFraction({ input: 10, output: 1, cache_read: 900, cache_creation: 100, turns: 1 });
    const high = cacheFraction({ input: 10, output: 1_000_000, cache_read: 900, cache_creation: 100, turns: 1 });
    expect(low).toBe(high);
  });

  test("zero denominator returns 0, not NaN", () => {
    expect(cacheFraction({ input: 0, output: 0, cache_read: 0, cache_creation: 0, turns: 0 })).toBe(0);
  });

  test("a cold call (Finding 1, call 2 shape: 0 reuse) has fraction 0", () => {
    expect(cacheFraction({ input: 10, output: 5, cache_read: 0, cache_creation: 19372, turns: 1 })).toBe(0);
  });
});

// --- Deterministic seeded PRNG (mulberry32); test-only. ---
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("property: conservation — sum of per-key totals equals grandTotal, for any random sequence", () => {
  test("2000 randomized recordTurn calls across a small key universe, seeded and reproducible", () => {
    const rng = mulberry32(0xacc0);
    const nodes = ["n1", "n2", "n3"];
    const claims = ["c1", "c2"];
    const campaigns = ["camp1"];

    let state: AccountingState = emptyAccountingState();
    let expectedGrand = { input: 0, output: 0, cache_read: 0, cache_creation: 0, turns: 0 };
    const perKeyExpected = new Map<string, { input: number; output: number; cache_read: number; cache_creation: number; turns: number }>();

    for (let i = 0; i < 2000; i++) {
      const key: AccountingKey = {
        nodeId: nodes[Math.floor(rng() * nodes.length)]!,
        claimId: claims[Math.floor(rng() * claims.length)]!,
        campaignId: campaigns[Math.floor(rng() * campaigns.length)]!,
      };
      const u: WorkerUsage = {
        input: Math.floor(rng() * 100),
        output: Math.floor(rng() * 100),
        cache_read: Math.floor(rng() * 1000),
        cache_creation: Math.floor(rng() * 1000),
      };
      state = recordTurn(state, key, u);

      expectedGrand = {
        input: expectedGrand.input + u.input,
        output: expectedGrand.output + u.output,
        cache_read: expectedGrand.cache_read + u.cache_read,
        cache_creation: expectedGrand.cache_creation + u.cache_creation,
        turns: expectedGrand.turns + 1,
      };
      const kStr = `${key.nodeId} ${key.claimId} ${key.campaignId}`;
      const prior = perKeyExpected.get(kStr) ?? { input: 0, output: 0, cache_read: 0, cache_creation: 0, turns: 0 };
      perKeyExpected.set(kStr, {
        input: prior.input + u.input,
        output: prior.output + u.output,
        cache_read: prior.cache_read + u.cache_read,
        cache_creation: prior.cache_creation + u.cache_creation,
        turns: prior.turns + 1,
      });
    }

    // Conservation: grandTotal must equal the independently-accumulated expected total.
    expect(grandTotal(state)).toEqual(expectedGrand);

    // Conservation: every individual key's totals must match the independently-tracked expectation.
    for (const key of allKeys(state)) {
      const kStr = `${key.nodeId} ${key.claimId} ${key.campaignId}`;
      expect(totalsFor(state, key)).toEqual(perKeyExpected.get(kStr)!);
    }

    // Conservation: summing every per-key bucket by hand must equal grandTotal too (the property
    // as literally stated in the WP brief: "sum of parts equals totals").
    let summedParts = { input: 0, output: 0, cache_read: 0, cache_creation: 0, turns: 0 };
    for (const key of allKeys(state)) {
      const t = totalsFor(state, key);
      summedParts = {
        input: summedParts.input + t.input,
        output: summedParts.output + t.output,
        cache_read: summedParts.cache_read + t.cache_read,
        cache_creation: summedParts.cache_creation + t.cache_creation,
        turns: summedParts.turns + t.turns,
      };
    }
    expect(summedParts).toEqual(grandTotal(state));
  });
});
