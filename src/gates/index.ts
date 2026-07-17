// PURITY: pure — no fs/network/clock (L3). Static gate registry, ordered per AISM's own
// check-all.sh composition (check-all.sh: check-defs, check-refs, argument, check-runs,
// check-provenance, check-report-shards) — note this is NOT docs/gate-contracts.md's own Gate
// 1-6 numbering order (defs, linker, refs, provenance, runs, shards); the composition order and
// the contract's exposition order are independent and this WP intentionally follows check-all.sh
// per the deliverable brief ("ordered per check-all.sh order").

import type { Gate } from "./framework";
import { defsGate } from "./defs";
import { refsGate } from "./refs";
import { linkerGate } from "./linker";
import { runsGate } from "./runs";
import { provenanceGate } from "./provenance";
import { shardsGate } from "./shards";

export const GATES: readonly Gate[] = [defsGate, refsGate, linkerGate, runsGate, provenanceGate, shardsGate];
