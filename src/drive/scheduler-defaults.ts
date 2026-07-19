// PURITY: pure — no fs/network/clock (L3). Scheduling knobs the M3.0 caching spike's numbers
// justify (docs/memos/2026-07-19-m3.0-caching-spike.md), NOT promoted to `.rk/config`/GateConfig
// this wave: the parallel backend-adapter lane owns src/gates/config.ts and the `workers` config
// extension for M3.2/M3.3 this milestone (coordination note in the M3.3 task brief), so growing
// GateConfig here would race that lane's own edits to the same file. These constants are the
// scheduler's compile-time defaults; a caller may override any of them per-call via
// src/drive/scheduler.ts's `ScheduleOptions` (never a hidden env var or module-level mutable —
// that would violate L3 purity). Promoting these to a real `.rk/config.json` surface (with the
// usual validateConfigOverrides enum/range checks src/gates/config.ts already does for the six
// gates) is a named follow-up, not built here — see the final WP report.

import type { Tier } from "./vocab";

/** Conservative staleness window for treating a same-prefix group's session as still "warm"
 * (docs/worker-contract.md (d).5: the spike measured only an OBSERVED 1-hour cache tier plus ONE
 * confirming 180-second survival point — NOT a proven expiry boundary). 45 minutes intentionally
 * undershoots the observed 1h tier by a wide margin: scheduling must never assume cache survival
 * "right up to" a boundary that was never measured, per the Tier A review's forced correction. */
export const DEFAULT_STALE_AFTER_MS = 45 * 60 * 1000;

/** Shared-context group floor (docs/worker-contract.md (d).2): a group of 1-2 items is
 * arithmetically not a caching win given the observed 1-hour (2x-write) cache tier — smaller
 * groups dispatch flat/unshared instead. Pricing-derived POLICY, not itself a measured batch
 * result (no >=3-item batch was run through the M3.0 spike). */
export const DEFAULT_SHARED_GROUP_FLOOR = 3;

/** Max concurrently-dispatched non-first (resume) turns in one scheduling round, absent a
 * per-tier override below. A resume turn only pays its own small per-turn cost (Finding 2:
 * 82-174 tokens), so this is a concurrency/rate-limit safety valve, not a cache-economics rule —
 * unlike the stagger rule (which is about NEVER concurrently dispatching two group-FIRST calls),
 * this cap is about not overwhelming a backend/host with too many simultaneous resume calls. */
export const DEFAULT_BURST_BUDGET = 4;

/** Per-tier concurrency cap layered on top of `DEFAULT_BURST_BUDGET` — the hard tier is
 * higher-stakes (rigour-ladder's top rung) and kept more conservative by default. */
export const DEFAULT_PER_TIER_EFFORT_CAP: Record<Tier, number> = {
  l5: 6,
  hard: 3,
};
