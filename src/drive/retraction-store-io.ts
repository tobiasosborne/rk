// EDGE — fs. rk-0ehr / P1: the ONE place `.rk/retractions.jsonl` (the campaign repo's retraction
// ledger) is actually opened. Everything else in the src/drive/retraction-*.ts family is pure and
// takes/returns plain data — this module is the thin fs seam around
// src/drive/{retraction-record,retraction-store}.ts, the same edge-wraps-pure-core convention
// src/drive/l5-store-io.ts follows for the verdict ledger.
//
// APPEND-ONLY, BY CONSTRUCTION: `appendRetractions` calls `node:fs`'s `appendFileSync` — never
// `writeFileSync` (which truncates) and never a read-modify-write of the whole file. There is no
// code path here that removes or rewrites a byte already on disk. That matters more on THIS ledger
// than on any other: rewriting it is exactly how a retraction disappears and a defective claim
// goes green again, which is the AISM failure mode this whole record type exists to prevent
// (src/drive/retraction-record.ts's header).
//
// ORDINAL ASSIGNMENT: the next record's `ordinal` is `1 + the highest ordinal already on disk`
// (never a line count — a corrupted line must not shift every subsequent ordinal). Single writer
// per campaign repo at a time (no file locking), consistent with rk's no-daemon stance
// (CLAUDE.md §7) and identical to the verdict ledger's own documented limitation.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildRetractionRecord,
  serializeRetractionRecord,
  type RetractionInput,
  type RetractionRecord,
} from "./retraction-record";
import { parseRetractionLog, retractionStoreHealthy, type RetractionLogParseResult } from "./retraction-store";

/** The ledger's fixed, campaign-repo-relative location. Exported so no other surface (a future
 * `rk retract` CLI, Gate 2's snapshot read) ever hand-derives this path a second way. */
export function retractionStorePath(root: string): string {
  return join(root, ".rk", "retractions.jsonl");
}

/** Reads and parses the ledger. A missing file is a legitimate state (a campaign where nothing has
 * ever been retracted) — `{records: [], issues: []}`, never an error, mirroring every other edge
 * reader in src/store/. Corrupted lines are surfaced in `issues`; this function does not swallow,
 * log, or editorialize about them — the caller decides how loudly to report. */
export function readRetractionStore(root: string): RetractionLogParseResult {
  const path = retractionStorePath(root);
  if (!existsSync(path)) return { records: [], issues: [] };
  return parseRetractionLog(readFileSync(path, "utf8"));
}

function nextOrdinal(records: readonly RetractionRecord[]): number {
  let max = -1;
  for (const r of records) if (r.ordinal > max) max = r.ordinal;
  return max + 1;
}

export interface AppendRetractionResult {
  /** True iff every input was accepted and appended. */
  ok: boolean;
  appended: RetractionRecord[];
  /** Inputs `buildRetractionRecord` rejected (blank reason, bad hash, unknown domain, ...) —
   * reported, never silently dropped; nothing rejected is ever partially written. */
  rejected: Array<{ input: RetractionInput; reason: string }>;
}

/** Appends every input to the ledger as ONE write call (one `appendFileSync` carrying every
 * accepted line, each newline-terminated). A rejected input contributes NOTHING to that write, so
 * a batch with one bad input still cleanly appends the good ones and reports the bad one in
 * `rejected`, never a partial line on disk. `nowIso` is the edge's only clock read (L3: the pure
 * core never calls it) — injectable so tests pin `appendedAt` instead of racing `Date.now()`.
 *
 * FAIL CLOSED ON CORRUPTION: if the on-disk store is unhealthy (a truncated/garbage line, a broken
 * ordinal chain), this writes NOTHING and rejects everything. The true latest ordinal is unknowable
 * through corruption, so writing `max+1` would cement it — and on this ledger, cementing corruption
 * can silently drop a standing retraction. Repair out of band before the log grows again. */
export function appendRetractions(
  root: string,
  inputs: readonly RetractionInput[],
  nowIso: () => string = () => new Date().toISOString(),
): AppendRetractionResult {
  const path = retractionStorePath(root);
  mkdirSync(dirname(path), { recursive: true });
  const existing = readRetractionStore(root);

  const health = retractionStoreHealthy(existing);
  if (!health.healthy) {
    return {
      ok: false,
      appended: [],
      rejected: inputs.map((input) => ({
        input,
        reason: `store integrity compromised, refusing to append through corruption: ${health.problems.join("; ")}`,
      })),
    };
  }

  let ordinal = nextOrdinal(existing.records);

  const appended: RetractionRecord[] = [];
  const rejected: Array<{ input: RetractionInput; reason: string }> = [];
  let batch = "";
  for (const input of inputs) {
    const built = buildRetractionRecord(input, ordinal, nowIso());
    if (!built.ok) {
      rejected.push({ input, reason: built.reason });
      continue;
    }
    appended.push(built.record);
    batch += serializeRetractionRecord(built.record) + "\n";
    ordinal++;
  }
  if (batch.length > 0) appendFileSync(path, batch, "utf8");
  return { ok: rejected.length === 0, appended, rejected };
}

/** Convenience single-input form of `appendRetractions`. */
export function appendRetraction(root: string, input: RetractionInput, nowIso?: () => string): AppendRetractionResult {
  return appendRetractions(root, [input], nowIso);
}
