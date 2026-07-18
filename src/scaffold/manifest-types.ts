// PURITY: pure — no fs/network/clock (L3). Shared TS shape for `templates/manifest.json` (M1.2's
// input contract) — one place both `src/scaffold/plan.ts` and `src/cli/upgrade.ts` import from,
// so the two never quietly disagree about the manifest's shape.

export type StampedClassification = "authored-append-only" | "rewritten-whole" | "generated" | "directory";

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

export interface Manifest {
  template_version: string;
  slot_syntax: string;
  unfilled_slot_grep: string;
  note: string;
  slots: SlotDef[];
  stamped: StampedEntry[];
}
