// PURITY: pure — no fs/network/clock (L3). Parsing/serializing refs/manifest/sources.lock.json
// plus the pure status-classification decision. Reading the file from disk, hashing local
// payloads, and any real cache-dir/cache-url probing are all edge concerns (src/refs/status.ts).
//
// Ground truth: fetch-refs.py's `load_lock` (fetch-refs.py:55-56) and its JSON shape (see a real
// example at almost-idempotent-stochastic-maps/refs/manifest/sources.lock.json).

import type { FetchSpec, LockFile, LockFileEntry, SourceId, SourceStatus } from "../types";
import { sourceId } from "../types";

export function parseLockFile(text: string): LockFile {
  const raw = JSON.parse(text) as {
    arxiv_verified?: string[];
    files: Array<{
      path: string;
      sha256: string;
      source_id: string;
      fetch: FetchSpec | null;
      note?: string;
    }>;
  };
  const files: LockFileEntry[] = raw.files.map((f) => ({
    path: f.path,
    sha256: f.sha256,
    source_id: sourceId(f.source_id),
    fetch: f.fetch,
    ...(f.note !== undefined ? { note: f.note } : {}),
  }));
  return { arxiv_verified: raw.arxiv_verified ?? [], files };
}

export function serializeLockFile(lock: LockFile): string {
  const out: { arxiv_verified: string[]; files: unknown[] } = {
    arxiv_verified: lock.arxiv_verified ?? [],
    files: lock.files.map((f) => ({
      path: f.path,
      sha256: f.sha256,
      source_id: f.source_id as SourceId as string,
      fetch: f.fetch,
      ...(f.note !== undefined ? { note: f.note } : {}),
    })),
  };
  return JSON.stringify(out, null, 2);
}

export interface StatusInputs {
  /** File already exists locally with a hash matching the lock entry's recorded sha256. */
  presentOnDisk: boolean;
  /** The lock entry's `fetch` field is non-null (a reproducible route exists). */
  hasFetchSpec: boolean;
  /** A content-addressed cache dir/url lookup succeeded during the dry-run probe. */
  cacheHit: boolean;
}

/** The `--status` dry-run classification, as a pure decision over pre-probed booleans. Mirrors
 * fetch-refs.py's `reconstruct(..., write=False, allow_fetch=False)` control flow exactly
 * (fetch-refs.py:143-172): present-on-disk short-circuits first; then a cache hit (checked even
 * in dry-run mode — fetch-refs.py never skips `cache_lookup`, only the network `fetch_spec`
 * path is gated by `allow_fetch`); then fetchable-if-spec; else missing. */
export function decideStatus(inputs: StatusInputs): SourceStatus {
  if (inputs.presentOnDisk) return "present";
  if (inputs.cacheHit) return "cache";
  if (inputs.hasFetchSpec) return "fetchable";
  return "missing";
}
