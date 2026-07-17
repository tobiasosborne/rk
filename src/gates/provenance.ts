// ROLE: Gate 4 — provenance (report/ <-> argument/lemmas/*.md). Contract:
// docs/gate-contracts.md "Gate 4 — provenance". STUB (M0.3 skeleton): fill in per that section's
// Checks 1-10 (11 build check is --build-only) and corpus/provenance/*'s 13 fixtures.
// PURITY: pure — no fs/network/clock (L3).

import type { Gate, GateResult } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import type { GateConfig } from "./config";

export const provenanceGate: Gate = {
  name: "provenance",
  run(_snapshot: RepoSnapshot, _config: GateConfig): GateResult {
    return { findings: [], coverage: [], notImplemented: true };
  },
};
