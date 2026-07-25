// PURITY: pure — no fs/network/clock (L3). M3.7's second deliverable, planning half: the
// `--dry-run`-shaped projection of "what would an L5 dispatch send" — composes candidate shards
// via src/drive/batch-composer.ts (tier `l5`), threads each member through
// src/drive/batch-plan.ts's `toBatchPlan`, and pairs every surviving member with the CURRENT
// `l5ContentHash`-domain hash the caller already computed (src/drive/l5-store-io.ts's
// `currentL5ContentHash` is the edge that produces those; this module only consumes the map, it
// never reads a file itself). A future `rk verify --l5 --dry-run` CLI (deferred — see this WP's
// final report) renders exactly this structure; the actual dispatch execution against a real
// `WorkerBackend` is src/drive/l5-dispatch.ts, which this module has no knowledge of.
//
// A member with no entry in `currentHashes` (the caller never read that shard's bytes, e.g. a
// registry/file-system mismatch) is excluded with reason `missing-current-hash` — never silently
// dropped, never dispatched with a guessed or stale hash.
//
// rk-74o (M3 review follow-up 3): ACTUAL-MEMBER PROVENANCE. This module used to keep the composer's
// `batchId` after dropping members: "deriveBatchId is keyed on the ORIGINAL composed membership,
// not the post-hash-filter one". That is exactly the defect the review named — the recorded id then
// describes a set that was never dispatched, and `af unvalidate --batch <id>` (PRD C3's
// bulk-revocation lever) claims a coverage it does not have. A batch that drops ANY member now
// re-derives its id (and therefore its `claimId`) over the survivors, and renumbers their
// dependency-order positions contiguously. The composer's original id is still reported as
// `composedBatchId` so the drop stays visible rather than erased.

import { composeBatches, deriveBatchId, type BatchComposerConfig } from "./batch-composer";
import type { BatchCandidate, Determinacy, EligibilityConstraint, ExclusionReason } from "./batch-eligibility";
import { EXCLUSION_DETERMINACY } from "./batch-eligibility";
import { toBatchPlan } from "./batch-plan";
import type { GraphDocument } from "../graph/types";

export interface L5DispatchPlanMember {
  itemId: string;
  order: number;
  contentHash: string;
}

export interface L5DispatchPlanBatch {
  /** The id derived from the members ACTUALLY in this batch (post-drop). This is the id a verdict
   * record carries and the id `af unvalidate --batch` would revoke. */
  batchId: string;
  /** What the composer derived BEFORE any member was dropped for a missing hash. Diagnostic only —
   * never written to a ledger, never used as a claim id; it exists so a report can say "this batch
   * lost members" instead of silently showing a different id than the composer logged. Equal to
   * `batchId` whenever nothing was dropped. */
  composedBatchId: string;
  /** `l5:<batchId>` — the isolation-tuple `claimId` this batch's session will be opened under
   * (docs/worker-contract.md section (a)). Namespaced with the `l5:` prefix so an l5 claim id can
   * never collide with a hard-tier claim id derived from the same underlying batch composition.
   * Follows the RE-DERIVED `batchId`, so the session's isolation tuple names the dispatched set. */
  claimId: string;
  members: L5DispatchPlanMember[];
  score: number;
}

export type L5PlanExclusionReason = ExclusionReason | "missing-current-hash";

export interface L5DispatchPlanExclusion {
  id: string;
  /** `"content-hash"` for `missing-current-hash`; otherwise the eligibility guardrail that refused
   * (src/drive/batch-eligibility.ts). */
  constraint: EligibilityConstraint | "content-hash";
  reason: L5PlanExclusionReason;
  determinacy: Determinacy;
  detail: string;
}

export interface L5DispatchPlan {
  northStarId: string;
  cap: number;
  batches: L5DispatchPlanBatch[];
  excluded: L5DispatchPlanExclusion[];
}

/** Builds the dry-run-shaped L5 dispatch plan. `currentHashes` maps every candidate's `itemId` to
 * its current `l5ContentHash`-domain hash; a batch that loses every member to a missing hash
 * contributes NOTHING to `batches` (not an empty-members batch entry), and a batch that loses only
 * some re-derives its identity over the survivors (see the header's rk-74o note). The dispatch tier
 * is fixed at `"l5"` by this module — it is the L5 planner — so a candidate declaring any other
 * tier is refused by the composer's own screen, not quietly re-tiered here. */
export function planL5Dispatch(
  doc: GraphDocument,
  candidates: readonly BatchCandidate[],
  northStarId: string,
  currentHashes: ReadonlyMap<string, string>,
  config: BatchComposerConfig = {},
): L5DispatchPlan {
  const composed = composeBatches(doc, candidates, northStarId, { ...config, tier: "l5" });
  const excluded: L5DispatchPlanExclusion[] = composed.excluded.map((e) => ({
    id: e.id, constraint: e.constraint, reason: e.reason, determinacy: e.determinacy, detail: e.detail,
  }));
  const batches: L5DispatchPlanBatch[] = [];

  for (const composedBatch of composed.batches) {
    const plan = toBatchPlan(composedBatch);
    const survivors: { itemId: string; contentHash: string }[] = [];
    for (const member of plan.members) {
      const contentHash = currentHashes.get(member.nodeId);
      if (contentHash === undefined) {
        excluded.push({
          id: member.nodeId,
          constraint: "content-hash",
          reason: "missing-current-hash",
          determinacy: "indeterminate",
          detail: "no current l5ContentHash was supplied for this shard, so the bytes a verdict would bind to are unknown",
        });
        continue;
      }
      survivors.push({ itemId: member.nodeId, contentHash });
    }
    if (survivors.length === 0) continue;
    // Re-derive over the survivors and renumber their positions contiguously: `order` is documented
    // as "the index this member occupies in `members`", so leaving a gap where a dropped member was
    // would make that field describe a member list that does not exist.
    const batchId = deriveBatchId(northStarId, survivors.map((s) => s.itemId));
    const members: L5DispatchPlanMember[] = survivors.map((s, order) => ({ itemId: s.itemId, order, contentHash: s.contentHash }));
    batches.push({ batchId, composedBatchId: composedBatch.batchId, claimId: `l5:${batchId}`, members, score: composedBatch.score });
  }

  return { northStarId, cap: composed.cap, batches, excluded };
}

/** Deterministic one-line refusal text (mirrors src/drive/batch-eligibility.ts's
 * `describeExclusion`, extended with this module's own `missing-current-hash` reason so a driver
 * log line never has to know which of the two produced a given exclusion). */
export function describeL5PlanExclusion(ex: L5DispatchPlanExclusion): string {
  return `l5-dispatch-plan: '${ex.id}' refused by the ${ex.constraint} guardrail (${ex.reason}, ${ex.determinacy}) — ${ex.detail}`;
}

/** Every eligibility reason keeps the determinacy src/drive/batch-eligibility.ts assigned it; this
 * module adds exactly one reason of its own, and it is INDETERMINATE (a missing hash means the
 * shard's current bytes were never read — not that the shard was found ineligible). */
export const L5_PLAN_EXCLUSION_DETERMINACY: Record<L5PlanExclusionReason, Determinacy> = {
  ...EXCLUSION_DETERMINACY,
  "missing-current-hash": "indeterminate",
};
