// PURITY: pure — no fs/network/clock (L3). M3.3: the cache-aware batch SCHEDULING decision core —
// same-prefix grouping, the stagger rule, the >=3-item shared-context floor, and per-tier
// effort/burst caps, all as one deterministic function over caller-supplied data (including the
// caller-supplied "now", per L3 — this module never reads the wall clock itself). Consumes
// docs/memos/2026-07-19-m3.0-caching-spike.md's numbers via src/drive/scheduler-defaults.ts's
// constants (deliberately NOT promoted to GateConfig this wave — see that file's header).
//
// Three contract rules made mechanical here (docs/worker-contract.md (d), IMPLEMENTATION_PLAN.md
// M3.3 row):
// 1. STAGGER — "the first call of every same-prefix group is dispatched alone and awaited to its
//    first streamed token before any other call sharing that prefix fires" (POLICY, motivated by
//    ONE measured concurrency trial, Finding 4: a race with no reliable winner). This module reads
//    that conservatively: EVERY "first call" in the whole schedule (a new/reset group's turn 1, or
//    any item of a sub-floor "flat" group, since each such item is itself an unshared first call)
//    gets its OWN singleton wave — no two first-calls are EVER concurrent, not just same-content
//    ones, because Finding 5 showed a common CLI-level root prefix is shared by literally every
//    call in a campaign regardless of which group's content sits behind it.
// 2. FLOOR — a group under `sharedGroupFloor` (default 3, scheduler-defaults.ts) is not worth a
//    cache write at the observed 1-hour (2x) write tier; every item in it dispatches independently
//    ("flat"), each its own first call, never chained as resume turns.
// 3. CONSERVATIVE TTL — a group whose last known activity (`groupLastActiveAt`) is undefined or
//    older than `staleAfterMs` (default 45 min, well inside the observed-but-unproven 1h tier) is
//    treated as COLD: its first item in this call must re-establish the session (a fresh first
//    call), never assumed to resume a possibly-expired one.

import type { Tier } from "./vocab";
import {
  DEFAULT_BURST_BUDGET,
  DEFAULT_PER_TIER_EFFORT_CAP,
  DEFAULT_SHARED_GROUP_FLOOR,
  DEFAULT_STALE_AFTER_MS,
} from "./scheduler-defaults";

export interface ScheduleCandidate {
  id: string;
  groupKey: string;
  tier: Tier;
  /** Epoch ms the group's shared session/prefix was last active, BEFORE this scheduling call
   * (e.g. when it was created in a prior batch). `undefined` = never dispatched, always cold.
   * Callers MUST supply the same value for every candidate sharing a `groupKey` — this module
   * takes the first-encountered value per group and does not reconcile disagreement (a caller
   * supplying inconsistent values for one group is a caller bug, out of this pure function's
   * scope to detect). */
  groupLastActiveAt?: number;
}

export interface ScheduleOptions {
  /** Caller-supplied "current time" (epoch ms) — this pure module never reads a clock itself. */
  now: number;
  staleAfterMs?: number;
  sharedGroupFloor?: number;
  burstBudget?: number;
  perTierEffortCap?: Partial<Record<Tier, number>>;
}

export interface ScheduledItem {
  id: string;
  groupKey: string;
  tier: Tier;
  /** "shared": part of a >=floor group riding one resumed session across turns. "flat": dispatched
   * independently — either a sub-floor group or a cold-restart of a stale group. */
  mode: "shared" | "flat";
  /** True iff THIS item is the stagger-governed lone call establishing (or re-establishing) a
   * session — a real group's turn 1, or (for "flat" items) the item's own lone call. */
  isFirstCall: boolean;
  wave: number;
}

export interface Schedule {
  /** Dispatch order: every item in `waves[w]` fires concurrently; `waves[w]` must be fully
   * resolved (awaited) before `waves[w+1]` starts. A wave containing an `isFirstCall` item always
   * has exactly that one item in it (the stagger rule, enforced by construction). */
  waves: ScheduledItem[][];
  items: ScheduledItem[];
}

interface GroupPlan {
  groupKey: string;
  candidates: ScheduleCandidate[];
  mode: "shared" | "flat";
  needsFreshSession: boolean;
}

function planGroups(candidates: ScheduleCandidate[], floor: number, now: number, staleAfterMs: number): GroupPlan[] {
  const order: string[] = [];
  const byGroup = new Map<string, ScheduleCandidate[]>();
  for (const c of candidates) {
    if (!byGroup.has(c.groupKey)) {
      byGroup.set(c.groupKey, []);
      order.push(c.groupKey);
    }
    byGroup.get(c.groupKey)!.push(c);
  }
  return order.map((groupKey) => {
    const groupCandidates = byGroup.get(groupKey)!;
    const mode: "shared" | "flat" = groupCandidates.length >= floor ? "shared" : "flat";
    const lastActiveAt = groupCandidates[0]!.groupLastActiveAt;
    const needsFreshSession = lastActiveAt === undefined || now - lastActiveAt > staleAfterMs;
    return { groupKey, candidates: groupCandidates, mode, needsFreshSession };
  });
}

/** Splits one "round" of concurrently-eligible resume items into budget-respecting sub-waves,
 * preserving relative order (a stable greedy bin-pack, not a reorder-for-density optimizer — this
 * is a scheduling safety valve, not a knapsack problem worth solving optimally). */
function splitByBudget(items: ScheduledItem[], burstBudget: number, tierCap: Record<Tier, number>): ScheduledItem[][] {
  const waves: ScheduledItem[][] = [];
  let current: ScheduledItem[] = [];
  let currentTierCounts = new Map<Tier, number>();
  for (const item of items) {
    const tierCount = currentTierCounts.get(item.tier) ?? 0;
    const capForTier = tierCap[item.tier] ?? Infinity;
    if (current.length >= burstBudget || tierCount >= capForTier) {
      waves.push(current);
      current = [];
      currentTierCounts = new Map();
    }
    current.push(item);
    currentTierCounts.set(item.tier, (currentTierCounts.get(item.tier) ?? 0) + 1);
  }
  if (current.length > 0) waves.push(current);
  return waves;
}

/** Builds a deterministic dispatch schedule from a flat list of candidates. Deterministic in
 * candidate-encounter order — same input, same `now`, same options, always the same `Schedule` (a
 * property the stagger/floor tests below depend on). */
export function buildSchedule(candidates: ScheduleCandidate[], options: ScheduleOptions): Schedule {
  const floor = options.sharedGroupFloor ?? DEFAULT_SHARED_GROUP_FLOOR;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const burstBudget = options.burstBudget ?? DEFAULT_BURST_BUDGET;
  const tierCap: Record<Tier, number> = { ...DEFAULT_PER_TIER_EFFORT_CAP, ...(options.perTierEffortCap ?? {}) };

  const groups = planGroups(candidates, floor, options.now, staleAfterMs);

  const firstCallItems: ScheduledItem[] = [];
  const restQueues: ScheduledItem[][] = [];

  for (const group of groups) {
    if (group.mode === "flat") {
      for (const c of group.candidates) {
        firstCallItems.push({ id: c.id, groupKey: c.groupKey, tier: c.tier, mode: "flat", isFirstCall: true, wave: -1 });
      }
      continue;
    }
    // mode === "shared"
    const shared = group.candidates.map((c): ScheduledItem => ({ id: c.id, groupKey: c.groupKey, tier: c.tier, mode: "shared", isFirstCall: false, wave: -1 }));
    if (group.needsFreshSession) {
      const first = shared[0]!;
      first.isFirstCall = true;
      firstCallItems.push(first);
      restQueues.push(shared.slice(1));
    } else {
      restQueues.push(shared);
    }
  }

  const waves: ScheduledItem[][] = [];
  // Rule 1 (stagger): every first call gets its OWN singleton wave, in encounter order.
  for (const item of firstCallItems) {
    item.wave = waves.length;
    waves.push([item]);
  }

  // Round-robin the remaining per-group resume queues: round k takes item k of every group that
  // still has one — concurrent ACROSS groups, but never two items of the SAME group in one round
  // (a session's own turns are inherently sequential — one conversation, one turn at a time).
  const maxRounds = restQueues.reduce((max, q) => Math.max(max, q.length), 0);
  for (let round = 0; round < maxRounds; round++) {
    const roundItems: ScheduledItem[] = [];
    for (const queue of restQueues) {
      if (queue[round] !== undefined) roundItems.push(queue[round]!);
    }
    for (const subwave of splitByBudget(roundItems, burstBudget, tierCap)) {
      const w = waves.length;
      for (const item of subwave) item.wave = w;
      waves.push(subwave);
    }
  }

  return { waves, items: waves.flat() };
}
