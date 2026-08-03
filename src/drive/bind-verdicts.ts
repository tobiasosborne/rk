// PURITY: pure — no fs/network/clock (L3). `bindVerdicts` is the M3.1 repair wave's landing-
// blocker-1 fix: the driver-owned enrichment step that turns untrusted raw worker output (shape
// (a), src/drive/verdict-raw.ts) into the driver-constructed verdict document (shape (b),
// schemas/verdict.v1.json / src/drive/verdict-schema.ts) by INJECTING itemId/contentHash/tier/
// batchId/verifier-identity from the driver's own immutable dispatch state — never reading any of
// those fields from worker output, because shape (a) does not even have room for them
// (`additionalProperties:false` there rejects them outright). This module is the one place those
// two shapes meet.
//
// Under the session/one-item-per-turn model (review blocker 3 / Q5 ruling: "cap each session turn
// at exactly one verdict; the batch cap limits turns"), one dispatch = one raw output = one
// verdict, so the "missing/extra/duplicate items" language in the ORIGINAL blocker-1 finding
// (written before blocker 3 collapsed multi-item-per-call batching to single-item turns) now
// surfaces as: "missing" = the call failed before producing anything (src/drive/worker-result.ts's
// job, not this one); "extra/duplicate" = a verdicts[] array of length != 1, which is
// src/drive/verdict-schema.ts's minItems:1/maxItems:1 job on the CONSTRUCTED document. What THIS
// module owns is "mismatched": raw output shaped for the wrong tier relative to dispatch state.

import { validateRawWorkerOutput, type CorrectionDetail, type RawIssue } from "./verdict-raw";
import { validateVerdictDocument, type VerdictDocument, type VerdictIssue } from "./verdict-schema";
import type { VerifierIdentity } from "./identity";
import { SHA256_HEX_RE, isNonBlankString, type Tier } from "./vocab";

/** The driver's own immutable record of what it dispatched THIS turn — never derived from worker
 * output. `contentHash` must already be computed per the pinned hash domain for `tier`
 * (docs/worker-contract.md section (d): raw shard-file SHA-256 for `l5`, af's `ComputeContentHash`
 * value for `hard`) BEFORE dispatch; `bindVerdicts` trusts it as given (verifying the source hash
 * itself, before dispatch and again before apply, is the driver's own edge-code responsibility,
 * not this pure function's). */
export interface DispatchState {
  itemId: string;
  contentHash: string;
  tier: Tier;
  claimId: string;
  batchId?: string;
  verifier: VerifierIdentity;
}

export interface BindIssue {
  stage: "dispatchState" | "rawOutput" | "document";
  path: string;
  message: string;
}

export type BindResult = { ok: true; document: VerdictDocument } | { ok: false; issues: BindIssue[] };

function validateDispatchState(state: DispatchState): BindIssue[] {
  const issues: BindIssue[] = [];
  if (!isNonBlankString(state.itemId)) issues.push({ stage: "dispatchState", path: "itemId", message: "must be a non-blank string" });
  if (!isNonBlankString(state.claimId)) issues.push({ stage: "dispatchState", path: "claimId", message: "must be a non-blank string" });
  if (typeof state.contentHash !== "string" || !SHA256_HEX_RE.test(state.contentHash)) {
    issues.push({ stage: "dispatchState", path: "contentHash", message: "must be a 64-character lowercase hex SHA-256 digest" });
  }
  if (state.batchId !== undefined && !isNonBlankString(state.batchId)) {
    issues.push({ stage: "dispatchState", path: "batchId", message: "must be a non-blank string when present" });
  }
  return issues;
}

/** A cheap, EXPLICIT pre-check for the most common tier-mismatch shape (a hard-tier `{outcome:
 * ...}` object handed to an l5 dispatch, or an l5 verdict STRING-enum value implied where an
 * object was expected) — `validateRawWorkerOutput` would already reject either shape via its own
 * unknown-property/missing-property checks, but this gives a dedicated, readable "tier mismatch"
 * message rather than making a caller infer it from a pile of unrelated-looking property errors. */
function detectTierMismatch(tier: Tier, raw: unknown): BindIssue | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  // The l5 raw shape's `verdict` is a STRING enum; the hard raw shape's `verdict` is an OBJECT
  // with an `outcome` field (src/drive/verdict-raw.ts). Whichever of those the OTHER tier's shape
  // shows is the tell-tale sign of a tier mismatch — checked on `raw.verdict`, not on `raw`
  // itself, since that is where each shape actually differs.
  if (tier === "l5" && typeof obj.verdict === "object" && obj.verdict !== null && "outcome" in (obj.verdict as Record<string, unknown>)) {
    return { stage: "rawOutput", path: "$", message: `tier mismatch: raw output looks like a hard-tier response ('verdict.outcome' present) but dispatch state's tier is 'l5'` };
  }
  if (tier === "hard" && typeof obj.verdict === "string") {
    return { stage: "rawOutput", path: "$", message: `tier mismatch: raw output looks like an l5-tier response (string 'verdict') but dispatch state's tier is 'hard'` };
  }
  return undefined;
}

function toBindIssues(stage: BindIssue["stage"], issues: RawIssue[] | VerdictIssue[]): BindIssue[] {
  return issues.map((i) => ({ stage, path: i.path, message: i.message }));
}

/** Builds the driver-constructed verdict document (shape (b)) from `dispatchState` (trusted,
 * immutable) and `rawWorkerOutput` (untrusted `unknown`, shape (a)). Returns `{ok:false, issues}`
 * on ANY rejection — dispatch-state malformation, tier mismatch, raw-shape violation, or (belt and
 * suspenders) a constructed document that somehow still fails `validateVerdictDocument`. Never
 * throws, never partially applies. */
export function bindVerdicts(dispatchState: DispatchState, rawWorkerOutput: unknown): BindResult {
  const stateIssues = validateDispatchState(dispatchState);
  if (stateIssues.length > 0) return { ok: false, issues: stateIssues };

  const mismatch = detectTierMismatch(dispatchState.tier, rawWorkerOutput);
  if (mismatch) return { ok: false, issues: [mismatch] };

  const rawIssues = validateRawWorkerOutput(dispatchState.tier, rawWorkerOutput);
  if (rawIssues.length > 0) return { ok: false, issues: toBindIssues("rawOutput", rawIssues) };

  const raw = rawWorkerOutput as Record<string, unknown>;
  const { itemId, contentHash, tier, claimId: _claimId, batchId, verifier } = dispatchState;
  const verdict =
    tier === "l5"
      ? raw.verdict === "VALID-WITH-CORRECTION"
        ? { itemId, tier, contentHash, justification: raw.justification as string, verdict: "VALID-WITH-CORRECTION" as const, correction: raw.correction as CorrectionDetail }
        : { itemId, tier, contentHash, justification: raw.justification as string, verdict: raw.verdict as "VALID" | "INVALID" }
      : { itemId, tier, contentHash, justification: raw.justification as string, verdict: raw.verdict as Record<string, unknown> };

  const document: VerdictDocument = {
    schema_version: "1",
    ...(batchId !== undefined ? { batchId } : {}),
    verifier,
    verdicts: [verdict as VerdictDocument["verdicts"][number]],
  };

  const documentIssues = validateVerdictDocument(document);
  if (documentIssues.length > 0) return { ok: false, issues: toBindIssues("document", documentIssues) };

  return { ok: true, document };
}

/** Blocker 6's plain-language transition rule, made a callable code artifact: a hard-tier
 * `challenge` NEVER accepts the node this turn, regardless of severity. There is no
 * accept-with-advisory-challenge shape in v1 (a future v2 could add one for minor/note
 * severities — explicitly out of scope here). `_severity` is intentionally unused: the point of
 * this function is that severity does NOT change the answer. */
export function hardChallengeAcceptsThisTurn(_severity: string): boolean {
  return false;
}

/** Blocker 6's other transition rule, made callable: a `VALID-WITH-CORRECTION` verdict must never
 * be promoted on the strength of the ORIGINAL `contentHash` — the driver must re-dispatch against
 * `correction.correctedContentHash` and receive a fresh, re-bound verdict before promotion. This
 * function always returns `true`; it exists so the rule is a real, testable statement (M3.7 can
 * assert against it) rather than prose a future implementer could miss. */
export function correctionRequiresReVerificationBeforePromotion(_correction: CorrectionDetail): boolean {
  return true;
}

/** rk-0ehr / P1's transition rule, made callable, and the exact sibling of the rule above: a LIVE
 * retraction (src/drive/retraction-store.ts's `liveRetractionFor` — the item's current hash still
 * equals the retraction record's, in the matching pinned domain) overrides ANY verdict for that
 * item, including a fresh `VALID`. There is no verdict value that survives it, which is why
 * `_verdict` is intentionally unused: the point of this function is that the verdict does NOT
 * change the answer. It always returns `true`; it exists so the rule is a real, testable statement
 * with ONE call site (src/drive/l5-promote.ts's `promotionStateFor`) rather than prose a future
 * implementer could re-derive differently. Ratified plan: docs/memos/2026-08-03-rk-improvement-
 * plan-from-aism.md §P1 semantics (a) — "status demotes and propagation cascades exactly as an
 * INVALID would". */
export function retractionOverridesVerdict(_verdict: string): boolean {
  return true;
}
