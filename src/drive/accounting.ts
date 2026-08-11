// PURITY: pure — no fs/network/clock (L3). M3.3: per-turn usage rollup — the M3.9 report's data
// layer — plus the HONEST cache-fraction computation the M3.0 caching spike's own headline table
// defines: cache_read as a fraction of TOTAL TOKENS PROCESSED THAT CALL, i.e.
// input + cache_read + cache_creation, DELIBERATELY EXCLUDING output tokens (generation is never
// something a prompt cache could have served, so folding it into the denominator would understate
// the fraction and misrepresent what caching bought — docs/memos/2026-07-19-m3.0-caching-spike.md's
// Finding 1/2 tables reconcile exactly this way, with no output component). Reuses
// `WorkerUsage`'s shape (src/drive/worker-result.ts) — a turn's usage numbers, never re-derived
// here from anything else.
//
// Field named `nodeId`, not the bare word this comment is carefully NOT spelling out followed by
// a colon (a registry shard id / af node id, same referent as bind-verdicts.ts's
// `DispatchState.itemId`): scripts/selftest.ts's purity grep forbids that exact substring anywhere
// in a PURITY-marked file (it exists to catch a Node built-in import), which would false-positive
// on an interface field spelled that way followed by its type annotation.

import type { WorkerUsage } from "./worker-result";

export interface AccountingKey {
  nodeId: string;
  claimId: string;
  campaignId: string;
}

export interface AccountingTotals {
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
  turns: number;
}

const ZERO_TOTALS: AccountingTotals = { input: 0, output: 0, cache_read: 0, cache_creation: 0, turns: 0 };

function keyString(k: AccountingKey): string {
  return [k.nodeId, k.claimId, k.campaignId].join(" ");
}

function addTotals(a: AccountingTotals, b: AccountingTotals): AccountingTotals {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cache_read: a.cache_read + b.cache_read,
    cache_creation: a.cache_creation + b.cache_creation,
    turns: a.turns + b.turns,
  };
}

function usageAsTotals(u: WorkerUsage): AccountingTotals {
  return { input: u.input, output: u.output, cache_read: u.cache_read, cache_creation: u.cache_creation, turns: 1 };
}

export interface AccountingState {
  readonly byKey: ReadonlyMap<string, AccountingTotals>;
  /** keyString -> the structured key it was built from, so `allKeys` can enumerate without a
   * caller needing to already know every (nodeId, claim, campaign) triple in advance. */
  readonly keys: ReadonlyMap<string, AccountingKey>;
}

export function emptyAccountingState(): AccountingState {
  return { byKey: new Map(), keys: new Map() };
}

/** Rolls one turn's usage into the (nodeId, claim, campaign) bucket it belongs to. Pure: returns a
 * NEW state (a fresh Map each call), never mutates `state` — the same immutable-record discipline
 * src/drive/session.ts's `SessionRecord` uses, applied to an accumulator instead of a fixed fact. */
export function recordTurn(state: AccountingState, key: AccountingKey, usage: WorkerUsage): AccountingState {
  const k = keyString(key);
  const prior = state.byKey.get(k) ?? ZERO_TOTALS;
  const byKey = new Map(state.byKey);
  byKey.set(k, addTotals(prior, usageAsTotals(usage)));
  const keys = new Map(state.keys);
  keys.set(k, key);
  return { byKey, keys };
}

export function totalsFor(state: AccountingState, key: AccountingKey): AccountingTotals {
  return state.byKey.get(keyString(key)) ?? ZERO_TOTALS;
}

/** Every (nodeId, claim, campaign) bucket currently recorded — for the M3.9 report to enumerate
 * without needing to know keys in advance. */
export function allKeys(state: AccountingState): AccountingKey[] {
  return [...state.keys.values()];
}

/** Sums every bucket's totals. This must always equal the sum of every individual `recordTurn`
 * call's own usage, for ANY sequence of calls in ANY order — the conservation property the test
 * suite checks (no turn is ever double-counted or dropped by the per-key aggregation). */
export function grandTotal(state: AccountingState): AccountingTotals {
  let total = ZERO_TOTALS;
  for (const t of state.byKey.values()) total = addTotals(total, t);
  return total;
}

/** Integer-fair split of `total` across `n` shares: each gets `floor(total/n)`, and the first
 * `total % n` (caller's own order) get one extra — exact and deterministic, `sum(shares)===total`.
 * Moved here from src/drive/report.ts (rk-0ree) so BOTH per-session pooling rules — report.ts's
 * cache_creation attribution and src/reward/attribution.ts's L5 session-open split — share the ONE
 * split formula instead of drifting apart. */
export function fairShares(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** Token-weighted cache-read fraction, per the M3.0 spike's own definition (see file header):
 * cache_read / (input + cache_read + cache_creation). Returns 0 (not NaN) when the denominator is
 * 0 — an empty/not-yet-dispatched bucket is a legitimate state, not a division error. */
export function cacheFraction(totals: AccountingTotals): number {
  const denom = totals.input + totals.cache_read + totals.cache_creation;
  if (denom <= 0) return 0;
  return totals.cache_read / denom;
}
