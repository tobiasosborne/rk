// PURITY: pure — no fs/network/clock (L3). A verifier fence is valid only when its structured
// claim/ref pair resolves to the latest fresh plain-VALID L5 record and no live retraction binds.
// The caller supplies parsed stores and current hashes; this core never discovers identity or IO.

import { l5StoreHealthy, type L5LogParseResult } from "./l5-store";
import { promotionStateFor } from "./l5-promote";
import type { L5StoredVerdict } from "./l5-record";
import {
  liveRetractionFor,
  retractionStoreHealthy,
  type RetractionLogParseResult,
} from "./retraction-store";

const VERDICT_PATH = ".rk/l5-verdicts.jsonl";
const VERDICT_REF = /^\.rk\/l5-verdicts\.jsonl#ordinal=(0|[1-9][0-9]*)$/;

export interface AssumedVerified {
  claimId: string;
  verdictRef: string;
}

export interface VerifierFenceStoreState {
  l5: L5LogParseResult;
  retractions: RetractionLogParseResult;
  /** Current raw-shard-byte hashes, keyed by the driver-supplied claim identity. */
  currentHashes: ReadonlyMap<string, string>;
}

export interface ConfirmedVerifierFence extends AssumedVerified {
  contentHash: string;
  locus: string;
  verdict: "VALID";
}

export type VerifierFenceRefusalReason =
  | "malformed entry"
  | "unknown item"
  | "verdict-ref-missing"
  | "claim-not-covered"
  | "current-hash-missing"
  | "l5-store-unhealthy"
  | "retraction-store-unhealthy"
  | "stale"
  | "retracted"
  | "invalid"
  | "correction-pending"
  | "no-verdict"
  | "verdict-ref-superseded";

export interface VerifierFenceRefusal extends AssumedVerified {
  reason: VerifierFenceRefusalReason;
}

export interface VerifierFenceCoverage {
  checked: number;
  total: number;
  confirmed: number;
  refused: number;
}

export interface VerifierFenceValidation {
  coverage: VerifierFenceCoverage;
  confirmed: ConfirmedVerifierFence[];
  refusals: VerifierFenceRefusal[];
}

/** Worker-facing evidence. The driver has checked these identities against its supplied store
 * view; the verifier still has to confirm the cited hash/locus independently before honoring it. */
export function renderConfirmedVerifierFences(fences: readonly ConfirmedVerifierFence[]): string {
  const lines = [`Assumed verified (structured, driver-confirmed) (${fences.length}):`];
  if (fences.length === 0) lines.push("(none; no input is fenced from scrutiny)");
  for (const fence of fences) lines.push(JSON.stringify(fence));
  lines.push(
    "Before honoring any fence, independently confirm its claimId, verdictRef, contentHash, locus, and verdict. " +
      "If any confirmation is unavailable or disagrees, re-litigate that input and say so in the justification.",
  );
  return lines.join("\n");
}

export function verdictRefFor(record: L5StoredVerdict): string {
  return `${VERDICT_PATH}#ordinal=${record.ordinal}`;
}

function refusal(entry: AssumedVerified, reason: VerifierFenceRefusalReason): VerifierFenceRefusal {
  return { claimId: entry.claimId, verdictRef: entry.verdictRef, reason };
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedEntry(entry: unknown): AssumedVerified | undefined {
  if (!plainObject(entry)) return undefined;
  return {
    claimId: typeof entry.claimId === "string" ? entry.claimId : "",
    verdictRef: typeof entry.verdictRef === "string" ? entry.verdictRef : "",
  };
}

function recordAtRef(records: readonly L5StoredVerdict[], verdictRef: string): L5StoredVerdict | undefined {
  const match = VERDICT_REF.exec(verdictRef);
  if (match === null) return undefined;
  const ordinal = Number(match[1]);
  return records.find((record) => record.ordinal === ordinal);
}

/** Fail-closed validation of every declared fence. Coverage is per entry, including malformed
 * entries: a supplied but unusable fence is a refusal, never an omitted optional value. */
export function validateVerifierFences(
  entries: readonly unknown[],
  state: VerifierFenceStoreState,
): VerifierFenceValidation {
  const confirmed: ConfirmedVerifierFence[] = [];
  const refusals: VerifierFenceRefusal[] = [];
  if (entries.length === 0) {
    return { coverage: { checked: 0, total: 0, confirmed: 0, refused: 0 }, confirmed, refusals };
  }

  const l5Health = l5StoreHealthy(state.l5);
  const retractionHealth = retractionStoreHealthy(state.retractions);
  for (const rawEntry of entries) {
    const entry = normalizedEntry(rawEntry);
    if (entry === undefined) {
      refusals.push(refusal({ claimId: "", verdictRef: "" }, "malformed entry"));
      continue;
    }
    if (!l5Health.healthy) {
      refusals.push(refusal(entry, "l5-store-unhealthy"));
      continue;
    }
    if (!retractionHealth.healthy) {
      refusals.push(refusal(entry, "retraction-store-unhealthy"));
      continue;
    }
    const cited = recordAtRef(state.l5.records, entry.verdictRef);
    if (cited === undefined) {
      refusals.push(refusal(entry, "verdict-ref-missing"));
      continue;
    }
    if (entry.claimId.length === 0 || cited.itemId !== entry.claimId) {
      refusals.push(refusal(entry, "claim-not-covered"));
      continue;
    }
    const currentHash = state.currentHashes.get(entry.claimId);
    if (currentHash === undefined) {
      refusals.push(refusal(entry, "current-hash-missing"));
      continue;
    }
    const liveRetraction = liveRetractionFor(
      state.retractions.records,
      entry.claimId,
      currentHash,
      "l5-shard-bytes",
    );
    const promotion = promotionStateFor(state.l5.records, entry.claimId, currentHash, liveRetraction);
    if (promotion.status === "not-promotable") {
      refusals.push(refusal(entry, promotion.reason));
      continue;
    }
    if (promotion.record.ordinal !== cited.ordinal) {
      refusals.push(refusal(entry, "verdict-ref-superseded"));
      continue;
    }
    confirmed.push({
      claimId: entry.claimId,
      verdictRef: verdictRefFor(cited),
      contentHash: cited.l5ContentHash,
      locus: `${VERDICT_PATH}:${cited.ordinal + 1}`,
      verdict: "VALID",
    });
  }

  return {
    coverage: {
      checked: entries.length,
      total: entries.length,
      confirmed: confirmed.length,
      refused: refusals.length,
    },
    confirmed,
    refusals,
  };
}
