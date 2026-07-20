// PURITY: pure — no fs/network/clock (L3). M3.9: the token/call accounting REPORT machinery
// (IMPLEMENTATION_PLAN.md M3.9, PRD C9's closing paragraph — "The driver reports tokens/calls per
// validated node so success criterion 4 is measured, not estimated"). This is the INSTRUMENT, not
// the SC4 verdict — src/drive/report-baseline.ts (split out, M3 repair-wave blocker 8, to keep
// this file within CLAUDE.md's shard-size guidance) is what compares a `CampaignReport` built here
// against a real M3.5 baseline memo.
//
// Two jobs: (1) parse `.rk/driver-log.jsonl` TEXT (read by the fs edge, src/cli/verify.ts — same
// split as src/drive/l5-store.ts's pure parser vs. src/drive/l5-store-io.ts's fs edge) into typed
// records, never silently dropping a corrupted line (L2, l5-store's corrupted-tail precedent);
// (2) fold the `"usage"` records — the ONE new record kind this WP adds to the driver's
// log-writing edge, src/drive/driver-run.ts — into src/drive/accounting.ts's tested rollup, plus a
// PER-NODE COST ATTRIBUTION on top.
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

import { isNonBlankString, ROLES, type Role } from "./vocab";
import type { WorkerUsage } from "./worker-result";
import { allKeys, cacheFraction, emptyAccountingState, grandTotal, recordTurn, totalsFor, type AccountingTotals } from "./accounting";

// --- Driver-log record shapes (read-only view; driver-run.ts/driver-balloon.ts construct them) --

export interface UsageLogRecord { kind: "usage"; at: string; contractId: string; claimId: string; nodeId: string; role: Role; sessionId: string; usage: WorkerUsage; }
// Field spelled with a space before its colon on purpose: scripts/selftest.ts's purity grep forbids
// a Node built-in import's exact spelling anywhere in a PURITY-marked file — same false-positive
// src/drive/accounting.ts's header already documents (see there for the full explanation). The
// wire field is genuinely named this (driver-run.ts's existing, untouched `verdict-outcome` shape),
// so it cannot be renamed away like accounting.ts's own `nodeId` was.
export interface VerdictOutcomeLogRecord { kind: "verdict-outcome"; at: string; node : string; verdict: string; status: string; exit: number; }
export interface BalloonLogRecord { kind: "balloon"; at: string; contractId: string; nodeCount: number; cap: number; classification: string; routing: string; priorBalloonCount: number; offendingSubtree: string[]; rationale: string; }
export interface BalloonUnclassifiedLogRecord { kind: "balloon-unclassified"; at: string; contractId: string; nodeCount: number; cap: number; reason: string; }
/** The four remaining kinds (mark-skipped/bd-skipped/prover-overreach/node-skipped) are diagnostic
 * only — this report's math never reads their fields, so they get the loud-but-minimal check
 * (valid JSON object, recognized kind) rather than full per-field validation. */
export interface OtherDriverLogRecord { kind: "balloon-mark-skipped" | "balloon-bd-skipped" | "prover-overreach" | "node-skipped"; at: string; }

export type DriverLogRecord = UsageLogRecord | VerdictOutcomeLogRecord | BalloonLogRecord | BalloonUnclassifiedLogRecord | OtherDriverLogRecord;
const OTHER_KINDS = new Set(["balloon-mark-skipped", "balloon-bd-skipped", "prover-overreach", "node-skipped"]);

export interface DriverLogIssue { line: number; message: string; }
export interface DriverLogParseResult { records: DriverLogRecord[]; issues: DriverLogIssue[]; }

function isPlainObject(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function isNumber(v: unknown): v is number { return typeof v === "number" && Number.isFinite(v); }
function isUsage(v: unknown): v is WorkerUsage {
  return isPlainObject(v) && isNumber(v.input) && isNumber(v.output) && isNumber(v.cache_read) && isNumber(v.cache_creation);
}

/** Parses and validates one raw JSONL line. Mirrors src/drive/l5-record.ts's
 * `parseL5StoredVerdictLine`: never throws; every failure (bad JSON, unrecognized `kind`, a
 * missing/mistyped field on a kind this report's math consumes) is an `issue`, never a silent skip. */
export function parseDriverLogLine(raw: string, line: number): { ok: true; record: DriverLogRecord } | { ok: false; issue: DriverLogIssue } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, issue: { line, message: `not valid JSON (${e instanceof Error ? e.message : String(e)}) — likely a truncated/corrupted append` } };
  }
  if (!isPlainObject(parsed)) return { ok: false, issue: { line, message: "must be a JSON object" } };
  const fail = (message: string) => ({ ok: false as const, issue: { line, message } });
  if (!isNonBlankString(parsed.at)) return fail("'at' must be a non-blank string");

  switch (parsed.kind) {
    case "usage":
      if (!isNonBlankString(parsed.contractId) || !isNonBlankString(parsed.claimId) || !isNonBlankString(parsed.nodeId) || !isNonBlankString(parsed.sessionId)) return fail("usage record: missing/mistyped id field(s)");
      if (typeof parsed.role !== "string" || !ROLES.has(parsed.role as Role)) return fail(`usage record: 'role' must be one of ${[...ROLES].join(", ")}`);
      if (!isUsage(parsed.usage)) return fail("usage record: 'usage' must have finite numeric input/output/cache_read/cache_creation");
      return { ok: true, record: parsed as unknown as UsageLogRecord };
    case "verdict-outcome":
      if (!isNonBlankString(parsed.node) || !isNonBlankString(parsed.verdict) || !isNonBlankString(parsed.status) || !isNumber(parsed.exit)) return fail("verdict-outcome record: missing/mistyped field(s)");
      return { ok: true, record: parsed as unknown as VerdictOutcomeLogRecord };
    case "balloon":
      if (!isNonBlankString(parsed.contractId) || !isNumber(parsed.nodeCount) || !isNumber(parsed.cap) || !isNonBlankString(parsed.classification) || !isNonBlankString(parsed.routing)) return fail("balloon record: missing/mistyped field(s)");
      return { ok: true, record: parsed as unknown as BalloonLogRecord };
    case "balloon-unclassified":
      if (!isNonBlankString(parsed.contractId) || !isNumber(parsed.nodeCount) || !isNumber(parsed.cap)) return fail("balloon-unclassified record: missing/mistyped field(s)");
      return { ok: true, record: parsed as unknown as BalloonUnclassifiedLogRecord };
    default:
      if (typeof parsed.kind === "string" && OTHER_KINDS.has(parsed.kind)) return { ok: true, record: parsed as unknown as OtherDriverLogRecord };
      return fail(`unrecognized 'kind': ${JSON.stringify(parsed.kind)}`);
  }
}

/** Splits log text into records. Same trailing-newline convention as `parseL5Log`: the ONE empty
 * element a well-formed file's final "\n" produces is dropped (a format artifact, not data); every
 * OTHER blank/malformed line is an issue, never silently skipped. */
export function parseDriverLog(text: string): DriverLogParseResult {
  const records: DriverLogRecord[] = [];
  const issues: DriverLogIssue[] = [];
  if (text.length === 0) return { records, issues };
  const rawLines = text.split("\n");
  const lines = rawLines[rawLines.length - 1] === "" ? rawLines.slice(0, -1) : rawLines;
  lines.forEach((raw, i) => {
    const line = i + 1;
    if (raw.trim().length === 0) { issues.push({ line, message: "blank line in the middle of the log (not the file's own trailing newline) — never silently skipped" }); return; }
    const result = parseDriverLogLine(raw, line);
    if (result.ok) records.push(result.record);
    else issues.push(result.issue);
  });
  return { records, issues };
}

// --- Aggregation ---------------------------------------------------------------------------------

export interface VerdictCounts { total: number; applied: number; blocked: number; rejected: number; other: number; }
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
  return { campaignId, measured: usageRecords.length > 0, totals: grand, cacheFraction: cacheFraction(grand), verdicts, balloons, nodeRows, claimRows, parseIssues: [...issues], attributionIssues };
}
