// EDGE — fs. M3.7: the ONE place `.rk/l5-verdicts.jsonl` (the campaign repo's L5 verdict ledger)
// is actually opened. Everything else in the src/drive/l5-*.ts family is pure and takes/returns
// plain data (`L5StoredVerdict[]`, parsed text) — this module is the thin fs seam around
// src/drive/{l5-record,l5-store}.ts, following the same edge-wraps-pure-core convention as
// src/store/registry-load.ts around src/gates/linker-parse.ts.
//
// APPEND-ONLY, BY CONSTRUCTION: `appendL5Verdicts` calls `node:fs`'s `appendFileSync` — never
// `writeFileSync` (which truncates) and never any read-modify-write of the whole file. There is no
// code path in this module that removes or rewrites a byte already on disk; the mutation-proof for
// this property (swap `appendFileSync` for `writeFileSync` and watch the "earlier records survive
// a second append call" test go red) is recorded in this WP's final report, not here.
//
// ORDINAL ASSIGNMENT: the next record's `ordinal` is `1 + the highest ordinal already on disk`
// (never a line count — a corrupted/dropped line must not shift every subsequent ordinal, and
// `parseL5Log` already tells us exactly which ordinals survived). This module assumes a SINGLE
// writer per campaign repo at a time (no file locking) — a known, documented limitation (see the
// WP's final report's "what deferred" list), consistent with rk's no-daemon, no-remote-automation
// stance (CLAUDE.md §7).

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildL5StoredVerdict, serializeL5StoredVerdict, type L5StoredVerdict } from "./l5-record";
import { parseL5Log, type L5LogParseResult } from "./l5-store";
import { sha256Bytes } from "../refs/hash";
import type { VerdictDocument } from "./verdict-schema";

/** The ledger's fixed, campaign-repo-relative location. Exported so a future `rk verify`/`rk
 * check` CLI surface never hand-derives this path a second way. */
export function l5StorePath(root: string): string {
  return join(root, ".rk", "l5-verdicts.jsonl");
}

/** Reads and parses the ledger. A missing file is a legitimate state (a fresh campaign that has
 * never dispatched an L5 review) — `{records: [], issues: []}`, never an error, mirroring every
 * other edge reader in src/store/ (e.g. `loadRegistrySource`'s own "root absence... legitimate
 * state" doc comment). Any corrupted line is surfaced in `issues` (src/drive/l5-store.ts's
 * `parseL5Log`) — this function does not swallow, log, or otherwise editorialize about them; the
 * caller decides how loudly to report (CLAUDE.md L2: never silently dropped, but this module does
 * not itself choose the reporting channel). */
export function readL5Store(root: string): L5LogParseResult {
  const path = l5StorePath(root);
  if (!existsSync(path)) return { records: [], issues: [] };
  return parseL5Log(readFileSync(path, "utf8"));
}

function nextOrdinal(records: readonly L5StoredVerdict[]): number {
  let max = -1;
  for (const r of records) if (r.ordinal > max) max = r.ordinal;
  return max + 1;
}

export interface AppendL5Result {
  /** True iff every input document was accepted and appended. */
  ok: boolean;
  appended: L5StoredVerdict[];
  /** Documents `buildL5StoredVerdict` rejected (wrong tier, unencodable identity, ...) — reported,
   * never silently dropped from the count; nothing rejected is ever partially written. */
  rejected: Array<{ document: VerdictDocument; reason: string }>;
}

/** Appends every l5-tier `document` to the ledger as one write call (one `appendFileSync`
 * carrying every accepted line, each newline-terminated) — a rejected document contributes NOTHING
 * to that write, so a batch containing one bad document still cleanly appends the good ones and
 * reports the bad one in `rejected`, never a partial line on disk. `nowIso` is the edge's only
 * clock read (L3: the pure core never calls it) — injectable so tests can pin `appendedAt` to a
 * fixed value instead of asserting against `Date.now()` drift. Ordinal assignment reads the
 * CURRENT on-disk state fresh at the start of this call (see file header: single-writer
 * assumption). */
export function appendL5Verdicts(
  root: string,
  documents: readonly VerdictDocument[],
  nowIso: () => string = () => new Date().toISOString(),
): AppendL5Result {
  const path = l5StorePath(root);
  mkdirSync(dirname(path), { recursive: true });
  const existing = readL5Store(root);
  let ordinal = nextOrdinal(existing.records);

  const appended: L5StoredVerdict[] = [];
  const rejected: Array<{ document: VerdictDocument; reason: string }> = [];
  let batch = "";
  for (const document of documents) {
    const built = buildL5StoredVerdict(document, ordinal, nowIso());
    if (!built.ok) {
      rejected.push({ document, reason: built.reason });
      continue;
    }
    appended.push(built.record);
    batch += serializeL5StoredVerdict(built.record) + "\n";
    ordinal++;
  }
  if (batch.length > 0) appendFileSync(path, batch, "utf8");
  return { ok: rejected.length === 0, appended, rejected };
}

/** Convenience single-document form of `appendL5Verdicts`. */
export function appendL5Verdict(root: string, document: VerdictDocument, nowIso?: () => string): AppendL5Result {
  return appendL5Verdicts(root, [document], nowIso);
}

/** The L5 tier's pinned hash domain (docs/worker-contract.md section (f)): lowercase hex SHA-256
 * of the RAW shard-file bytes at `absShardPath`, no normalization whatsoever — the SAME domain
 * every `l5ContentHash`/record in this store family is bound to. Reuses `src/refs/hash.ts`'s
 * existing edge hasher rather than a second implementation; this function's only job is reading
 * the right bytes off the right path. */
export function currentL5ContentHash(absShardPath: string): string {
  return sha256Bytes(readFileSync(absShardPath));
}
