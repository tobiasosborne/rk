// ROLE: Gate 5 — runs (runs/<YYYY-MM-DD>-<slug>/). Contract: docs/gate-contracts.md
// "Gate 5 — runs". STUB (M0.3 skeleton): fill in per that section's Checks 1-6 and
// corpus/runs/*'s 7 fixtures (including the day-1 empty-runs/ golden case, runs-07).
// PURITY: pure — no fs/network/clock (L3).

import type { Gate, GateResult } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import type { GateConfig } from "./config";

export const runsGate: Gate = {
  name: "runs",
  run(_snapshot: RepoSnapshot, _config: GateConfig): GateResult {
    return { findings: [], coverage: [], notImplemented: true };
  },
};
