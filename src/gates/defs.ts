// ROLE: Gate 1 — defs (definitions/*.md). Contract: docs/gate-contracts.md "Gate 1 — defs".
// STUB (M0.3 skeleton): fill in per that section's Checks 1-14 and corpus/defs/*'s 15 fixtures.
// PURITY: pure — no fs/network/clock (L3).

import type { Gate, GateResult } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import type { GateConfig } from "./config";

export const defsGate: Gate = {
  name: "defs",
  run(_snapshot: RepoSnapshot, _config: GateConfig): GateResult {
    return { findings: [], coverage: [], notImplemented: true };
  },
};
