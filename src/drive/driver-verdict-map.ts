// PURITY: pure — no fs/network/clock (L3). M3.6: the VALIDITY-CRITICAL translation from a bound rk
// verdict document (shape (b), schemas/verdict.v1.json, already validated by src/drive/bind-
// verdicts.ts) into one `af verdicts apply` item (../vibefeld/docs/verdicts-apply.md). This decides
// what gets recorded as a validated ledger event, so it is L6 validity semantics — it is deliberately
// a tiny, isolated, mutation-proven pure function so the M3 boundary Tier A review can audit it in
// one read. It applies exactly two rules and no more:
//   1. A hard-tier `accept` outcome → `{verdict:"accept", reason: justification}`. af requires a
//      non-blank reason on every item including accepts (verdicts-apply.md), so the worker's
//      justification is carried as the reason; a blank justification is rejected UPSTREAM by
//      bind-verdicts/verdict-raw (minLength:1) before this function is ever reached.
//   2. A hard-tier `challenge` outcome → `{verdict:"challenge", reason, target, severity, category?}`.
//      A challenge NEVER accepts the node this turn regardless of severity — matching
//      src/drive/bind-verdicts.ts's `hardChallengeAcceptsThisTurn` (always false) — because this map
//      never emits an `accept` item from a `challenge` outcome. There is no third path.
//
// It refuses (returns {ok:false}) anything that is not a hard-tier single-verdict document — the L5
// soft tier does NOT go through `af verdicts apply` (that verb is hard-tier only, per
// src/drive/batch-plan.ts's `toVerdictFileSkeleton`).

import type { VerdictDocument } from "./verdict-schema";
import { SEVERITIES, CATEGORIES, type Severity, type Category } from "./vocab";

export interface AfApplyItem {
  // Quoted key (not a bare identifier) so scripts/selftest.ts's purity grep — a line scanner
  // guarding against a stray `node`-colon-shaped import — never trips on a legitimate field name,
  // the same discipline src/drive/batch-plan.ts's `VerdictFileSkeletonItem` uses.
  "node": string;
  verdict: "accept" | "challenge";
  reason: string;
  target?: string;
  severity?: string;
  category?: string;
  /** rk B1: the node content hash this verdict was bound against, sent to `af verdicts apply` as
   * `expect_hash` so af re-checks it (and, for an accept, verifier-ready availability) atomically
   * under its own state read — the kernel guarantee a driver-side re-read alone cannot give. Set by
   * the driver loop from the bound hash immediately before apply, not by the pure mapper. */
  expect_hash?: string;
}

export type AfItemResult = { ok: true; item: AfApplyItem } | { ok: false; reason: string };

/** Maps `doc`'s single verdict onto node `nodeId`. `doc` must be a hard-tier document with exactly
 * one verdict (the worker-contract's one-verdict-per-turn rule — verdict-schema enforces it), whose
 * `verdict` field is the RawHardOutcome object bind-verdicts carried through. */
export function afItemFromVerdictDocument(nodeId: string, doc: VerdictDocument): AfItemResult {
  const entry = doc.verdicts[0];
  if (doc.verdicts.length !== 1 || entry === undefined) {
    return { ok: false, reason: `expected exactly one verdict, got ${doc.verdicts.length}` };
  }
  if (entry.tier !== "hard") {
    return { ok: false, reason: `af verdicts apply is hard-tier only; verdict tier is '${entry.tier}'` };
  }
  const outcome = entry.verdict as Record<string, unknown>;
  if (outcome === null || typeof outcome !== "object") {
    return { ok: false, reason: "hard verdict payload is not an object" };
  }
  const justification = entry.justification;
  if (outcome.outcome === "accept") {
    return { ok: true, item: { "node": nodeId, verdict: "accept", reason: justification } };
  }
  if (outcome.outcome === "challenge") {
    const target = outcome.target;
    const severity = outcome.severity;
    const reason = outcome.reason;
    if (typeof target !== "string" || target.trim().length === 0) return { ok: false, reason: "challenge missing 'target'" };
    if (typeof severity !== "string" || !SEVERITIES.has(severity as Severity)) return { ok: false, reason: "challenge 'severity' invalid" };
    if (typeof reason !== "string" || reason.trim().length === 0) return { ok: false, reason: "challenge missing 'reason'" };
    const item: AfApplyItem = { "node": nodeId, verdict: "challenge", reason, target, severity };
    if (typeof outcome.category === "string" && CATEGORIES.has(outcome.category as Category)) item.category = outcome.category;
    return { ok: true, item };
  }
  return { ok: false, reason: `unknown hard outcome '${String(outcome.outcome)}'` };
}
