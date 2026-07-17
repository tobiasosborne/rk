// ROLE: Gate 2 — argument/linker (argument/lemmas/*.md). Contract: docs/gate-contracts.md
// "Gate 2 — argument / linker". STUB (M0.3 skeleton): fill in per that section's Checks 1-12
// and corpus/linker/*'s 21 fixtures.
// PURITY: pure — no fs/network/clock (L3).

import type { Gate, GateResult } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import type { GateConfig } from "./config";

export const linkerGate: Gate = {
  name: "linker",
  run(_snapshot: RepoSnapshot, _config: GateConfig): GateResult {
    return { findings: [], coverage: [], notImplemented: true };
  },
};
