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

// rk-qxp (FIX 6): af's challenge `target` is an ASPECT ENUM (statement|inference|context|
// dependencies|scope|gap|type_error|domain|completeness — ../vibefeld/internal/schema/target.go),
// NOT a node id. The MODEL-facing challenge names the node AT FAULT in its `target`; the ASPECT is
// derived from the model's `category` via this fixed, documented map. Every rk category
// (src/drive/vocab.ts's CATEGORIES) has an entry; a challenge with NO category falls through to
// `statement` (af's own default). Keeping the model-facing schema unchanged means no compat event.
const CATEGORY_TO_ASPECT: Record<Category, string> = {
  gap: "gap",
  dependency: "dependencies",
  missing: "completeness",
  incorrect: "inference",
  unclear: "statement",
  other: "statement",
};
/** af aspect for the model's `category` — absent/unknown category defaults to af's own `statement`. */
function aspectForCategory(category: unknown): string {
  return typeof category === "string" && category in CATEGORY_TO_ASPECT ? CATEGORY_TO_ASPECT[category as Category] : "statement";
}

export interface AfApplyItem {
  // Quoted key (not a bare identifier) so scripts/selftest.ts's purity grep — a line scanner
  // guarding against a stray `node`-colon-shaped import — never trips on a legitimate field name,
  // the same discipline src/drive/batch-plan.ts's `VerdictFileSkeletonItem` uses.
  "node": string;
  verdict: "accept" | "challenge";
  reason: string;
  /** rk-qxp (FIX 6): af's challenge ASPECT enum (statement|inference|...|completeness), DERIVED
   * from the model's `category` — NOT the model's node-id target (that becomes `node` above). */
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

/** Maps `doc`'s single verdict onto the proof. `doc` must be a hard-tier document with exactly one
 * verdict (the worker-contract's one-verdict-per-turn rule — verdict-schema enforces it), whose
 * `verdict` field is the RawHardOutcome object bind-verdicts carried through. `nodeId` is the node
 * UNDER REVIEW (where an accept is recorded). `knownNodeIds` is the set of node ids present in the
 * proof export, used to validate a challenge's BLAMED node (rk-qxp FIX 6): a challenge is recorded
 * on the node the model named at fault (`target`), which may be the reviewed node or a dependency;
 * an unknown blamed node is a loud map failure, never a silently mis-attributed challenge. */
export function afItemFromVerdictDocument(nodeId: string, doc: VerdictDocument, knownNodeIds: ReadonlySet<string>): AfItemResult {
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
    // rk-qxp (FIX 6): the model's `target` is the NODE ID at fault (its own model-facing schema),
    // NOT af's aspect enum. Record the challenge ON that blamed node (item.node := target),
    // validated present in the export; the af `target` ASPECT is derived from the model's category.
    const blamed = outcome.target;
    const severity = outcome.severity;
    const reason = outcome.reason;
    if (typeof blamed !== "string" || blamed.trim().length === 0) return { ok: false, reason: "challenge missing 'target' (the node id at fault)" };
    if (!knownNodeIds.has(blamed)) return { ok: false, reason: `challenge names blamed node '${blamed}' which is not present in the proof export — refusing to record a mis-attributed challenge` };
    if (typeof severity !== "string" || !SEVERITIES.has(severity as Severity)) return { ok: false, reason: "challenge 'severity' invalid" };
    if (typeof reason !== "string" || reason.trim().length === 0) return { ok: false, reason: "challenge missing 'reason'" };
    const item: AfApplyItem = { "node": blamed, verdict: "challenge", reason, target: aspectForCategory(outcome.category), severity };
    if (typeof outcome.category === "string" && CATEGORIES.has(outcome.category as Category)) item.category = outcome.category;
    return { ok: true, item };
  }
  return { ok: false, reason: `unknown hard outcome '${String(outcome.outcome)}'` };
}
