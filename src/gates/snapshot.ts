// PURITY: pure — no fs/network/clock (L3). RepoSnapshot: the in-memory view of a repo tree every
// M0.3 gate reads from (never fs directly — src/gates/load.ts is the impure edge that builds
// one). Also hosts the flat-frontmatter YAML-subset parser shared by every gate that reads a
// `---`-delimited `key: value` header — ground truth: docs/gate-contracts.md Gate 1 Inputs
// ("Frontmatter: flat key: value per line, terminated by a second `---` line",
// check-defs.py:30-50) and Gate 2 Inputs (identical grammar, argument.py:106-124).

/** path -> raw file text, repo-relative POSIX-style paths ("definitions/foo.md"), no leading
 * slash. Directory existence is inferred by prefix match over these keys (e.g. "does
 * proofs/lem-x/ledger/ exist?" <=> some key starts with "proofs/lem-x/ledger/") — no separate
 * directory listing is tracked, since every file class the six gates read is a real file, never
 * a meaningfully-empty directory (docs/gate-contracts.md's per-gate Inputs sections all name
 * globs over files, not bare directory presence). */
export type RepoSnapshot = ReadonlyMap<string, string>;

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
