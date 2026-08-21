// EDGE — fs. Contract-bounded TEXT inclusion for snapshot-load.ts. Hash/dir coverage remains the
// full-tree walk in snapshot-load.ts; this shard only decides which files enter RepoSnapshot text.

import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Bytes } from "../refs/hash";
import { SNAPSHOT_INCLUDE_RULES } from "./snapshot-rules";

/** Git placeholder for an otherwise-empty directory: existence only, never content/hash. */
export const DIR_PLACEHOLDER = ".gitkeep";

// The rule table is src/store/snapshot-rules.ts (rk-5lzf: `definitions` is RECURSIVE so nested
// notation shards are visible; `.rk/conventions` takes `.json` only). One table, one walker.
export interface SnapshotAccum {
  text: Map<string, string>;
  sha256: Map<string, string>;
  dirs: Set<string>;
}

/** Raw bytes are decoded only for the text projection; sha256 stays byte-faithful. */
export function readInto(acc: SnapshotAccum, relPath: string, absPath: string): void {
  const bytes = readFileSync(absPath);
  acc.text.set(relPath, bytes.toString("utf8"));
  acc.sha256.set(relPath, sha256Bytes(bytes));
}

function collectDir(
  absRoot: string,
  relDir: string,
  recursive: boolean,
  extensions: string[] | undefined,
  acc: SnapshotAccum,
): void {
  const absDir = join(absRoot, ...relDir.split("/"));
  let entries: string[];
  try {
    entries = readdirSync(absDir);
  } catch {
    return;
  }
  acc.dirs.add(relDir);
  for (const name of entries) {
    const absPath = join(absDir, name);
    const st = lstatSync(absPath);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      if (recursive) collectDir(absRoot, `${relDir}/${name}`, recursive, extensions, acc);
      else acc.dirs.add(`${relDir}/${name}`);
      continue;
    }
    if (name === DIR_PLACEHOLDER || !st.isFile()) continue;
    if (extensions && extensions.length > 0) {
      const dot = name.lastIndexOf(".");
      const ext = dot === -1 ? "" : name.slice(dot);
      if (!extensions.includes(ext)) continue;
    }
    readInto(acc, `${relDir}/${name}`, absPath);
  }
}

export function collectIncluded(root: string, acc: SnapshotAccum): void {
  for (const rule of SNAPSHOT_INCLUDE_RULES) collectDir(root, rule.dir, rule.recursive, rule.extensions, acc);
}
