// PURITY: pure — no fs/network/clock (L3). Static gate registry, ordered per AISM's own
// check-all.sh composition (check-all.sh: check-defs, check-refs, argument, check-runs,
// check-provenance, check-report-shards) — note this is NOT docs/gate-contracts.md's own Gate
// 1-6 numbering order (defs, linker, refs, provenance, runs, shards); the composition order and
// the contract's exposition order are independent and this WP intentionally follows check-all.sh
// per the deliverable brief ("ordered per check-all.sh order").
//
// rk-xbm: `configGate` (src/gates/config.ts) is a synthetic seventh entry, not one of AISM's six
// — it has no check-all.sh counterpart, so it is not subject to that ordering rule. Placed FIRST:
// config validity is a precondition every other gate's *interpretation* of its own findings
// depends on (a malformed `phase` would otherwise change what "passing" means for all six), so a
// reader scanning `rk check` output top-to-bottom sees config problems before anything they might
// explain.
//
// M2.6: `freshnessGate` (src/gates/freshness.ts, docs/gate-contracts.md Gate 7) is likewise a
// synthetic entry with no check-all.sh counterpart — AISM never had a general regenerate-and-diff
// mechanism, only the per-file mirror check Gate 2 Check 11 still carries. Placed LAST: it
// consults `linkerGate`'s own parse (via `parseRegistry`) to regenerate the artifacts it
// diffs against, so a reader sees the underlying registry's own findings before the derived
// staleness findings that depend on it.

import type { Gate } from "./framework";
import { configGate } from "./config";
import { defsGate } from "./defs";
import { notationGate } from "./notation";
import { refsGate } from "./refs";
import { linkerGate } from "./linker";
import { runsGate } from "./runs";
import { provenanceGate } from "./provenance";
import { shardsGate } from "./shards";
import { freshnessGate } from "./freshness";
import { rewardGate } from "./reward";

// N2 (rk-5man): `rewardGate` (src/gates/reward.ts, docs/gate-contracts.md Gate 8) is a third
// synthetic entry with no check-all.sh counterpart — the payout ledger is rk-only (PRD Amendment
// A1). Placed after shards (it consults parseRegistry, so registry parse findings appear first)
// and before freshness (which stays last per its own note above).
// rk-5lzf (Tier A, LB5): `notationGate` (src/gates/notation.ts, docs/gate-contracts.md Gate 9) is
// the fourth synthetic entry — no check-all.sh counterpart; AISM has no notation register. Placed
// immediately after `defsGate`, whose own shards ARE the register it checks against: a reader
// scanning output top-to-bottom sees a malformed or colliding register entry before the
// unregistered-symbol findings that follow from it.
export const GATES: readonly Gate[] = [
  configGate,
  defsGate,
  notationGate,
  refsGate,
  linkerGate,
  runsGate,
  provenanceGate,
  shardsGate,
  rewardGate,
  freshnessGate,
];
