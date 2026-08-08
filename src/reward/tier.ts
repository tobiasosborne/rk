// PURITY: pure — no fs/network/clock (L3). S0 finding S0-1 (rk-ptx0): the ONE mapping from a
// node's registry state to the highest CLOSE tier the ledger may bank for it. Shared by Gate 8
// Check 4 (src/gates/reward.ts) and the shadow emitter (`rk reward sync`) so the gate and the
// writer can never disagree about what is bankable — one mapping, never two.
//
// Trust is monotone (PRD §5): only external oracles promote; self-report never banks. A shard
// whose author wrote `status: proved` with `af: none` is a CLAIM, not a result — it supports no
// close tier at all, which is exactly the laundering class S0-1 caught live.

import type { CloseTier } from "./types";

/** Tier rank for the "may not bank ABOVE entitlement" comparison (paying less is allowed —
 * conservative closes are honest; paying more is the laundering). */
export const TIER_RANK: Record<CloseTier, number> = { numerical: 1, "proved-mod-audit": 2, proved: 3 };

/** The highest close tier `{status, af}` supports, or undefined when nothing is bankable.
 * - af:validated -> proved (the hard tier's own oracle said yes)
 * - status:proved-mod-audit -> proved-mod-audit (the L5 soft tier promoted it)
 * - status:numerical -> numerical (evidence-bundle ceiling rung — earns weakly, never promotes)
 * - everything else (incl. self-reported proved, cited, stated, conjecture, open) -> undefined:
 *   cited is external byte-matched work (nothing was closed HERE), the rest are claims. */
export function supportedCloseTier(shard: { status?: string; af: string }): CloseTier | undefined {
  if (shard.af === "validated") return "proved";
  if (shard.status === "proved-mod-audit") return "proved-mod-audit";
  if (shard.status === "numerical") return "numerical";
  return undefined;
}
