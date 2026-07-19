// PURITY: pure — no fs/network/clock (L3). M3.7: the L5 verdict store's QUERY core over an
// already-parsed record list — "L5 soft tier (default)... the L5 verdict store is a first-class
// deliverable" (PRD C9). The append-only log itself lives at `.rk/l5-verdicts.jsonl`
// (src/drive/l5-store-io.ts is the fs edge that reads/appends it); this module never opens that
// file — every function here takes `records: readonly L5StoredVerdict[]` as a plain argument.
//
// THE PROPERTY THAT MATTERS (module brief, restated as code): a verdict is FRESH iff the CURRENT
// shard-file bytes hash to the l5ContentHash it was recorded against. There is no tombstone, no
// update-in-place, no "mark stale" event — staleness is COMPUTED at read time from a hash
// comparison the caller supplies (`currentHash`), never stored as a flag anywhere in the log. An
// edit to the shard file changes its bytes, which changes its hash, which makes every EXISTING
// record for that shard compare unequal to the new `currentHash` — staleness falls out of the
// hash-binding for free, exactly as docs/worker-contract.md section (f) intends.
//
// LATEST-BY-ORDINAL, ACROSS ALL HASHES THE SHARD HAS EVER HAD: `latestVerdictFor` picks the
// highest-`ordinal` record for `shardId` REGARDLESS of which hash it was bound to, then checks
// THAT record's freshness against `currentHash`. This deliberately does not fall back to an older
// record whose hash happens to still match (e.g. a shard reverted to prior bytes) — a superseded
// verdict is superseded, full stop; PRD C9's monotone-trust discipline ("only external oracles
// promote; self-report only downgrades") is about promotion direction, not about resurrecting an
// old record because a later edit happened to be a revert.

import { parseL5StoredVerdictLine, type L5StoredVerdict } from "./l5-record";
import type { L5Verdict } from "./vocab";

/** The read-time answer for one shard: the LATEST (by ordinal) record on file for it, and whether
 * that record's bound hash still matches `currentHash`. `undefined` means no record exists for
 * this shard at all (never dispatched, or every record for it was itself corrupted and dropped by
 * `parseL5Log` — either way, "absent," not "stale"). */
export interface LatestVerdict {
  verdict: L5Verdict;
  fresh: boolean;
  record: L5StoredVerdict;
}

/** Finds the highest-ordinal record for `shardId` among `records` and reports its freshness
 * against `currentHash`. `records` need not be sorted or pre-filtered by the caller — every
 * function in this module scans the full list itself, so a caller can pass the raw parsed log
 * unchanged. Two records for the same shard: the higher `ordinal` always wins, unconditionally. */
export function latestVerdictFor(records: readonly L5StoredVerdict[], shardId: string, currentHash: string): LatestVerdict | undefined {
  let latest: L5StoredVerdict | undefined;
  for (const r of records) {
    if (r.itemId !== shardId) continue;
    if (latest === undefined || r.ordinal > latest.ordinal) latest = r;
  }
  if (latest === undefined) return undefined;
  return { verdict: latest.verdict, fresh: latest.l5ContentHash === currentHash, record: latest };
}

/** The set of every distinct `itemId` `records` mentions, so a caller can enumerate shards without
 * already knowing the full id list (mirrors src/drive/accounting.ts's `allKeys` convention). */
export function knownShardIds(records: readonly L5StoredVerdict[]): string[] {
  return [...new Set(records.map((r) => r.itemId))].sort();
}

/** The promotion-relevant VIEW: for every shard named in `currentHashes` that has a FRESH latest
 * verdict, the verdict + record; shards with no record, or whose latest record is stale, are
 * simply absent from the returned map (never a placeholder entry). This is deliberately NOT the
 * promotion decision itself (src/drive/l5-promote.ts layers the contract's rule (g)
 * VALID-WITH-CORRECTION exclusion on top) — this function answers "what is fresh," nothing about
 * what a fresh verdict is allowed to promote. */
export function freshVerdicts(records: readonly L5StoredVerdict[], currentHashes: ReadonlyMap<string, string>): Map<string, LatestVerdict> {
  const out = new Map<string, LatestVerdict>();
  for (const [shardId, currentHash] of currentHashes) {
    const latest = latestVerdictFor(records, shardId, currentHash);
    if (latest !== undefined && latest.fresh) out.set(shardId, latest);
  }
  return out;
}

export interface CoverageReport {
  totalShards: number;
  fresh: number;
  stale: number;
  missing: number;
  staleShardIds: string[];
  missingShardIds: string[];
}

/** Coverage/staleness reporting shape for `rk check`'s freshness gate and any future `rk verify`
 * summary — never a silent skip (CLAUDE.md L2): every shard in `shardIds` is classified into
 * exactly one of fresh/stale/missing, and the totals always sum to `shardIds.length`. */
export function coverage(records: readonly L5StoredVerdict[], shardIds: readonly string[], currentHashes: ReadonlyMap<string, string>): CoverageReport {
  let fresh = 0;
  const staleShardIds: string[] = [];
  const missingShardIds: string[] = [];
  for (const shardId of shardIds) {
    const currentHash = currentHashes.get(shardId);
    const latest = currentHash === undefined ? undefined : latestVerdictFor(records, shardId, currentHash);
    if (latest === undefined) {
      missingShardIds.push(shardId);
    } else if (latest.fresh) {
      fresh++;
    } else {
      staleShardIds.push(shardId);
    }
  }
  return {
    totalShards: shardIds.length,
    fresh,
    stale: staleShardIds.length,
    missing: missingShardIds.length,
    staleShardIds,
    missingShardIds,
  };
}

export interface L5LogIssue {
  line: number;
  message: string;
}

export interface L5LogParseResult {
  records: L5StoredVerdict[];
  issues: L5LogIssue[];
}

/** Splits raw `.rk/l5-verdicts.jsonl` TEXT (already read by the fs edge, src/drive/l5-store-io.ts)
 * into records, one JSONL line at a time, via src/drive/l5-record.ts's `parseL5StoredVerdictLine`.
 * A single trailing empty line (the normal artifact of every appended line ending in `\n`) is
 * silently ignored — that is a file-format convention, not data loss. ANY OTHER malformed line —
 * garbage JSON, a truncated/short final write from a crash mid-append, a shape violation — is
 * NEVER silently dropped: it is skipped for the purposes of `records` (so later, well-formed lines
 * remain readable) but ALWAYS reported in `issues` (CLAUDE.md L2 — "a silent skip is a bug, full
 * stop"). A caller (the fs edge, a future `rk verify`/`rk check` surface) decides how loudly to
 * surface `issues`; this pure function's job ends at never losing them. */
export function parseL5Log(text: string): L5LogParseResult {
  const records: L5StoredVerdict[] = [];
  const issues: L5LogIssue[] = [];
  if (text.length === 0) return { records, issues };

  const rawLines = text.split("\n");
  // A well-formed file ends in "\n", so split produces one trailing "" element — drop exactly
  // that one artifact, never a non-empty short/corrupted final line.
  const lines = rawLines[rawLines.length - 1] === "" ? rawLines.slice(0, -1) : rawLines;

  lines.forEach((raw, i) => {
    const lineNumber = i + 1;
    if (raw.trim().length === 0) {
      issues.push({ line: lineNumber, message: "blank line in the middle of the log (not the file's own trailing newline) — never silently skipped" });
      return;
    }
    const result = parseL5StoredVerdictLine(raw, lineNumber);
    if (result.ok) records.push(result.record);
    else issues.push(result.issue);
  });

  return { records, issues };
}
