// PURITY: pure — no fs/network/clock (L3). M3.9's SC4 baseline-comparison half, split out of
// src/drive/report.ts (M3 repair-wave blocker 8: report.ts crossed the ~200-line shard guidance
// once this WP's fixes landed — CLAUDE.md's "~200-line source shards, hard cap 280" — and this
// half is already a self-contained job: match a `.rk`-external baseline memo against a
// `CampaignReport` already built by report.ts's `buildReport`). `compareToBaseline` never
// fabricates a denominator until a real M3.5 baseline memo exists (`undefined`/empty baseline ->
// `available: false`), and (M3 repair-wave blocker 8) also refuses to compare at all when the
// report it would compare against carries unresolved parse or attribution errors — a favorable
// ratio computed over damaged input is worse than an honest "not yet measurable."
//
// M3 repair-wave blocker 8 (docs/reviews/2026-07-19-m3-milestone-review-codex.md): the ORIGINAL
// memo shape keyed an entry by bare `lemma` alone, joined against `CampaignReport.nodeRows` by bare
// `nodeId` — but nodeIds are unique only WITHIN one claim/workspace (report.ts's own "distinct
// (nodeId, claimId) pairs" rule for nodeRows, exercised by report.test.ts's property test), so a
// multi-claim campaign's baseline could silently match the WRONG claim's node. `claimId` is now a
// required field on every entry, and the join key is `(claimId, nodeId)`, never bare `nodeId`. This
// is a memo SHAPE change (CLAUDE.md rule 10: schema changes bump a version field and get a
// fixture) — the top-level shape is now `{schemaVersion, entries}`, not a bare array, so an old
// pre-fix memo is REJECTED outright rather than silently mis-parsed with a missing claimId.

import { isNonBlankString } from "./vocab";
import type { CampaignReport } from "./report";

export const BASELINE_MEMO_SCHEMA_VERSION = 2;

export interface BaselineEntry { claimId: string; lemma: string; tokens: number; calls: number; }
export type BaselineMemo = BaselineEntry[];
export interface BaselineMemoFile { schemaVersion: number; entries: BaselineEntry[]; }

function isPlainObject(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function isNonNegativeInteger(v: unknown): v is number { return typeof v === "number" && Number.isInteger(v) && v >= 0; }

/** `.rk`-external memo shape M3.5 produces: `{schemaVersion: 2, entries: [{claimId, lemma, tokens,
 * calls}, ...]}`, one entry per already-validated node re-measured from a fresh workspace under
 * the CURRENT (pre-batching/caching) protocol — the SC4 denominator. `claimId` must match the
 * `claimId` the SAME campaign's driver log recorded that node's usage under (src/drive/report.ts's
 * `UsageLogRecord.claimId`) — never a registry lemma id standing in for it. `tokens`/`calls` must be
 * non-negative INTEGERS (a negative or fractional cost/call count is never a real measurement,
 * M3 blocker 8's explicit finding) and every `(claimId, lemma)` pair must be unique (a duplicate
 * entry is ambiguous — which value is the real measurement? — so the whole memo is rejected, never
 * silently resolved by picking one). */
export function parseBaselineMemo(text: string): { ok: true; baseline: BaselineMemo } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: `baseline file is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!isPlainObject(parsed)) return { ok: false, reason: `baseline file must be a JSON object {schemaVersion: ${BASELINE_MEMO_SCHEMA_VERSION}, entries: [{claimId, lemma, tokens, calls}, ...]} — a bare array is the unsupported pre-fix shape` };
  if (parsed.schemaVersion !== BASELINE_MEMO_SCHEMA_VERSION) return { ok: false, reason: `baseline file 'schemaVersion' must be ${BASELINE_MEMO_SCHEMA_VERSION}, got ${JSON.stringify(parsed.schemaVersion)}` };
  if (!Array.isArray(parsed.entries)) return { ok: false, reason: "baseline file 'entries' must be a JSON array of {claimId, lemma, tokens, calls}" };

  const baseline: BaselineMemo = [];
  const seen = new Set<string>();
  for (const [i, entry] of parsed.entries.entries()) {
    if (!isPlainObject(entry) || !isNonBlankString(entry.claimId) || !isNonBlankString(entry.lemma) || !isNonNegativeInteger(entry.tokens) || !isNonNegativeInteger(entry.calls)) {
      return { ok: false, reason: `baseline entry ${i} must be {claimId: string, lemma: string, tokens: non-negative integer, calls: non-negative integer}` };
    }
    const key = `${entry.claimId} ${entry.lemma}`;
    if (seen.has(key)) return { ok: false, reason: `baseline entry ${i} is a duplicate (claimId, lemma) pair: ('${entry.claimId}', '${entry.lemma}') already appeared earlier in this memo` };
    seen.add(key);
    baseline.push({ claimId: entry.claimId, lemma: entry.lemma, tokens: entry.tokens, calls: entry.calls });
  }
  return { ok: true, baseline };
}

export interface BaselineComparisonRow { claimId: string; lemma: string; baselineTokens: number; baselineCalls: number; currentTokens: number; currentCalls: number; ratio?: number; }
export interface BaselineComparison { available: boolean; rows: BaselineComparisonRow[]; caveat: string; }

export const NO_BASELINE_CAVEAT = "no baseline recorded — SC4 not yet measurable";
export const SC4_CAVEAT = "SC4 (IMPLEMENTATION_PLAN.md M3.9): >=3x improvement over the M3.5 baseline, or an honest miss with analysis.";
export const PARSE_OR_ATTRIBUTION_CAVEAT = "SC4 comparison unavailable — the driver log has unresolved parse and/or attribution errors (see the issues printed above); fix them and re-run before trusting any SC4 ratio.";

/** Matches baseline entries to this campaign's node rows by `(claimId, lemma===nodeId)` — never
 * bare `nodeId` (M3 blocker 8: a bare-nodeId join can silently match the wrong claim). Never
 * fabricates a denominator: a lemma with zero measured current tokens gets `ratio: undefined`,
 * never `Infinity` or a silently-substituted value. Refuses to compare at all — `available: false`,
 * zero rows — when the report itself carries unresolved parse issues (`parseIssues`) or session/
 * claim attribution issues (`attributionIssues`): a favorable-looking ratio computed over
 * incomplete or misattributed input is worse than no ratio (M3 blocker 8's core finding). */
export function compareToBaseline(report: CampaignReport, baseline?: BaselineMemo): BaselineComparison {
  if (baseline === undefined || baseline.length === 0) return { available: false, rows: [], caveat: NO_BASELINE_CAVEAT };
  if (report.parseIssues.length > 0 || report.attributionIssues.length > 0) return { available: false, rows: [], caveat: PARSE_OR_ATTRIBUTION_CAVEAT };
  const rows = baseline.map((b) => {
    const node = report.nodeRows.find((n) => n.claimId === b.claimId && n.nodeId === b.lemma);
    const currentTokens = node?.attributedTokens ?? 0;
    const currentCalls = node?.totals.turns ?? 0;
    return { claimId: b.claimId, lemma: b.lemma, baselineTokens: b.tokens, baselineCalls: b.calls, currentTokens, currentCalls, ratio: currentTokens > 0 ? b.tokens / currentTokens : undefined };
  });
  return { available: true, rows, caveat: SC4_CAVEAT };
}
