// scripts/selftest.ts — `bun run selftest`. The L3 purity grep + the corpus red-fixture runner.
// CLAUDE.md §4: "bun test + bun run selftest ... all three green before any commit that claims
// a WP step." L2's coverage-reporting mandate applies here too: every check prints exactly one
// final coverage line, even at N=0 (an empty corpus on day one is a legitimate green state, not
// a silent skip).
//
// rk-6vw (2026-07-18 M0.3 milestone review, finding 6 — "guard-the-guards lie"):
// corpus/README.md:13 has always claimed "`rk check --selftest` runs the corpus", but this file
// used to only COUNT fixture directories (`totalFixtureCount`), never actually run a single one
// through its gate. It now calls `runAllFixtures` (src/gates/corpus-run.ts) — the exact same
// runner test/corpus.test.ts uses per-fixture via `expect()` — so this script and the test suite
// can never silently disagree about what "the corpus passes" means.
//
// Purity convention: a file opts into the check by starting with a `// PURITY: pure` comment
// (first 5 lines) — src/refs/{checksum,lock,manifest,quote,path-safety}.ts, src/types.ts, and
// (as of M0.3) src/gates/{framework,snapshot,config,defs,linker,refs,provenance,runs,shards}.ts
// all do this; src/graph (M2.1) will adopt the same marker rather than a new mechanism. A file
// without the marker is never scanned (an EDGE file legitimately uses fs/network/clock — e.g.
// src/gates/{load,config-load,corpus-discovery,corpus-run}.ts). Forbidden patterns: `node:`
// imports, `Date.`, `process.`, `Bun.`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { totalFixtureCount } from "../src/gates/corpus-discovery";
import { GATE_DIRS, runAllFixtures } from "../src/gates/corpus-run";

const PURITY_MARKER = "PURITY: pure";
const PURITY_MARKER_SCAN_LINES = 5;
const FORBIDDEN: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bnode:/, label: "node:" },
  { pattern: /\bDate\./, label: "Date." },
  { pattern: /\bprocess\./, label: "process." },
  { pattern: /\bBun\./, label: "Bun." },
];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build"]);

export interface PurityViolation {
  file: string;
  line: number;
  pattern: string;
  text: string;
}

function findTsFiles(root: string, dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      findTsFiles(root, p, out);
    } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
      out.push(p);
    }
  }
}

/** Scans every non-test .ts file under `<repoRoot>/src` for the `PURITY: pure` marker in its
 * first few lines; for each marked file, checks every line against the forbidden-pattern list.
 * Returns both the list of files actually checked (for the coverage line) and any violations. */
export function checkPurity(repoRoot: string): { checked: string[]; violations: PurityViolation[] } {
  const srcDir = join(repoRoot, "src");
  const allFiles: string[] = [];
  findTsFiles(repoRoot, srcDir, allFiles);

  const checked: string[] = [];
  const violations: PurityViolation[] = [];
  for (const file of allFiles) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    const header = lines.slice(0, PURITY_MARKER_SCAN_LINES).join("\n");
    if (!header.includes(PURITY_MARKER)) continue;
    checked.push(file);
    lines.forEach((line, i) => {
      for (const { pattern, label } of FORBIDDEN) {
        if (pattern.test(line)) {
          violations.push({ file, line: i + 1, pattern: label, text: line.trim() });
        }
      }
    });
  }
  return { checked, violations };
}

async function main(): Promise<number> {
  const repoRoot = join(import.meta.dir, "..");
  let errors = 0;

  const { checked, violations } = checkPurity(repoRoot);
  for (const v of violations) {
    console.log(`ERROR ${relative(repoRoot, v.file)}:${v.line} forbidden pattern '${v.pattern}' in a PURITY: pure file — ${v.text}`);
  }
  errors += violations.length;
  console.log(
    `checked purity: ${checked.length - violations.length}/${checked.length} pure files clean ` +
      `(${violations.length} errors)`,
  );

  // Corpus fixture count (M0.3): discovers corpus/<gate>/<fixture>/ the same way
  // test/corpus.test.ts does (both call src/gates/corpus-discovery.ts — one implementation, so
  // the two can never silently disagree). corpus/README.md's ledger totals to 84 fixtures across
  // the six M0 gates; a drift from that number means the corpus and its own ledger have gone out
  // of sync, which is itself an ERROR here, not a silent skip (L2).
  const EXPECTED_FIXTURE_COUNT = 84;
  const corpusRoot = join(repoRoot, "corpus");
  const fixtureTotal = totalFixtureCount(corpusRoot);
  if (fixtureTotal !== EXPECTED_FIXTURE_COUNT) {
    console.log(
      `ERROR corpus: discovered ${fixtureTotal} fixtures, expected ${EXPECTED_FIXTURE_COUNT} ` +
        `per corpus/README.md's ledger totals — corpus and ledger have drifted`,
    );
    errors += 1;
  }
  console.log(`checked corpus: ${fixtureTotal}/${EXPECTED_FIXTURE_COUNT} gate fixtures discovered`);

  // Corpus execution (rk-6vw, finding 6): actually run every discovered fixture through its gate
  // via the SAME runner test/corpus.test.ts uses (src/gates/corpus-run.ts's `runFixture`), never
  // a second implementation that could quietly drift from it. Reports one pass-count line per
  // gate plus an aggregate, and fails loudly — printing every fixture's own error list — on any
  // mismatch, rather than silently counting directories the way this script used to.
  const results = await runAllFixtures(corpusRoot);
  const byGate = new Map<string, { pass: number; total: number }>();
  for (const g of GATE_DIRS) byGate.set(g, { pass: 0, total: 0 });
  let corpusRunFailures = 0;
  for (const r of results) {
    const bucket = byGate.get(r.gate)!;
    if (r.notImplemented) continue; // stub gates: no pass/fail signal yet, excluded from counts
    bucket.total += 1;
    if (r.errors.length === 0) {
      bucket.pass += 1;
    } else {
      corpusRunFailures += 1;
      for (const e of r.errors) {
        console.log(`ERROR corpus/${r.gate}/${r.fixtureId}: ${e}`);
      }
    }
  }
  for (const g of GATE_DIRS) {
    const b = byGate.get(g)!;
    console.log(`checked corpus/${g}: ${b.pass}/${b.total} fixtures passed`);
  }
  const runTotal = [...byGate.values()].reduce((sum, b) => sum + b.total, 0);
  const runPass = [...byGate.values()].reduce((sum, b) => sum + b.pass, 0);
  console.log(`checked corpus-run: ${runPass}/${runTotal} fixtures passed`);
  errors += corpusRunFailures;

  if (errors > 0) {
    console.log(`\nrk selftest: FAILED (${errors} error(s)). Fix the violation(s) above.`);
    return 1;
  }
  console.log("\nrk selftest: OK");
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
