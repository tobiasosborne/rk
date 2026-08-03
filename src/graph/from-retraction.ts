// PURITY: pure — no fs/network/clock (L3). registry↔retraction join (rk-0ehr / P1, graph
// `schema_version: "2"`): builds `RetractionEdge[]` + the retraction portion of the `unresolved`
// bucket from a `RegistryNode[]` and the raw `RetractionSourceRecord[]` src/store/retraction-load.ts
// collected off `.rk/retractions.jsonl`. Keys on `itemId` == registry `id`, exact string match —
// the same join key bd uses (PRD C5: "registry id IS the key"), and the only edge whose source
// ledger rk itself writes, so there is no foreign-vocabulary hazard to negotiate here.
//
// EVERY record becomes an edge, resolved or not — the fr precedent (an `UnresolvedFrEdge` stays
// fully visible in `edges.fr`), not the bd one (which emits no edge at all when nothing matches).
// A retraction naming an id no registry shard carries is a real, reportable fact about the ledger:
// it may be a typo, or a shard that was deleted while its withdrawal still stands. Either way it
// gets an edge AND a companion `unresolved` bucket entry — never a silent drop (L2, PRD C5).
//
// LIVENESS IS NOT COMPUTED HERE. `live`/`currentHashObserved` are resolved by the impure reader
// (which is the only layer that can hash a file), exactly as `FrEdge.verdictFresh` is — this pure
// converter copies them through unmodified and never second-guesses them.

import type { RegistryNode, RetractionEdge, RetractionHashDomain, UnresolvedOtherRef } from "./types";

/** One parsed `.rk/retractions.jsonl` record plus the liveness the reader resolved for it. Mirrors
 * src/drive/retraction-record.ts's `RetractionRecord` field-for-field (minus `schemaVersion` and
 * the non-identity `appendedAt`, neither of which the projection carries) and adds the two
 * reader-resolved booleans. */
export interface RetractionSourceRecord {
  itemId: string;
  ordinal: number;
  contentHash: string;
  hashDomain: RetractionHashDomain;
  retractedBy: string;
  reason: string;
  /** Does the retraction still bind to the item's current hash in its domain? (Fail-closed `true`
   * when the current hash could not be observed — see `currentHashObserved`.) */
  live: boolean;
  currentHashObserved: boolean;
}

export interface RetractionJoin {
  edges: RetractionEdge[];
  unresolved: UnresolvedOtherRef[];
}

export function buildRetractionEdges(
  nodes: readonly RegistryNode[],
  records: readonly RetractionSourceRecord[],
): RetractionJoin {
  const ids = new Set(nodes.map((n) => n.id));
  const edges: RetractionEdge[] = [];
  const unresolved: UnresolvedOtherRef[] = [];

  for (const r of records) {
    const resolved = ids.has(r.itemId);
    edges.push({
      nodeId: r.itemId,
      ordinal: r.ordinal,
      contentHash: r.contentHash,
      hashDomain: r.hashDomain,
      retractedBy: r.retractedBy,
      reason: r.reason,
      resolved,
      live: r.live,
      currentHashObserved: r.currentHashObserved,
    });
    if (!resolved) {
      unresolved.push({
        edge: "retraction",
        ref: r.itemId,
        reason: `retraction record (ordinal ${r.ordinal}) names itemId '${r.itemId}', which is not a registry node`,
      });
    }
  }

  return { edges, unresolved };
}
