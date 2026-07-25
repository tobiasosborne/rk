// PURITY: pure — no fs/network/clock (L3). M3.4: batch provenance threading. Projects a
// src/drive/batch-composer.ts `ComposedBatch` into (a) `BatchPlan` — the richer internal record
// carrying everything the eventual verdict dispatch needs per member (which of the two PINNED hash
// domains, docs/worker-contract.md section (f), verifies its content; its dependency-order
// position) — and (b) `VerdictFileSkeleton` — the HARD-TIER-ONLY scaffold matching
// ../vibefeld/docs/verdicts-apply.md's file shape byte-for-byte (`schema_version`, `batch_id`,
// `verified_by`, `items[].node` — see test/drive/batch-plan-vibefeld-seam.test.ts, which reads
// that doc directly and fails on field-name drift, the same discipline
// test/drive/vibefeld-seam-fixture.test.ts already applies to severity/category).
//
// This module computes NO hash bytes itself (that requires reading the current shard/af-node
// content, which is edge-code — docs/worker-contract.md (f): "the driver verifies the current
// source hash ... BEFORE dispatch ... BEFORE apply", explicitly out of this pure module's scope).
// `contentHashDomain` names WHICH pinned domain applies (`l5ContentHash` vs `hardContentHash`),
// never a computed digest.
//
// M3.6/M3.7 SEAM (read this before wiring the driver loop): `toVerdictFileSkeleton` produces
// `items` in dependency order with ONLY the `node` field populated — `verdict`/`reason` (and, for
// challenges, `target`/`severity`/`category`) are NOT here, because they do not exist until the
// M3.6 driver actually dispatches each member and receives a real verdict (schemas/verdict.v1.json
// / src/drive/bind-verdicts.ts). `verified_by` is the literal placeholder string
// `VERIFIED_BY_PLACEHOLDER` — the driver MUST overwrite it with the real verifier identity seam
// (src/drive/identity.ts's `encodeVerifierSeam`) before ever calling `af verdicts apply`; writing
// the placeholder to a live ledger would record a nonsense identity, not a missing one.

import type { ComposedBatch } from "./batch-composer";
import type { Tier } from "./vocab";

/** Which of docs/worker-contract.md section (f)'s two PINNED hash domains verifies this member's
 * content before dispatch/apply: `"l5"` (raw shard-file SHA-256, no normalization) or `"hard"`
 * (../vibefeld's `Node.ComputeContentHash()`). The two domains are never comparable to each
 * other — see that section; this module only records WHICH one applies, per the batch's own tier. */
export type ContentHashDomain = "l5" | "hard";

export interface BatchPlanMember {
  nodeId: string;
  /** 0-based dependency-order position: the index this member occupies in `members` (and, for a
   * hard-tier plan, the index it will occupy in the final `af verdicts apply` file's `items`
   * array). Independence (src/drive/batch-composer.ts's guardrail 1) makes any order valid
   * dependency order for THIS batch's own members — there is nothing for one member to be
   * ordered "before" relative to another when neither requires the other — so this field exists
   * for bookkeeping determinism, not because an ordering constraint was discharged here. */
  order: number;
  contentHashDomain: ContentHashDomain;
}

export interface BatchPlan {
  batchId: string;
  /** A batch is homogeneous-tier by construction: every member is dispatched under the SAME tier
   * (mixing l5/hard verdict shapes in one af verdicts-apply file would violate that file's own
   * schema, which is hard-tier only — see `toVerdictFileSkeleton` below). rk-74o: this is now
   * `batch.tier` — the tier every member was actually SCREENED against by
   * src/drive/batch-eligibility.ts — not a second, independent value the caller re-declares here.
   * The old two-argument form let a hard-tier batch be planned as `l5`, which would pin the wrong
   * content-hash domain (docs/worker-contract.md (f): the two domains are never comparable). */
  tier: Tier;
  members: BatchPlanMember[];
}

/** Projects a composed batch into its `BatchPlan`, tagging every member with its dependency-order
 * position and the pinned hash domain implied by the batch's own screened tier. `batch.members` is
 * already sorted ascending (src/drive/batch-composer.ts) — that sort order becomes the
 * dependency-order position 1:1, index by index. */
export function toBatchPlan(batch: ComposedBatch): BatchPlan {
  const contentHashDomain: ContentHashDomain = batch.tier === "l5" ? "l5" : "hard";
  return {
    batchId: batch.batchId,
    tier: batch.tier,
    members: batch.members.map((nodeId, order) => ({ nodeId, order, contentHashDomain })),
  };
}

/** One `items[]` entry of the af verdicts-apply file (../vibefeld/docs/verdicts-apply.md), AT THE
 * SKELETON STAGE: only `node` is populated (mirrors that document's own field name byte-for-byte —
 * quoted here as a string-literal key, not a bare identifier, solely so scripts/selftest.ts's
 * purity grep — a dumb line scanner guarding against a stray `node`-colon-shaped import — never
 * trips on a legitimate field name it was never meant to catch). */
export interface VerdictFileSkeletonItem {
  "node": string;
}

/** The af verdicts-apply file shape (../vibefeld/docs/verdicts-apply.md's "Top-level document"),
 * AT THE SKELETON STAGE — every field name is byte-identical to that document's own JSON snippet;
 * `verified_by` carries `VERIFIED_BY_PLACEHOLDER` until the M3.6 driver overwrites it, and `items`
 * carry only `node` until the driver fills in each member's real verdict/reason after dispatch. */
export interface VerdictFileSkeleton {
  schema_version: "1";
  batch_id: string;
  verified_by: string;
  items: VerdictFileSkeletonItem[];
}

/** Never a valid verifier identity on its own (src/drive/identity.ts's seam encoding always
 * produces `family|backend|model|sessionId`, four non-blank `|`-joined components — this string
 * has zero `|` characters, so `decodeVerifierSeam` rejects it outright if ever accidentally
 * submitted, rather than silently misparsing it as some single-component identity). */
export const VERIFIED_BY_PLACEHOLDER = "PENDING-VERIFIER-IDENTITY";

export type SkeletonResult = { ok: true; skeleton: VerdictFileSkeleton } | { ok: false; reason: string };

/** Builds the af verdicts-apply file skeleton for a HARD-TIER plan only — the file this seam
 * exists for is af's own ingestion verb (V2), which never applies to the L5 soft tier. Returns
 * `{ok:false}` rather than throwing for an l5 plan, matching this codebase's Result-type
 * convention for a caller error that is a legitimate, expected branch, not a crash. */
export function toVerdictFileSkeleton(plan: BatchPlan): SkeletonResult {
  if (plan.tier !== "hard") {
    return { ok: false, reason: `af verdicts apply is hard-tier only; plan.tier is '${plan.tier}'` };
  }
  const items: VerdictFileSkeletonItem[] = [...plan.members]
    .sort((a, b) => a.order - b.order)
    .map((m) => ({ "node": m.nodeId }));
  return {
    ok: true,
    skeleton: { schema_version: "1", batch_id: plan.batchId, verified_by: VERIFIED_BY_PLACEHOLDER, items },
  };
}
