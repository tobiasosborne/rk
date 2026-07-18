// PURITY: pure — no fs/network/clock (L3). M1.2 (`rk init`): the `{{RK_SLOT_<NAME>}}` template
// engine (templates/manifest.json's `slot_syntax`) — substitutes every occurrence of every known
// slot in a template's text, and reports any `{{RK_SLOT_` residue left behind afterward (the
// manifest's own `unfilled_slot_grep` contract: "a match means a slot was missed"). Kept
// deliberately dumb: a literal `{{RK_SLOT_NAME}}` string replace, no templating-language features
// (conditionals, loops) — the manifest names none, and CLAUDE.md L4 (zero runtime deps) rules out
// pulling in a template engine for nine flat substitutions.

/** Substitutes every `{{name}}` occurrence in `text` for the matching value in `slots` (missing
 * keys are simply not replaced — the caller uses `findUnfilledSlots` afterward to detect that,
 * rather than this function silently inventing a placeholder or throwing mid-substitution). */
export function fillTemplate(text: string, slots: Readonly<Record<string, string>>): string {
  let out = text;
  for (const [name, value] of Object.entries(slots)) {
    out = out.split(`{{${name}}}`).join(value);
  }
  return out;
}

/** Scans `text` for the manifest's `unfilled_slot_grep` pattern (`\{\{RK_SLOT_`, i.e. any
 * remaining `{{RK_SLOT_...}}` placeholder) and returns every distinct match. Mutation-proof target
 * (a) of this WP: a slot-filler that leaves a slot unfilled must make this return a non-empty
 * list, and `rk init` must refuse to write when it does (never a silently-empty slot reaching
 * disk). */
export function findUnfilledSlots(text: string): string[] {
  const re = /\{\{RK_SLOT_[A-Z0-9_]+\}\}/g;
  const found = new Set<string>();
  for (const m of text.matchAll(re)) found.add(m[0]);
  return [...found].sort();
}
