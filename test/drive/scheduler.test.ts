// 1:1 test file for src/drive/scheduler.ts (M3.3). Unit tests pin down the floor/stagger/TTL rules
// on hand-built cases; the property tests generate MANY random candidate sets (varying group
// sizes, tiers, and staleness) and assert the schedule the pure core emits never violates the
// three contract rules docs/worker-contract.md (d) states: (1) STAGGER — no wave containing a
// first-call item ever has more than that one item in it; (2) FLOOR — no group scheduled "shared"
// has fewer than the configured floor's worth of items; (3) session sequentiality — no two items
// of the SAME "shared" group ever land in the same wave (a session's own turns are one
// conversation, never concurrent with themselves).

import { describe, expect, test } from "bun:test";
import { buildSchedule, type ScheduleCandidate } from "../../src/drive/scheduler";
import type { Tier } from "../../src/drive/vocab";

function candidate(id: string, groupKey: string, tier: Tier = "l5", groupLastActiveAt?: number): ScheduleCandidate {
  return { id, groupKey, tier, groupLastActiveAt };
}

describe("buildSchedule — floor rule", () => {
  test("a group of 2 (below the default floor of 3) dispatches flat, every item its own first call", () => {
    const schedule = buildSchedule([candidate("a", "g1"), candidate("b", "g1")], { now: 1000 });
    for (const item of schedule.items) {
      expect(item.mode).toBe("flat");
      expect(item.isFirstCall).toBe(true);
    }
  });

  test("a group of exactly 3 (at the floor) dispatches shared", () => {
    const schedule = buildSchedule([candidate("a", "g1"), candidate("b", "g1"), candidate("c", "g1")], { now: 1000 });
    for (const item of schedule.items) expect(item.mode).toBe("shared");
    expect(schedule.items.filter((i) => i.isFirstCall).length).toBe(1); // exactly one session-creating turn
  });

  test("a custom sharedGroupFloor of 5 demotes a 4-item group to flat", () => {
    const items = [candidate("a", "g1"), candidate("b", "g1"), candidate("c", "g1"), candidate("d", "g1")];
    const schedule = buildSchedule(items, { now: 1000, sharedGroupFloor: 5 });
    for (const item of schedule.items) expect(item.mode).toBe("flat");
  });
});

describe("buildSchedule — stagger rule", () => {
  test("two independent 1-item (flat) groups never share a wave", () => {
    const schedule = buildSchedule([candidate("a", "g1"), candidate("b", "g2")], { now: 1000 });
    expect(schedule.waves.length).toBe(2);
    for (const wave of schedule.waves) expect(wave.length).toBe(1);
  });

  test("a fresh 3-item shared group's turn-1 is alone in its wave", () => {
    const schedule = buildSchedule([candidate("a", "g1"), candidate("b", "g1"), candidate("c", "g1")], { now: 1000 });
    const firstWave = schedule.waves.find((w) => w.some((i) => i.isFirstCall));
    expect(firstWave).toBeDefined();
    expect(firstWave!.length).toBe(1);
  });

  test("multiple fresh shared groups: their turn-1s land in DIFFERENT singleton waves, never together", () => {
    const items = [
      candidate("a1", "g1"), candidate("a2", "g1"), candidate("a3", "g1"),
      candidate("b1", "g2"), candidate("b2", "g2"), candidate("b3", "g2"),
    ];
    const schedule = buildSchedule(items, { now: 1000 });
    const firstWaves = schedule.waves.filter((w) => w.some((i) => i.isFirstCall));
    expect(firstWaves.length).toBe(2);
    for (const w of firstWaves) expect(w.length).toBe(1);
  });
});

describe("buildSchedule — conservative TTL / staleness", () => {
  test("undefined groupLastActiveAt is always cold (a first call is scheduled)", () => {
    const schedule = buildSchedule([candidate("a", "g1", "l5", undefined), candidate("b", "g1"), candidate("c", "g1")], { now: 1000 });
    expect(schedule.items.some((i) => i.isFirstCall)).toBe(true);
  });

  test("a group last active 46 minutes ago (past the 45-min default) is treated as cold — a fresh first call", () => {
    const now = 100_000_000;
    const staleTimestamp = now - 46 * 60 * 1000;
    const schedule = buildSchedule(
      [candidate("a", "g1", "l5", staleTimestamp), candidate("b", "g1", "l5", staleTimestamp), candidate("c", "g1", "l5", staleTimestamp)],
      { now },
    );
    expect(schedule.items.filter((i) => i.isFirstCall).length).toBe(1);
  });

  test("a group last active 5 minutes ago is warm — NO first call this round, all items are resumes", () => {
    const now = 100_000_000;
    const freshTimestamp = now - 5 * 60 * 1000;
    const schedule = buildSchedule(
      [candidate("a", "g1", "l5", freshTimestamp), candidate("b", "g1", "l5", freshTimestamp), candidate("c", "g1", "l5", freshTimestamp)],
      { now },
    );
    expect(schedule.items.every((i) => !i.isFirstCall)).toBe(true);
    expect(schedule.items.every((i) => i.mode === "shared")).toBe(true);
  });
});

describe("buildSchedule — budget/tier caps split resume rounds", () => {
  test("a resume round larger than burstBudget is split into multiple waves", () => {
    // One warm (no first-call) shared group of 10 items -> round 0 alone would have 10 items.
    const now = 100_000_000;
    const freshTimestamp = now - 60 * 1000;
    const items: ScheduleCandidate[] = [];
    for (let i = 0; i < 10; i++) items.push(candidate(`i${i}`, "g1", "l5", freshTimestamp));
    const schedule = buildSchedule(items, { now, burstBudget: 4 });
    for (const wave of schedule.waves) expect(wave.length).toBeLessThanOrEqual(4);
  });
});

// --- Deterministic seeded PRNG (mulberry32); test-only, not the pure module under test. ---
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

function randomCandidateSet(rng: () => number, now: number): ScheduleCandidate[] {
  const groupCount = 1 + Math.floor(rng() * 6); // 1..6 groups
  const items: ScheduleCandidate[] = [];
  for (let g = 0; g < groupCount; g++) {
    const groupKey = `group-${g}`;
    const size = 1 + Math.floor(rng() * 6); // 1..6 items per group
    const tier: Tier = rng() < 0.5 ? "l5" : "hard";
    const staleness = rng();
    let lastActiveAt: number | undefined;
    if (staleness < 0.3) lastActiveAt = undefined;
    else if (staleness < 0.6) lastActiveAt = now - 60 * 60 * 1000; // 60 min ago -> stale
    else lastActiveAt = now - 5 * 60 * 1000; // 5 min ago -> warm
    for (let i = 0; i < size; i++) items.push({ id: `${groupKey}-${i}`, groupKey, tier, groupLastActiveAt: lastActiveAt });
  }
  return items;
}

describe("property: stagger + floor + session-sequentiality hold over many random candidate sets", () => {
  test("200 randomized candidate sets, seeded and reproducible", () => {
    const rng = mulberry32(0xfeedface);
    const now = 1_000_000_000;
    for (let trial = 0; trial < 200; trial++) {
      const candidates = randomCandidateSet(rng, now);
      const schedule = buildSchedule(candidates, { now });

      // Track expected group sizes as given (the FLOOR property is about the INPUT group size,
      // not the schedule's own bookkeeping).
      const groupSizes = new Map<string, number>();
      for (const c of candidates) groupSizes.set(c.groupKey, (groupSizes.get(c.groupKey) ?? 0) + 1);

      for (const wave of schedule.waves) {
        // STAGGER: any wave with a first-call item has exactly that one item.
        if (wave.some((i) => i.isFirstCall)) {
          expect(wave.length).toBe(1);
        }
        // SESSION SEQUENTIALITY: no two items of the same "shared" group share a wave.
        const sharedGroupKeysSeen = new Set<string>();
        for (const item of wave) {
          if (item.mode !== "shared") continue;
          expect(sharedGroupKeysSeen.has(item.groupKey)).toBe(false);
          sharedGroupKeysSeen.add(item.groupKey);
        }
      }

      // FLOOR: every "shared" item's group has size >= 3 (the default floor); every "flat" item's
      // group has size < 3.
      for (const item of schedule.items) {
        const size = groupSizes.get(item.groupKey)!;
        if (item.mode === "shared") expect(size).toBeGreaterThanOrEqual(3);
        else expect(size).toBeLessThan(3);
      }

      // Every candidate produced exactly one scheduled item — nothing dropped, nothing duplicated.
      expect(schedule.items.length).toBe(candidates.length);
    }
  });
});
