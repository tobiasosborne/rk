// PURITY: pure — no fs/network/clock (L3). Shared TS shape for `templates/manifest.json` (M1.2's
// input contract) — one place both `src/scaffold/plan.ts` and `src/cli/upgrade.ts` import from,
// so the two never quietly disagree about the manifest's shape.

/** `campaign-seed` (added with template_version 1.4.0) is stamped ONCE with real content the
 * campaign then rewrites in place — the north-star registry shard is the only one today. It is not
 * `authored-append-only` (that class is stamped as an empty skeleton and grows by appending) and
 * emphatically not `rewritten-whole` (re-stamping it would destroy research content), so
 * `computeUpgradeAdvice` files it under never-overwritten, never under diff-and-hand-merge. */
export type StampedClassification =
  | "authored-append-only"
  | "rewritten-whole"
  | "generated"
  | "campaign-seed"
  | "directory";

export interface StampedEntry {
  path: string;
  template: string | null;
  classification: StampedClassification;
}

export interface SlotDef {
  name: string;
  description: string;
  unique: boolean;
}

/** One template_version's user-facing migration notes. `changes` entries are printed verbatim by
 * `rk upgrade`, so each must be self-contained and say what to DO — this is the only channel for a
 * change a per-file diff cannot reveal (a new stamped path absent from the old repo; a new
 * `.rk/config.json` key, which is not a stamped file at all). */
export interface ChangelogEntry {
  version: string;
  changes: string[];
}

export interface Manifest {
  template_version: string;
  slot_syntax: string;
  unfilled_slot_grep: string;
  note: string;
  /** Prose gloss of each `StampedClassification`, for a reader of the manifest. Optional: purely
   * documentary, never consumed by the stamp/upgrade logic. */
  classifications?: Record<string, string>;
  slots: SlotDef[];
  stamped: StampedEntry[];
  changelog_note?: string;
  /** Newest first. Optional so a hand-rolled or older manifest degrades to "no notes" rather than
   * crashing `rk upgrade`. */
  changelog?: ChangelogEntry[];
}
