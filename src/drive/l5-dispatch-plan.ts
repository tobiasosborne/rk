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

import { composeBatches, type BatchComposerConfig, type ExclusionReason } from "./batch-composer";
import { toBatchPlan } from "./batch-plan";
import type { GraphDocument } from "../graph/types";

export interface L5DispatchPlanMember {
  itemId: string;
  order: number;
  contentHash: string;
}

export interface L5DispatchPlanBatch {
  batchId: string;
  /** `l5:<batchId>` — the isolation-tuple `claimId` this batch's session will be opened under
   * (docs/worker-contract.md section (a)). Namespaced with the `l5:` prefix so an l5 claim id can
   * never collide with a hard-tier claim id derived from the same underlying batch composition. */
  claimId: string;
  members: L5DispatchPlanMember[];
  score: number;
}

export type L5PlanExclusionReason = ExclusionReason | "missing-current-hash";

export interface L5DispatchPlanExclusion {
  id: string;
  reason: L5PlanExclusionReason;
}

export interface L5DispatchPlan {
  northStarId: string;
  cap: number;
  batches: L5DispatchPlanBatch[];
  excluded: L5DispatchPlanExclusion[];
}

/** Builds the dry-run-shaped L5 dispatch plan. `currentHashes` maps every candidate's `itemId` to
 * its current `l5ContentHash`-domain hash; a batch that loses every member to a missing hash
 * contributes NOTHING to `batches` (not an empty-members batch entry) — its surviving members (if
 * any) still form a smaller batch under the same `batchId`/`claimId` the composer derived, since
 * `deriveBatchId` is keyed on the ORIGINAL composed membership, not the post-hash-filter one (this
 * mirrors `toBatchPlan`'s own stance: hash verification is edge-adjacent bookkeeping layered on
 * top of a composition decision already made). */
export function planL5Dispatch(
  doc: GraphDocument,
  candidateIds: readonly string[],
  northStarId: string,
  currentHashes: ReadonlyMap<string, string>,
  config: BatchComposerConfig = {},
): L5DispatchPlan {
  const composed = composeBatches(doc, candidateIds, northStarId, config);
  const excluded: L5DispatchPlanExclusion[] = composed.excluded.map((e) => ({ id: e.id, reason: e.reason }));
  const batches: L5DispatchPlanBatch[] = [];

  for (const composedBatch of composed.batches) {
    const plan = toBatchPlan(composedBatch, "l5");
    const members: L5DispatchPlanMember[] = [];
    for (const member of plan.members) {
      const contentHash = currentHashes.get(member.nodeId);
      if (contentHash === undefined) {
        excluded.push({ id: member.nodeId, reason: "missing-current-hash" });
        continue;
      }
      members.push({ itemId: member.nodeId, order: member.order, contentHash });
    }
    if (members.length === 0) continue;
    batches.push({ batchId: composedBatch.batchId, claimId: `l5:${composedBatch.batchId}`, members, score: composedBatch.score });
  }

  return { northStarId, cap: composed.cap, batches, excluded };
}
