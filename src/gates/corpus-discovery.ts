// EDGE — fs. Discovers `corpus/<gate>/<fixture-id>/` fixture directories (corpus/README.md's
// "Fixture directory layout") for both the corpus test harness (test/corpus.test.ts) and `bun
// run selftest`'s coverage line — one discovery implementation, so the two can never silently
// disagree on the fixture count.

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
