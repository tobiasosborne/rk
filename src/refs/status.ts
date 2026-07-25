// EDGE — fs (+ optionally network, if RK_REFS_CACHE_URL/EXTPROP_REFS_CACHE_URL is set: parity
// with fetch-refs.py, which performs a real cache_lookup even in --status dry-run mode). Ports
// fetch-refs.py's `--status` path: `reconstruct(files, write=False, allow_fetch=False)`
// (fetch-refs.py:143-172,206-214) — classify every lock-file entry as present/cache/fetchable/
// missing WITHOUT fetching or writing anything. The pure classification rule lives in
// src/refs/lock.ts (`decideStatus`); this module only does the fs/network probing that rule
// needs as input.
//
// rk-54a (generality audit 2026-07-25, finding M7): the cache env vars were inherited verbatim
// from AISM's fetch-refs.py as EXTPROP_REFS_CACHE(_URL) — another campaign's acronym sitting in
// rk's own public environment-variable namespace. Renamed to RK_REFS_CACHE(_URL). The old names
// are read as a DEPRECATED FALLBACK (someone's shell profile may still export them) via
// `resolveRenamedEnv`, which reports which name actually supplied the value so a caller (here,
// `rk refs status`) can warn once, clearly, rather than silently honoring a dead name forever.

import { join } from "node:path";
import { parseLockFile } from "./lock";
import { decideStatus } from "./lock";
import { sha256File, sha256Bytes } from "./hash";
import { assertSafeRelPath } from "./path-safety";
import type { StatusRow } from "../types";

export interface ComputeStatusOptions {
  /** Content-addressed cache directory: a hit is <cacheDir>/<sha256>. Defaults to
   * $RK_REFS_CACHE, falling back to the deprecated $EXTPROP_REFS_CACHE (fetch-refs.py's own env
   * var, fetch-refs.py:193) if the new name is unset. */
  cacheDir?: string;
  /** Content-addressed cache URL: a hit is GET <cacheUrl>/<sha256>. Defaults to
   * $RK_REFS_CACHE_URL, falling back to the deprecated $EXTPROP_REFS_CACHE_URL
   * (fetch-refs.py:194) if the new name is unset. A live network call — matches AISM's own
   * --status behavior, which does not skip this probe; unset in tests (no live calls). */
  cacheUrl?: string;
}

/** Which name actually supplied the value: "new" (the current, documented name), "old" (the
 * deprecated fallback — someone's shell profile still exports it), or "unset" (neither is set). */
export type EnvSource = "new" | "old" | "unset";

export interface RenamedEnvResult {
  value: string | undefined;
  source: EnvSource;
}

/** Resolves an env var that has been renamed, preferring the new name. Precedence when BOTH are
 * set: the NEW name wins, silently — an operator who has already set `newName` has made an
 * explicit, current choice, and warning about a stale variable they simply forgot to unset would
 * be noise, not signal (there is nothing actionable left for them to do). The OLD name is read
 * only when the new one is entirely absent, and that path is exactly what should warn: it is the
 * one place the deprecated name is actually steering behavior. */
export function resolveRenamedEnv(newName: string, oldName: string): RenamedEnvResult {
  const newVal = process.env[newName];
  if (newVal !== undefined) return { value: newVal, source: "new" };
  const oldVal = process.env[oldName];
  if (oldVal !== undefined) return { value: oldVal, source: "old" };
  return { value: undefined, source: "unset" };
}

export const RK_REFS_CACHE_ENV = "RK_REFS_CACHE";
export const RK_REFS_CACHE_ENV_DEPRECATED = "EXTPROP_REFS_CACHE";
export const RK_REFS_CACHE_URL_ENV = "RK_REFS_CACHE_URL";
export const RK_REFS_CACHE_URL_ENV_DEPRECATED = "EXTPROP_REFS_CACHE_URL";

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
  const cacheDir = opts.cacheDir ?? resolveRenamedEnv(RK_REFS_CACHE_ENV, RK_REFS_CACHE_ENV_DEPRECATED).value;
  const cacheUrl = opts.cacheUrl ?? resolveRenamedEnv(RK_REFS_CACHE_URL_ENV, RK_REFS_CACHE_URL_ENV_DEPRECATED).value;
  const resolvedOpts: ComputeStatusOptions = {
    ...(cacheDir !== undefined ? { cacheDir } : {}),
    ...(cacheUrl !== undefined ? { cacheUrl } : {}),
  };

  const lockPath = join(repoRoot, "refs", "manifest", "sources.lock.json");
  const lock = parseLockFile(await Bun.file(lockPath).text());

  const rows: StatusRow[] = [];
  for (const entry of lock.files) {
    // rk-correct divergence from fetch-refs.py (see src/refs/path-safety.ts header): reject a
    // traversal path in a lock entry loudly, rather than joining it blindly.
    assertSafeRelPath(entry.path);
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
