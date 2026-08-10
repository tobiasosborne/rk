// PURITY: pure — no fs/network/clock (L3). N1.3 (rk-lmtr): shared types + PRE-REGISTERED
// constants for the reward system. Every number here is fixed by
// docs/memos/2026-08-08-prereg-autonomy-v1.md (append-only; changed only at the named
// re-registration points — S0 findings or the N5.2 postmortem). The event log is append-only
// JSONL (.rk/reward-ledger.jsonl, store edge in src/store/); ORDER IS MEANING — payouts are a
// deterministic fold over the log (src/reward/engine.ts), balances are DERIVED, never stored,
// so double-pay is structurally impossible. No timestamps anywhere (same determinism stance as
// schemas/graph.v1.json).

import type { AfFlag, RigourStatus } from "../graph/types";

/** Tiers that can bank a CLOSE, with their pre-registered payout weights (prereg §1).
 * `numerical` is the ceiling rung (PRD §5) — it earns, weakly, but never promotes. */
export const CLOSE_TIER_WEIGHTS = {
  proved: 1.0,
  "proved-mod-audit": 0.6,
  numerical: 0.25,
} as const;
export type CloseTier = keyof typeof CLOSE_TIER_WEIGHTS;

/** Hardness scale token constant: H_real(spent) = log2(1 + spent/HARDNESS_T0). Log scaling —
 * grind cannot be farmed linearly (prereg §1). */
export const HARDNESS_T0 = 100_000;
/** REDUCE split (prereg §1): fraction paid on verification, remainder escrowed. */
export const REDUCE_UPFRONT_FRACTION = 0.25;
/** Escrow expires after this many allocation rounds with no CLOSE/PRUNE among the grant's
 * children (prereg §1) — the anti-decomposition-inflation device. */
export const ESCROW_EXPIRY_ROUNDS = 12;
export const PRUNE_RATE = 0.3;
export const REUSE_RATE = 0.1;
export const COMPRESS_RATE = 0.1;

/** Prediction-to-expected-tokens bridge (prereg §2 predictions are P(close within 250k) and
 * P(close within 1M)): interval midpoints plus a 2M tail for the never-closes mass. */
export const PREDICTION_TOKEN_BUCKETS = { mid250k: 125_000, mid1m: 625_000, tail: 2_000_000 } as const;

export type RewardEvent =
  | { /** Allocation-round marker, appended by the driver; drives escrow expiry only. */
      type: "round"; n: number }
  | { /** A hardness prediction, appended BEFORE the first attempt on the obligation
       * (immutability and the before-first-attempt rule are enforced at the store/gate layer;
       * the engine consumes whatever precedes the consuming event in the log). */
      type: "predict"; obligation: string; estimator: string; p250k: number; p1m: number }
  | { /** A verified decomposition: a new route on `obligation` whose local implication step
       * passed verification. The verification record itself lives with the claim (af); this
       * event is appended only after that check — the engine trusts the log, the gates guard
       * what may enter it. */
      type: "reduce"; obligation: string; children: string[] }
  | { type: "close"; nodeId: string; tier: CloseTier; spentTokens: number;
      citedDefs: string[]; citedLemmas: string[]; wildcard?: boolean }
  | { /** Append-only compensation for an earlier applied close. `targetCloseSeq` is the
       * zero-based event position in the canonical parsed event stream; `nodeId` makes that
       * positional reference fail closed if a malformed earlier line retargets it. The recorded
       * prior/current states and evidence are checked by Gate 8; the graph-independent fold
       * reverses only a close whose node identity also agrees. */
      type: "demote"; targetCloseSeq: number; nodeId: string; reason: string; evidenceRef: string;
      priorStatus: RigourStatus; priorAf: AfFlag;
      resultingStatus: RigourStatus; resultingAf: AfFlag }
  | { /** Verified refutation; `certRef` names the death certificate (refutation record). */
      type: "prune"; nodeId: string; certRef: string; wildcard?: boolean }
  | { type: "compress"; nodeId: string; useSites: string[] };

export interface RewardDiagnostic {
  /** 0-based position of the offending event in the log. */
  seq: number;
  code:
    | "duplicate-close"
    | "demote-unbanked-close"
    | "demote-target-mismatch"
    | "reduce-unpredicted"
    | "prune-unpredicted"
    | "compress-refused"
    | "escrow-expired";
  nodeId?: string;
  detail?: string;
}

export interface EscrowState {
  obligation: string;
  /** Log position of the granting reduce event — the escrow's identity. */
  grantSeq: number;
  total: number;
  remaining: number;
  expired: boolean;
}

export interface PayoutResult {
  /** Artifact id -> derived balance, keys sorted. Attribution to workers/arms is fr's job
   * (Q2 split); rk accounts per artifact. */
  balances: Record<string, number>;
  escrows: EscrowState[];
  diagnostics: RewardDiagnostic[];
  /** Event passthrough counts, for audit/chaos-yield reporting. */
  totals: {
    closes: number;
    demotions: number;
    reduces: number;
    prunes: number;
    wildcardCloses: number;
    wildcardPrunes: number;
  };
}
