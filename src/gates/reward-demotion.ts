// ROLE: Gate 8's registry/evidence half of rk-4317 demotion. The reward engine can reverse
// balance credits from ledger facts alone; only this pure gate has the snapshot facts needed to
// decide whether the compensation is truthful. A demotion suppresses an old tier finding only
// when the target identity agrees, the recorded prior state could legally bank the close, its
// evidence is a separate readable text record, and its exact current state is strictly lower.
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
    // A parsed-stream position is not a stable identity: an unreadable earlier line changes every
    // later position. The engine emits the target-mismatch finding and refuses compensation; this
    // check likewise refuses to consume or neutralize the close.
    if (event.nodeId !== targetClose.nodeId) return;
    consumedCloseSeqs.add(event.targetCloseSeq);

    let complete = true;
    const shard = lemmaById.get(targetClose.nodeId);
    const selfEvidence = event.evidenceRef === path || event.evidenceRef === shard?.path;
    if (selfEvidence) {
      complete = false;
      findings.push({
        severity: "ERROR",
        path,
        structural: true,
        message:
          `[reward-demote-evidence-self-reference] event ${seq} demotes close event ${event.targetCloseSeq} ` +
          `(${targetClose.nodeId}) but evidenceRef '${event.evidenceRef}' is ${event.evidenceRef === path ? "the reward ledger itself" : "the target shard itself"} — self-reference is not refuting evidence`,
      });
    } else if (fileSha256(snapshot, event.evidenceRef) === undefined) {
      complete = false;
      findings.push({
        severity: "ERROR",
        path,
        structural: true,
        message: `[reward-demote-evidence-missing] event ${seq} demotes close event ${event.targetCloseSeq} but evidenceRef '${event.evidenceRef}' is absent`,
      });
    } else if (snapshot.get(event.evidenceRef) === undefined || snapshot.get(event.evidenceRef)!.trim().length === 0) {
      const unreadableReason = snapshot.get(event.evidenceRef) === undefined
        ? "only hash-visible, not a readable snapshot text record"
        : "blank, not a text record";
      complete = false;
      findings.push({
        severity: "ERROR",
        path,
        structural: true,
        message:
          `[reward-demote-evidence-unreadable] event ${seq} demotes close event ${event.targetCloseSeq} ` +
          `but evidenceRef '${event.evidenceRef}' is ${unreadableReason}`,
      });
    }

    if (shard === undefined) return;
    const priorTier = supportedCloseTier({ status: event.priorStatus, af: event.priorAf });
    const wasLegal = priorTier !== undefined && TIER_RANK[priorTier] >= TIER_RANK[targetClose.tier];
    if (!wasLegal) {
      complete = false;
      findings.push({
        severity: "ERROR",
        path,
        structural: true,
        message:
          `[reward-demote-never-legal] event ${seq} records prior status='${event.priorStatus}', af='${event.priorAf}' ` +
          `for close event ${event.targetCloseSeq} (${targetClose.nodeId}, tier='${targetClose.tier}'), but that prior state ` +
          `supports ${priorTier === undefined ? "no close tier" : `at most '${priorTier}'`} — a close that was never legal cannot be repaired by demotion`,
      });
    }
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
