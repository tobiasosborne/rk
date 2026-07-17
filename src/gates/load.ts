// EDGE — fs. Walks a root directory into an in-memory RepoSnapshot (src/gates/snapshot.ts),
// restricted to the explicit file classes the six M0 gates actually read
// (docs/gate-contracts.md's per-gate "Inputs" sections) — deliberately not a kitchen-sink
// whole-tree read (this WP's brief: "explicit include globs from the contract, no kitchen-sink").

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RepoSnapshot } from "./snapshot";

interface IncludeRule {
  /** repo-relative dir, POSIX-style ("argument/lemmas"). */
  dir: string;
  recursive: boolean;
  /** File extensions (with leading dot) to include; omit/empty to include every file. */
  extensions?: string[];
}

/** One rule per file class docs/gate-contracts.md names as an Input across the six gates:
 * - `definitions/*.md`               — defs gate (Gate 1 Inputs)
 * - `argument/{INDEX,DAG,README}.md` — linker gate's own generated-mirror files (Gate 2 Inputs)
 * - `argument/lemmas/*.md`           — linker + provenance gates (Gate 2 / Gate 4 Inputs)
 * - `proofs/**`                      — refs gate's externals JSON + linker's ledger/meta.json
 *                                       introspection targets (Gate 2 / Gate 3 Inputs)
 * - `refs/manifest/*`                — defs gate's manifest (Gate 1 Inputs: checksums.sha256)
 * - `runs/**`                        — runs gate (Gate 5 Inputs)
 * - `report/**\/*.{tex,md}`          — provenance + report-shards gates (Gate 4 / Gate 6 Inputs)
 * plus the repo-root `INDEX.md` (runs gate's reverse-lookup input), handled separately below
 * since it is a single literal file, not a directory rule. */
const INCLUDE_RULES: IncludeRule[] = [
  { dir: "definitions", recursive: false },
  { dir: "argument", recursive: false },
  { dir: "argument/lemmas", recursive: false },
  { dir: "proofs", recursive: true },
  { dir: "refs/manifest", recursive: false },
  { dir: "runs", recursive: true },
  { dir: "report", recursive: true, extensions: [".tex", ".md"] },
];

function collectDir(
  absRoot: string,
  relDir: string,
  recursive: boolean,
  extensions: string[] | undefined,
  out: Map<string, string>,
): void {
  const absDir = join(absRoot, ...relDir.split("/"));
  let entries: string[];
  try {
    entries = readdirSync(absDir);
  } catch {
    return; // absent directory entirely is legitimate (e.g. day-1 empty runs/) — never an error
  }
  for (const name of entries) {
    const absPath = join(absDir, name);
    const st = statSync(absPath);
    if (st.isDirectory()) {
      if (recursive) collectDir(absRoot, `${relDir}/${name}`, recursive, extensions, out);
      continue;
    }
    if (extensions && extensions.length > 0) {
      const dot = name.lastIndexOf(".");
      const ext = dot === -1 ? "" : name.slice(dot);
      if (!extensions.includes(ext)) continue;
    }
    out.set(`${relDir}/${name}`, readFileSync(absPath, "utf8"));
  }
}

/** Builds a RepoSnapshot from a real directory tree, reading only the file classes above. Any
 * rule's directory being entirely absent is silent (not every gate's input tree exists in every
 * fixture or every repo state) — this mirrors every gate's own "empty/absent input is a
 * legitimate state" contract, not a loader-level error. */
export function loadSnapshot(root: string): RepoSnapshot {
  const out = new Map<string, string>();
  for (const rule of INCLUDE_RULES) {
    collectDir(root, rule.dir, rule.recursive, rule.extensions, out);
  }
  try {
    out.set("INDEX.md", readFileSync(join(root, "INDEX.md"), "utf8"));
  } catch {
    // absent entirely is legitimate (a fresh scaffold before any run bundle exists)
  }
  return out;
}
