// 1:1 test file for src/drive/l5-promote.ts (M3.7's third deliverable) — the promotion query API
// the M3.8 linker WP will call. Covers every `PromotionStatus` branch, with a dedicated
// mutation-proof test for the contract's rule (g): a fresh VALID-WITH-CORRECTION must NEVER read
// as promotable, even though its bound hash matches current bytes.

import { describe, expect, test } from "bun:test";
import { promotionQuery, promotionStateFor } from "../../src/drive/l5-promote";
import { retractionOverridesVerdict } from "../../src/drive/bind-verdicts";
import type { L5StoredVerdict } from "../../src/drive/l5-record";

const HASH_ORIGINAL = "a".repeat(64);
const HASH_CORRECTED = "b".repeat(64);

function rec(overrides: Partial<L5StoredVerdict> = {}): L5StoredVerdict {
  return {
    schemaVersion: "1",
    ordinal: 0,
    itemId: "lem-1",
    l5ContentHash: HASH_ORIGINAL,
    verdict: "VALID",
    justification: "j",
    verifierSeam: "claude|claude|m|s",
    ...overrides,
  };
}

describe("promotionStateFor — the plain cases", () => {
  test("no record at all -> not-promotable, reason no-verdict", () => {
    expect(promotionStateFor([], "lem-1", HASH_ORIGINAL)).toEqual({ status: "not-promotable", reason: "no-verdict" });
  });

  test("a fresh VALID verdict -> promotable", () => {
    const r = rec({ verdict: "VALID" });
    expect(promotionStateFor([r], "lem-1", HASH_ORIGINAL)).toEqual({ status: "promotable", record: r });
  });

  test("a fresh INVALID verdict -> not-promotable, reason invalid", () => {
    const r = rec({ verdict: "INVALID" });
    expect(promotionStateFor([r], "lem-1", HASH_ORIGINAL)).toEqual({ status: "not-promotable", reason: "invalid", record: r });
  });

  test("a stale VALID verdict (shard edited since) -> not-promotable, reason stale", () => {
    const r = rec({ verdict: "VALID", l5ContentHash: HASH_ORIGINAL });
    expect(promotionStateFor([r], "lem-1", HASH_CORRECTED)).toEqual({ status: "not-promotable", reason: "stale", record: r });
  });
});

describe("promotionStateFor — rule (g): VALID-WITH-CORRECTION never promotes on its own hash", () => {
  test("MUTATION-PROOF: a fresh VALID-WITH-CORRECTION (bound hash still matches CURRENT bytes -- the fix has not landed on disk) is NOT promotable", () => {
    // If the correction-pending guard were deleted (i.e. this function fell back to the plain
    // "fresh && verdict !== INVALID" rule), this exact case would misread as promotable: the
    // record's own bound hash equals currentHash, so ordinary staleness alone says "fresh." Rule
    // (g) forbids promotion here regardless -- this is the one case that is NOT free from the
    // hash-binding property alone (see this module's file-header design note).
    const r = rec({ verdict: "VALID-WITH-CORRECTION", correction: { description: "fix the sign", correctedContentHash: HASH_CORRECTED } });
    const state = promotionStateFor([r], "lem-1", HASH_ORIGINAL);
    expect(state).toEqual({ status: "not-promotable", reason: "correction-pending", record: r });
  });

  test("once the shard is edited to the corrected bytes but NOT yet re-verified, the old correction record goes stale (free from hash-binding) -- still not promotable, now for a different reason", () => {
    const r = rec({ verdict: "VALID-WITH-CORRECTION", correction: { description: "fix the sign", correctedContentHash: HASH_CORRECTED } });
    const state = promotionStateFor([r], "lem-1", HASH_CORRECTED);
    expect(state).toEqual({ status: "not-promotable", reason: "stale", record: r });
  });

  test("AFTER a fresh re-dispatch re-verifies the corrected bytes and appends a later plain VALID record, promotion succeeds", () => {
    const correctionRecord = rec({ ordinal: 0, verdict: "VALID-WITH-CORRECTION", l5ContentHash: HASH_ORIGINAL, correction: { description: "fix the sign", correctedContentHash: HASH_CORRECTED } });
    const reVerified = rec({ ordinal: 1, verdict: "VALID", l5ContentHash: HASH_CORRECTED });
    const state = promotionStateFor([correctionRecord, reVerified], "lem-1", HASH_CORRECTED);
    expect(state).toEqual({ status: "promotable", record: reVerified });
  });

  test("a SECOND round of correction (fresh VALID-WITH-CORRECTION as the latest, later than an earlier plain VALID) still never promotes", () => {
    const oldValid = rec({ ordinal: 0, verdict: "VALID", l5ContentHash: HASH_ORIGINAL });
    const newCorrection = rec({ ordinal: 1, verdict: "VALID-WITH-CORRECTION", l5ContentHash: HASH_CORRECTED, correction: { description: "another fix", correctedContentHash: "c".repeat(64) } });
    const state = promotionStateFor([oldValid, newCorrection], "lem-1", HASH_CORRECTED);
    expect(state.status).toBe("not-promotable");
  });
});

describe("promotionQuery — batch form over a whole snapshot", () => {
  test("returns an explicit entry for every key in currentHashes, never a partial map", () => {
    const records = [rec({ itemId: "a", verdict: "VALID" })];
    const currentHashes = new Map([["a", HASH_ORIGINAL], ["never-dispatched", HASH_ORIGINAL]]);
    const result = promotionQuery(records, currentHashes);
    expect(result.size).toBe(2);
    expect(result.get("a")).toEqual({ status: "promotable", record: records[0] });
    expect(result.get("never-dispatched")).toEqual({ status: "not-promotable", reason: "no-verdict" });
  });
});

// ---------------------------------------------------------------------------------------
// rk-0ehr / P1 — a live retraction overrides any fresh VALID (ratified plan
// docs/memos/2026-08-03-rk-improvement-plan-from-aism.md §P1, semantics (a)).
// ---------------------------------------------------------------------------------------

const RETRACTION = {
  schemaVersion: "1" as const,
  ordinal: 0,
  itemId: "lem-1",
  contentHash: HASH_ORIGINAL,
  hashDomain: "l5-shard-bytes" as const,
  retractedBy: "audit:2026-07-28-independent-sweep",
  reason: "independent sweep found the step-3 approximation unjustified",
};

describe("promotionStateFor — retraction overrides the verdict", () => {
  test("a fresh VALID verdict + a live retraction is NOT promotable", () => {
    expect(promotionStateFor([rec()], "lem-1", HASH_ORIGINAL)).toEqual({ status: "promotable", record: rec() });
    const withRetraction = promotionStateFor([rec()], "lem-1", HASH_ORIGINAL, RETRACTION);
    expect(withRetraction.status).toBe("not-promotable");
    if (withRetraction.status !== "not-promotable") throw new Error("unreachable");
    expect(withRetraction.reason).toBe("retracted");
    expect(withRetraction.retraction).toEqual(RETRACTION);
  });

  test("`retracted` outranks every other not-promotable reason (it is the strongest signal)", () => {
    const stale = promotionStateFor([rec({ l5ContentHash: HASH_CORRECTED })], "lem-1", HASH_ORIGINAL, RETRACTION);
    expect(stale.status === "not-promotable" && stale.reason).toBe("retracted");
    const none = promotionStateFor([], "lem-1", HASH_ORIGINAL, RETRACTION);
    expect(none.status === "not-promotable" && none.reason).toBe("retracted");
  });

  test("no live retraction supplied -> the pre-existing answer is unchanged", () => {
    expect(promotionStateFor([rec()], "lem-1", HASH_ORIGINAL, undefined)).toEqual({ status: "promotable", record: rec() });
  });

  test("promotionQuery threads live retractions per item, keyed by the l5-shard-bytes domain", () => {
    const records = [rec({ itemId: "lem-1" }), rec({ ordinal: 1, itemId: "lem-2" })];
    const hashes = new Map([["lem-1", HASH_ORIGINAL], ["lem-2", HASH_ORIGINAL]]);
    const out = promotionQuery(records, hashes, [RETRACTION]);
    expect(out.get("lem-1")!.status).toBe("not-promotable");
    expect(out.get("lem-2")!.status).toBe("promotable");
  });

  test("an af-canonical retraction never demotes an L5 promotion (domains are never cross-compared)", () => {
    const afDomain = { ...RETRACTION, hashDomain: "af-canonical" as const };
    const out = promotionQuery([rec()], new Map([["lem-1", HASH_ORIGINAL]]), [afDomain]);
    expect(out.get("lem-1")!.status).toBe("promotable");
  });
});

describe("retractionOverridesVerdict — the rule as a callable statement", () => {
  test("always true, mirroring correctionRequiresReVerificationBeforePromotion", () => {
    expect(retractionOverridesVerdict("VALID")).toBe(true);
    expect(retractionOverridesVerdict("VALID-WITH-CORRECTION")).toBe(true);
    expect(retractionOverridesVerdict("INVALID")).toBe(true);
  });
});
