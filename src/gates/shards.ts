// ROLE: Gate 6 — report-shards (report/main.tex + report/sections/*.tex). Contract:
// docs/gate-contracts.md "Gate 6 — report-shards". STUB (M0.3 skeleton): fill in per that
// section's Checks 1-20 and corpus/shards/*'s 12 fixtures.
// PURITY: pure — no fs/network/clock (L3).

import type { Gate, GateResult } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import type { GateConfig } from "./config";

export const shardsGate: Gate = {
  name: "shards",
  run(_snapshot: RepoSnapshot, _config: GateConfig): GateResult {
    return { findings: [], coverage: [], notImplemented: true };
  },
};
