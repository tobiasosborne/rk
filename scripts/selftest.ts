// scripts/selftest.ts — `bun run selftest`. v0: the L3 purity grep + a placeholder corpus
// check. CLAUDE.md §4: "bun test + bun run selftest ... all three green before any commit
// that claims a WP step." L2's coverage-reporting mandate applies here too: every check
// prints exactly one final coverage line, even at N=0 (an empty corpus on day one is a
// legitimate green state, not a silent skip).
//
// Purity convention: a file opts into the check by starting with a `// PURITY: pure` comment
// (first 5 lines) — src/refs/{checksum,lock,manifest,quote,path-safety}.ts and src/types.ts do
// this today; src/gates and src/graph (M0.3/M2.1) will adopt the same marker rather than a new
// mechanism. A file without the marker is never scanned (an EDGE file legitimately uses fs/
// network/clock). Forbidden patterns: `node:` imports, `Date.`, `process.`, `Bun.`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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

function main(): number {
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

  // Placeholder for the corpus/gate selftest (M0.3 lands `rk check --selftest`; M0.2's fixtures
  // land under corpus/ in a parallel WP). Reported explicitly at N=0 rather than omitted — an
  // empty/not-yet-landed corpus check is a visible, honest state, not a silent skip (L2).
  console.log("checked corpus: 0/0 gate fixtures (rk check --selftest not yet landed — M0.3)");

  if (errors > 0) {
    console.log(`\nrk selftest: FAILED (${errors} error(s)). Fix the purity violation(s) above.`);
    return 1;
  }
  console.log("\nrk selftest: OK");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
