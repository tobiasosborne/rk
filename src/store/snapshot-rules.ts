// ROLE: explicit text include rules for snapshot loading. No I/O; whole-tree hash facts are
// independent of these text boundaries.

export interface SnapshotIncludeRule {
  dir: string;
  recursive: boolean;
  extensions?: string[];
}

export const SNAPSHOT_INCLUDE_RULES: readonly SnapshotIncludeRule[] = [
  { dir: "definitions", recursive: true },
  { dir: "argument", recursive: true },
  { dir: "proofs", recursive: true },
  { dir: "refs", recursive: true },
  { dir: "runs", recursive: true },
  { dir: "report", recursive: true, extensions: [".tex", ".md"] },
  { dir: ".rk", recursive: false },
  { dir: ".rk/conventions", recursive: false, extensions: [".json"] },
];
