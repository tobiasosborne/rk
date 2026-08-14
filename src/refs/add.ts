// EDGE — fs + network (via injectable getter) + clock (retrieved date). `rk refs add <locator>`:
// acquire a payload, hash it, install it under refs/, and update all three manifest artifacts
// (checksums.sha256, sources.lock.json, SOURCES.md). PRD C7: "fetch (arXiv/DOI/local file),
// hash, extract ..., write manifest row (citation, locator, retrieval route + date, SHA256 of
// payload and extraction)."
//
// Scope decision (not a fetch-refs.py port — `add` has no python counterpart; fetch-refs.py only
// RECONSTRUCTS an already-recorded manifest, it never originates one): `add` fetches the arXiv
// PDF route only (not the eprint-member/tar route used for tex-source reproducibility), since
// selecting a tar member requires knowing which file inside the bundle is wanted, which the CLI
// locator doesn't express. Recorded here, not silently narrowed — a future `--member <path>`
// flag can add the eprint-member route without changing this function's shape.
//
// DIVERGENCE (rk-correct, see src/refs/path-safety.ts): the destination path is derived from the
// user-supplied `--id`, so it is sanitized the same way an untrusted lock-file path would be —
// fetch-refs.py has no analogous originating command to compare against.

import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Bytes } from "./hash";
import { assertSafeRelPath } from "./path-safety";
import { parseChecksumsFile, serializeChecksumsFile } from "./checksum";
import { parseLockFile, serializeLockFile } from "./lock";
import { appendManifestRow } from "./manifest";
import { readSourcesDocument } from "./sources-doc";
import type { UrlGetter } from "./fetch";
import type { AddLocator, FetchSpec, LockFileEntry } from "../types";
import { sourceId as brandSourceId } from "../types";

async function defaultGet(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export function parseLocator(locator: string): AddLocator {
  if (locator.startsWith("arxiv:")) return { kind: "arxiv", id: locator.slice("arxiv:".length) };
  if (locator.startsWith("doi:")) return { kind: "doi", doi: locator.slice("doi:".length) };
  if (/^https?:\/\//.test(locator)) return { kind: "url", url: locator };
  return { kind: "local-file", path: locator };
}

function basenameForLocator(loc: AddLocator): string {
  switch (loc.kind) {
    case "local-file":
      return basename(loc.path);
    case "arxiv":
      return `${loc.id}.pdf`;
    case "doi":
      return `${loc.doi.replace(/[/:]/g, "_")}.bin`;
    case "url": {
      try {
        const b = basename(new URL(loc.url).pathname);
        return b || "payload.bin";
      } catch {
        return "payload.bin";
      }
    }
  }
}

async function acquire(loc: AddLocator, get: UrlGetter): Promise<Uint8Array> {
  switch (loc.kind) {
    case "local-file": {
      const file = Bun.file(loc.path);
      if (!(await file.exists())) {
        throw new Error(`rk refs add: local-file locator '${loc.path}' does not exist`);
      }
      return new Uint8Array(await file.arrayBuffer());
    }
    case "arxiv":
      return get(`https://arxiv.org/pdf/${loc.id}`);
    case "doi":
      return get(`https://doi.org/${loc.doi}`);
    case "url":
      return get(loc.url);
  }
}

function fetchSpecFor(loc: AddLocator): FetchSpec | null {
  switch (loc.kind) {
    case "local-file":
      return null; // cache-only, AISM convention (hognas-mukherjea in the real manifest)
    case "arxiv":
      return { kind: "arxiv-pdf", id: loc.id };
    case "doi":
      return { kind: "url", url: `https://doi.org/${loc.doi}` };
    case "url":
      return { kind: "url", url: loc.url };
  }
}

export interface AddOptions {
  id: string;
  citation?: string;
  role?: string;
  /** ISO date (YYYY-MM-DD). Defaults to today — injectable so tests are deterministic. */
  retrieved?: string;
  get?: UrlGetter;
}

export interface AddResult {
  sourceId: string;
  path: string; // repo-relative, e.g. "refs/foo/bar.pdf"
  sha256: string;
}

/** Acquires `locator`'s bytes, hashes them, installs the payload under
 * `<repoRoot>/refs/<id>/<basename>`, and appends a row to all three manifest artifacts. Never
 * fabricates a hash (SOURCES.md's own policy line, verbatim) — the sha256 recorded everywhere is
 * always freshly computed from the bytes actually installed.
 *
 * ORDERING INVARIANT (rk-tyl6): at no intermediate failure point does the tree hold a lock or
 * checksum entry whose SOURCES.md row is missing. Two halves, both load-bearing:
 *   PREPARE — every read, parse and append happens before the first write, so a malformed
 *     SOURCES.md (or an unparseable lock) aborts with NOTHING written, the way `adopt` already
 *     did ("Writes NOTHING when any check fails");
 *   COMMIT  — payload bytes, then the human-facing SOURCES.md ROW, then the two machine artifacts
 *     that pin it. A crash between writes can therefore leave a row with no pin (visible, and
 *     re-running `add` completes it) but never a pin with no row, which is what campaign-D hit:
 *     checksums+lock updated, the manifest row lost, and the only way out a hand-seeded
 *     SOURCES.md plus a rerun. */
export async function addSource(repoRoot: string, locator: string, opts: AddOptions): Promise<AddResult> {
  assertSafeRelPath(opts.id);
  const parsed = parseLocator(locator);
  const bytes = await acquire(parsed, opts.get ?? defaultGet);
  const sha256 = sha256Bytes(bytes);
  const fileBasename = basenameForLocator(parsed);
  const relPath = `${opts.id}/${fileBasename}`;
  assertSafeRelPath(relPath);

  const manifestDir = join(repoRoot, "refs", "manifest");
  const checksumsPath = join(manifestDir, "checksums.sha256");
  const lockPath = join(manifestDir, "sources.lock.json");
  const sourcesMdPath = join(manifestDir, "SOURCES.md");

  // --- PREPARE: nothing below this line touches disk until every artifact's new content exists.
  const checksums = parseChecksumsFile(await Bun.file(checksumsPath).text().catch(() => ""));
  checksums.push({ sha256, path: relPath });

  const lock = parseLockFile(await Bun.file(lockPath).text().catch(() => '{"files":[]}'));
  const entry: LockFileEntry = {
    path: relPath,
    sha256,
    source_id: brandSourceId(opts.id),
    fetch: fetchSpecFor(parsed),
    ...(parsed.kind === "local-file" ? { note: "cache-only; acquire manually" } : {}),
  };
  lock.files.push(entry);

  // Seeded when absent or blank, exactly as `rk refs adopt` seeds it (src/refs/sources-doc.ts):
  // a fresh scaffold has no refs/manifest/ at all, and that must not be an error on the first
  // `rk refs add` — let alone one thrown after the other two artifacts were already written.
  const updatedSourcesMd = appendManifestRow(await readSourcesDocument(sourcesMdPath), {
    sourceId: brandSourceId(opts.id),
    citation: opts.citation ?? locator,
    locator,
    retrieved: opts.retrieved ?? new Date().toISOString().slice(0, 10),
    localPath: `refs/${relPath}`,
    sha16: sha256.slice(0, 16),
    role: opts.role ?? "",
  });

  // --- COMMIT: row before pins (see the ordering invariant above).
  await Bun.write(join(repoRoot, "refs", relPath), bytes);
  await Bun.write(sourcesMdPath, updatedSourcesMd);
  await Bun.write(checksumsPath, serializeChecksumsFile(checksums));
  await Bun.write(lockPath, serializeLockFile(lock));

  return { sourceId: opts.id, path: `refs/${relPath}`, sha256 };
}
