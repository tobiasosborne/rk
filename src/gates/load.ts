// EDGE — fs + subprocess (git). Walks a root directory into an in-memory RepoSnapshot
// (src/gates/snapshot.ts), restricted to the explicit file classes the six M0 gates actually
// read (docs/gate-contracts.md's per-gate "Inputs" sections) — deliberately not a kitchen-sink
// whole-tree read (this WP's brief: "explicit include globs from the contract, no kitchen-sink").
//
// This edge ALSO measures the three SnapshotFacts a pure gate cannot compute itself (M0.3 review
// rk-399): (1) byte-faithful raw-byte sha256 of every file (never a UTF-8 round-trip — correct
// for binary/non-UTF-8 payloads); (2) real git tracking via `git ls-files` at the root; (3)
// directory existence INCLUDING empty directories. The gate consumes facts; it never guesses.
//
// Hash-verifiability is GLOBAL, not bounded by the include rules (review N1 BLOCKER): a full-tree
// walk (`walkTree`) records a hash for EVERY file present on disk and EVERY directory (empty ones
// included), skipping only the repo-root `.git` (`ROOT_SKIP_DIR`) and the `.gitkeep` placeholder. So a source
// payload present on disk but outside the include rules AND untracked (a gitignored payload) still
// receives a hash fact — the pure gate then distinguishes "present + stale ⇒ ERROR" from "absent ⇒
// WARN" (docs/gate-contracts.md Gate 4 check 4). Only TEXT content stays bounded to the include
// rules (the six gates' declared Inputs); the hash+dirs FACTS span the whole tree.
//
// rk-bdd (2026-07-18 M0.3 re-review, finding 6) assessed this file for the same relocation as
// src/gates/{corpus-run,corpus-discovery}.ts (moved to src/corpus/ that same session — both were
// impure files silently exempt from the purity grep inside a PURE directory). Deliberately NOT
// moved in that pass: this file has a much larger fan-out (src/cli/check.ts, several test files)
// AND is cited by path in prose across Tier-A files (framework.ts, docs/gate-contracts.md) and
// two immutable review records, whose citations could not be corrected without violating the
// review-record immutability convention. A correctly-scoped move needs its own WP with time for
// the full doc sweep, not a same-session tack-on. Filed as rk-7uc.

import { lstatSync, readdirSync, readFileSync } from "node:fs";
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

/** The SOLE directory the full-tree hash walk skips, and ONLY at the repo root: `.git`.
 *
 * round-3 landing-blocker 1: the skip-set must not match a basename ANYWHERE in the tree. The old
 * set (`.git`, `node_modules`, `.hg`, `.svn`, skipped wherever they appeared) meant a source
 * payload shadowed by a coincidental parent — `notes/node_modules/payload.bin`, a gitignored blob
 * under a directory a researcher happened to name `.svn`, etc. — received no hash, so Gate 4
 * check 4 read it as genuinely absent and downgraded a present+stale source to a WARN false-pass.
 * The invariant is absolute: no path a provenance source row can name may be present-on-disk yet
 * hash-fact-absent.
 *
 * Why `.git` is the one safe exception, and why only at the root: git itself REFUSES to place
 * tracked content under a `.git` component (`git add .git/x` is rejected), so no source payload —
 * tracked or gitignored — can ever legitimately be named under the repo-root `.git`; and it is the
 * cost driver (thousands of loose objects dominate the walk). Anchoring to the root is what keeps
 * the exception safe: a NESTED directory literally named `.git` (a vendored/independent repo under
 * our root) is ordinary content from this root's vantage and IS walked. `node_modules`/`.hg`/
 * `.svn` are NOT git-forbidden locations — a gitignored payload can live under them — so they are
 * no longer skipped at all; the invariant forbids it. (In a research repo they are rarely present,
 * and far smaller than `.git` when they are.) */
const ROOT_SKIP_DIR = ".git";

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
 * NOTE (review finding 1 + N1): the include set bounds only TEXT content, never hash-
 * verifiability. `walkTree` below hashes every file present on disk (tracked or not, inside these
 * rules or not), so a provenance source row naming ANY present path is verified (present+stale ⇒
 * ERROR), never silently WARNed as "absent". */
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

/** SYMLINK POLICY (round-3 landing-blocker 3; docs/gate-contracts.md Shared conventions, "Snapshot
 * loading"). Both walkers `lstat` every entry and treat a symbolic link as CONTENT-INVISIBLE: it
 * is never followed — not hashed, not read as text, not recorded as a directory, never descended
 * into. This is the whole safety story for three failure modes the old `statSync` (which follows
 * links) exposed, each of which could throw or diverge BEFORE `rk check`'s per-gate exception
 * boundary and take the entire composed run down: (1) a DANGLING link — `statSync` throws ENOENT
 * following a dead target; `lstat` returns the link's own metadata and never touches the target;
 * (2) a CYCLIC self/parent-referential link — `statSync` reports it as a directory and the walk
 * recurses forever; not following it terminates trivially; (3) an ESCAPING link to a path outside
 * the root — `statSync` would read/walk foreign bytes into the snapshot; not following it keeps the
 * walk inside the root. A symlinked source therefore has no hash fact, so Gate 4 reads it as
 * genuinely absent ⇒ WARN "not hash-verifiable" — the safe direction (never a false ERROR, never a
 * missed-stale false-green), and never a crash. Only regular files (`isFile()`) get content/hash;
 * fifos/sockets/device nodes are skipped for the same reason. */

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
    const st = lstatSync(absPath); // lstat: never follows the link (see the SYMLINK POLICY note above)
    if (st.isSymbolicLink()) continue; // symlinks are content-invisible: neither followed nor recorded
    if (st.isDirectory()) {
      // A recursive rule descends into subdirs (recording their existence, empty ones included,
      // AND their content); a non-recursive rule descends ONLY to record the subdir's existence,
      // never its content — preserving "no kitchen-sink" while completing directory facts.
      if (recursive) collectDir(absRoot, `${relDir}/${name}`, recursive, extensions, acc);
      else acc.dirs.add(`${relDir}/${name}`);
      continue;
    }
    if (name === DIR_PLACEHOLDER) continue; // directory placeholder: existence only, never content
    if (!st.isFile()) continue; // only regular files carry content (skip fifo/socket/device nodes)
    if (extensions && extensions.length > 0) {
      const dot = name.lastIndexOf(".");
      const ext = dot === -1 ? "" : name.slice(dot);
      if (!extensions.includes(ext)) continue;
    }
    readInto(acc, `${relDir}/${name}`, absPath);
  }
}

/** Full recursive walk from `root`: records EVERY directory (empty ones included) into `acc.dirs`
 * and a byte-faithful sha256 for EVERY file present on disk into `acc.sha256`, skipping the repo-root `.git`
 * and the `.gitkeep` placeholder. Files already hashed by an include rule are not re-read
 * (`acc.sha256.has`). This is what makes hash-verifiability global (review N1): a present-on-disk
 * source outside the include rules — untracked/gitignored included — still gets a hash fact, so the
 * pure gate never conflates "present + stale" (ERROR) with "absent" (WARN). */
function walkTree(absRoot: string, relDir: string, acc: Accum): void {
  const absDir = relDir === "" ? absRoot : join(absRoot, ...relDir.split("/"));
  let entries: string[];
  try {
    entries = readdirSync(absDir);
  } catch {
    return; // an unreadable/absent directory is silent, matching collectDir
  }
  if (relDir !== "") acc.dirs.add(relDir);
  for (const name of entries) {
    const absPath = join(absDir, name);
    const st = lstatSync(absPath); // lstat: never follows the link (see the SYMLINK POLICY note above)
    const rel = relDir === "" ? name : `${relDir}/${name}`;
    if (st.isSymbolicLink()) continue; // symlinks are content-invisible: neither followed nor recorded
    if (st.isDirectory()) {
      if (relDir === "" && name === ROOT_SKIP_DIR) continue; // skip ONLY the repo-root .git
      walkTree(absRoot, rel, acc);
      continue;
    }
    if (name === DIR_PLACEHOLDER) continue; // directory existence only, never content/hash
    if (acc.sha256.has(rel)) continue; // already hashed via an include rule — avoid a re-read
    if (!st.isFile()) continue; // only regular files get a hash (skip fifo/socket/device nodes)
    acc.sha256.set(rel, sha256Bytes(readFileSync(absPath)));
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

/** Builds a RepoSnapshot (text + SnapshotFacts) from a real directory tree. Include-rule files are
 * read for text (and hashed once, in the same read); `walkTree` then hashes EVERY remaining file
 * present on disk and records EVERY directory (empty ones included), so hash-verifiability spans
 * the whole tree, not just the include rules (review N1). `git ls-files` supplies the real
 * `tracked` fact (used only to shape the stale-source ERROR message: tracked vs
 * gitignored-but-present). Any rule's directory being entirely absent is silent — mirroring every
 * gate's own "empty/absent input is a legitimate state" contract. */
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

  // Full-tree walk: hash every file present on disk not already hashed, and record every directory
  // — hash-verifiability is not bounded by the include rules (review N1). Only the repo-root .git is skipped.
  walkTree(root, "", acc);

  const tracked = gitTracked(root);
  const facts: SnapshotFacts = { sha256: acc.sha256, tracked, dirs: acc.dirs };
  const snapshot = acc.text as Map<string, string> & SnapshotFacts;
  Object.assign(snapshot, facts);
  return snapshot;
}
