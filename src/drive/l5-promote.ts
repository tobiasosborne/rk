// PURITY: pure — no fs/network/clock (L3). M3.7's THIRD deliverable: the promotion query shaped
// for the linker's `stated` -> `proved-mod-audit` check (PRD C9: "queried by the linker for
// stated->proved-mod-audit promotion and by the freshness gate"). DESIGN + API ONLY — wiring this
// into Gate 2 (src/gates/**) is EXPLICITLY M3.8's job, not this WP's (src/gates/** is read-only
// here per this WP's brief). This module exists so M3.8 has exactly one function to call and
// exactly one rule to trust, instead of re-deriving the (g) transition rule from prose.
//
// ============================================================================================
// DESIGN NOTE FOR THE M3.8 IMPLEMENTER — read this before wiring Gate 2
// ============================================================================================
// Call `promotionStateFor` (or `promotionQuery` for a whole snapshot) with the shard's CURRENT
// content hash (the same `l5ContentHash` domain, docs/worker-contract.md section (f): raw
// shard-file bytes, no normalization — reuse whatever hash Gate 2 already has from its own
// snapshot read; never recompute a second, possibly-differently-normalized hash for this call).
//
// The ONLY status that means "promote": `{status:"promotable"}`. Every other status means "do not
// promote this shard on L5 grounds this run" — Gate 2 must NOT try to be cleverer than the status
// it gets back. In particular:
//
// - `{status:"correction-pending"}` fires when the LATEST record for the shard is
//   `VALID-WITH-CORRECTION` and its bound hash STILL matches the shard's current bytes — i.e. the
//   verifier's flagged correction has not yet been applied to the file (or was applied and
//   reverted). This is the one case the contract's rule (g) forces to be checked EXPLICITLY,
//   because the ordinary hash-binding freshness check alone would call this record "fresh" (its
//   bound hash equals current bytes) — technically true, but "fresh" is not "promotable": nothing
//   has independently re-verified corrected bytes yet, so promoting here would be exactly the
//   false-freshness failure blocker 6 exists to prevent. `promotionStateFor` withholds it FOR YOU
//   — do not add a second check for this case in Gate 2; if you find yourself writing
//   `if (verdict === "VALID-WITH-CORRECTION") { ... }` in the linker, that logic belongs here
//   instead, not duplicated there.
// - `{status:"not-promotable", reason:"stale"}` fires once the shard is edited: the latest
//   record's bound hash no longer matches current bytes. This comes FOR FREE from the ordinary
//   staleness check (src/drive/l5-store.ts's `latestVerdictFor`) — no rule (g)-specific code is
//   needed for it. Concretely: once a researcher edits the file to actually match a
//   VALID-WITH-CORRECTION verdict's suggested fix, that OLD record goes stale automatically (its
//   hash no longer matches), and there is NO promotable record until a FRESH dispatch re-verifies
//   the new bytes and appends a plain `VALID` (or a further `VALID-WITH-CORRECTION`) record ahead
//   of it by ordinal. Gate 2 never needs to reach for `correctedContentHash` itself to detect this
///  — it is not this function's job to look ahead for a "did the fix land" record; that is what
//   re-running L5 dispatch and re-querying produces.
// - `{status:"not-promotable", reason:"invalid"}` / `"no-verdict"` are exactly what they say — an
//   `INVALID` latest verdict, or no record for the shard at all. Never treat "no record" as
//   "promotable by default" — silence is not consent (PRD C5's "never silently dropped" ethos).
//
// WHAT M3.8 MUST NEVER INFER: this module's `record` field on a non-promotable status is provided
// for DIAGNOSTIC/reporting purposes only (e.g. "last verdict was INVALID, justification: ...") —
// it is never a second source of truth to override `status`. Gate 2's own promotion decision must
// be `status === "promotable"`, nothing computed from the record's own fields directly.
// ============================================================================================

import { latestVerdictFor } from "./l5-store";
import { correctionRequiresReVerificationBeforePromotion } from "./bind-verdicts";
import type { L5StoredVerdict } from "./l5-record";

export type PromotionStatus =
  | { status: "promotable"; record: L5StoredVerdict }
  | { status: "not-promotable"; reason: "stale" | "invalid" | "correction-pending" | "no-verdict"; record?: L5StoredVerdict };

/** The promotion decision for one shard: `records` is the full parsed log (unfiltered — this
 * function does its own latest-by-ordinal lookup via `latestVerdictFor`), `currentHash` is the
 * shard's CURRENT `l5ContentHash`-domain hash. See this file's header design note for what each
 * non-promotable `reason` means and what it must never be used to infer. */
export function promotionStateFor(records: readonly L5StoredVerdict[], shardId: string, currentHash: string): PromotionStatus {
  const latest = latestVerdictFor(records, shardId, currentHash);
  if (latest === undefined) return { status: "not-promotable", reason: "no-verdict" };
  if (!latest.fresh) return { status: "not-promotable", reason: "stale", record: latest.record };
  if (latest.verdict === "INVALID") return { status: "not-promotable", reason: "invalid", record: latest.record };
  if (latest.verdict === "VALID-WITH-CORRECTION") {
    // Rule (g), made mechanical: a fresh VALID-WITH-CORRECTION verdict NEVER promotes on the
    // strength of the bytes the verifier flagged — `correctionRequiresReVerificationBeforePromotion`
    // (src/drive/bind-verdicts.ts) always returns `true`; calling it here (rather than inlining
    // `true`) keeps this decision traceable to the ONE callable statement of the rule, so a future
    // reader searching for "who enforces blocker 6" finds exactly one call site, not two
    // independently-written copies of the same fact.
    if (correctionRequiresReVerificationBeforePromotion(latest.record.correction!)) {
      return { status: "not-promotable", reason: "correction-pending", record: latest.record };
    }
  }
  return { status: "promotable", record: latest.record };
}

/** Batch form over a whole snapshot: `currentHashes` maps every shard id Gate 2 is considering to
 * its current hash. Returns a status for every key in `currentHashes` — never a partial map (a
 * shard with no record at all still gets an explicit `no-verdict` entry, not an absent key), so a
 * caller can report coverage the same way src/drive/l5-store.ts's `coverage` does. */
export function promotionQuery(records: readonly L5StoredVerdict[], currentHashes: ReadonlyMap<string, string>): Map<string, PromotionStatus> {
  const out = new Map<string, PromotionStatus>();
  for (const [shardId, currentHash] of currentHashes) out.set(shardId, promotionStateFor(records, shardId, currentHash));
  return out;
}
