// EDGE — fs + clock (retrieval date, injectable). `rk refs adopt <path> --source <locator>`
// (rk-pk8o): register an ALREADY-DOWNLOADED payload that lives under refs/ into the three manifest
// artifacts, with NO network of any kind.
//
// Why this exists (window-1 firewalled campaign, ../rk-campaign-A finding #1 — the largest
// structural blocker): a librarian script running outside the agent's sandbox writes
// refs/sources/arxiv-1811.08017.txt, and there is no refs/manifest/ at all. `rk refs add` cannot
// help — its every non-local route needs the network, and its local-file route COPIES the file to
// refs/<id>/<basename> rather than registering it where it already is. So Gate 3 could see the bytes
// while `rk refs status` and `rk refs quote` knew nothing about them: a cited rung was unreachable.
//
// Format: NOT a second manifest format. This module writes through the SAME parsers/serializers
// `add.ts` uses (checksum.ts, lock.ts, manifest.ts), so `rk refs status`, `rk refs quote` and Gate 3
// treat an adopted source exactly as they treat a fetched one. What Gate 3 itself checks is the
// PAYLOAD's existence under refs/ (docs/gate-contracts.md Gate 3, check 2) — adoption does not move
// bytes, so that check is unaffected; what adoption adds is the recorded sha256 that pins them and
// the source-id → path join `rk refs quote` resolves.
//
// PROVENANCE DECISION — `fetch` is recorded as `null`, never a route derived from `--source`.
// rk did not fetch these bytes and cannot know they are what the locator serves: the campaign's own
// payload is a text EXTRACTION of a PDF, so an `arxiv-pdf` fetch spec would name a route whose bytes
// could never match the recorded hash. A fetch spec is a reproducibility CLAIM; fabricating one is
// the same class of lie as fabricating a hash. The locator is therefore recorded where it is honest:
// SOURCES.md's `locator` column and the lock entry's `note` (cache-only, as AISM's own
// non-reproducible sources are recorded). `rk refs status` consequently reports an adopted source as
// `present` while its bytes are on disk and `missing` — not `fetchable` — once they are not.

// Error messages here carry NO "rk refs adopt:" prefix — src/cli/refs.ts adds it once at the edge
// (a doubled prefix is what the first live-fire run on ../rk-campaign-A printed).

import { basename, join } from "node:path";
import { checksumMatches, parseChecksumsFile, serializeChecksumsFile } from "./checksum";
import { sha256File } from "./hash";
import { parseLockFile, serializeLockFile } from "./lock";
import { appendManifestRow, parseManifestTable } from "./manifest";
import { readSourcesDocument } from "./sources-doc";
import { assertSafeRelPath } from "./path-safety";
import type { LockFileEntry } from "../types";
import { sourceId as brandSourceId } from "../types";

export interface AdoptOptions {
  /** Where the bytes came from, as the operator knows it: a URL, `arxiv:<id>`, `doi:<doi>`, or any
   * human locator ("user-supplied scan"). Recorded verbatim; never turned into a fetch route. */
  source: string;
  /** Optional expected digest (e.g. from the librarian's own ledger). A mismatch is fatal. */
  expectSha256?: string;
  /** Defaults to the payload basename's stem. */
  id?: string;
  citation?: string;
  role?: string;
  /** ISO date (YYYY-MM-DD). Defaults to today — injectable so tests are deterministic. */
  retrieved?: string;
}

export interface AdoptResult {
  sourceId: string;
  /** Repo-relative, e.g. "refs/sources/arxiv-1811.08017.txt". */
  path: string;
  sha256: string;
  /** True iff the lock file already carried this exact path+hash+source-id before this call. */
  alreadyAdopted: boolean;
}

/** Rejects a value that would break the SOURCES.md table it lands in. `formatManifestRow` does not
 * escape cells, so an unescaped `|` or newline would silently fabricate/destroy columns — a
 * corrupted provenance record, so a loud refusal rather than a mangled row. */
function assertTableSafe(field: string, value: string): void {
  if (value.includes("|") || value.includes("\n")) {
    throw new Error(`${field} must not contain '|' or a newline (it is written into the SOURCES.md table): '${value}'`);
  }
}

/** repo-relative (`refs/sources/x.txt`) or already refs-relative (`sources/x.txt`) -> the
 * refs-relative form the manifest artifacts record. */
function toRefsRelative(inputPath: string): string {
  assertSafeRelPath(inputPath);
  const norm = inputPath.replace(/^\.\//, "");
  const rel = norm.startsWith("refs/") ? norm.slice("refs/".length) : norm;
  assertSafeRelPath(rel);
  return rel;
}

function defaultIdFor(refsRel: string): string {
  const base = basename(refsRel);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

/** Registers `<repoRoot>/refs/<path>` — which must already exist — in refs/manifest/
 * {checksums.sha256,sources.lock.json,SOURCES.md}, seeding a fresh SOURCES.md if there is none.
 * Never fetches, never copies bytes, never fabricates a hash: the sha256 written everywhere is
 * always freshly computed from the file on disk. Writes NOTHING when any check fails. */
export async function adoptSource(repoRoot: string, inputPath: string, opts: AdoptOptions): Promise<AdoptResult> {
  const refsRel = toRefsRelative(inputPath);
  const repoRel = `refs/${refsRel}`;
  const id = opts.id ?? defaultIdFor(refsRel);
  if (id === "") throw new Error(`could not derive a source-id from '${inputPath}' — pass --id <source-id>`);
  assertTableSafe("--source", opts.source);
  assertTableSafe("--id", id);
  if (opts.citation !== undefined) assertTableSafe("--citation", opts.citation);
  if (opts.role !== undefined) assertTableSafe("--role", opts.role);

  const abs = join(repoRoot, repoRel);
  if (!(await Bun.file(abs).exists())) {
    const elsewhere = await Bun.file(join(repoRoot, refsRel)).exists();
    throw new Error(
      `'${repoRel}' does not exist` +
        (elsewhere
          ? ` — the payload is at '${refsRel}', outside refs/. Move it under refs/ first: an adopted source's path must be refs-relative, since that is what the manifest, 'rk refs quote' and Gate 3 all resolve.`
          : " — adopt registers an ALREADY-downloaded payload; nothing was written."),
    );
  }
  const sha256 = await sha256File(abs);

  if (opts.expectSha256 !== undefined && !checksumMatches(sha256, opts.expectSha256)) {
    throw new Error(
      `sha256 mismatch for '${repoRel}' — expected ${opts.expectSha256.toLowerCase()}, ` +
        `computed ${sha256} from the bytes on disk. Nothing was written: the payload is not the one ` +
        `whose hash you claimed (wrong file, truncated download, or a stale ledger entry).`,
    );
  }

  const manifestDir = join(repoRoot, "refs", "manifest");
  const lockPath = join(manifestDir, "sources.lock.json");
  const lock = parseLockFile(await Bun.file(lockPath).text().catch(() => '{"files":[]}'));
  const existing = lock.files.find((f) => f.path === refsRel);
  if (existing !== undefined) {
    if (!checksumMatches(existing.sha256, sha256)) {
      throw new Error(
        `'${repoRel}' is already adopted with sha256 ${existing.sha256}, but the bytes ` +
          `on disk now hash to ${sha256}. Nothing was written — a recorded hash is a pin, and rk will ` +
          `not silently repoint it. Restore the pinned bytes, or remove the entry deliberately if the ` +
          `payload legitimately changed.`,
      );
    }
    if (existing.source_id !== brandSourceId(id)) {
      throw new Error(
        `'${repoRel}' is already adopted under source-id '${existing.source_id}', not ` +
          `'${id}'. Nothing was written — one path cannot carry two source-ids (which one a quote is ` +
          `attributed to would be ambiguous).`,
      );
    }
  }

  const retrieved = opts.retrieved ?? new Date().toISOString().slice(0, 10);
  const note = `cache-only; acquire manually (adopted offline from '${opts.source}')`;

  const checksumsPath = join(manifestDir, "checksums.sha256");
  const checksums = parseChecksumsFile(await Bun.file(checksumsPath).text().catch(() => ""));
  if (!checksums.some((c) => c.path === refsRel && checksumMatches(c.sha256, sha256))) {
    checksums.push({ sha256, path: refsRel });
    await Bun.write(checksumsPath, serializeChecksumsFile(checksums));
  }

  if (existing === undefined) {
    const entry: LockFileEntry = { path: refsRel, sha256, source_id: brandSourceId(id), fetch: null, note };
    lock.files.push(entry);
    await Bun.write(lockPath, serializeLockFile(lock));
  }

  const sourcesMdPath = join(manifestDir, "SOURCES.md");
  // Shared with `add` since rk-tyl6 (src/refs/sources-doc.ts) — one reader, so the two writers
  // cannot drift apart about what "no SOURCES.md yet" means. The only behavior change here: a
  // file that exists but is blank now seeds too, instead of throwing one line later.
  const sourcesMd = await readSourcesDocument(sourcesMdPath);
  if (!parseManifestTable(sourcesMd).some((r) => r.localPath === repoRel)) {
    await Bun.write(
      sourcesMdPath,
      appendManifestRow(sourcesMd, {
        sourceId: brandSourceId(id),
        citation: opts.citation ?? opts.source,
        locator: opts.source,
        retrieved,
        localPath: repoRel,
        sha16: sha256.slice(0, 16),
        role: opts.role ?? "adopted offline (no fetch route recorded)",
      }),
    );
  }

  return { sourceId: id, path: repoRel, sha256, alreadyAdopted: existing !== undefined };
}
