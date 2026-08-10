// PURITY: pure — no fs/network/clock (L3). N1.4 (rk-lmtr, prereg §2): Brier scoring of
// pre-registered hardness predictions against realized outcomes, and the estimator weights the
// allocator will consume. "LLM taste is a prior with a scoreboard, never a reward" — this file
// is the scoreboard. Predictions are immutable log entries (append-only ledger); outcomes are
// read from the same log's CLOSE/PRUNE events, so calibration is as derived and re-computable
// as the balances themselves.

import type { RewardEvent } from "./types";

/** Weight clip bounds (prereg §2): weight = clip(0.25/brier, 0.5, 2.0). A perfect (brier 0)
 * estimator sits at the cap, a confidently-wrong one at the floor — taste is never amplified
 * beyond 4x between best and worst. */
export const WEIGHT_FLOOR = 0.5;
export const WEIGHT_CAP = 2.0;
/** The two pre-registered prediction horizons, in tokens. */
export const HORIZON_250K = 250_000;
export const HORIZON_1M = 1_000_000;

export interface EstimatorCalibration {
  estimator: string;
  /** Resolved predictions scored (unresolved ones neither help nor hurt — prereg §2). */
  resolved: number;
  brier: number;
  weight: number;
}

export interface CalibrationResult {
  /** Sorted by estimator name. */
  estimators: EstimatorCalibration[];
  /** Predictions whose obligation has neither closed nor been pruned yet. */
  unresolved: number;
}

/** y-outcomes for one resolved obligation. */
type Outcome = { y250: 0 | 1; y1m: 0 | 1 };

export function computeCalibration(events: readonly RewardEvent[]): CalibrationResult {
  // First pass: outcomes. A demotion overrides its applied close with false: the prediction was
  // that a bankable close would survive, and validity review established that it did not.
  const outcomes = new Map<string, Outcome>();
  const closed = new Set<string>();
  const appliedCloseBySeq = new Map<number, string>();
  events.forEach((ev, seq) => {
    if (ev.type === "close" && !outcomes.has(ev.nodeId)) {
      closed.add(ev.nodeId);
      appliedCloseBySeq.set(seq, ev.nodeId);
      outcomes.set(ev.nodeId, {
        y250: ev.spentTokens <= HORIZON_250K ? 1 : 0,
        y1m: ev.spentTokens <= HORIZON_1M ? 1 : 0,
      });
    } else if (ev.type === "close" && !closed.has(ev.nodeId)) {
      // A prior PRUNE may already have fixed the outcome false, but this close still has an
      // engine-applied identity for a later demote to reference. Gate 8 reports the conflict.
      closed.add(ev.nodeId);
      appliedCloseBySeq.set(seq, ev.nodeId);
    } else if (ev.type === "prune" && !outcomes.has(ev.nodeId)) {
      outcomes.set(ev.nodeId, { y250: 0, y1m: 0 });
    } else if (ev.type === "demote") {
      const target = appliedCloseBySeq.get(ev.targetCloseSeq);
      if (target !== undefined) outcomes.set(target, { y250: 0, y1m: 0 });
    }
  });

  // Second pass: score every prediction whose obligation resolved.
  const perEstimator = new Map<string, { sum: number; n: number }>();
  let unresolved = 0;
  for (const ev of events) {
    if (ev.type !== "predict") continue;
    const o = outcomes.get(ev.obligation);
    if (o === undefined) {
      unresolved += 1;
      continue;
    }
    const brier = ((ev.p250k - o.y250) ** 2 + (ev.p1m - o.y1m) ** 2) / 2;
    const agg = perEstimator.get(ev.estimator) ?? { sum: 0, n: 0 };
    agg.sum += brier;
    agg.n += 1;
    perEstimator.set(ev.estimator, agg);
  }

  const estimators = [...perEstimator.entries()]
    .map(([estimator, { sum, n }]) => {
      const brier = sum / n;
      const weight = brier === 0 ? WEIGHT_CAP : Math.min(WEIGHT_CAP, Math.max(WEIGHT_FLOOR, 0.25 / brier));
      return { estimator, resolved: n, brier, weight };
    })
    .sort((a, b) => a.estimator.localeCompare(b.estimator));

  return { estimators, unresolved };
}
