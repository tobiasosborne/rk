// PURITY: pure — no fs/network/clock (L3). M1.2 (`rk init`) manifest interpretation: given the
// parsed `templates/manifest.json`, a map of already-read template file contents (keyed by the
// manifest's own `template` field, e.g. "CLAUDE.md.tmpl"), and a resolved slot-value map, computes
// the full stamp plan — every file to write (with its slot-substituted content) and every
// directory to create — WITHOUT touching fs itself. `src/cli/init.ts` is the thin edge that reads
// `templates/*.tmpl` (or, in the compiled binary, the embedded copies —
// `src/scaffold/templates-embed.ts`) into that content map, calls this, and writes the result.

import type { Manifest } from "./manifest-types";
import { fillTemplate, findUnfilledSlots } from "./slots";

export interface PlannedFile {
  path: string;
  content: string;
}

export interface StampPlan {
  files: PlannedFile[];
  dirs: string[];
  /** Non-empty iff ANY stamped file still carries a `{{RK_SLOT_...}}` placeholder after
   * substitution — `src/cli/init.ts` MUST refuse to write anything when this is non-empty (never
   * a silently-unfilled slot reaching disk; mutation-proof target (a) of this WP). Keyed by file
   * path so the caller can report exactly which file(s) and which slot(s). */
  unfilled: { path: string; slots: string[] }[];
}

/** Builds the stamp plan. `templateText` must carry an entry for every non-null `template` named
 * by `manifest.stamped` — a missing one is itself a bug in the manifest/embed pairing, surfaced
 * the same way an unfilled slot is (via `unfilled`, naming the file with a synthetic
 * `<template-missing>` marker) rather than thrown, so `rk init` can report it as one more loud,
 * refuse-to-write finding instead of an uncaught crash. */
export function planStamp(
  manifest: Manifest,
  templateText: Readonly<Record<string, string>>,
  slots: Readonly<Record<string, string>>,
): StampPlan {
  const files: PlannedFile[] = [];
  const dirs: string[] = [];
  const unfilled: { path: string; slots: string[] }[] = [];

  for (const entry of manifest.stamped) {
    if (entry.template === null) {
      dirs.push(entry.path);
      continue;
    }
    const raw = templateText[entry.template];
    if (raw === undefined) {
      unfilled.push({ path: entry.path, slots: ["<template-missing>"] });
      continue;
    }
    const content = fillTemplate(raw, slots);
    const missing = findUnfilledSlots(content);
    if (missing.length > 0) {
      unfilled.push({ path: entry.path, slots: missing });
    }
    files.push({ path: entry.path, content });
  }

  return { files, dirs, unfilled };
}
