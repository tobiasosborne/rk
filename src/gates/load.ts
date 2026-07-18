// EDGE — fs + subprocess (git). Walks a root directory into an in-memory RepoSnapshot
// (src/gates/snapshot.ts), restricted to the explicit file classes the six M0 gates actually
// read (docs/gate-contracts.md's per-gate "Inputs" sections) — deliberately not a kitchen-sink
// whole-tree read (this WP's brief: "explicit include globs from the contract, no kitchen-sink").
//
// This edge ALSO measures the three SnapshotFacts a pure gate cannot compute itself (M0.3 review
// rk-399): (1) byte-faithful raw-byte sha256 of every file (never a UTF-8 round-trip — correct
// for binary/non-UTF-8 payloads); (2) real git tracking via `git ls-files` at the root; (3)
// directory existence INCLUDING empty directories. The gate consumes facts; it never guesses.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RepoSnapshot, SnapshotFacts } from "./snapshot";
import { sha256Bytes } from "../refs/hash";

interface IncludeRule {
  /** repo-relative dir, POSIX-style ("argument/lemmas"). */
  dir: string;
  recursive: boolean;
  /** File extensions (with leading dot) to include; omit/empty to include every file. */
  extensions?: string[];
}

/** A git placeholder for an otherwise-empty directory: recorded as directory existence (its
 * parent dir is added to `dirs`), NEVER as bundle/shard content (excluded from the text map and
 * from its sha256/tracked facts). This is the corpus convention for representing a genuinely
 * empty directory in git, which cannot store one (corpus/README.md "empty-directory fixtures"). */
const DIR_PLACEHOLDER = ".gitkeep";

/** One rule per file class docs/gate-contracts.md names as an Input across the six gates:
 * - `definitions/*.md`               — defs gate (Gate 1 Inputs)
 * - `argument/{INDEX,DAG,README}.md` — linker gate's own generated-mirror files (Gate 2 Inputs)
 * - `argument/lemmas/*.md`           — linker + provenance gates (Gate 2 / Gate 4 Inputs)
 * - `proofs/**`                      — refs gate's externals JSON + linker's ledger/meta.json
 *                                       introspection targets (Gate 2 / Gate 3 Inputs)
 * - `refs/**`                        — defs gate's manifest (`refs/manifest/*`, Gate 1 Inputs:
 *                                       checksums.sha256) AND the refs gate's quote-source
 *                                       payload tree `refs/<source-id>/*` that Checks 2-4 byte-
 *                                       verify claimed VERBATIM quotes against (Gate 3 Inputs).
 *                                       One recursive rule covers both: a locus like
 *                                       `refs/kitaev-2405.02434/approximate_algebras.tex:503-532`
 *                                       (gate-contracts.md Gate 3) can nest arbitrarily deep, and
 *                                       narrowing to a fixed depth or extension would silently
 *                                       reintroduce the payload-ABSENT false-read this rule exists
 *                                       to close (rk-skd; see docs/gate-contracts.md Gate 3
 *                                       "THE 19/19 false-green"). Matches the `proofs/**`
 *                                       precedent below: recursive, no extension filter — these
 *                                       payloads are gitignored in real repos (present only on
 *                                       disk, never in git), so a whole-tree recursive read here
 *                                       is exactly the loader's job, not kitchen-sink bloat.
 * - `runs/**`                        — runs gate (Gate 5 Inputs)
 * - `report/**\/*.{tex,md}`          — provenance + report-shards gates (Gate 4 / Gate 6 Inputs)
 * plus the repo-root `INDEX.md` (runs gate's reverse-lookup input), handled separately below
 * since it is a single literal file, not a directory rule.
 *
 * NOTE (review finding 1): the include set no longer bounds hash-verifiability. A provenance
 * source row may name a tracked path OUTSIDE these rules; the git-tracked pass below hashes
 * every tracked file so such a row is verified (tracked+stale ⇒ ERROR), never silently WARNed. */
const INCLUDE_RULES: IncludeRule[] = [
  { dir: "definitions", recursive: false },
  { dir: "argument", recursive: false },
  { dir: "argument/lemmas", recursive: false },
  { dir: "proofs", recursive: true },
  { dir: "refs", recursive: true },
  { dir: "runs", recursive: true },
  { dir: "report", recursive: true, extensions: [".tex", ".md"] },
];

interface Accum {
  text: Map<string, string>;
  sha256: Map<string, string>;
  dirs: Set<string>;
}

/** Reads `absPath`'s raw bytes: UTF-8-decoded text into the map (what text gates read) and a
 * byte-faithful sha256 into the facts (what Gate 4 verifies). The two are decoupled on purpose —
 * the sha is of the raw bytes, so a non-UTF-8/binary payload hashes correctly even though its
 * text projection is lossy (review finding 1). */
function readInto(acc: Accum, relPath: string, absPath: string): void {
  const bytes = readFileSync(absPath); // Buffer (raw bytes) — no encoding arg
  acc.text.set(relPath, bytes.toString("utf8"));
  acc.sha256.set(relPath, sha256Bytes(bytes));
}

function collectDir(
  absRoot: string,
  relDir: string,
  recursive: boolean,
  extensions: string[] | undefined,
  acc: Accum,
): void {
  const absDir = join(absRoot, ...relDir.split("/"));
  let entries: string[];
  try {
    entries = readdirSync(absDir);
  } catch {
    return; // absent directory entirely is legitimate (e.g. day-1 empty runs/) — never an error
  }
  acc.dirs.add(relDir); // the directory EXISTS (recorded even when it holds no matching files)
  for (const name of entries) {
    const absPath = join(absDir, name);
    const st = statSync(absPath);
    if (st.isDirectory()) {
      // A recursive rule descends into subdirs (recording their existence, empty ones included,
      // AND their content); a non-recursive rule descends ONLY to record the subdir's existence,
      // never its content — preserving "no kitchen-sink" while completing directory facts.
      if (recursive) collectDir(absRoot, `${relDir}/${name}`, recursive, extensions, acc);
      else acc.dirs.add(`${relDir}/${name}`);
      continue;
    }
    if (name === DIR_PLACEHOLDER) continue; // directory placeholder: existence only, never content
    if (extensions && extensions.length > 0) {
      const dot = name.lastIndexOf(".");
      const ext = dot === -1 ? "" : name.slice(dot);
      if (!extensions.includes(ext)) continue;
    }
    readInto(acc, `${relDir}/${name}`, absPath);
  }
}

/** `git ls-files -z` at `root` → repo-relative tracked paths. Empty set when `root` is not a git
 * repo / git is unavailable — tracking then degrades to "nothing tracked" (a source row is WARN,
 * never a false ERROR). Runs from `root` so paths come back relative to it (matches the snapshot
 * keys), including when `root` is a subdirectory of a larger repo (the corpus fixtures). */
function gitTracked(root: string): Set<string> {
  try {
    const proc = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: root });
    if (proc.exitCode !== 0) return new Set();
    const out = proc.stdout.toString();
    const paths = out.split("\0").filter((p) => p.length > 0);
    return new Set(paths);
  } catch {
    return new Set();
  }
}

/** Builds a RepoSnapshot (text + SnapshotFacts) from a real directory tree. Include-rule files
 * are read for text + hashed; every git-tracked file is additionally hashed (so a source row
 * naming a tracked path outside the include rules is still verifiable); directory existence
 * (empty dirs included) is recorded. Any rule's directory being entirely absent is silent — this
 * mirrors every gate's own "empty/absent input is a legitimate state" contract. */
export function loadSnapshot(root: string): RepoSnapshot {
  const acc: Accum = { text: new Map(), sha256: new Map(), dirs: new Set() };
  for (const rule of INCLUDE_RULES) {
    collectDir(root, rule.dir, rule.recursive, rule.extensions, acc);
  }
  try {
    readInto(acc, "INDEX.md", join(root, "INDEX.md"));
  } catch {
    // absent entirely is legitimate (a fresh scaffold before any run bundle exists)
  }

  const tracked = gitTracked(root);
  // Hash every tracked file not already hashed via the include rules, so a provenance source row
  // naming a tracked path OUTSIDE the include set is hash-verifiable (review finding 1) rather
  // than being downgraded to an "unverifiable/WARN" false pass. The `.gitkeep` placeholder is
  // never hashed as content.
  for (const path of tracked) {
    if (acc.sha256.has(path)) continue;
    if (path.endsWith(`/${DIR_PLACEHOLDER}`) || path === DIR_PLACEHOLDER) continue;
    try {
      const bytes = readFileSync(join(root, ...path.split("/")));
      acc.sha256.set(path, sha256Bytes(bytes));
    } catch {
      // tracked in the index but not on disk (staged delete etc.): leave unhashed => the gate
      // treats it as absent (WARN), never a false ERROR.
    }
  }

  const facts: SnapshotFacts = { sha256: acc.sha256, tracked, dirs: acc.dirs };
  const snapshot = acc.text as Map<string, string> & SnapshotFacts;
  Object.assign(snapshot, facts);
  return snapshot;
}
