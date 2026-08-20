// PURITY: pure — no fs/network/clock (L3). Split from linker-parse.ts (rk-c83, hard-cap-280 wave):
// the `definitions/*.md` id lookup table — a DIFFERENT job from parsing `argument/` shards
// (different directory, different registry, used only as a lookup for Gate 2 check 7's `defs:`
// resolution). Ground truth: docs/gate-contracts.md "Gate 2 — argument / linker" check 7, ported
// from argument.py:506-514 `load_def_ids`.

import { baseName, listFilesRecursive, parseFrontmatter } from "./snapshot";
import type { RepoSnapshot } from "./snapshot";

/** `definitions/**\/*.md` id set (excluding README.md/INDEX.md at any depth), for check 7's
 * `defs:` resolution — argument.py:506-514 `load_def_ids`. A definitions shard with absent/
 * unterminated frontmatter or no `id:` is silently skipped here (defs gate owns validating ITS OWN
 * shards; this is only a lookup table).
 *
 * RECURSIVE since rk-5lzf (LB5): the notation register lives at
 * `definitions/notation/<symbol-id>.md`, and the former one-level `listDir` scan meant a result
 * shard naming one of those ids in `defs:` got Gate 2 check 7's "unknown def id" ERROR for a shard
 * that plainly exists. Ids stay flat (the filename STEM, never the nested path) — Gate 1's own
 * id==stem check uses the same convention. */
export function loadDefIds(snapshot: RepoSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const path of listFilesRecursive(snapshot, "definitions", ".md")) {
    const name = baseName(path);
    if (name === "README.md" || name === "INDEX.md") continue;
    const content = snapshot.get(path);
    if (content === undefined) continue;
    const fm = parseFrontmatter(content);
    if (fm.present && fm.terminated && fm.fields.id) ids.add(fm.fields.id);
  }
  return ids;
}
