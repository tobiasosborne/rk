// EDGE — fs. Discovers `corpus/<gate>/<fixture-id>/` fixture directories (corpus/README.md's
// "Fixture directory layout") for both the corpus test harness (test/corpus.test.ts) and `bun
// run selftest`'s coverage line — one discovery implementation, so the two can never silently
// disagree on the fixture count.
//
// Lives under src/corpus/ (not src/gates/), one level up from this repo's own corpus/ fixture
// tree it discovers: this is an fs-touching harness module, not a gate — src/gates/ is a PURE
// directory per CLAUDE.md §5 and IMPLEMENTATION_PLAN.md §0, and an fs-using file placed inside
// it is silently exempt from the marker-based purity grep (scripts/selftest.ts) rather than
// visibly out of place (2026-07-18 M0.3 re-review finding 6). Moved here (not scripts/) because
// it is shared library code two callers import (test/corpus.test.ts, scripts/selftest.ts,
// src/cli/check.ts's `--selftest`), not a standalone script.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** The six gate directory names under corpus/ — matches each gate's `name` in src/gates/index.ts
 * and the fixture-id prefix (corpus/README.md: "<gate> is one of defs, linker, refs, provenance,
 * runs, shards"). */
export const GATE_DIRS = ["defs", "linker", "refs", "provenance", "runs", "shards"] as const;
export type GateDir = (typeof GATE_DIRS)[number];

export function discoverFixtures(corpusRoot: string, gateDir: string): string[] {
  const dir = join(corpusRoot, gateDir);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => {
      try {
        return statSync(join(dir, n)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

export function discoverAllFixtures(corpusRoot: string): Record<GateDir, string[]> {
  const out = {} as Record<GateDir, string[]>;
  for (const g of GATE_DIRS) out[g] = discoverFixtures(corpusRoot, g);
  return out;
}

export function totalFixtureCount(corpusRoot: string): number {
  const all = discoverAllFixtures(corpusRoot);
  return GATE_DIRS.reduce((sum, g) => sum + all[g]!.length, 0);
}

/** corpus/README.md's ledger total across the six M0 gates. One shared home (M0.3 round-3
 * review follow-up 2, check.ts:89): `bun run selftest` (scripts/selftest.ts) and `rk check
 * --selftest` (src/cli/check.ts) both enforce this exact number against `totalFixtureCount`, so
 * the two entry points can never drift apart on what "the corpus" is expected to contain. A drift
 * between this constant and corpus/README.md's own ledger is itself a bug — bump both together. */
export const EXPECTED_FIXTURE_COUNT = 86;
