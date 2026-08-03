// EDGE — fs (via src/drive/retraction-store-io.ts, which owns the actual file handle). Reads the
// campaign's `.rk/retractions.jsonl` ledger for the GRAPH pipeline (src/store/build-graph.ts ->
// src/graph/assemble.ts), mirroring src/store/af-load.ts and src/store/fr-load.ts: a store reader
// whose whole job is turning one on-disk source into the plain records the pure projection layer
// consumes (`RetractionSourceRecord`, src/graph/from-retraction.ts).
//
// THIS IS THE ONLY LAYER THAT RESOLVES LIVENESS, and it is here for the same reason
// `FrEdge.verdictFresh` is resolved by src/store/fr-load.ts: deciding whether a retraction still
// binds requires HASHING THE CURRENT ARTIFACT, which a pure module (L3) cannot do. The pure layer
// receives `live` as data and never second-guesses it.
//
// THE TWO DOMAINS (schemas/retraction.v1.json's `hashDomain`; verdict.v1's "the two must never be
// compared to each other"):
//   - `l5-shard-bytes` — a REAL comparison. `currentHashes` maps registry id -> the shard file's
//     current raw-bytes sha256 (`SnapshotFacts.sha256`, the exact domain `l5ContentHash` pins).
//     Equal ⇒ live; different ⇒ released by an edit, and `currentHashObserved: true` records that
//     the release was OBSERVED rather than assumed.
//   - `af-canonical` — NOT observable today. `af export --graph json` carries no node content hash
//     through src/store/af-load.ts's reader, so there is nothing to compare. This module FAILS
//     CLOSED (`live: true`) and sets `currentHashObserved: false` so every downstream surface can
//     say "retracted; edit-release not verifiable here" instead of implying a hash match that
//     never happened. Reversing that default would mean silently un-retracting a claim on the
//     strength of data rk does not have — the exact AISM failure P1 exists to close.
// The same fail-closed rule applies in the l5 domain when no current hash is available for an item
// at all (a retraction naming an id the registry does not carry, or an unreadable shard).
//
// FAIL CLOSED ON CORRUPTION: an unhealthy ledger (any parse issue or a broken ordinal chain,
// src/drive/retraction-store.ts's `retractionStoreHealthy`) yields ZERO records plus `problems` —
// never a partially-trusted read. src/store/build-graph.ts folds `problems` into its structural-loss
// diagnostics, so a corrupt ledger cannot produce a smaller-but-still-exit-0 graph.

import { existsSync } from "node:fs";
import { readRetractionStore, retractionStorePath } from "../drive/retraction-store-io";
import { retractionStoreHealthy } from "../drive/retraction-store";
import type { RetractionSourceRecord } from "../graph/from-retraction";

export interface RetractionSource {
  /** False iff `.rk/retractions.jsonl` is entirely absent — a legitimate state (nothing has ever
   * been retracted), distinct from "present and empty". */
  present: boolean;
  /** False iff the ledger is corrupt; `records` is then empty and `problems` non-empty. */
  healthy: boolean;
  problems: string[];
  records: RetractionSourceRecord[];
}

export function loadRetractionSource(root: string, currentHashes: ReadonlyMap<string, string>): RetractionSource {
  const parsed = readRetractionStore(root);
  const present = parsed.records.length > 0 || parsed.issues.length > 0 || retractionLedgerExists(root);
  const health = retractionStoreHealthy(parsed);
  if (!health.healthy) {
    return { present: true, healthy: false, problems: health.problems, records: [] };
  }

  const records: RetractionSourceRecord[] = parsed.records.map((r) => {
    const observedHash = r.hashDomain === "l5-shard-bytes" ? currentHashes.get(r.itemId) : undefined;
    const currentHashObserved = observedHash !== undefined;
    return {
      itemId: r.itemId,
      ordinal: r.ordinal,
      contentHash: r.contentHash,
      hashDomain: r.hashDomain,
      retractedBy: r.retractedBy,
      reason: r.reason,
      // Fail closed: unobserved ⇒ the retraction stands. See this file's header.
      live: currentHashObserved ? observedHash === r.contentHash : true,
      currentHashObserved,
    };
  });

  return { present, healthy: true, problems: [], records };
}

/** `readRetractionStore` returns the same `{records: [], issues: []}` for "no file" and "empty
 * file", but those are DIFFERENT states a consumer must not conflate (the same distinction
 * src/store/fr-load.ts draws between absent and authoritatively-empty), so presence is checked
 * directly against the path the drive edge owns. */
function retractionLedgerExists(root: string): boolean {
  return existsSync(retractionStorePath(root));
}
