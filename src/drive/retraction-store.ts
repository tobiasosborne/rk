// PURITY: pure — no fs/network/clock (L3). rk-0ehr / P1: the retraction ledger's QUERY core over
// an already-parsed record list. The append-only log itself lives at `.rk/retractions.jsonl`
// (src/drive/retraction-store-io.ts is the fs edge); this module never opens that file — every
// function takes `records: readonly RetractionRecord[]` as a plain argument. Structure mirrors
// src/drive/l5-store.ts one-for-one on purpose: same latest-by-ordinal discipline, same
// "computed at read time, never a stored flag" stance, same fail-closed health assessment.
//
// THE PROPERTY THAT MATTERS: a retraction is LIVE iff the item's CURRENT content hash equals the
// record's `contentHash` IN THE MATCHING `hashDomain`. Three consequences, all deliberate:
//   1. A retraction issued while the bytes are unchanged binds immediately — that is the whole
//      point (the AISM incident: an out-of-band demotion of an UNEDITED artifact, invisible to
//      every edit-triggered staleness check; see src/drive/retraction-record.ts's header).
//   2. Editing the artifact releases the binding. The hash changes, the record no longer matches,
//      and ordinary staleness semantics take over — every verdict bound to the OLD bytes is stale
//      too, so a fresh verification is needed regardless. Nothing is lost; nothing is resurrected.
//   3. The two pinned hash domains (schemas/verdict.v1.json: `l5ContentHash` raw shard bytes vs
//      `hardContentHash` af-canonical field concatenation) are NEVER compared to each other. A
//      caller passes the domain it can actually observe a current hash in, and only records in
//      THAT domain are considered. A same-valued hash in the wrong domain is not a match.
//
// LATEST-BY-ORDINAL AMONG LIVE RECORDS: `liveRetractionFor` picks the highest-ordinal record that
// BINDS (item + domain + hash all match), not the highest-ordinal record for the item overall.
// This differs from src/drive/l5-store.ts's `latestVerdictFor` (which takes the latest record
// unconditionally and then asks whether it is fresh) because the two ledgers answer different
// questions: a verdict is a claim that can be SUPERSEDED by a later verdict, so an older one must
// never be resurrected; a retraction is a standing demotion that persists until the artifact
// changes, so a later record bound to DIFFERENT bytes says nothing about the current ones.

import { parseRetractionRecordLine, type RetractionHashDomain, type RetractionRecord } from "./retraction-record";

/** THE shared lookup both the gate-level path (src/gates/linker-retraction.ts) and the graph-level
 * path (src/store/retraction-load.ts) call. One implementation means the two status
 * representations rk keeps deliberately separate — `Lemma` (gate parse-recovery shape) and
 * `RegistryNode` (graph projection shape), src/graph/types.ts:70-77 — cannot drift apart on what
 * "retracted" means. Returns the highest-ordinal record that BINDS to `currentHash` in `domain`,
 * or `undefined` when nothing binds (never retracted, or retracted-then-edited). */
export function liveRetractionFor(
  records: readonly RetractionRecord[],
  itemId: string,
  currentHash: string,
  domain: RetractionHashDomain,
): RetractionRecord | undefined {
  let live: RetractionRecord | undefined;
  for (const r of records) {
    if (r.itemId !== itemId) continue;
    if (r.hashDomain !== domain) continue; // never cross-compare domains
    if (r.contentHash !== currentHash) continue; // the artifact moved on: this record no longer binds
    if (live === undefined || r.ordinal > live.ordinal) live = r;
  }
  return live;
}

/** Batch form: for every item in `currentHashes` (item id -> its CURRENT hash in `domain`), the
 * live retraction, when there is one. Items with no live retraction are simply absent from the
 * returned map — never a placeholder entry, same convention as src/drive/l5-store.ts's
 * `freshVerdicts`. */
export function liveRetractionsByItem(
  records: readonly RetractionRecord[],
  currentHashes: ReadonlyMap<string, string>,
  domain: RetractionHashDomain,
): Map<string, RetractionRecord> {
  const out = new Map<string, RetractionRecord>();
  for (const [itemId, currentHash] of currentHashes) {
    const live = liveRetractionFor(records, itemId, currentHash, domain);
    if (live !== undefined) out.set(itemId, live);
  }
  return out;
}

/** Every distinct item id the ledger mentions, sorted — so a caller can report coverage ("checked
 * N/N") without already knowing the id list (mirrors src/drive/l5-store.ts's `knownShardIds`). */
export function retractedItemIds(records: readonly RetractionRecord[]): string[] {
  return [...new Set(records.map((r) => r.itemId))].sort();
}

export interface RetractionLogIssue {
  line: number;
  message: string;
}

export interface RetractionLogParseResult {
  records: RetractionRecord[];
  issues: RetractionLogIssue[];
}

/** The append-only ordinal chain's integrity, checked over the parsed records IN FILE ORDER — the
 * exact rule src/drive/l5-store.ts's `assessL5OrdinalChain` enforces for the verdict ledger, on
 * this ledger's own independent chain. A healthy file is written by a single writer assigning
 * `ordinal = 1 + max-on-disk` from 0, so record i carries ordinal i. A duplicate, an out-of-order
 * pair, a gap (a cleanly-deleted line leaves no parse issue behind), or a truncated prefix (first
 * ordinal != 0) is tamper or loss that a plain per-item query cannot see — and on THIS ledger,
 * silently losing a record means silently un-retracting a claim. Empty ⇒ chain intact. */
export function assessRetractionOrdinalChain(records: readonly RetractionRecord[]): string[] {
  const problems: string[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < records.length; i++) {
    const ord = records[i]!.ordinal;
    if (seen.has(ord)) problems.push(`duplicate ordinal ${ord} (two records claim the same append position)`);
    seen.add(ord);
    if (ord !== i) {
      problems.push(
        `ordinal ${ord} at file position ${i} breaks the contiguous append-only chain (a healthy single-writer log has record i carrying ordinal i; expected ${i}) — gap, reorder, duplicate, or truncated prefix`,
      );
    }
  }
  return problems;
}

export interface RetractionStoreHealth {
  healthy: boolean;
  /** Every reason the store is not trustworthy: line-attributed parse issues followed by
   * ordinal-chain problems. Empty iff `healthy`. */
  problems: string[];
}

/** Is the retraction ledger trustworthy enough to answer "is this item retracted"? Healthy iff
 * `parseRetractionLog` reported ZERO issues AND the ordinal chain is intact. A single corrupt line
 * poisons the WHOLE store: a truncated line's own `itemId` is unknowable, so it could name ANY
 * item — and reading "not retracted" for an item whose retraction is exactly the unreadable line
 * is the false-validity direction. Callers (Gate 2's retraction check; the writer's append guard)
 * fail closed on `!healthy`. */
export function retractionStoreHealthy(parsed: RetractionLogParseResult): RetractionStoreHealth {
  const problems = [
    ...parsed.issues.map((i) => `line ${i.line}: ${i.message}`),
    ...assessRetractionOrdinalChain(parsed.records),
  ];
  return { healthy: problems.length === 0, problems };
}

/** Splits raw `.rk/retractions.jsonl` TEXT (already read by the fs edge, or handed over by a gate's
 * snapshot) into records, one JSONL line at a time. A single trailing empty line — the normal
 * artifact of every appended line ending in `\n` — is a file-format convention, silently ignored.
 * ANY OTHER malformed line is skipped for `records` (so later good lines stay readable) but ALWAYS
 * reported in `issues` (L2: "a silent skip is a bug, full stop"). */
export function parseRetractionLog(text: string): RetractionLogParseResult {
  const records: RetractionRecord[] = [];
  const issues: RetractionLogIssue[] = [];
  if (text.length === 0) return { records, issues };

  const rawLines = text.split("\n");
  const lines = rawLines[rawLines.length - 1] === "" ? rawLines.slice(0, -1) : rawLines;

  lines.forEach((raw, i) => {
    const lineNumber = i + 1;
    if (raw.trim().length === 0) {
      issues.push({ line: lineNumber, message: "blank line in the middle of the log (not the file's own trailing newline) — never silently skipped" });
      return;
    }
    const result = parseRetractionRecordLine(raw, lineNumber);
    if (result.ok) records.push(result.record);
    else issues.push(result.issue);
  });

  return { records, issues };
}
