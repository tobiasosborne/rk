// ROLE: Gate 8's registry/evidence half of rk-4317 demotion. The reward engine can reverse
// balance credits from ledger facts alone; only this pure gate has the snapshot facts needed to
// decide whether the compensation is truthful. A demotion suppresses an old tier finding only
// when its evidence exists, its recorded resulting state exactly matches the shard, and that
// state supports strictly less than the original close tier.
// PURITY: pure — no fs/network/clock (L3).

import type { Finding } from "./framework";
import type { Lemma } from "./linker-parse";
import { fileSha256, type RepoSnapshot } from "./snapshot";
import { supportedCloseTier, TIER_RANK } from "../reward/tier";
import type { RewardEvent } from "../reward/types";

export interface RewardDemotionCheck {
  findings: Finding[];
  /** Close positions whose old tier finding is neutralized by a complete compensation. */
  compensatedCloseSeqs: ReadonlySet<number>;
}

type CloseEvent = Extract<RewardEvent, { type: "close" }>;

export function checkRewardDemotions(
  snapshot: RepoSnapshot,
  events: readonly RewardEvent[],
  lemmaById: ReadonlyMap<string, Lemma>,
): RewardDemotionCheck {
  const path = ".rk/reward-ledger.jsonl";
  const findings: Finding[] = [];
  const compensatedCloseSeqs = new Set<number>();
  const appliedCloseBySeq = new Map<number, CloseEvent>();
  const closedIds = new Set<string>();
  const consumedCloseSeqs = new Set<number>();

  events.forEach((event, seq) => {
    if (event.type === "close") {
      if (!closedIds.has(event.nodeId)) {
        closedIds.add(event.nodeId);
        appliedCloseBySeq.set(seq, event);
      }
      return;
    }
    if (event.type !== "demote") return;

    const targetClose = appliedCloseBySeq.get(event.targetCloseSeq);
    if (targetClose === undefined || consumedCloseSeqs.has(event.targetCloseSeq)) {
      // The engine owns the matching demote-unbanked-close diagnostic. Do not duplicate it here.
      return;
    }
    consumedCloseSeqs.add(event.targetCloseSeq);

    let complete = true;
    if (fileSha256(snapshot, event.evidenceRef) === undefined) {
      complete = false;
      findings.push({
        severity: "ERROR",
        path,
        structural: true,
        message: `[reward-demote-evidence-missing] event ${seq} demotes close event ${event.targetCloseSeq} but evidenceRef '${event.evidenceRef}' is absent`,
      });
    }

    const shard = lemmaById.get(targetClose.nodeId);
    if (shard === undefined) return;
    const exactState = shard.status === event.resultingStatus && shard.af === event.resultingAf;
    const currentTier = supportedCloseTier(shard);
    const strictlyLower = currentTier === undefined || TIER_RANK[currentTier] < TIER_RANK[targetClose.tier];
    if (!exactState || !strictlyLower) {
      complete = false;
      findings.push({
        severity: "ERROR",
        path,
        structural: true,
        message:
          `[reward-demotion-without-downgrade] event ${seq} records resulting status='${event.resultingStatus}', af='${event.resultingAf}' ` +
          `for close event ${event.targetCloseSeq} (${targetClose.nodeId}, tier='${targetClose.tier}'), but the registry currently says ` +
          `status='${String(shard.status)}', af='${shard.af}' and supports ${currentTier === undefined ? "no close tier" : `tier '${currentTier}'`} ` +
          `— the recorded state must match exactly and be strictly below the banked tier`,
      });
    }
    if (complete) compensatedCloseSeqs.add(event.targetCloseSeq);
  });

  return { findings, compensatedCloseSeqs };
}
