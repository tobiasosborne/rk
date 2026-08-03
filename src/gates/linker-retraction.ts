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
//
// THE UNCONDITIONAL VETO (`checkRetractionVeto`, LB3 of the 2026-08-03 M3-close review). Check 16's
// enforcement used to exist ONLY inside the two specialized consumers, and both were reachable only
// through a precondition of their own: Check 14 early-returns on an absent `.rk/l5-verdicts.jsonl`
// BEFORE it ever reads `liveL5`, and it consults `liveL5` only inside the `stated` /
// `proved-mod-audit` status branches; Check 8 fires only when the shard's own `af` reads
// `validated`. Net: a live `l5-shard-bytes` retraction on a `proved` shard in a repo that has never
// dispatched an L5 review produced ZERO gate findings (fixture `linker-45`) while
// src/graph/validate-conflicts.ts's `retraction-vs-status` vetoed the same tree unconditionally —
// `rk check` exit 0, `rk render` defect, same repo.
//
// `checkRetractionVeto` closes that by mirroring the graph rule's own three reasons verbatim
// (src/graph/validate-conflicts.ts:118-133): (1) TRUTHFULNESS — a veto that depends on a status
// list silently stops working the day the list drifts; (2) the withdrawal is a FACT about the item,
// not a disagreement between two status vocabularies; (3) it makes enforcement a pure function of
// the ledger, so no other store's presence can suppress it. So: EVERY shard carrying a live
// retraction in EITHER domain gets an ERROR, whatever its declared status, whether or not
// `.rk/l5-verdicts.jsonl` exists.
//
// ONE STORY, NOT THREE. The two specialized findings are NOT replaced — they add semantics this
// veto deliberately does not carry (Check 8: the shard leaves the available set and every dependent
// cascades; Check 14: an already-granted promotion can no longer be confirmed). The wording is
// adjudicated so a reader sees one story: this veto STATES THE WITHDRAWAL (`retraction veto:` …,
// naming domain/ordinal/issuer/reason and the shard's own declared status/af), and each specialized
// finding names itself as that withdrawal's propagation or promotion CONSEQUENCE. None of the three
// contradicts another, and the remedy sentence is the same in all of them: demote, or edit the
// artifact and re-verify.

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

/** Check 16's own coverage accounting (the rk-lkeh S/J discipline, applied to retraction). A bare
 * live-count on the coverage line READS as enforcement without being it — exactly the shape LB3
 * found. `live` and `driven` are therefore rendered as a pair: a reader can always see how many of
 * the live retractions actually produced a veto ERROR rather than inferring it. Under
 * `checkRetractionVeto` the two are equal by construction on a healthy store, and that is the
 * point — the day an edit reintroduces a conditional, `driven < live` is visible on the coverage
 * line of every run instead of being silent. */
export interface RetractionVetoReport {
  findings: Finding[];
  /** Live retraction records bound to a registry shard, summed over BOTH domains (a shard can
   * carry one in each; they are never merged, since the two domains are never cross-compared). */
  live: number;
  /** Of `live`, how many DROVE a Check 16 veto ERROR. */
  driven: number;
}

/** The domains, in the fixed order findings are emitted in — deterministic output, never a Map
 * iteration order leaking into a gate's finding list. */
const VETO_DOMAINS = [
  { domain: "l5-shard-bytes", view: (f: RetractionFacts) => f.liveL5 },
  { domain: "af-canonical", view: (f: RetractionFacts) => f.liveAf },
] as const;

/** Check 16's UNCONDITIONAL enforcement (LB3) — see this file's header for the full rationale and
 * for why the two specialized findings (Check 8 propagation, Check 14 promotion) stay alongside it
 * rather than being replaced by it.
 *
 * One ERROR per (shard, live retraction), naming the domain, ordinal, issuer, reason, and the
 * shard's OWN declared `status`/`af` — so the finding is legible without cross-referencing the
 * ledger, and so a reader can see exactly which claim the withdrawal contradicts. Independent of
 * `.rk/l5-verdicts.jsonl` (this function never reads it) and independent of the status vocabulary
 * (no status is enumerated anywhere below). A corrupt store yields ZERO live retractions by
 * construction (`readRetractionFacts` empties both maps), so this check contributes nothing there
 * and `retractionStoreFindings` carries the fail-closed ERRORs instead — never both descriptions of
 * the same fault. */
export function checkRetractionVeto(lemmas: readonly Lemma[], facts: RetractionFacts): RetractionVetoReport {
  const findings: Finding[] = [];
  let live = 0;
  for (const l of lemmas) {
    for (const { domain, view } of VETO_DOMAINS) {
      const r = view(facts).get(l.id);
      if (r === undefined) continue;
      live++;
      findings.push({
        severity: "ERROR",
        path: l.path,
        message:
          `retraction veto: '${l.id}' carries a LIVE retraction (${domain}, ordinal ${r.ordinal}) ` +
          `issued by ${r.retractedBy}: ${r.reason} — the registry still declares status: ` +
          // "unset" rather than "" — an absent status is a real, distinct state, never folded into
          // a real one and never rendered as an empty string (the stance src/render/styling.ts's
          // `UNSET_STYLE` and src/graph/validate-conflicts.ts's `registryValue` already take).
          `${l.status ?? "unset"}, af: ${l.af}. A retraction withdraws the CLAIM ITSELF, so no ` +
          `declared status can stand over it: demote the shard, or edit the artifact and re-verify ` +
          `(an edit releases the hash binding). This veto is unconditional — it never depends on ` +
          `the shard's status vocabulary and never on any other store being present`,
      });
    }
  }
  // Every live retraction on a registry shard drives a veto: `driven === live` by construction
  // here, reported rather than assumed so the coverage pair stays honest if this loop ever grows a
  // branch (see `RetractionVetoReport`).
  return { findings, live, driven: findings.length };
}

/** The store's own health findings: one fail-closed ERROR per problem, attributed to the ledger
 * file. Kept separate from `readRetractionFacts` so the facts can be computed once and consumed by
 * several checks while the ERRORs are emitted exactly once (src/gates/linker.ts's wiring). */
export function retractionStoreFindings(facts: RetractionFacts): Finding[] {
  if (facts.healthy) return [];
  return facts.problems.map((p) => ({
    severity: "ERROR" as const,
    path: RETRACTION_STORE_PATH,
    // LB5 (2026-08-03 M3-close review, reviewer ruling): a ledger/parse-integrity fault on THIS
    // store is STRUCTURAL — the same class as a linker/defs/refs parse fault, per the Phase matrix's
    // own "parse errors" bullet. Without it, `rk check` printed OK on a corrupt retraction ledger in
    // exploration phase while `rk render` refused the same tree, and the stamped pre-commit hook
    // runs the permissive surface. Note the split this flag draws: an UNREADABLE ledger blocks in
    // both phases; what a READABLE ledger MEANS for a status (`checkRetractionVeto`) stays
    // consolidation-weight non-structural.
    structural: true,
    message:
      `retraction store integrity compromised — retraction status is unknowable, fail closed: ${p}` +
      ` (a corrupt line's own itemId cannot be read, so no item can be confirmed un-retracted)`,
  }));
}
