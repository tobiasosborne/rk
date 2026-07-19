// EDGE — subprocess (`fr export`) + fs (direct `.frontier/log.jsonl` fallback). Reads fr's state
// for the registry↔fr join (PRD C5). Primary path: invoke the real `fr export` (F7,
// ../knowledge-frontier/docs/export-v1.md) — it hands back fr's OWN `derive.ts`-computed view
// (supersession, dead-route keying, verdict freshness) rather than making rk reimplement any of
// it, exactly as F7's "fr stays presentation-free" stance intends. Absence is a DISTINCT, LOUD
// state (`fr export` exits non-zero and prints nothing to stdout on a missing/corrupt
// `.frontier/` — the doc's own "Hazards for the M2.2 reader" section says so explicitly), never
// silently treated as an empty portfolio.
//
// Fallback path (fr binary unavailable — `Bun.spawnSync` throws): a direct, REDUCED-FIDELITY read
// of `.frontier/log.jsonl` (one JSON object per line, oldest first, per export-v1.md's own `log`
// section). This reconstructs `evidence.artifact`/`graduated_to` targets for the join but does
// NOT recompute verdict freshness (`fr export`'s `verdicts[].fresh` is a live hash-bound
// recomputation this reader will not reimplement) — `verdictFresh` stays `undefined` in the
// fallback, which src/graph/validate-conflicts.ts's `banked-without-oracle` check already treats
// as the conservative (never-false-green) direction. `degraded: true` on the result flags this
// for the caller to surface.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FrSourceRecord } from "../graph/from-fr";

interface FrEvidence {
  artifact: string | null;
  verdict?: string;
}
interface FrLogRecord {
  cycle: number;
  outcome: string;
  evidence?: FrEvidence | null;
  supersedes?: number | null;
  graduated_to?: string;
}
interface FrVerdict {
  claim: string;
  fresh: boolean;
  ts?: string;
}
interface FrExportDoc {
  schema_version?: string;
  log?: FrLogRecord[];
  verdicts?: FrVerdict[];
}

export interface FrSource {
  present: true;
  degraded: boolean;
  /** RAW nonblank row count — every nonblank line on the ledger-fallback path (regardless of
   * whether it parsed), or the export doc's own `log` array length on the primary path.
   * M2-boundary-review blocker 9: this MUST count every candidate row, not just the ones that
   * parsed, or a corrupted banked record vanishes from accounting entirely. */
  totalLogRecords: number;
  records: FrSourceRecord[];
  /** Nonblank rows that failed `JSON.parse` on the ledger-fallback path — always `[]` on the
   * primary `fr export` path (a whole-document parse failure there is a total `error`/absence,
   * not a per-line concern). `totalLogRecords === records.length + malformedLines.length +
   * (rows naming no resolvable reference at all)` — a malformed row is a STRUCTURAL reader
   * diagnostic, carried here so a caller (src/store/build-graph.ts's `diagnostics.structuralLoss`)
   * can surface it rather than silently treating a degraded-but-corrupt source as authoritative. */
  malformedLines: { lineNo: number; snippet: string }[];
}
export interface FrAbsent {
  present: false;
  reason: string;
}

/** The latest recorded verdict (array order — verdicts[] is fr's own append-order audit trail)
 * whose `claim` EXACT-STRING-matches `artifact` — no fuzzy match, per the doc's own hazard. */
function latestVerdictFor(artifact: string, verdicts: readonly FrVerdict[]): FrVerdict | undefined {
  let hit: FrVerdict | undefined;
  for (const v of verdicts) if (v.claim === artifact) hit = v;
  return hit;
}

function recordsFromLog(log: readonly FrLogRecord[], verdicts: readonly FrVerdict[]): FrSourceRecord[] {
  const out: FrSourceRecord[] = [];
  for (const rec of log) {
    if (rec.outcome === "graduate" && rec.graduated_to) {
      out.push({ cycle: rec.cycle, kind: "graduate", ref: rec.graduated_to, outcome: rec.outcome });
      continue;
    }
    const artifact = rec.evidence?.artifact;
    if (!artifact) continue; // no resolvable reference named at all — not part of this join surface
    const verdict = latestVerdictFor(artifact, verdicts);
    out.push({
      cycle: rec.cycle,
      kind: "artifact",
      ref: artifact,
      outcome: rec.outcome,
      verdict: rec.evidence?.verdict,
      verdictFresh: verdict?.fresh,
      supersedes: rec.supersedes ?? undefined,
    });
  }
  return out;
}

function runFrExport(root: string, frCommand: readonly string[]): { doc: FrExportDoc } | { error: string } | "unavailable" {
  let proc: ReturnType<typeof Bun.spawnSync>;
  try {
    proc = Bun.spawnSync([...frCommand, "export"], { cwd: root });
  } catch {
    return "unavailable";
  }
  if (proc.exitCode !== 0) {
    const stderr = proc.stderr.toString().trim();
    return { error: stderr.length > 0 ? stderr : `fr export exited ${proc.exitCode}` };
  }
  try {
    return { doc: JSON.parse(proc.stdout.toString()) as FrExportDoc };
  } catch {
    return { error: "fr export produced unparseable JSON" };
  }
}

function runLedgerFallback(root: string): FrSource | FrAbsent {
  let text: string;
  try {
    text = readFileSync(join(root, ".frontier", "log.jsonl"), "utf8");
  } catch {
    return { present: false, reason: "fr binary unavailable and no .frontier/log.jsonl found" };
  }
  const log: FrLogRecord[] = [];
  const malformedLines: { lineNo: number; snippet: string }[] = [];
  let rawNonblankCount = 0;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim().length === 0) continue;
    rawNonblankCount++;
    try {
      log.push(JSON.parse(line) as FrLogRecord);
    } catch {
      // M2-boundary-review blocker 9 (2026-07-19): a corrupt line in the raw log is a real parse
      // hazard the fallback cannot recover from per-line — it is skipped from `log` (never
      // silently pretended parseable), but MUST stay counted in `totalLogRecords` (the raw
      // nonblank scan above, not `log.length`) and be carried forward as a structural diagnostic
      // so a corrupted banked record can never silently vanish from accounting.
      malformedLines.push({ lineNo: i + 1, snippet: line.slice(0, 120) });
    }
  }
  return {
    present: true,
    degraded: true,
    totalLogRecords: rawNonblankCount,
    records: recordsFromLog(log, []),
    malformedLines,
  };
}

/** Reads `root`'s fr state. `frCommand` defaults to `["fr"]`, overridable so a test can force the
 * fallback path deterministically. Absence (`.frontier/` missing/corrupt) is reported, never
 * silently treated as an empty portfolio. */
export function loadFrSource(root: string, frCommand: readonly string[] = ["fr"]): FrSource | FrAbsent {
  const viaExport = runFrExport(root, frCommand);
  if (viaExport === "unavailable") return runLedgerFallback(root);
  if ("error" in viaExport) return { present: false, reason: viaExport.error };
  const log = viaExport.doc.log ?? [];
  const verdicts = viaExport.doc.verdicts ?? [];
  return {
    present: true,
    degraded: false,
    totalLogRecords: log.length,
    records: recordsFromLog(log, verdicts),
    malformedLines: [], // a whole-document parse failure on this path is a total error/absence,
    // never a per-line concern (see runFrExport's own JSON.parse try/catch above).
  };
}
