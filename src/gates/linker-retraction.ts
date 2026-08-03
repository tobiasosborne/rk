// PURITY: pure — no fs/network/clock (L3). Gate 2's retraction facts (rk-0ehr / P1, ratified plan
// docs/memos/2026-08-03-rk-improvement-plan-from-aism.md §P1): the presence-conditional read of
// `.rk/retractions.jsonl` off the snapshot's already-loaded text map, resolved into the TWO
// per-domain live-retraction views Gate 2's other checks consume. Same mechanism
// src/gates/linker-l5.ts uses for `.rk/l5-verdicts.jsonl` and src/gates/freshness.ts for
// `.rk/generated.json` (`.rk` is included one level deep by src/store/snapshot-load.ts), so this
// module stays pure — no second fs read.
//
// A campaign where nothing has ever been retracted has no such file. That is a legitimate state,
// never an ERROR — but it is named on Gate 2's coverage line rather than silently skipped (L2).
//
// WHY TWO VIEWS, AND WHY THEY NEVER MIX. schemas/retraction.v1.json pins each record to exactly
// one of verdict.v1's two hash domains, which must never be compared to each other:
//   - `liveL5`  (domain `l5-shard-bytes`): the retraction's `contentHash` is compared against the
//     shard file's CURRENT raw-bytes sha256, straight off `SnapshotFacts.sha256` — the same domain
//     `l5ContentHash` is pinned to (docs/worker-contract.md section (f)). This is a real, observed
//     hash comparison: edit the shard and the retraction stops binding, exactly as designed.
//     Consumed by Check 14 (L5 promotion, src/gates/linker-l5.ts).
//   - `liveAf`  (domain `af-canonical`): ../vibefeld's own `Node.ComputeContentHash()` value. rk
//     CANNOT presently observe an item's current af-canonical hash — `af export --graph json` does
//     not carry a node content hash through src/store/af-load.ts's reader — so there is no hash to
//     compare against. This module FAILS CLOSED: an af-canonical retraction is treated as live
//     until rk learns to read that hash. A standing demotion outliving an unobservable edit is the
//     safe direction; the alternative (assuming the artifact changed) would silently un-retract a
//     claim, which is the exact AISM failure mode P1 exists to close. The limitation is documented
//     in schemas/retraction.v1.json's `hashDomain` prose and surfaced on the graph edge as
//     `currentHashObserved: false`, never presented as a confirmed match. Consumed by Check 8
//     (status propagation, src/gates/linker-graph.ts's `isAvailable`).
//
// FAIL CLOSED ON CORRUPTION. A single unparseable line or a broken ordinal chain poisons the WHOLE
// store (src/drive/retraction-store.ts's `retractionStoreHealthy`): a truncated line's own
// `itemId` is unknowable, so reading "not retracted" for the very item whose retraction is that
// unreadable line is the false-validity direction. An unhealthy store yields ZERO live retractions
// AND an ERROR per problem — never a quietly-degraded "nothing retracted" answer.

import type { Finding } from "./framework";
import type { Lemma } from "./linker-parse";
import { fileSha256, type RepoSnapshot } from "./snapshot";
import type { RetractionRecord } from "../drive/retraction-record";
import { liveRetractionFor, parseRetractionLog, retractionStoreHealthy } from "../drive/retraction-store";

export const RETRACTION_STORE_PATH = ".rk/retractions.jsonl";

export interface RetractionFacts {
  /** False iff `.rk/retractions.jsonl` is entirely absent — presence-conditional, never an ERROR
   * on its own. */
  present: boolean;
  /** False iff the ledger has any parse issue or a broken ordinal chain. When false, BOTH live
   * maps are empty and `problems` is non-empty: the store is poisoned, not partially trusted. */
  healthy: boolean;
  problems: string[];
  /** Every well-formed record, in file order (empty when `!healthy`). */
  records: RetractionRecord[];
  /** Live retractions in the `l5-shard-bytes` domain, by registry id — a real hash comparison
   * against the shard's current raw bytes. */
  liveL5: Map<string, RetractionRecord>;
  /** Live retractions in the `af-canonical` domain, by registry id — fail-closed (see header). */
  liveAf: Map<string, RetractionRecord>;
  /** Retraction records naming an id no registry shard carries. Never silently dropped (L2);
   * sorted, deduplicated, surfaced on Gate 2's coverage line. */
  unmatchedItemIds: string[];
}

const ABSENT: RetractionFacts = {
  present: false, healthy: true, problems: [], records: [], liveL5: new Map(), liveAf: new Map(), unmatchedItemIds: [],
};

/** Reads and resolves the ledger against the registry's current state. Pure: `snapshot` already
 * carries both the ledger text and every shard's raw-bytes sha256. */
export function readRetractionFacts(snapshot: RepoSnapshot, lemmas: readonly Lemma[]): RetractionFacts {
  const text = snapshot.get(RETRACTION_STORE_PATH);
  if (text === undefined) return { ...ABSENT, liveL5: new Map(), liveAf: new Map() };

  const parsed = parseRetractionLog(text);
  const health = retractionStoreHealthy(parsed);
  if (!health.healthy) {
    return {
      present: true, healthy: false, problems: health.problems, records: [],
      liveL5: new Map(), liveAf: new Map(), unmatchedItemIds: [],
    };
  }

  const records = parsed.records;
  const liveL5 = new Map<string, RetractionRecord>();
  const liveAf = new Map<string, RetractionRecord>();
  const knownIds = new Set<string>();

  for (const l of lemmas) {
    knownIds.add(l.id);
    const currentHash = fileSha256(snapshot, l.path);
    if (currentHash !== undefined) {
      const l5 = liveRetractionFor(records, l.id, currentHash, "l5-shard-bytes");
      if (l5 !== undefined) liveL5.set(l.id, l5);
    }
    // af-canonical: no observable current hash (see header) — every record for this item in that
    // domain binds, highest ordinal wins.
    let af: RetractionRecord | undefined;
    for (const r of records) {
      if (r.itemId !== l.id || r.hashDomain !== "af-canonical") continue;
      if (af === undefined || r.ordinal > af.ordinal) af = r;
    }
    if (af !== undefined) liveAf.set(l.id, af);
  }

  const unmatchedItemIds = [...new Set(records.map((r) => r.itemId).filter((id) => !knownIds.has(id)))].sort();
  return { present: true, healthy: true, problems: [], records, liveL5, liveAf, unmatchedItemIds };
}

/** The store's own health findings: one fail-closed ERROR per problem, attributed to the ledger
 * file. Kept separate from `readRetractionFacts` so the facts can be computed once and consumed by
 * several checks while the ERRORs are emitted exactly once (src/gates/linker.ts's wiring). */
export function retractionStoreFindings(facts: RetractionFacts): Finding[] {
  if (facts.healthy) return [];
  return facts.problems.map((p) => ({
    severity: "ERROR" as const,
    path: RETRACTION_STORE_PATH,
    message:
      `retraction store integrity compromised — retraction status is unknowable, fail closed: ${p}` +
      ` (a corrupt line's own itemId cannot be read, so no item can be confirmed un-retracted)`,
  }));
}
