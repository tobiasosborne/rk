// scripts/selftest.ts — `bun run selftest`. The L3 purity grep + the corpus red-fixture runner.
// CLAUDE.md §4: "bun test + bun run selftest ... all three green before any commit that claims
// a WP step." L2's coverage-reporting mandate applies here too: every check prints exactly one
// final coverage line, even at N=0 (an empty corpus on day one is a legitimate green state, not
// a silent skip).
//
// rk-6vw (2026-07-18 M0.3 milestone review, finding 6 — "guard-the-guards lie"):
// corpus/README.md:13 has always claimed "`rk check --selftest` runs the corpus", but this file
// used to only COUNT fixture directories (`totalFixtureCount`), never actually run a single one
// through its gate. It now calls `runAllFixtures` (src/corpus/run.ts) — the exact same
// runner test/corpus.test.ts uses per-fixture via `expect()` — so this script and the test suite
// can never silently disagree about what "the corpus passes" means.
//
// Purity convention: a file opts into the check by starting with a `// PURITY: pure` comment
// anywhere in its leading comment block (`headerBlock` below) — src/refs/{checksum,lock,manifest,
// quote,path-safety}.ts, src/types.ts, and (as of M0.3) src/gates/{framework,snapshot,config,
// defs,linker,refs,provenance,runs,shards}.ts all do this; src/graph (M2.1) will adopt the same
// marker rather than a new mechanism. A file without the marker is never scanned (an EDGE file
// legitimately uses fs/network/clock).
//
// rk-bdd (2026-07-18 M0.3 re-review, finding 6): the corpus harness (discovery + per-fixture
// runner) used to live at src/gates/{corpus-discovery,corpus-run}.ts — fs-using files silently
// exempt from the marker scan above, sitting inside src/gates/, which CLAUDE.md §5 and
// IMPLEMENTATION_PLAN.md §0 both classify PURE. That was an architecture-law regression (an
// unmarked file there reads as "forgot the marker", not "correctly placed edge code"). Both now
// live at src/corpus/{discovery,run}.ts instead — edge territory, same tier as src/drive/
// src/refs/src/cli. `checkGatesDirImpureAllowlist` below closes the hole that let this regression
// stay silent: any future non-pure file landing directly in src/gates/ now fails loudly unless
// it is in the allowlist, instead of just never being scanned by `checkPurity`.
// src/gates/{load,config-load}.ts remain the only fs-using files still inside src/gates/ — see
// their own module doc comments for why they were not moved in this pass (bd rk follow-up).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { totalFixtureCount } from "../src/corpus/discovery";
import { runAllFixtures } from "../src/corpus/run";
import { formatCorpusRunReport } from "../src/corpus/report";

const PURITY_MARKER = "PURITY: pure";
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

/** The file's leading comment block: every contiguous line from the top that is blank or starts
 * with `//`, stopping at the first line of real code. `PURITY_MARKER`/`GATES_DIR_IMPURE_ALLOWLIST`
 * detection both scan this (not a fixed line count — found empirically while wiring
 * `checkGatesDirImpureAllowlist` in: `src/gates/{defs,refs,linker,runs}.ts`'s header runs 6-8
 * lines and `provenance.ts`'s runs 9, all past a fixed 5-line window a prior version of this
 * scan used, which silently never checked those five files at all despite their marker — an L2
 * regression this fix closes). */
function headerBlock(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith("//") || line.trim() === "") {
      out.push(line);
    } else {
      break;
    }
  }
  return out.join("\n");
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
    if (!headerBlock(text).includes(PURITY_MARKER)) continue;
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

/** Non-test .ts files directly under src/gates/ that are known, deliberate, fs-using edges
 * (documented `// EDGE —` header, never marked `PURITY: pure`) and therefore legitimately absent
 * from `checkPurity`'s scan. Any OTHER unmarked file appearing in src/gates/ is the exact
 * regression rk-bdd finding 6 flagged: an impure module silently exempted from the purity grep
 * by never opting in, rather than visibly flagged as out of place. Keep this list short — the
 * fix for a new impure gate-adjacent module is almost always to relocate it (src/corpus/ or
 * another edge directory), the way corpus-run.ts/corpus-discovery.ts were relocated, not to grow
 * this allowlist. */
const GATES_DIR_IMPURE_ALLOWLIST = new Set(["load.ts", "config-load.ts"]);

export interface GatesDirViolation {
  file: string;
}

/** Scans `<repoRoot>/src/gates/` (direct children only — it has no subdirectories) for a non-test
 * `.ts` file that is neither `PURITY: pure`-marked nor in `GATES_DIR_IMPURE_ALLOWLIST`. Returns
 * both the checked file list (coverage) and any violation. This is a directory-placement check,
 * distinct from `checkPurity`'s marker-content check above: it is the thing that would have
 * caught corpus-run.ts/corpus-discovery.ts landing in src/gates/ in the first place. */
export function checkGatesDirImpureAllowlist(repoRoot: string): { checked: string[]; violations: GatesDirViolation[] } {
  const gatesDir = join(repoRoot, "src", "gates");
  let names: string[];
  try {
    names = readdirSync(gatesDir);
  } catch {
    return { checked: [], violations: [] };
  }
  const checked: string[] = [];
  const violations: GatesDirViolation[] = [];
  for (const name of names) {
    if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
    const file = join(gatesDir, name);
    checked.push(file);
    if (headerBlock(readFileSync(file, "utf8")).includes(PURITY_MARKER)) continue; // checkPurity already covers it
    if (GATES_DIR_IMPURE_ALLOWLIST.has(name)) continue; // documented, deliberate edge file
    violations.push({ file });
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

  // rk-bdd (finding 6): src/gates/ is a PURE directory (CLAUDE.md §5) — any non-test .ts file
  // there that is neither PURITY-marked nor a documented allowlisted edge (load.ts,
  // config-load.ts) is a silent-exemption regression, the same class corpus-run.ts/
  // corpus-discovery.ts were before this WP relocated them to src/corpus/.
  const { checked: gatesDirChecked, violations: gatesDirViolations } = checkGatesDirImpureAllowlist(repoRoot);
  for (const v of gatesDirViolations) {
    console.log(
      `ERROR ${relative(repoRoot, v.file)}:1 impure file directly in src/gates/ (PURE per CLAUDE.md ` +
        `§5) is neither PURITY-marked nor in scripts/selftest.ts's documented allowlist — relocate ` +
        `it (e.g. src/corpus/) or add it to the allowlist with a reason`,
    );
  }
  errors += gatesDirViolations.length;
  console.log(
    `checked gates-dir-purity: ${gatesDirChecked.length - gatesDirViolations.length}/${gatesDirChecked.length} ` +
      `src/gates/ files pure-or-allowlisted (${gatesDirViolations.length} errors)`,
  );

  // Corpus fixture count (M0.3): discovers corpus/<gate>/<fixture>/ the same way
  // test/corpus.test.ts does (both call src/corpus/discovery.ts — one implementation, so
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
  // via the SAME runner test/corpus.test.ts (and `rk check --selftest`, src/cli/check.ts) uses
  // (src/corpus/run.ts's `runFixture`/`runAllFixtures`), never a second implementation that could
  // quietly drift from it. Reports one pass-count line per gate plus an aggregate, and fails
  // loudly — printing every fixture's own error list — on any mismatch, rather than silently
  // counting directories the way this script used to. `runFixture` itself never throws (rk-bdd
  // finding 8: a per-fixture exception boundary converts any crash into that fixture's own error
  // entry), so a crashing fixture no longer aborts this sweep before later fixtures run.
  const results = await runAllFixtures(corpusRoot);
  const { lines: corpusReportLines, errorCount: corpusRunFailures } = formatCorpusRunReport(results);
  for (const line of corpusReportLines) console.log(line);
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
