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
/** The remaining diagnostic-only kinds — this report's math never reads their fields, so they get
 * the loud-but-minimal check (valid JSON object, recognized kind) rather than full per-field
 * validation. `proof-recorded` (a prover turn recorded a decomposition, src/drive/driver-prove-
 * node.ts) and `churn-cap` (a growth-only run aborted, src/drive/driver-run.ts) were previously
 * OMITTED from the allowlist and so mis-reported as `unrecognized 'kind'` / "could not be parsed"
 * even though rk's OWN driver writes them — recognized here alongside the other four. */
export interface OtherDriverLogRecord { kind: "balloon-mark-skipped" | "balloon-bd-skipped" | "prover-overreach" | "node-skipped" | "proof-recorded" | "churn-cap"; at: string; }
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

export type DriverLogRecord = UsageLogRecord | VerdictOutcomeLogRecord | BalloonLogRecord | BalloonUnclassifiedLogRecord | DiscardLogRecord | BindFailedLogRecord | ParseFailedLogRecord | RecordProofFailedLogRecord | OtherDriverLogRecord;
const OTHER_KINDS = new Set(["balloon-mark-skipped", "balloon-bd-skipped", "prover-overreach", "node-skipped", "proof-recorded", "churn-cap"]);

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
