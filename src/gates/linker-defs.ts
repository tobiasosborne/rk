// PURITY: pure — no fs/network/clock (L3). Split from linker-parse.ts (rk-c83, hard-cap-280 wave):
// the `definitions/**/*.md` id lookup table — a DIFFERENT job from parsing `argument/` shards
// (different directory, different registry, used only as a lookup for Gate 2 check 7's `defs:`
// resolution). Ground truth: docs/gate-contracts.md "Gate 2 — argument / linker" check 7, ported
// from argument.py:506-514 `load_def_ids`.

import { readDefinitionShards } from "./definitions-scan";
import type { RepoSnapshot } from "./snapshot";

/** `definitions/**\/*.md` id set for check 7's `defs:` resolution — argument.py:506-514
 * `load_def_ids`. A definitions shard with absent/unterminated frontmatter or no `id:` is silently
 * skipped here (defs gate owns validating ITS OWN shards; this is only a lookup table).
 *
 * Discovery, the non-shard policy, and the recursion all come from the ONE canonical reader
 * (src/gates/definitions-scan.ts, rk-5lzf B6) — this module must never grow a second scan that
 * could disagree with Gate 1's about which files are shards. A DUPLICATE flat id collapses into a
 * single set entry here by construction; that is why `idCollisions` exists and why Gate 1 raises
 * it as a structural `def-id-collision` (Tier A review 2026-08-20, finding 6).
 */
export function loadDefIds(snapshot: RepoSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const shard of readDefinitionShards(snapshot)) {
    if (shard.id !== undefined) ids.add(shard.id);
  }
  return ids;
}
