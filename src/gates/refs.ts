// ROLE: Gate 3 — refs (proofs/<ws>/externals/*.json). Contract: docs/gate-contracts.md
// "Gate 3 — refs". STUB (M0.3 skeleton): fill in per that section's Checks 1-5 and
// corpus/refs/*'s 7 fixtures. Must call src/refs/quote.ts's `wholeQuoteMatch` for the verdict —
// never re-derive the rule (Tier-A boundary-review carry-forward,
// docs/reviews/2026-07-17-tier-a-boundary-review.md).
// PURITY: pure — no fs/network/clock (L3).

import type { Gate, GateResult } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import type { GateConfig } from "./config";

export const refsGate: Gate = {
  name: "refs",
  run(_snapshot: RepoSnapshot, _config: GateConfig): GateResult {
    return { findings: [], coverage: [], notImplemented: true };
  },
};
