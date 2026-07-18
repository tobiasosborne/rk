// PURITY: pure — no fs/network/clock (L3). RepoSnapshot: the in-memory view of a repo tree every
// M0.3 gate reads from (never fs directly — src/gates/load.ts is the impure edge that builds
// one). Also hosts the flat-frontmatter YAML-subset parser shared by every gate that reads a
// `---`-delimited `key: value` header — ground truth: docs/gate-contracts.md Gate 1 Inputs
// ("Frontmatter: flat key: value per line, terminated by a second `---` line",
// check-defs.py:30-50) and Gate 2 Inputs (identical grammar, argument.py:106-124).

/** Edge-supplied facts a pure gate cannot compute itself (git state, raw-byte hashes,
 * empty-directory existence). Every field is a *fact measured at the impure edge*
 * (src/gates/load.ts), never a guess: the pure gate consumes them, it does not re-derive them.
 * REQUIRED on every RepoSnapshot (no longer `Partial` — review N2): a Map-only snapshot silently
 * carried DIFFERENT validity semantics through the same `RepoSnapshot` type (provenance stale ⇒
 * WARN instead of ERROR, an empty run bundle invisible, an existing-but-empty sections directory
 * a false ERROR via a prefix fallback). Requiring facts makes a factless snapshot a type error;
 * `loadSnapshot` measures them at the real edge and `snapshotFromFiles` synthesizes them for
 * tests/probes, so there is no legitimate factless construction path left. */
export interface SnapshotFacts {
  /** repo-relative path -> full 64-char lowercase sha256 of the file's RAW bytes (never a
   * UTF-8 round-trip — byte-faithful for binary/non-UTF-8 payloads). Keyed for every file the
   * edge hashed: the include-rule text files AND every git-tracked file (so a source row naming
   * a tracked path OUTSIDE the include rules is still hash-verifiable — review finding 1). */
  sha256: ReadonlyMap<string, string>;
  /** repo-relative paths reported by `git ls-files` at the root (real git tracking state, not a
   * "present in this snapshot" proxy — review Check-4 ruling). */
  tracked: ReadonlySet<string>;
  /** repo-relative directories that EXIST on disk, INCLUDING empty ones, no trailing slash.
   * Lets a gate distinguish "the directory exists but holds no contract file" (ERROR classes:
   * an empty run bundle, an absent report/sections/) from "inferred present because a file lives
   * under it" — the case the old file-prefix-only model could not represent (review finding 2). */
  dirs: ReadonlySet<string>;
}

/** path -> raw file text, repo-relative POSIX-style paths ("definitions/foo.md"), no leading
 * slash — the primary map every gate reads. Carries the edge-measured `SnapshotFacts` as REQUIRED
 * sidecar fields (review N2): `loadSnapshot` populates them from the real tree, `snapshotFromFiles`
 * synthesizes them for tests/probes. There is no factless RepoSnapshot — the `fileSha256`/
 * `isTracked`/`dirExists`/`childDirs` accessors read the facts directly, with no
 * silent-degradation fallback (a missing fact is a programming error, not a papered-over default).
 * Consumers that only read text (`.get`/`.keys`/`.has`) are untouched by the sidecars. */
export type RepoSnapshot = ReadonlyMap<string, string> & SnapshotFacts;

/** Byte-faithful full sha256 (64 hex) of `path`'s raw bytes as the edge measured it, or undefined
 * when the edge never hashed `path` (genuinely ABSENT from disk — the edge hashes every present
 * file, review N1). A pure gate compares against this; it never re-hashes snapshot text (a UTF-8
 * round-trip that silently corrupts binary payloads — review finding 1). */
export function fileSha256(snapshot: RepoSnapshot, path: string): string | undefined {
  return snapshot.sha256.get(path);
}

/** True iff `git ls-files` listed `path` at the root. */
export function isTracked(snapshot: RepoSnapshot, path: string): boolean {
  return snapshot.tracked.has(path);
}

/** True iff directory `dir` exists on disk (empty ones included) per the edge's `dirs` fact — read
 * strictly from the fact, with NO file-prefix fallback (review N2: the fallback made a
 * present-but-empty directory indistinguishable from an absent-but-file-shadowed one). */
export function dirExists(snapshot: RepoSnapshot, dir: string): boolean {
  const d = dir.endsWith("/") ? dir.slice(0, -1) : dir;
  return snapshot.dirs.has(d);
}

/** Immediate child DIRECTORY names of `parent` from the `dirs` fact (empty-dir aware). Reads the
 * fact directly — callers that also need file-inferred children union this with `listDir` (see
 * src/gates/runs.ts). */
export function childDirs(snapshot: RepoSnapshot, parent: string): string[] {
  const p = parent.endsWith("/") ? parent : `${parent}/`;
  const names = new Set<string>();
  for (const d of snapshot.dirs) {
    if (!d.startsWith(p)) continue;
    const rest = d.slice(p.length);
    if (rest.length === 0) continue;
    const slash = rest.indexOf("/");
    names.add(slash === -1 ? rest : rest.slice(0, slash));
  }
  return [...names].sort();
}

/** Pure test/probe builder: synthesizes a full RepoSnapshot (text + REQUIRED SnapshotFacts) from
 * an in-memory file map, so a caller never hand-assembles facts and can never accidentally omit
 * them (facts are required by the type — review N2). Fact synthesis:
 *   - `dirs`  — every ancestor directory of every file path, unioned with `opts.dirs` (the EXTRA
 *     empty directories that hold no file, which path-derivation alone cannot see: an empty run
 *     bundle, an empty `report/sections/`).
 *   - `tracked` — every file path by default (everything tracked), overridable via `opts.tracked`
 *     (e.g. `[]` for an untracked-but-present payload).
 *   - `sha256` — INJECTED via `opts.sha256`, defaulting to empty. Byte hashing needs a hasher, and
 *     L3 purity forbids the native crypto primitives in this pure module; the only gate that
 *     verifies hash freshness (Gate 4 check 4) owns a hasher in its own non-pure test file and
 *     injects the map.
 *     An empty default is an EXPLICIT "no file hashed" (all-absent) state the gate reads
 *     truthfully — never a silent degradation. */
export function snapshotFromFiles(
  files: Record<string, string> | ReadonlyMap<string, string>,
  opts: {
    dirs?: Iterable<string>;
    tracked?: Iterable<string>;
    sha256?: ReadonlyMap<string, string> | Record<string, string>;
  } = {},
): RepoSnapshot {
  const pairs = files instanceof Map ? [...files.entries()] : Object.entries(files as Record<string, string>);
  const text = new Map<string, string>(pairs);
  const dirs = new Set<string>(opts.dirs ?? []);
  for (const path of text.keys()) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  const tracked = new Set<string>(opts.tracked ?? text.keys());
  const shaSrc = opts.sha256;
  const shaPairs = shaSrc instanceof Map ? [...shaSrc.entries()] : Object.entries((shaSrc as Record<string, string>) ?? {});
  const sha256 = new Map<string, string>(shaPairs);
  const snapshot = text as Map<string, string> & SnapshotFacts;
  Object.assign(snapshot, { sha256, tracked, dirs } satisfies SnapshotFacts);
  return snapshot;
}

/** Immediate child names (files or subdirectories, one level only) of `dir` within `snapshot`.
 * `dir` may or may not carry a trailing slash. Returns `[]` when nothing in the snapshot lives
 * under `dir` — a legitimate "this tree has none of these" state (e.g. day-1 empty `runs/`),
 * never an error. */
export function listDir(snapshot: RepoSnapshot, dir: string): string[] {
  const prefix = dir.endsWith("/") ? dir : `${dir}/`;
  const names = new Set<string>();
  for (const path of snapshot.keys()) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const slash = rest.indexOf("/");
    names.add(slash === -1 ? rest : rest.slice(0, slash));
  }
  return [...names].sort();
}

/** True iff `path` is present in `snapshot` verbatim. */
export function hasPath(snapshot: RepoSnapshot, path: string): boolean {
  return snapshot.has(path);
}

/** True iff any snapshot key lives under `prefix` (a cheap directory-existence probe — see the
 * RepoSnapshot doc comment above for why no separate directory index is kept). */
export function hasPrefix(snapshot: RepoSnapshot, prefix: string): boolean {
  const p = prefix.endsWith("/") ? prefix : `${prefix}/`;
  for (const path of snapshot.keys()) {
    if (path.startsWith(p)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------
// Frontmatter (YAML-subset)
// ---------------------------------------------------------------------------------------

export interface Frontmatter {
  /** false when the file's first non-blank line is not a bare `---` at all. */
  present: boolean;
  /** false when a second `---` line was never found before EOF (unterminated). Only meaningful
   * when `present` is true. */
  terminated: boolean;
  /** key -> raw trimmed value string. A key repeated within one frontmatter block keeps only its
   * LAST occurrence (a plain line-by-line map build — mirrors a naive dict-from-lines parse). */
  fields: Record<string, string>;
  /** 1-indexed line numbers (relative to the whole file) of any line inside the frontmatter
   * block that contains no `:` at all (docs/gate-contracts.md Gate 1 check 2 / Gate 2 check 1). */
  malformedLines: number[];
}

const FRONTMATTER_DELIM = "---";

/** Parses the flat `---` / `key: value`* / `---` frontmatter block that opens a defs/linker
 * shard. Blank lines inside the block are skipped (neither a field nor malformed) — no real
 * fixture shard carries one, and it keeps the parser from flagging cosmetic whitespace as a
 * violation. Does not interpret nested/typed YAML — the shards only ever use flat scalar
 * `key: value` lines (`;`-separated lists like `aliases`/`deps` stay a single string value; the
 * gate that owns that field splits it itself). */
export function parseFrontmatter(content: string): Frontmatter {
  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === "") i++;
  if (i >= lines.length || lines[i]!.trim() !== FRONTMATTER_DELIM) {
    return { present: false, terminated: false, fields: {}, malformedLines: [] };
  }
  i++; // past the opening ---
  const fields: Record<string, string> = {};
  const malformedLines: number[] = [];
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === FRONTMATTER_DELIM) {
      return { present: true, terminated: true, fields, malformedLines };
    }
    if (line.trim() === "") continue;
    const idx = line.indexOf(":");
    if (idx === -1) {
      malformedLines.push(i + 1);
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    fields[key] = value;
  }
  return { present: true, terminated: false, fields, malformedLines };
}
