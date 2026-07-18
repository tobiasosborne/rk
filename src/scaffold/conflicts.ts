// PURITY: pure — no fs/network/clock (L3). M1.2 (`rk init`) safety check: refuse to stamp into a
// directory that already contains anything the manifest would overwrite. Deliberately checks
// EVERY `stamped` entry's path (files AND directories) against what already exists at the target
// — `.rk/` is not special-cased, it is simply one more manifest-stamped directory entry, so "a
// directory that already contains .rk/" falls straight out of "any file the manifest would
// overwrite" (this WP's brief) rather than needing its own rule.

export interface ManifestPathEntry {
  path: string;
}

/** Returns the manifest paths that already exist at the target (per `existingPaths`, an edge-
 * supplied set of bare manifest-entry paths — trailing "/" stripped — that `existsSync` found on
 * disk at the stamp root; see `src/cli/init.ts`'s `existingManifestPaths`). Sorted for a
 * deterministic, readable conflict report. Mutation-proof target (b) of this WP: disabling this
 * check (e.g. always returning `[]`) must make a red-corpus-style integration test fail — `rk
 * init` must never silently overwrite an existing stamped file. */
export function detectConflicts(manifestPaths: ManifestPathEntry[], existingPaths: ReadonlySet<string>): string[] {
  const conflicts = new Set<string>();
  for (const entry of manifestPaths) {
    // A directory entry's manifest path carries a trailing slash (e.g. ".rk/"); the on-disk
    // existence set is queried without it, since a real directory listing has no trailing slash.
    const bare = entry.path.endsWith("/") ? entry.path.slice(0, -1) : entry.path;
    if (existingPaths.has(bare)) conflicts.add(entry.path);
  }
  return [...conflicts].sort();
}
