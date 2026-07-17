// EDGE — fs (+ optionally network, if EXTPROP_REFS_CACHE_URL is set: parity with
// fetch-refs.py, which performs a real cache_lookup even in --status dry-run mode). Ports
// fetch-refs.py's `--status` path: `reconstruct(files, write=False, allow_fetch=False)`
// (fetch-refs.py:143-172,206-214) — classify every lock-file entry as present/cache/fetchable/
// missing WITHOUT fetching or writing anything. The pure classification rule lives in
// src/refs/lock.ts (`decideStatus`); this module only does the fs/network probing that rule
// needs as input.

import { join } from "node:path";
import { parseLockFile } from "./lock";
import { decideStatus } from "./lock";
import { sha256File, sha256Bytes } from "./hash";
import type { StatusRow } from "../types";

export interface ComputeStatusOptions {
  /** Content-addressed cache directory: a hit is <cacheDir>/<sha256>. Defaults to
   * $EXTPROP_REFS_CACHE (fetch-refs.py's own env var, fetch-refs.py:193). */
  cacheDir?: string;
  /** Content-addressed cache URL: a hit is GET <cacheUrl>/<sha256>. Defaults to
   * $EXTPROP_REFS_CACHE_URL (fetch-refs.py:194). A live network call — matches AISM's own
   * --status behavior, which does not skip this probe; unset in tests (no live calls). */
  cacheUrl?: string;
}

async function cacheHit(sha: string, opts: ComputeStatusOptions): Promise<boolean> {
  if (opts.cacheDir) {
    const p = join(opts.cacheDir, sha);
    if (await Bun.file(p).exists()) {
      try {
        return (await sha256File(p)) === sha;
      } catch {
        return false;
      }
    }
  }
  if (opts.cacheUrl) {
    try {
      const res = await fetch(`${opts.cacheUrl.replace(/\/$/, "")}/${sha}`);
      if (!res.ok) return false;
      const bytes = new Uint8Array(await res.arrayBuffer());
      return sha256Bytes(bytes) === sha;
    } catch {
      return false;
    }
  }
  return false;
}

/** Computes the status of every file named in `<repoRoot>/refs/manifest/sources.lock.json`,
 * touching disk only to read the lock file and stat/hash local payloads (plus an optional cache
 * probe — see ComputeStatusOptions). Never writes, never performs a real fetch_spec download —
 * that asymmetry vs. `rk refs add` is the entire point of `--status`/`rk refs status`. */
export async function computeStatus(
  repoRoot: string,
  opts: ComputeStatusOptions = {},
): Promise<StatusRow[]> {
  const cacheDir = opts.cacheDir ?? process.env.EXTPROP_REFS_CACHE;
  const cacheUrl = opts.cacheUrl ?? process.env.EXTPROP_REFS_CACHE_URL;
  const resolvedOpts: ComputeStatusOptions = {
    ...(cacheDir !== undefined ? { cacheDir } : {}),
    ...(cacheUrl !== undefined ? { cacheUrl } : {}),
  };

  const lockPath = join(repoRoot, "refs", "manifest", "sources.lock.json");
  const lock = parseLockFile(await Bun.file(lockPath).text());

  const rows: StatusRow[] = [];
  for (const entry of lock.files) {
    const dst = join(repoRoot, "refs", entry.path);
    let presentOnDisk = false;
    if (await Bun.file(dst).exists()) {
      try {
        presentOnDisk = (await sha256File(dst)) === entry.sha256;
      } catch {
        presentOnDisk = false;
      }
    }
    const hit = presentOnDisk ? false : await cacheHit(entry.sha256, resolvedOpts);
    const status = decideStatus({
      presentOnDisk,
      hasFetchSpec: entry.fetch !== null,
      cacheHit: hit,
    });
    rows.push({ path: entry.path, sourceId: entry.source_id, status });
  }
  return rows;
}
