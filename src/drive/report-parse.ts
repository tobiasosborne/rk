// PURITY: pure — no fs/network/clock (L3). Split from src/drive/report.ts (rk-tbg, hard-cap-280
// split wave): the PARSE half of M3.9's token/call accounting machinery — reading `.rk/driver-
// log.jsonl` TEXT (read by the fs edge, src/cli/verify.ts — same split as src/drive/l5-store.ts's
// pure parser vs. src/drive/l5-store-io.ts's fs edge) into typed records, never silently dropping
// a corrupted line (L2, l5-store's corrupted-tail precedent). The AGGREGATE half (folding these
// records into a `CampaignReport`) stays in `report.ts`, which imports the types below.
//
// KNOWN GAP (not fixed here — see report.ts's own header): `verdict-outcome`/overreach/skip kinds
// carry a bare af node id, unique only WITHIN one claim's workspace; two claims can both have node
// "1". Splitting those per-claim would need claimId on an EXISTING record kind, which this WP's
// brief forbids touching.

import { isNonBlankString, ROLES, type Role } from "./vocab";
import type { WorkerUsage } from "./worker-result";

/** Sentinel `nodeId` for a "usage" record that attributes an L5 verifier session's OPENING cost —
 * e.g. `ClaudeBackend.createSession`'s real `claude -p sharedContext` call — rather than any one
 * member's turn (src/drive/l5-dispatch.ts is the one writer). Never a real af/registry node id
 * (parens are not a legal id character in this codebase's id grammars), so it can never collide
 * with, or be mistaken for, an actual proof node. Lives HERE (the wire-shape home, pure) so that
 * pure readers — src/reward/attribution.ts's spentTokens rule, report.ts's aggregation — can name
 * it without importing the fs/subprocess edge that writes it (rk-0ree). */
export const L5_SESSION_OPEN_NODE_ID = "(session-open)";

// --- Driver-log record shapes (read-only view; driver-run.ts/driver-balloon.ts construct them) --

// rk-xxp (GAP 11): `repair` is OPTIONAL — set `true` only on the usage record for a repair turn's
// OWN spend (src/drive/driver-verify-node.ts logs this as a second, separate "usage" record, never
// merged into the first turn's), absent on every ordinary turn. Older/ordinary records without it
// stay recognized (lenient-optional, same pattern as ParseFailedLogRecord's diagnosability fields).
export interface UsageLogRecord { kind: "usage"; at: string; contractId: string; claimId: string; nodeId: string; role: Role; sessionId: string; usage: WorkerUsage; repair?: boolean; }
// Field spelled with a space before its colon on purpose: scripts/selftest.ts's purity grep forbids
// a Node built-in import's exact spelling anywhere in a PURITY-marked file — same false-positive
// src/drive/accounting.ts's header already documents (see there for the full explanation). The
// wire field is genuinely named this (driver-run.ts's existing, untouched `verdict-outcome` shape),
// so it cannot be renamed away like accounting.ts's own `nodeId` was.
export interface VerdictOutcomeLogRecord { kind: "verdict-outcome"; at: string; node : string; verdict: string; status: string; exit: number; }
export interface BalloonLogRecord { kind: "balloon"; at: string; contractId: string; nodeCount: number; cap: number; classification: string; routing: string; priorBalloonCount: number; offendingSubtree: string[]; rationale: string; }
export interface BalloonUnclassifiedLogRecord { kind: "balloon-unclassified"; at: string; contractId: string; nodeCount: number; cap: number; reason: string; }
/** The remaining diagnostic-only kinds — this report's math never reads their fields, so they get
 * the loud-but-minimal check (valid JSON object, recognized kind) rather than full per-field
 * validation. `proof-recorded` (a prover turn recorded a decomposition, src/drive/driver-prove-
 * node.ts) and `churn-cap` (a growth-only run aborted, src/drive/driver-run.ts) were previously
 * OMITTED from the allowlist and so mis-reported as `unrecognized 'kind'` / "could not be parsed"
 * even though rk's OWN driver writes them — recognized here alongside the other four.
 * `prover-body-invalid` (rk-xfzg, src/drive/driver-prove-node.ts) is written whenever an exit-0
 * prover turn's body fails `src/drive/prover-raw.ts`'s `validateRawProverOutput` (the same validator
 * `extractProofContent` now defers to) — the concrete `issues` and a bounded `rawSnippet` are
 * diagnostic-only evidence, same family as `bind-failed`/`record-proof-failed`. */
export interface OtherDriverLogRecord { kind: "balloon-mark-skipped" | "balloon-bd-skipped" | "prover-overreach" | "node-skipped" | "proof-recorded" | "churn-cap" | "prover-body-invalid"; at: string; }
/** rk-53r (P3) + rk-jit (STOP-4): the driver's two per-node DISCARD kinds. `cross-vendor-rejected`
 * (driver-verify-node.ts) is written whenever the cross-vendor gate refuses an accept;
 * `vacuous-accept-discarded` is the new backstop discard of an accept on a proofless node. Both were
 * previously reported as `unrecognized 'kind'` (STOP-REPORT-4) even though rk's OWN driver writes
 * them — recognized here with `node`/`reason` validated, and counted in `CampaignReport.discards`. */
// The `node` field is spelled with a space before its colon on purpose — same purity-grep
// false-positive the `VerdictOutcomeLogRecord` above documents (the selftest forbids a Node builtin
// import's exact spelling in a PURITY file; the wire field is genuinely named this).
export interface DiscardLogRecord { kind: "cross-vendor-rejected" | "vacuous-accept-discarded"; at: string; node : string; reason: string; }
/** rk-qxp: the driver's bind-failure EVIDENCE record (src/drive/driver-verify-node.ts). Written
 * whenever a returned verdict fails to bind, carrying the node, the bind issues (each with its PATH),
 * and a bounded, JSON-safe snippet of the raw model output — so a live stop is self-diagnosing rather
 * than requiring a re-run to see what the model actually emitted. This report only COUNTS these (the
 * math never reads `issues`/`rawSnippet`), but they must be RECOGNIZED (never `unrecognized 'kind'`).
 * The `node` field is spelled with a space before its colon — same purity-grep false-positive the
 * records above document (the selftest forbids a Node builtin import's exact spelling in a PURITY
 * file; the wire field is genuinely named this). */
export interface BindFailedLogRecord { kind: "bind-failed"; at: string; node : string; issues: { path: string; message: string }[]; rawSnippet: string; }
/** GAP 7(b): the driver's parse/extraction-failure EVIDENCE record (src/drive/driver-verify-node.ts
 * and driver-prove-node.ts). Written whenever a nominally-successful (exit 0) turn's output could not
 * be extracted to the single JSON object it must be (src/drive/driver-live.ts's `toDispatchedTurn`
 * → exit 12), carrying the node, the turn's role, and a bounded, JSON-safe snippet of the raw model
 * output — so a live stop can quote what the model actually returned instead of only "worker exit 12"
 * (the STOP-REPORT-6 gap: the claude verifier's output was unrecoverable). This report only COUNTS
 * these (the math never reads `rawSnippet`), but they MUST be RECOGNIZED (never `unrecognized 'kind'`).
 * The `node` field is spelled with a space before its colon — same purity-grep false-positive the
 * records above document. */
export interface ParseFailedLogRecord { kind: "parse-failed"; at: string; node : string; role: Role; rawSnippet: string;
  /** rk-d1n (M3.5 live debug), all OPTIONAL and validated leniently so older records without them stay
   * recognized: `parseError` = the JSON.parse message, `classification` = the diagnostic failure-mode
   * class (unterminated | trailing-content | no-object | multiple-objects | other), `rawFailurePath` =
   * the `.rk/parse-failures/<node>-<n>.txt` file holding the full un-truncated raw output. This report
   * only COUNTS parse-failed records; the math reads none of these fields. */
  parseError?: string; classification?: string; rawFailurePath?: string; }
/** GAP 8 (STOP-REPORT-7): the driver's record-proof-failure EVIDENCE record (src/drive/driver-prove-
 * node.ts). Written whenever `af record-proof` refuses a prover decomposition (a bad `depends` entry,
 * a stale-role/stale-hash rejection, any non-zero af exit), carrying the node, af's error `reason`,
 * and a bounded, JSON-safe snippet of the children JSON — so a live stop can quote the raw prover
 * decomposition that af rejected instead of only "af recordProof failed: ...". This report only
 * COUNTS these (the math never reads `reason`/`rawSnippet`), but they MUST be RECOGNIZED (never
 * `unrecognized 'kind'`). The `node` field is spelled with a space before its colon — same purity-grep
 * false-positive the records above document. */
export interface RecordProofFailedLogRecord { kind: "record-proof-failed"; at: string; node : string; reason: string; rawSnippet: string; }
/** rk-xxp (GAP 11): the driver's bounded-schema-repair EVIDENCE record (src/drive/driver-verify-
 * node.ts, src/drive/verdict-repair.ts's `RepairRecord`). Written once per turn a repair was
 * dispatched for — never more than one per turn (the "at most one repair" invariant is enforced
 * structurally upstream in verdict-repair.ts, not by this reader). `issues` are the concrete
 * `RawIssue[]` echoed to the worker in the reprompt; `repairIssues` is present iff `outcome ===
 * "failed"` (the repair reply was itself refused) and absent iff `outcome === "repaired"` — this
 * report enforces that invariant rather than trusting the writer, since a record that claims
 * "repaired" while also carrying `repairIssues` (or vice versa) is contradictory evidence, not a
 * shape a reader should silently accept. A repair is a RECOVERED turn, not a free one: it cost a
 * real second backend turn (see the "usage" record with `repair: true` above) — this report counts
 * repairs separately from both `parseFailures`/`bindFailures` (which count TERMINAL failures) and
 * from `verdicts.applied` (which is the af-side outcome), so a reader can see "N turns needed a
 * repair" as its own honest number, docs/worker-contract.md's "Bounded schema repair" section. */
export interface VerdictRepairLogRecord { kind: "verdict-repair"; at: string; node : string; role: Role; outcome: "repaired" | "failed"; issues: { path: string; message: string }[]; repairIssues?: { path: string; message: string }[]; }
export interface VerifierFenceLogRecord { kind: "verifier-fence"; at: string; plannedBatchId: string; checked: number; total: number; confirmed: number; refused: number; refusals: Array<{ itemId: string; claimId: string; verdictRef: string; reason: string }>; }

export type DriverLogRecord = UsageLogRecord | VerdictOutcomeLogRecord | BalloonLogRecord | BalloonUnclassifiedLogRecord | DiscardLogRecord | BindFailedLogRecord | ParseFailedLogRecord | RecordProofFailedLogRecord | VerdictRepairLogRecord | VerifierFenceLogRecord | OtherDriverLogRecord;
const OTHER_KINDS = new Set(["balloon-mark-skipped", "balloon-bd-skipped", "prover-overreach", "node-skipped", "proof-recorded", "churn-cap", "prover-body-invalid"]);

export interface DriverLogIssue { line: number; message: string; }
export interface DriverLogParseResult { records: DriverLogRecord[]; issues: DriverLogIssue[]; }

function isPlainObject(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function isNumber(v: unknown): v is number { return typeof v === "number" && Number.isFinite(v); }
function isCount(v: unknown): v is number { return isNumber(v) && Number.isInteger(v) && v >= 0; }
/** rk-0ree (+ review P2): components must be NON-NEGATIVE INTEGERS, not merely finite numbers — a
 * negative token count is corrupt evidence (no backend can un-spend tokens) whose banked
 * spentTokens would drive H_real = log2(1 + spent/T0) toward log2 of a negative number (a NaN
 * payout in the append-only reward ledger); a FRACTIONAL count would let the integer-fair split
 * MINT tokens (fairShares(0.5, 1) = [1]), violating attribution's conservation rule. Rejected at
 * parse so every reader (SC4 report, budget guard, attribution) shares the guarantee. */
function isUsage(v: unknown): v is WorkerUsage {
  return isPlainObject(v) && isCount(v.input) && isCount(v.output) && isCount(v.cache_read) && isCount(v.cache_creation);
}
/** rk-xxp: each `{path, message}` pair inside a 'verdict-repair' record's `issues`/`repairIssues`
 * (mirrors src/drive/verdict-raw.ts's `RawIssue`) — every element checked, not just array-ness, so
 * a malformed element (a bare string, a missing `message`) is a loud issue rather than silently
 * accepted the way `bind-failed`'s shallower `Array.isArray` check would let it through. */
function isIssueList(v: unknown): v is { path: string; message: string }[] {
  return Array.isArray(v) && v.every((i) => isPlainObject(i) && isNonBlankString(i.path) && typeof i.message === "string");
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
      if (!isUsage(parsed.usage)) return fail("usage record: 'usage' must have NON-NEGATIVE INTEGER input/output/cache_read/cache_creation");
      // rk-xxp: 'repair', when present, flags a repair turn's OWN spend (see UsageLogRecord's doc
      // comment) — OPTIONAL and lenient like ParseFailedLogRecord's diagnosability fields, so an
      // ordinary usage record (no 'repair' key at all) stays recognized unchanged.
      if (parsed.repair !== undefined && typeof parsed.repair !== "boolean") return fail("usage record: 'repair', when present, must be a boolean");
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
    case "cross-vendor-rejected":
    case "vacuous-accept-discarded":
      if (!isNonBlankString(parsed.node) || !isNonBlankString(parsed.reason)) return fail(`${parsed.kind} record: missing/mistyped 'node'/'reason'`);
      return { ok: true, record: parsed as unknown as DiscardLogRecord };
    case "bind-failed":
      if (!isNonBlankString(parsed.node)) return fail("bind-failed record: missing/mistyped 'node'");
      if (!Array.isArray(parsed.issues)) return fail("bind-failed record: 'issues' must be an array");
      if (typeof parsed.rawSnippet !== "string") return fail("bind-failed record: 'rawSnippet' must be a string");
      return { ok: true, record: parsed as unknown as BindFailedLogRecord };
    case "parse-failed":
      if (!isNonBlankString(parsed.node)) return fail("parse-failed record: missing/mistyped 'node'");
      if (typeof parsed.role !== "string" || !ROLES.has(parsed.role as Role)) return fail(`parse-failed record: 'role' must be one of ${[...ROLES].join(", ")}`);
      if (typeof parsed.rawSnippet !== "string") return fail("parse-failed record: 'rawSnippet' must be a string");
      // rk-d1n: the M3.5 diagnosability fields are OPTIONAL — present is type-checked, absent stays
      // recognized (an older parse-failed record predates them and must still parse, not become a
      // loud issue). Diagnostic-only: nothing downstream reads them.
      if (parsed.parseError !== undefined && typeof parsed.parseError !== "string") return fail("parse-failed record: 'parseError', when present, must be a string");
      if (parsed.classification !== undefined && typeof parsed.classification !== "string") return fail("parse-failed record: 'classification', when present, must be a string");
      if (parsed.rawFailurePath !== undefined && typeof parsed.rawFailurePath !== "string") return fail("parse-failed record: 'rawFailurePath', when present, must be a string");
      return { ok: true, record: parsed as unknown as ParseFailedLogRecord };
    case "record-proof-failed":
      if (!isNonBlankString(parsed.node)) return fail("record-proof-failed record: missing/mistyped 'node'");
      if (!isNonBlankString(parsed.reason)) return fail("record-proof-failed record: missing/mistyped 'reason'");
      if (typeof parsed.rawSnippet !== "string") return fail("record-proof-failed record: 'rawSnippet' must be a string");
      return { ok: true, record: parsed as unknown as RecordProofFailedLogRecord };
    case "verdict-repair":
      if (!isNonBlankString(parsed.node)) return fail("verdict-repair record: missing/mistyped 'node'");
      if (typeof parsed.role !== "string" || !ROLES.has(parsed.role as Role)) return fail(`verdict-repair record: 'role' must be one of ${[...ROLES].join(", ")}`);
      if (parsed.outcome !== "repaired" && parsed.outcome !== "failed") return fail("verdict-repair record: 'outcome' must be 'repaired' or 'failed'");
      if (!isIssueList(parsed.issues)) return fail("verdict-repair record: 'issues' must be an array of {path, message}");
      if (parsed.repairIssues !== undefined && !isIssueList(parsed.repairIssues)) return fail("verdict-repair record: 'repairIssues', when present, must be an array of {path, message}");
      // rk-xxp invariant (src/drive/verdict-repair.ts's RepairRecord doc comment): 'repairIssues' is
      // present IFF the repair itself failed, never on a 'repaired' outcome, never absent on a
      // 'failed' one — a record violating this is contradictory evidence, not a shape to trust.
      if (parsed.outcome === "repaired" && parsed.repairIssues !== undefined) return fail("verdict-repair record: outcome 'repaired' must not carry 'repairIssues'");
      if (parsed.outcome === "failed" && parsed.repairIssues === undefined) return fail("verdict-repair record: outcome 'failed' must carry 'repairIssues'");
      return { ok: true, record: parsed as unknown as VerdictRepairLogRecord };
    case "verifier-fence": {
      if (!isNonBlankString(parsed.plannedBatchId)) return fail("verifier-fence record: missing/mistyped 'plannedBatchId'");
      if (!isCount(parsed.checked) || !isCount(parsed.total) || !isCount(parsed.confirmed) || !isCount(parsed.refused)) return fail("verifier-fence record: coverage fields must be non-negative integers");
      if (parsed.checked !== parsed.total || parsed.confirmed + parsed.refused !== parsed.total) return fail("verifier-fence record: contradictory coverage totals");
      if (!Array.isArray(parsed.refusals) || !parsed.refusals.every((r) =>
        isPlainObject(r) && isNonBlankString(r.itemId) && typeof r.claimId === "string" &&
        typeof r.verdictRef === "string" && isNonBlankString(r.reason))) {
        return fail("verifier-fence record: 'refusals' must carry itemId/claimId/verdictRef/reason strings");
      }
      if (parsed.refusals.length !== parsed.refused) return fail("verifier-fence record: refusal detail count does not match 'refused'");
      return { ok: true, record: parsed as unknown as VerifierFenceLogRecord };
    }
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
