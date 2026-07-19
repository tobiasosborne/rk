// EDGE — fs (via src/store/snapshot-load.ts). Reads the registry source (`argument/**/*.md`
// shards + `definitions/*.md` ids) off a real repo root, reusing the EXISTING snapshot +
// frontmatter machinery (src/store/snapshot-load.ts's `loadSnapshot`, src/gates/linker-parse.ts's
// `parseRegistry`/`loadDefIds`) rather than forking a second frontmatter parser — M2.2's own
// brief names this explicitly. This module owns NOTHING new about frontmatter grammar; it is a
// thin composition edge that also hands back the same `RepoSnapshot` so a caller (src/store/
// af-load.ts) can reuse the already-walked `proofs/**` subtree for the ledger fallback without a
// second filesystem walk.

import { loadDefIds, parseRegistry, type Lemma, type ParseRegistryResult } from "../gates/linker-parse";
import type { RepoSnapshot } from "../gates/snapshot";
import { loadSnapshot } from "./snapshot-load";

export interface RegistrySource {
  snapshot: RepoSnapshot;
  lemmas: Lemma[];
  /** Parse-stage Findings (Gate 2 checks 1-5) — surfaced so a caller can report "N shards, M
   * parse-level findings" rather than silently proceeding as if every shard read cleanly. This
   * reader does not interpret them; `rk check` already does that job. */
  parseFindings: ParseRegistryResult["errors"];
  /** Candidate count considered (every non-excluded `argument/**\/*.md` file) — the same
   * "total" `parseRegistry` reports, so a caller can print "N/N shards read", never a silent
   * partial read. */
  total: number;
  ignored: string[];
  defIds: Set<string>;
}

/** Reads `root`'s registry source. `root` absence, an empty `argument/` tree, and zero
 * `definitions/` shards are all legitimate states (a fresh `rk init`) — never an error, mirroring
 * every other edge in src/store/. */
export function loadRegistrySource(root: string): RegistrySource {
  const snapshot = loadSnapshot(root);
  const { lemmas, errors, total, ignored } = parseRegistry(snapshot);
  const defIds = loadDefIds(snapshot);
  return { snapshot, lemmas, parseFindings: errors, total, ignored, defIds };
}
