// ROLE: THE canonical `definitions/**` reader. One recursive scan, one non-shard policy, one
// id-collision rule — reused by Gate 1 (src/gates/defs.ts), Gate 2's def-id lookup
// (src/gates/linker-defs.ts), Gate 9 (src/gates/notation.ts), the notation register parser
// (src/gates/notation-shards.ts), the live verifier's definition context
// (src/cli/verify-live-io.ts), and the HTML definitions view (src/render/defs-edge.ts).
// Contract: docs/gate-contracts.md Gate 1 "Inputs". PURITY: pure — no fs/network/clock (L3).
//
// WHY IT EXISTS (rk-5lzf repair wave, blocker B6; Tier A review 2026-08-20 finding 6). After the
// first pass of this bead, Gate 1 and `loadDefIds` recursed while the live verifier and the
// renderer still read one level — so a definition Gate 2 happily RESOLVED could be silently
// missing from the prompt the prover actually sees and from the generated definitions view. Two
// readers with different reach over the same directory is a false-green generator: the gate says
// the reference is fine, and the artifact built from it does not contain the definition. A second
// hole rode along: the two recursive readers keyed shards by FLAT id, so two files at different
// depths with the same id collapsed into one `Set` entry with no complaint at all.
//
// THE NON-SHARD POLICY, stated once. `README.md`, `INDEX.md` and `DAG.md` are documentation or
// generated mirrors; a basename starting with `_` is the scratch/partial convention; a basename
// starting with `notes` is a lab-notebook file. All four are skipped AT ANY DEPTH, by BASENAME.
// Before this, Gate 1 skipped only README/INDEX (so `DAG.md` and `notes.md` were parsed as shards
// and reported missing-field ERRORs) while Gate 9 skipped README/INDEX/DAG (so the same tree gave
// two different answers to "is this a shard"). Anything else ending in `.md` IS a shard: the
// policy is a closed list, never a guess about what looks authored.

import { baseName, listFilesRecursive, parseFrontmatter, type RepoSnapshot } from "./snapshot";

export const DEFINITIONS_DIR = "definitions";

/** Exact basenames that are never a shard, at any depth. */
const NON_SHARD_EXACT: ReadonlySet<string> = new Set(["README.md", "INDEX.md", "DAG.md"]);
/** Basename PREFIXES (case-insensitive) that are never a shard, at any depth. */
const NON_SHARD_PREFIXES = ["_", "notes"] as const;

/** The ONE shared non-shard test. Exported so every consumer — Gate 1, Gate 9, the linker's
 * lookup, the verifier's context reader, the renderer — asks the same question and gets the same
 * answer. `base` is a BASENAME, not a path. */
export function isNonShardBasename(base: string): boolean {
  if (NON_SHARD_EXACT.has(base)) return true;
  const lower = base.toLowerCase();
  return NON_SHARD_PREFIXES.some((p) => lower.startsWith(p));
}

/** Every `definitions/**\/*.md` path that IS a shard, sorted. */
export function definitionShardPaths(snapshot: RepoSnapshot): string[] {
  return listFilesRecursive(snapshot, DEFINITIONS_DIR, ".md").filter((p) => !isNonShardBasename(baseName(p)));
}

export interface DefinitionShard {
  /** Repo-relative path, e.g. `definitions/notation/sym-eps.md`. */
  path: string;
  /** Filename stem (`sym-eps`) — what `id:` must equal. */
  stem: string;
  /** Frontmatter `id:`, trimmed; `undefined` when absent, blank, or unparseable. */
  id?: string;
  /** Raw file text. */
  content: string;
  /** Flat frontmatter fields (empty when the block is absent/unterminated). */
  fields: Record<string, string>;
  /** False when the frontmatter block is absent or unterminated — Gate 1 owns that ERROR; this
   * reader never drops the shard, so the file stays in every consumer's denominator. */
  frontmatterOk: boolean;
  /** 1-indexed lines inside the frontmatter block carrying no `:` (Gate 1 check 2). */
  malformedLines: number[];
}

/** Reads every definition shard, in path order. Never throws, never drops: a shard whose
 * frontmatter cannot be parsed comes back with `frontmatterOk: false` and no `id`, because a
 * reader that silently omitted it would shrink every consumer's denominator at once. */
export function readDefinitionShards(snapshot: RepoSnapshot): DefinitionShard[] {
  const out: DefinitionShard[] = [];
  for (const path of definitionShardPaths(snapshot)) {
    const content = snapshot.get(path);
    if (content === undefined) continue;
    const base = baseName(path);
    const fm = parseFrontmatter(content);
    const ok = fm.present && fm.terminated;
    const id = ok ? fm.fields.id?.trim() : undefined;
    out.push({
      path,
      stem: base.slice(0, -".md".length),
      ...(id ? { id } : {}),
      content,
      fields: ok ? fm.fields : {},
      frontmatterOk: ok,
      malformedLines: fm.malformedLines,
    });
  }
  return out;
}

export interface IdCollision {
  id: string;
  /** Every shard claiming `id`, sorted by path. Length >= 2 by construction. */
  paths: string[];
}

/** Flat ids claimed by more than one shard. Gate 1 turns each into a STRUCTURAL
 * `def-id-collision` ERROR: ids are the cross-reference key every other gate addresses a
 * definition by (`defs:` in Gate 2, the verifier's context, the rendered view), and two files
 * answering to one id means every one of those consumers silently picks whichever it saw last. */
export function idCollisions(shards: readonly DefinitionShard[]): IdCollision[] {
  const byId = new Map<string, string[]>();
  for (const shard of shards) {
    if (shard.id === undefined) continue;
    const paths = byId.get(shard.id);
    if (paths) paths.push(shard.path);
    else byId.set(shard.id, [shard.path]);
  }
  return [...byId.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([id, paths]) => ({ id, paths: [...paths].sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
