// EDGE — network + fs + clock. Semantic Scholar Graph API client for `rk refs snowball` (bead
// rk-hzla). Fetches, rate-limits, retries, times out, and caches the RAW API responses for a
// paper node (its own metadata, its references, its citations); converts them into the plain
// `SnowballPaper`/`OracleResult` shape src/refs/snowball-closure.ts's PURE BFS core consumes.
// This module does the async network work up front, then hands back a synchronous
// `SnowballOracle` (a Map lookup) — the pure core never sees a Promise, fs call, or clock read.
//
// Fetch economy: `buildSnowballOracle` fetches a paper's own metadata (self) ONLY for seeds — a
// seed is given as a bare id with nothing describing it, but every non-seed paper already arrives
// fully described (title/year/externalIds) inline in whichever references/citations page
// discovered it, so a second self-fetch for it would be redundant. It fetches references+
// citations (the two calls needed to expand a node) ONLY for nodes the pure core will actually
// expand — i.e. nodes at depth < maxDepth — mirroring `snowballClosure`'s own level-loop bound
// exactly, so this driver never spends a rate-limited request on a leaf node the closure
// computation would not have queried anyway.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OracleResult, SnowballOracle, SnowballPaper } from "./snowball-closure";

const API_BASE = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "title,year,externalIds";
const PAGE_LIMIT = 1000;

export const DEFAULT_MIN_SPACING_MS = 3500;
export const DEFAULT_MAX_RETRIES = 5;
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface SnowballFetchOptions {
  /** Absolute path to the cache directory (typically `<root>/refs/snowball/cache`). Created if
   * missing. Every raw response for a node is cached here, keyed by `sanitiseId(mapKey)`, so a
   * rerun over the same closure needs no network at all. */
  cacheDir: string;
  /** Sent as the `x-api-key` header when set (S2_API_KEY). */
  apiKey?: string;
  minSpacingMs?: number;
  maxRetries?: number;
  timeoutMs?: number;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to a real `setTimeout`-based sleep. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Injectable for tests; defaults to `Date.now`. */
  nowImpl?: () => number;
}

export interface BuildSnowballResult {
  oracle: SnowballOracle;
  /** True iff any node's fetch ultimately failed (network error, non-429 HTTP error, or 429
   * exhausted its retries) — the closure computed from `oracle` is then a partial one: failed
   * nodes contribute an empty `{refs: [], cites: []}`, never a thrown exception. */
  partial: boolean;
  /** One human-readable line per failed node, `"<id>: <reason>"`. */
  errors: string[];
}

interface RawCache {
  self: unknown | null;
  references: unknown[];
  citations: unknown[];
}

interface ResolvedOptions {
  apiKey: string | undefined;
  minSpacingMs: number;
  maxRetries: number;
  timeoutMs: number;
  fetchImpl: typeof fetch;
  sleepImpl: (ms: number) => Promise<void>;
  nowImpl: () => number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Filesystem-safe cache filename stem: anything outside `[A-Za-z0-9._-]` becomes `_`. Applied
 * to the closure's own mapKey (an arXiv id or an S2 paperId), never to a full URL. */
export function sanitiseId(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, "_");
}

function makeLimiter(opts: ResolvedOptions): () => Promise<void> {
  let last = -Infinity;
  return async () => {
    const now = opts.nowImpl();
    const elapsed = now - last;
    if (elapsed < opts.minSpacingMs) {
      await opts.sleepImpl(opts.minSpacingMs - elapsed);
    }
    last = opts.nowImpl();
  };
}

async function getJson(url: string, opts: ResolvedOptions, limiter: () => Promise<void>): Promise<any> {
  let attempt = 0;
  for (;;) {
    await limiter();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await opts.fetchImpl(url, {
        headers: opts.apiKey ? { "x-api-key": opts.apiKey } : {},
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 429) {
        attempt++;
        if (attempt > opts.maxRetries) {
          throw new Error(`HTTP 429 (rate limited), gave up after ${opts.maxRetries} retries: ${url}`);
        }
        const retryAfter = res.headers.get("retry-after");
        const backoffMs = retryAfter && Number.isFinite(Number(retryAfter))
          ? Number(retryAfter) * 1000
          : opts.minSpacingMs * 2 ** attempt;
        await opts.sleepImpl(backoffMs);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching ${url}`);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`timeout after ${opts.timeoutMs}ms fetching ${url}`);
      }
      throw err;
    }
  }
}

async function fetchPaginated(baseUrl: string, opts: ResolvedOptions, limiter: () => Promise<void>): Promise<unknown[]> {
  const all: unknown[] = [];
  let offset: number | undefined;
  for (;;) {
    const url = offset !== undefined ? `${baseUrl}&offset=${offset}` : baseUrl;
    const page = await getJson(url, opts, limiter);
    if (Array.isArray(page?.data)) all.push(...page.data);
    if (page?.next === undefined || page?.next === null) break;
    offset = page.next;
  }
  return all;
}

function toPaper(raw: any): SnowballPaper {
  const arxiv: string | undefined = raw?.externalIds?.ArXiv ?? undefined;
  const s2: string | undefined = raw?.paperId ?? undefined;
  const p: SnowballPaper = { id: s2 ?? arxiv ?? "unknown" };
  if (arxiv !== undefined) p.arxiv = arxiv;
  if (s2 !== undefined) p.s2 = s2;
  if (typeof raw?.title === "string") p.title = raw.title;
  if (typeof raw?.year === "number") p.year = raw.year;
  return p;
}

function readCache(path: string): RawCache | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RawCache;
  } catch {
    return undefined; // corrupt cache is treated as a miss, not a crash
  }
}

function writeCache(path: string, raw: RawCache): void {
  writeFileSync(path, JSON.stringify(raw, null, 2));
}

/** Fetches (or, on a rerun, reads from cache) the self/references/citations data for one node
 * and converts it to `OracleResult`. Never throws: a failure is recorded via `onError` and the
 * node's contribution to the closure becomes `null` (the caller substitutes an empty result). */
async function fetchAndCache(
  mapKey: string,
  queryId: string,
  includeSelf: boolean,
  cacheDir: string,
  opts: ResolvedOptions,
  limiter: () => Promise<void>,
  onError: (message: string) => void,
): Promise<OracleResult | null> {
  const cachePath = join(cacheDir, `${sanitiseId(mapKey)}.json`);
  let raw = readCache(cachePath);
  if (!raw) {
    try {
      const q = encodeURIComponent(queryId);
      const selfRaw = includeSelf ? await getJson(`${API_BASE}/paper/${q}?fields=${FIELDS}`, opts, limiter) : null;
      const references = await fetchPaginated(`${API_BASE}/paper/${q}/references?fields=${FIELDS}&limit=${PAGE_LIMIT}`, opts, limiter);
      const citations = await fetchPaginated(`${API_BASE}/paper/${q}/citations?fields=${FIELDS}&limit=${PAGE_LIMIT}`, opts, limiter);
      raw = { self: selfRaw, references, citations };
      writeCache(cachePath, raw);
    } catch (err) {
      onError(`${mapKey}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
  return {
    ...(raw.self ? { self: toPaper(raw.self) } : {}),
    refs: raw.references.map((r: any) => toPaper(r?.citedPaper ?? r)),
    cites: raw.citations.map((r: any) => toPaper(r?.citingPaper ?? r)),
  };
}

/** Async network driver: fetches exactly the nodes `snowballClosure(seeds, maxDepth, ...)` would
 * itself query (see module doc for the economy argument), caches every raw response under
 * `options.cacheDir`, and returns a synchronous oracle ready to hand to the pure core. */
export async function buildSnowballOracle(
  seeds: string[],
  maxDepth: number,
  options: SnowballFetchOptions,
): Promise<BuildSnowballResult> {
  mkdirSync(options.cacheDir, { recursive: true });
  const opts: ResolvedOptions = {
    apiKey: options.apiKey,
    minSpacingMs: options.minSpacingMs ?? DEFAULT_MIN_SPACING_MS,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    fetchImpl: options.fetchImpl ?? fetch,
    sleepImpl: options.sleepImpl ?? defaultSleep,
    nowImpl: options.nowImpl ?? Date.now,
  };
  const limiter = makeLimiter(opts);
  const map = new Map<string, OracleResult>();
  const errors: string[] = [];
  let partial = false;
  const onError = (m: string) => {
    errors.push(m);
    partial = true;
  };

  const visited = new Set<string>();
  let current: string[] = [];
  for (const seedId of seeds) {
    if (visited.has(seedId)) continue;
    visited.add(seedId);
    const result = await fetchAndCache(seedId, `arXiv:${seedId}`, true, options.cacheDir, opts, limiter, onError);
    map.set(seedId, result ?? { refs: [], cites: [] });
    current.push(seedId);
  }

  for (let level = 0; level < maxDepth; level++) {
    const next: string[] = [];
    for (const mapKey of current) {
      const result = map.get(mapKey);
      if (!result) continue;
      for (const p of [...result.refs, ...result.cites]) {
        if (visited.has(p.id)) continue;
        visited.add(p.id);
        next.push(p.id);
        if (level + 1 < maxDepth) {
          const r = await fetchAndCache(p.id, p.id, false, options.cacheDir, opts, limiter, onError);
          map.set(p.id, r ?? { refs: [], cites: [] });
        }
      }
    }
    current = next;
  }

  const oracle: SnowballOracle = (id: string) => map.get(id) ?? { refs: [], cites: [] };
  return { oracle, partial, errors };
}
