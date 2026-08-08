// PURITY: pure — no fs/network/clock (L3). N1.3 (rk-lmtr): the payout engine — ONE
// deterministic fold over the append-only reward event log. Graph-independent by design:
// attachment, pull rate, and wandering metrics live where graph meets ledger (rk audit, N4.1),
// not here. Formulas and constants are pre-registered (types.ts pointers); the engine refuses
// loudly (diagnostics) rather than guessing when an event lacks its prerequisites — a silent
// skip is a bug, full stop (CLAUDE.md L2 stance, applied to the ledger).

import {
  CLOSE_TIER_WEIGHTS, COMPRESS_RATE, ESCROW_EXPIRY_ROUNDS, HARDNESS_T0,
  PREDICTION_TOKEN_BUCKETS, PRUNE_RATE, REDUCE_UPFRONT_FRACTION, REUSE_RATE,
} from "./types";
import type { EscrowState, PayoutResult, RewardDiagnostic, RewardEvent } from "./types";

export function hardnessReal(spentTokens: number): number {
  return Math.log2(1 + spentTokens / HARDNESS_T0);
}

/** Expected tokens from one prediction pair (prereg §2 bridge). */
function expectedTokens(p250k: number, p1m: number): number {
  const b = PREDICTION_TOKEN_BUCKETS;
  return b.mid250k * p250k + b.mid1m * (p1m - p250k) + b.tail * (1 - p1m);
}

interface EscrowInternal extends EscrowState {
  /** Unvested share per child id (pro-rata by child H_pred at grant time). */
  shares: Map<string, number>;
  /** Round of the last CLOSE/PRUNE among the children (grant round initially). */
  lastActivityRound: number;
}

export function computePayouts(events: readonly RewardEvent[]): PayoutResult {
  const balances = new Map<string, number>();
  const diagnostics: RewardDiagnostic[] = [];
  const escrows: EscrowInternal[] = [];
  /** obligation -> mean expected tokens over all predictions seen so far (order is meaning). */
  const predictions = new Map<string, { sumE: number; count: number }>();
  const closed = new Map<string, number>(); // node -> spentTokens of its (single) close
  const compressed = new Set<string>();
  let currentRound = 0;

  const credit = (id: string, amount: number) => {
    if (amount !== 0) balances.set(id, (balances.get(id) ?? 0) + amount);
  };
  const hPred = (id: string): number | undefined => {
    const p = predictions.get(id);
    return p ? Math.log2(1 + p.sumE / p.count / HARDNESS_T0) : undefined;
  };
  const childActivity = (nodeId: string, seq: number) => {
    for (const e of escrows) {
      if (e.expired || !e.shares.has(nodeId)) continue;
      e.lastActivityRound = currentRound;
      void seq;
    }
  };

  const totals = { closes: 0, reduces: 0, prunes: 0, wildcardCloses: 0, wildcardPrunes: 0 };

  events.forEach((ev, seq) => {
    switch (ev.type) {
      case "round": {
        currentRound = ev.n;
        for (const e of escrows) {
          if (e.expired || e.remaining === 0) continue;
          if (currentRound - e.lastActivityRound >= ESCROW_EXPIRY_ROUNDS) {
            e.expired = true;
            diagnostics.push({
              seq, code: "escrow-expired", nodeId: e.obligation,
              detail: `escrow from reduce@${e.grantSeq}: ${e.remaining.toFixed(6)} voided after ${ESCROW_EXPIRY_ROUNDS} inactive rounds`,
            });
            e.remaining = 0;
            e.shares.clear();
          }
        }
        break;
      }
      case "predict": {
        const p = predictions.get(ev.obligation) ?? { sumE: 0, count: 0 };
        p.sumE += expectedTokens(ev.p250k, ev.p1m);
        p.count += 1;
        predictions.set(ev.obligation, p);
        break;
      }
      case "reduce": {
        totals.reduces += 1;
        const hParent = hPred(ev.obligation);
        const hChildren = ev.children.map((c) => hPred(c));
        if (hParent === undefined || hChildren.some((h) => h === undefined)) {
          diagnostics.push({ seq, code: "reduce-unpredicted", nodeId: ev.obligation,
            detail: "parent and every child need a prediction before a reduce can be valued" });
          break;
        }
        const sumChildren = (hChildren as number[]).reduce((a, b) => a + b, 0);
        const value = Math.max(0, hParent - sumChildren);
        credit(ev.obligation, REDUCE_UPFRONT_FRACTION * value);
        const escrowTotal = (1 - REDUCE_UPFRONT_FRACTION) * value;
        const shares = new Map<string, number>();
        ev.children.forEach((c, i) => {
          const w = sumChildren > 0 ? (hChildren[i] as number) / sumChildren : 1 / ev.children.length;
          shares.set(c, escrowTotal * w);
        });
        escrows.push({
          obligation: ev.obligation, grantSeq: seq, total: escrowTotal,
          remaining: escrowTotal, expired: false, shares, lastActivityRound: currentRound,
        });
        break;
      }
      case "close": {
        totals.closes += 1;
        if (ev.wildcard) totals.wildcardCloses += 1;
        if (closed.has(ev.nodeId)) {
          diagnostics.push({ seq, code: "duplicate-close", nodeId: ev.nodeId });
          break;
        }
        closed.set(ev.nodeId, ev.spentTokens);
        const payout = CLOSE_TIER_WEIGHTS[ev.tier] * hardnessReal(ev.spentTokens);
        credit(ev.nodeId, payout);
        const cited = [...ev.citedDefs, ...ev.citedLemmas];
        for (const c of cited) credit(c, (REUSE_RATE * payout) / cited.length);
        // Vest this node's share in every live escrow that named it a child.
        for (const e of escrows) {
          if (e.expired) continue;
          const share = e.shares.get(ev.nodeId);
          if (share === undefined) continue;
          e.shares.delete(ev.nodeId);
          e.remaining -= share;
          e.lastActivityRound = currentRound; // vesting IS child activity — before the delete above ate the evidence
          credit(e.obligation, share);
        }
        break;
      }
      case "prune": {
        totals.prunes += 1;
        if (ev.wildcard) totals.wildcardPrunes += 1;
        const h = hPred(ev.nodeId);
        if (h === undefined) {
          diagnostics.push({ seq, code: "prune-unpredicted", nodeId: ev.nodeId,
            detail: "a prune pays 0.3 x H_pred; no prediction exists for this node" });
          break;
        }
        credit(ev.nodeId, PRUNE_RATE * h);
        childActivity(ev.nodeId, seq);
        break;
      }
      case "compress": {
        const distinct = new Set(ev.useSites).size;
        const spent = closed.get(ev.nodeId);
        if (distinct < 2 || compressed.has(ev.nodeId) || spent === undefined) {
          diagnostics.push({ seq, code: "compress-refused", nodeId: ev.nodeId,
            detail: spent === undefined ? "node never closed"
              : compressed.has(ev.nodeId) ? "already compressed once"
              : `needs >= 2 distinct use sites, got ${distinct}` });
          break;
        }
        compressed.add(ev.nodeId);
        credit(ev.nodeId, COMPRESS_RATE * hardnessReal(spent));
        break;
      }
    }
  });

  const sortedBalances: Record<string, number> = {};
  for (const k of [...balances.keys()].sort((a, b) => a.localeCompare(b))) {
    sortedBalances[k] = balances.get(k)!;
  }
  return {
    balances: sortedBalances,
    escrows: escrows.map(({ shares: _s, lastActivityRound: _r, ...pub }) => pub),
    diagnostics,
    totals,
  };
}
