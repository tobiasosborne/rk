// PURITY: pure — no fs/network/clock (L3). M3.9: the token/call accounting REPORT machinery
// (IMPLEMENTATION_PLAN.md M3.9, PRD C9's closing paragraph — "The driver reports tokens/calls per
// validated node so success criterion 4 is measured, not estimated"). This is the INSTRUMENT, not
// the SC4 verdict — src/drive/report-baseline.ts (split out, M3 repair-wave blocker 8, to keep
// this file within CLAUDE.md's shard-size guidance) is what compares a `CampaignReport` built here
// against a real M3.5 baseline memo.
//
// This is the AGGREGATE half of M3.9's two jobs: folding parsed driver-log records (the record
// types + `parseDriverLog`/`parseDriverLogLine`, split out to `report-parse.ts`, rk-tbg hard-cap-
// 280 wave, and re-exported below unchanged so no import site needed editing) — specifically the
// `"usage"` records, the ONE new record kind this WP adds to the driver's log-writing edge,
// src/drive/driver-run.ts — into src/drive/accounting.ts's tested rollup, plus a PER-NODE COST
// ATTRIBUTION on top.
//
// ATTRIBUTION RULE: a turn's input/output/cache_read tokens are that turn's own node's cost, in
// full. `cache_creation` tokens are different — they pay to WRITE the shared prefix into the
// prompt cache, a cost that then benefits every later turn of the SAME session (`sessionId`), not
// just the turn that paid it. So `cache_creation` is pooled PER SESSION and split EVENLY
// (integer-fair: floor division, remainder to the first turns in log order — deterministic, no
// float rounding loss) across every turn dispatched in that session. A single-turn session
// degenerates to "attribute it all to that turn's node." This conserves the total exactly: summing
// every node's attributed cost equals the campaign grand total (the property test).
//
// KNOWN GAP (not fixed here — see final report): `verdict-outcome`/overreach/skip kinds carry a
// bare af node id, unique only WITHIN one claim's workspace; two claims can both have node "1".
// Splitting those per-claim would need claimId on an EXISTING record kind, which this WP's brief
// forbids touching. Verdict counts are therefore campaign-level only, honestly labeled. `balloon`
// records DO carry `contractId`, and a claim's contractId is established unambiguously by its own
// `usage` records, so balloon events ARE safely attributed per claim.

import { allKeys, cacheFraction, emptyAccountingState, grandTotal, recordTurn, totalsFor, type AccountingTotals } from "./accounting";
import type { DriverLogIssue, DriverLogRecord, UsageLogRecord } from "./report-parse";

export {
  parseDriverLog,
  parseDriverLogLine,
  type DriverLogIssue,
  type DriverLogParseResult,
  type DriverLogRecord,
  type UsageLogRecord,
  type VerdictOutcomeLogRecord,
  type BalloonLogRecord,
  type BalloonUnclassifiedLogRecord,
  type OtherDriverLogRecord,
  type DiscardLogRecord,
  type BindFailedLogRecord,
  type ParseFailedLogRecord,
  type RecordProofFailedLogRecord,
  type VerdictRepairLogRecord,
} from "./report-parse";

// --- Aggregation ---------------------------------------------------------------------------------

export interface VerdictCounts { total: number; applied: number; blocked: number; rejected: number; other: number; }
/** rk-53r (P3) + rk-jit (STOP-4): per-kind counts of the driver's own discard events, so `rk verify
 * --report` surfaces them (e.g. "the verifier accepted N proofless nodes that were discarded")
 * instead of dropping them as unrecognized noise. */
export interface DiscardCounts { crossVendorRejected: number; vacuousAcceptDiscarded: number; }
export interface BalloonCounts { total: number; unclassified: number; byClassification: Record<string, number>; }
export interface NodeReportRow { nodeId: string; claimId: string; totals: AccountingTotals; cacheFraction: number; attributedTokens: number; }
export interface ClaimReportRow { claimId: string; contractIds: string[]; nodeIds: string[]; totals: AccountingTotals; cacheFraction: number; attributedTokens: number; balloons: BalloonCounts; }
export interface CampaignReport {
  campaignId: string;
  measured: boolean; // false iff zero "usage" records found — never present a zeroed report as measured
  totals: AccountingTotals;
  cacheFraction: number;
  verdicts: VerdictCounts;
  balloons: BalloonCounts;
  discards: DiscardCounts;
  /** rk-qxp: count of 'bind-failed' evidence records — a returned verdict that failed to bind (e.g.
   * a challenge whose "target" was an unquotable number). A non-zero value on an otherwise
   * unmeasured campaign is the signature of a live stop where NO verdict ever landed. */
  bindFailures: number;
  /** GAP 7(b): count of 'parse-failed' evidence records — a nominally-successful turn whose output
   * could not be extracted to the single JSON object it must be (exit 12). Like `bindFailures`, a
   * non-zero value on an otherwise unmeasured campaign is the signature of a live stop where the
   * worker's output never bound; the raw snippet is in the driver-log for diagnosis. */
  parseFailures: number;
  /** GAP 8 (STOP-REPORT-7): count of 'record-proof-failed' evidence records — an `af record-proof`
   * that refused a prover decomposition (a bad `depends` entry, a stale-role/stale-hash rejection).
   * A non-zero value on an otherwise unmeasured campaign is the signature of a live stop where the
   * prover ran but no proof was ever recorded; the children snippet is in the driver-log for diagnosis. */
  recordProofFailures: number;
  /** rk-xxp (GAP 11): count of 'verdict-repair' records whose `outcome` is `"repaired"` — a turn
   * that failed raw-shape validation or single-object extraction on its first reply but was
   * recovered by the ONE bounded schema-repair reprompt (docs/worker-contract.md's "Bounded schema
   * repair" section). A repaired turn is NOT free: it cost a second real backend turn, logged as
   * its own `usage` record flagged `repair: true` and already folded into `totals`/`cacheFraction`
   * above — this counter exists so a reader can see how many turns needed the extra spend, distinct
   * from `verdicts.applied` (the af-side outcome) and from the terminal-failure counters below. */
  repairSucceeded: number;
  /** rk-xxp (GAP 11): count of 'verdict-repair' records whose `outcome` is `"failed"` — the repair
   * reprompt was dispatched (its tokens were spent) but its reply also failed raw-shape validation
   * or the process itself failed; the ORIGINAL failure representation is preserved verbatim
   * elsewhere (a parse-failed stays parse-failed, a bind-shape failure stays a bind failure), so
   * this counter does not double-count `parseFailures`/`bindFailures` — it is the "and the one
   * extra attempt we spent on it also didn't help" number. */
  repairFailures: number;
  nodeRows: NodeReportRow[];
  claimRows: ClaimReportRow[];
  parseIssues: DriverLogIssue[];
  /** M3 repair-wave blocker 8: a session is opened per (role, tier, claim) — docs/worker-
   * contract.md section (a) — so every "usage" record sharing one `sessionId` should also share
   * ONE `claimId`. A session whose records span more than one claimId means the cache_creation
   * pooling in `attributeTokens` below is mixing tokens across claims that should never have shared
   * a session; that pool's split is then not trustworthy. Never silently accepted: `compareToBaseline`
   * refuses SC4 comparison outright while this is non-empty (see there). */
  attributionIssues: string[];
}

const ZERO_TOTALS: AccountingTotals = { input: 0, output: 0, cache_read: 0, cache_creation: 0, turns: 0 };
function addTotals(a: AccountingTotals, b: AccountingTotals): AccountingTotals {
  return { input: a.input + b.input, output: a.output + b.output, cache_read: a.cache_read + b.cache_read, cache_creation: a.cache_creation + b.cache_creation, turns: a.turns + b.turns };
}

/** Integer-fair split of `total` across `n` shares: each gets `floor(total/n)`, and the first
 * `total % n` (caller's own order) get one extra — exact and deterministic, `sum(shares)===total`. */
function fairShares(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

function attributeTokens(usageRecords: readonly UsageLogRecord[]): Map<string, number> {
  const bySession = new Map<string, UsageLogRecord[]>();
  for (const r of usageRecords) bySession.set(r.sessionId, [...(bySession.get(r.sessionId) ?? []), r]);
  const perNode = new Map<string, number>(); // key: `${claimId} ${nodeId}`
  for (const turns of bySession.values()) {
    const shares = fairShares(turns.reduce((s, t) => s + t.usage.cache_creation, 0), turns.length);
    turns.forEach((t, i) => {
      const key = `${t.claimId} ${t.nodeId}`;
      perNode.set(key, (perNode.get(key) ?? 0) + t.usage.input + t.usage.output + t.usage.cache_read + shares[i]!);
    });
  }
  return perNode;
}

/** M3 repair-wave blocker 8: detects a session whose "usage" records were logged under more than
 * one `claimId` — a violation of the worker contract's "one session per (role, tier, claim)" rule
 * (docs/worker-contract.md section (a)) that would otherwise let `attributeTokens`'s per-session
 * cache_creation pool silently mix cost across unrelated claims. Returns one human-readable message
 * per offending session, sorted by sessionId for deterministic output — never a silent pass. */
function computeAttributionIssues(usageRecords: readonly UsageLogRecord[]): string[] {
  const bySession = new Map<string, Set<string>>();
  for (const r of usageRecords) {
    const claims = bySession.get(r.sessionId) ?? new Set<string>();
    claims.add(r.claimId);
    bySession.set(r.sessionId, claims);
  }
  const issues: string[] = [];
  for (const sessionId of [...bySession.keys()].sort()) {
    const claims = bySession.get(sessionId)!;
    if (claims.size > 1) {
      issues.push(`session '${sessionId}' has usage records under ${claims.size} different claimIds (${[...claims].sort().join(", ")}) — cache_creation pooling for this session is not attributable and its cost is excluded from SC4 comparison`);
    }
  }
  return issues;
}

function emptyVerdictCounts(): VerdictCounts { return { total: 0, applied: 0, blocked: 0, rejected: 0, other: 0 }; }
function classifyStatus(status: string, into: VerdictCounts): void {
  into.total++;
  if (status === "applied") into.applied++;
  else if (status.startsWith("blocked-by:")) into.blocked++;
  else if (status.startsWith("rejected:")) into.rejected++;
  else into.other++;
}
function emptyBalloonCounts(): BalloonCounts { return { total: 0, unclassified: 0, byClassification: {} }; }
function addBalloon(into: BalloonCounts, classification?: string): void {
  into.total++;
  if (classification === undefined) into.unclassified++;
  else into.byClassification[classification] = (into.byClassification[classification] ?? 0) + 1;
}

/** Folds parsed driver-log records into the full report. Pure: no I/O, no clock. `campaignId` is
 * caller-supplied (one driver-log.jsonl == one campaign, per-repo ground truth), never derived
 * here. `issues` (M3 repair-wave blocker 8, additive/optional so every pre-existing call site still
 * type-checks) is the caller's own `parseDriverLog(...).issues` — threaded through into the
 * returned report (previously hardcoded to `[]`, silently dropping every parse issue from the
 * report itself even though the CLI printed them separately) so `compareToBaseline` can refuse SC4
 * comparison when the log it is measuring against was not read cleanly. */
export function buildReport(records: readonly DriverLogRecord[], campaignId: string, issues: readonly DriverLogIssue[] = []): CampaignReport {
  const usageRecords = records.filter((r): r is UsageLogRecord => r.kind === "usage");
  let state = emptyAccountingState();
  for (const r of usageRecords) state = recordTurn(state, { nodeId: r.nodeId, claimId: r.claimId, campaignId }, r.usage);
  const attributed = attributeTokens(usageRecords);

  const verdicts = emptyVerdictCounts();
  for (const r of records) if (r.kind === "verdict-outcome") classifyStatus(r.status, verdicts);
  const balloons = emptyBalloonCounts();
  for (const r of records) {
    if (r.kind === "balloon") addBalloon(balloons, r.classification);
    else if (r.kind === "balloon-unclassified") addBalloon(balloons, undefined);
  }
  const discards: DiscardCounts = { crossVendorRejected: 0, vacuousAcceptDiscarded: 0 };
  let bindFailures = 0;
  let parseFailures = 0;
  let recordProofFailures = 0;
  let repairSucceeded = 0;
  let repairFailures = 0;
  for (const r of records) {
    if (r.kind === "cross-vendor-rejected") discards.crossVendorRejected++;
    else if (r.kind === "vacuous-accept-discarded") discards.vacuousAcceptDiscarded++;
    else if (r.kind === "bind-failed") bindFailures++;
    else if (r.kind === "parse-failed") parseFailures++;
    else if (r.kind === "record-proof-failed") recordProofFailures++;
    else if (r.kind === "verdict-repair") { if (r.outcome === "repaired") repairSucceeded++; else repairFailures++; }
  }

  const nodeRows: NodeReportRow[] = allKeys(state).map((k) => {
    const totals = totalsFor(state, k);
    return { nodeId: k.nodeId, claimId: k.claimId, totals, cacheFraction: cacheFraction(totals), attributedTokens: attributed.get(`${k.claimId} ${k.nodeId}`) ?? 0 };
  });

  const claimRows: ClaimReportRow[] = [...new Set(nodeRows.map((n) => n.claimId))].map((claimId) => {
    const rows = nodeRows.filter((n) => n.claimId === claimId);
    const contractIds = [...new Set(usageRecords.filter((u) => u.claimId === claimId).map((u) => u.contractId))];
    const totals = rows.reduce((acc, r) => addTotals(acc, r.totals), ZERO_TOTALS);
    const attributedTokens = rows.reduce((s, r) => s + r.attributedTokens, 0);
    const claimBalloons = emptyBalloonCounts();
    for (const r of records) {
      if ((r.kind === "balloon" || r.kind === "balloon-unclassified") && contractIds.includes(r.contractId)) addBalloon(claimBalloons, r.kind === "balloon" ? r.classification : undefined);
    }
    return { claimId, contractIds, nodeIds: rows.map((r) => r.nodeId), totals, cacheFraction: cacheFraction(totals), attributedTokens, balloons: claimBalloons };
  });

  const grand = grandTotal(state);
  const attributionIssues = computeAttributionIssues(usageRecords);
  return { campaignId, measured: usageRecords.length > 0, totals: grand, cacheFraction: cacheFraction(grand), verdicts, balloons, discards, bindFailures, parseFailures, recordProofFailures, repairSucceeded, repairFailures, nodeRows, claimRows, parseIssues: [...issues], attributionIssues };
}
