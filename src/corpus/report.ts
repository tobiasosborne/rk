// PURITY: pure — no fs/network/clock (L3). Formats a `FixtureRunResult[]` (src/corpus/run.ts)
// into the shared per-gate + aggregate report lines both `bun run selftest` (scripts/
// selftest.ts) and `rk check --selftest` (src/cli/check.ts, rk-bdd finding 7) print — one
// formatter, so the two entry points can never silently disagree about what the corpus-run
// report looks like, same "one implementation" discipline as src/corpus/run.ts itself.

import { GATE_DIRS } from "./discovery";
import type { FixtureRunResult } from "./run";

export interface CorpusRunReport {
  /** Every line to print, in order: per-fixture ERROR lines for any failing fixture, then one
   * `checked corpus/<gate>: <pass>/<total> fixtures passed` line per gate, then one aggregate
   * `checked corpus-run: <pass>/<total> fixtures passed` line. */
  lines: string[];
  /** Count of fixtures with >=1 error (including a crashed fixture, rk-bdd finding 8) — the
   * caller's own error tally / exit-code decision. */
  errorCount: number;
}

/** Builds the shared corpus-run report from `runAllFixtures`'s results. Never throws — a
 * fixture's own crash is already converted into a normal (non-empty-`errors`) `FixtureRunResult`
 * by `runFixture` (rk-bdd finding 8), so this function only ever does string formatting. */
export function formatCorpusRunReport(results: FixtureRunResult[]): CorpusRunReport {
  const lines: string[] = [];
  const byGate = new Map<string, { pass: number; total: number }>();
  for (const g of GATE_DIRS) byGate.set(g, { pass: 0, total: 0 });

  let errorCount = 0;
  for (const r of results) {
    const bucket = byGate.get(r.gate)!;
    if (r.notImplemented) continue; // stub gates: no pass/fail signal yet, excluded from counts
    bucket.total += 1;
    if (r.errors.length === 0) {
      bucket.pass += 1;
    } else {
      errorCount += 1;
      for (const e of r.errors) lines.push(`ERROR corpus/${r.gate}/${r.fixtureId}: ${e}`);
    }
  }
  for (const g of GATE_DIRS) {
    const b = byGate.get(g)!;
    lines.push(`checked corpus/${g}: ${b.pass}/${b.total} fixtures passed`);
  }
  const runTotal = [...byGate.values()].reduce((sum, b) => sum + b.total, 0);
  const runPass = [...byGate.values()].reduce((sum, b) => sum + b.pass, 0);
  lines.push(`checked corpus-run: ${runPass}/${runTotal} fixtures passed`);

  return { lines, errorCount };
}
