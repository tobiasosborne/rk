// Pure helper: parses + validates the required-for-live `--max-campaign-tokens` flag (rk-s9t, the
// M3 milestone review verdict (c) spend guard). Fail closed — an absent or non-positive-int value
// is a LOUD refusal, never a silent "unlimited" default. Split out of src/cli/verify-live.ts so
// that edge stays under the shard cap and this one job (flag string -> validated BudgetConfig) is
// unit-testable without the whole live-dispatch path.

import { DEFAULT_MAX_OUTPUT_TOKENS } from "../drive/driver-live";
import type { BudgetConfig } from "../drive/driver-guardrails";

export type CampaignBudgetResult = { ok: true; budget: BudgetConfig } | { ok: false; message: string };

const MISSING_CAP_MESSAGE =
  "rk verify --af --live: refusing to start -- a live run REQUIRES a campaign token cap.\n" +
  "  Pass --max-campaign-tokens <N>: the ceiling on TOTAL tokens across the whole run\n" +
  "  (input+output+cache over every turn, session creation included). This is a fail-closed\n" +
  "  spend guard -- --max-turns/--max-nodes bound CALL COUNT, not tokens; without a token cap a\n" +
  "  live run has no spend ceiling at all (M3 milestone review verdict (c), bead rk-s9t).";

/** Validates the required-for-live campaign token cap. Returns the `BudgetConfig` the driver
 * enforces (per-call reserve = one turn's own output cap, the one bound known ahead of a call), or
 * a refusal message. Rejects an absent flag, a non-integer, and a non-positive integer — each a
 * fail-closed refusal, never a silent default. */
export function parseCampaignBudget(raw: string | undefined): CampaignBudgetResult {
  if (raw === undefined) return { ok: false, message: MISSING_CAP_MESSAGE };
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0 || String(n) !== raw.trim()) {
    return { ok: false, message: `rk verify --af --live: --max-campaign-tokens must be a positive integer (got '${raw}').` };
  }
  return { ok: true, budget: { maxCampaignTokens: n, perCallReserve: DEFAULT_MAX_OUTPUT_TOKENS } };
}
