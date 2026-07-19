// Cross-repo seam fixture (M3.1 repair wave, follow-up 8): "the mirrored severity and category
// bytes currently match Vibefeld exactly. Add a cross-repo seam fixture so future enum drift
// cannot silently pass." src/drive/vocab.ts's SEVERITIES/CATEGORIES sets are documented as
// byte-identical to ../vibefeld's `ChallengeSeverity`/`ChallengeCategory` Go enums
// (internal/schema/{severity,category}.go) — this test reads THOSE SOURCE FILES DIRECTLY (never
// vibefeld's compiled output, never a hand-copied string list rk maintains separately) and fails
// if the two ever diverge, the same "cross-repo smoke test" class CLAUDE.md §5 describes for
// af/fr binaries. Read-only: this test never writes to ../vibefeld (CLAUDE.md rule 2 — cross-repo
// work belongs to the owning repo; reading its source for a drift check is not "work" on it).
//
// Locating ../vibefeld: this test may run from the main rk checkout OR from a nested git worktree
// (`rk/.claude/worktrees/<agent>/...`), which sit at different depths below the common
// `Projects/` ancestor both rk and vibefeld share. `findVibefeldRoot` walks upward from this
// file's own directory checking each ancestor for a `vibefeld/` child, which works at any nesting
// depth. If ../vibefeld cannot be found at all, this test FAILS LOUDLY (never silently skips —
// CLAUDE.md L2's "a silent skip is a bug" applies here even outside the corpus-gate context).

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SEVERITIES, CATEGORIES } from "../../src/drive/vocab";

function findVibefeldRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 20; i++) {
    const candidate = join(dir, "vibefeld");
    if (existsSync(join(candidate, "internal", "schema", "severity.go"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `could not locate ../vibefeld (searched ancestors of ${startDir} for a 'vibefeld/internal/schema/severity.go') — ` +
      "this is a hard failure per CLAUDE.md L2, not a silent skip; if vibefeld is genuinely absent from this " +
      "environment, that is itself a setup problem worth surfacing, not swallowing.",
  );
}

function extractGoStringConstants(source: string, constTypeName: string): Set<string> {
  const re = new RegExp(`\\w+\\s+${constTypeName}\\s*=\\s*"([a-z]+)"`, "g");
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) found.add(m[1]!);
  return found;
}

const vibefeldRoot = findVibefeldRoot(import.meta.dir);

describe("cross-repo seam fixture: severity/category enums byte-match ../vibefeld's Go source", () => {
  test("SEVERITIES matches every string literal assigned to a ChallengeSeverity constant in ../vibefeld/internal/schema/severity.go", () => {
    const source = readFileSync(join(vibefeldRoot, "internal", "schema", "severity.go"), "utf8");
    const goValues = extractGoStringConstants(source, "ChallengeSeverity");
    expect(goValues.size).toBeGreaterThan(0); // sanity: the regex actually found something
    expect(new Set(SEVERITIES)).toEqual(goValues);
  });

  test("CATEGORIES matches every string literal assigned to a ChallengeCategory constant in ../vibefeld/internal/schema/category.go", () => {
    const source = readFileSync(join(vibefeldRoot, "internal", "schema", "category.go"), "utf8");
    const goValues = extractGoStringConstants(source, "ChallengeCategory");
    expect(goValues.size).toBeGreaterThan(0);
    expect(new Set(CATEGORIES)).toEqual(goValues);
  });
});
