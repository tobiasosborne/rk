// ROLE: shared contracts across rk's modules (gates, graph, drive, refs). Domain-general —
// only add a type here when >1 module needs it, or the plan names it explicitly. This file
// grows with each milestone; M0.6 (refs) seeds it with the refs-acquisition surface.
// PURITY: pure — no fs/network/clock (L3). Type-only + trivial constructors; never import an edge.

// ---------------------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------------------

/** A `refs/manifest/` source-id, e.g. `baake-sumner-2007.11433`. Branded to prevent
 * accidental mixing with citation/locator free text at call sites. */
export type SourceId = string & { readonly __brand: "SourceId" };

export function sourceId(s: string): SourceId {
  return s as SourceId;
}

// ---------------------------------------------------------------------------------------
// refs/manifest/sources.lock.json — the reproducible-reconstruction recipe (fetch-refs.py)
// ---------------------------------------------------------------------------------------

/** How to re-fetch one payload file's bytes, byte-stably, with no local machine state.
 * Mirrors fetch-refs.py's `fetch_spec` kinds exactly (fetch-refs.py:66-73) — no `local-file`
 * kind exists here because a manually-acquired source is recorded as `fetch: null` (see
 * `LockFileEntry`), not as a spec; that is AISM's own convention (hognas-mukherjea in
 * sources.lock.json) and rk keeps it for parity. */
export type FetchSpec =
  | { kind: "url"; url: string }
  | { kind: "arxiv-pdf"; id: string }
  | { kind: "arxiv-eprint"; id: string }
  | { kind: "arxiv-eprint-member"; id: string };

export interface LockFileEntry {
  path: string;
  sha256: string;
  source_id: SourceId;
  /** null => cache-only, no reproducible fetch route (copyrighted / manually acquired). */
  fetch: FetchSpec | null;
  note?: string;
}

export interface LockFile {
  arxiv_verified?: string[];
  files: LockFileEntry[];
}

// ---------------------------------------------------------------------------------------
// refs/manifest/SOURCES.md — the human-facing catalogue row
// ---------------------------------------------------------------------------------------

/** One row of the `## Source registry` markdown table in SOURCES.md. `sha16` is the
 * first 16 hex chars of the full sha256 (the "key file (sha256-16)" column) — AISM's own
 * convention for a human-scannable prefix; the authoritative full hash lives in
 * checksums.sha256 and sources.lock.json. */
export interface ManifestRow {
  sourceId: SourceId;
  citation: string;
  locator: string;
  retrieved: string; // ISO date, e.g. "2026-07-02"
  localPath: string; // repo-relative, e.g. "refs/foo/bar.tex"
  sha16: string;
  role: string;
}

// ---------------------------------------------------------------------------------------
// Acquisition (`rk refs add <locator>`)
// ---------------------------------------------------------------------------------------

/** Parsed form of the CLI locator argument to `rk refs add`. Not part of the lock-file
 * schema (that's `FetchSpec`) — this is what the user typed, before rk decides how (or
 * whether) it becomes a reproducible fetch route. */
export type AddLocator =
  | { kind: "arxiv"; id: string }
  | { kind: "doi"; doi: string }
  | { kind: "url"; url: string }
  | { kind: "local-file"; path: string };

// ---------------------------------------------------------------------------------------
// Status (`rk refs status`)
// ---------------------------------------------------------------------------------------

/** Per-source reconstruction status, mirroring fetch-refs.py's `--status` dry-run
 * classification (fetch-refs.py:143-172,206-214): a file already on disk with a matching
 * hash is `present`; a cache-dir/cache-url hit during the dry-run is `cache`; a file with
 * no local copy but a `fetch` spec is `fetchable`; anything else is `missing`. */
export type SourceStatus = "present" | "fetchable" | "cache" | "missing";

export interface StatusRow {
  path: string;
  sourceId: SourceId;
  status: SourceStatus;
}

// ---------------------------------------------------------------------------------------
// Quote location (`rk refs quote <source-id> <pattern>`)
// ---------------------------------------------------------------------------------------

export interface QuoteRequest {
  sourceId: SourceId;
  pattern: string;
}

/** A byte-verbatim quote located in a local refs/ payload, with a path:line anchor for use
 * in claims and code comments (PRD C7). `quote` is an exact substring of the source file's
 * raw bytes (as text) — grep -F "<quote>" <path> must find it (single-line quotes only; see
 * src/refs/quote.ts for the multi-line caveat). */
export interface QuoteResult {
  sourceId: SourceId;
  path: string;
  line: number;
  quote: string;
}
