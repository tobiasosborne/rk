// EDGE — fs. Reads `definitions/**/*.md` frontmatter (Gate 1's own field set — id/term/kind/status/
// aliases/source/sha256, src/gates/defs.ts) plus an optional repo-root CONVENTIONS.md, for the
// richer definitions index + conventions ledger views (PRD C6). `GraphDocument.RegistryNode.defs`
// carries only the IDS a shard cites (src/graph/types.ts) — none of term/kind/status/aliases/
// source/sha256 cross the M2.2 join (that data lives only in `definitions/*.md` on disk), so this
// is a genuinely new, presence-conditional data source, read via its own small edge rather than a
// src/graph/ store reader (constraint: src/graph/ is read-only this WP).
//
// This is a DISPLAY-ONLY independent re-parse (same "independent re-parse" precedent as
// src/gates/provenance-parse.ts): it does NOT re-run Gate 1's own validity checks (manifest
// cross-check, DRIFT dedup, cited source/sha256 requiredness) — a def's declared fields are shown
// as declared, honestly, with no verdict attached; `rk check`'s defs gate remains the one place
// that decides pass/fail. `dedupNames`-shaped alias splitting is re-implemented directly (a
// one-line `;`-split) rather than imported, since `src/gates/defs.ts`'s `dedupNames` folds `term`
// into the same list this view keeps separate.
//
// CONVENTIONS.md (templates/CONVENTIONS.md.tmpl, PRD C6 "conventions ledger view") is AUTHORED,
// append-only prose (its own template's UPDATE POLICY) — never machine-readable structured data.
// This edge reads its raw text VERBATIM for an authored-content view; it is never parsed or
// scraped for facts (CLAUDE.md L5 "characterize, don't scrape prose speculatively" — this WP's
// own brief says the same). Absence is a legitimate, honestly-reported state.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readDefinitionShards } from "../gates/definitions-scan";
import { loadSnapshot } from "../store/snapshot-load";

const CONVENTIONS_PATH = "CONVENTIONS.md";

export interface DefRecord {
  id: string;
  path: string;
  term?: string;
  kind?: string;
  status?: string;
  /** `aliases:` split on `;`, trimmed, blanks dropped — `term` itself is NOT folded in here
   * (kept separate so a view can show "Foo (aka Foobar, F)" rather than a flat undifferentiated
   * list). */
  aliases: string[];
  source?: string;
  sha256?: string;
}

export interface DefsData {
  defs: DefRecord[];
  /** Repo-root CONVENTIONS.md's raw text, verbatim. `undefined` iff the file is absent — a
   * legitimate state, never a crash. */
  conventions?: string;
}

function splitAliases(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  return raw.split(";").map((a) => a.trim()).filter((a) => a.length > 0);
}

/** Loads `root`'s definitions index + conventions ledger data. `definitions/` absent entirely
 * degrades to an empty `defs` array (the same day-1-vacuity stance every other reader in this
 * codebase takes), never a crash. */
export function loadDefsData(root: string): DefsData {
  const snapshot = loadSnapshot(root);

  // rk-5lzf B6 (Tier A review 2026-08-20, finding 6): discovery, the non-shard policy, and the
  // recursion come from the ONE canonical reader (src/gates/definitions-scan.ts). This view used
  // to read one level while Gate 1 recursed, so a nested definition the gates validated and
  // resolved was simply MISSING from the generated definitions index -- a rendered artifact
  // quietly narrower than the repo it claims to display, which is the truthful-rendering concern
  // of PRD SC2. The DISPLAY-ONLY stance above is unchanged: this still attaches no verdict.
  const defs: DefRecord[] = readDefinitionShards(snapshot).map((shard) => {
    const f = shard.fields;
    return {
      id: shard.id ?? shard.stem,
      path: shard.path,
      term: f.term,
      kind: f.kind,
      status: f.status,
      aliases: splitAliases(f.aliases),
      source: f.source,
      sha256: f.sha256,
    };
  });

  let conventions: string | undefined;
  try {
    conventions = readFileSync(join(root, CONVENTIONS_PATH), "utf8");
  } catch {
    conventions = undefined;
  }

  return { defs, conventions };
}
