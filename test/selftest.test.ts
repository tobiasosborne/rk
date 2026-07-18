import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkGatesDirImpureAllowlist, checkPurity, violatingFileCount } from "../scripts/selftest";
import type { PurityViolation } from "../scripts/selftest";

function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "rk-selftest-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}

describe("checkPurity", () => {
  test("only scans files carrying the '// PURITY: pure' marker in their first lines", () => {
    const root = makeTree({
      "src/refs/pure-mod.ts": "// PURITY: pure — no fs/network/clock (L3).\nexport const x = 1;\n",
      "src/refs/edge-mod.ts": "// EDGE — touches fs.\nimport { readFileSync } from 'node:fs';\n",
    });
    const { checked, violations } = checkPurity(root);
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain("pure-mod.ts");
    expect(violations).toHaveLength(0);
    rmSync(root, { recursive: true, force: true });
  });

  test("flags a forbidden pattern (node: import) inside a file that claims purity", () => {
    const root = makeTree({
      "src/refs/lying.ts": "// PURITY: pure — no fs/network/clock (L3).\nimport { readFileSync } from 'node:fs';\n",
    });
    const { violations } = checkPurity(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.pattern).toContain("node:");
    expect(violations[0]!.line).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });

  test("flags Date./process./Bun. usage inside a claimed-pure file", () => {
    const root = makeTree({
      "src/refs/a.ts": "// PURITY: pure\nconst t = Date.now();\n",
      "src/refs/b.ts": "// PURITY: pure\nconst p = process.env.X;\n",
      "src/refs/c.ts": "// PURITY: pure\nconst h = Bun.hash('x');\n",
    });
    const { violations } = checkPurity(root);
    expect(violations.map((v) => v.file.split("/").pop())).toEqual(
      expect.arrayContaining(["a.ts", "b.ts", "c.ts"]),
    );
    rmSync(root, { recursive: true, force: true });
  });

  test("a file without the marker is never checked, even if it uses forbidden patterns", () => {
    const root = makeTree({
      "src/refs/plain-edge.ts": "// no marker here\nimport { readFileSync } from 'node:fs';\n",
    });
    const { checked, violations } = checkPurity(root);
    expect(checked).toHaveLength(0);
    expect(violations).toHaveLength(0);
    rmSync(root, { recursive: true, force: true });
  });

  test("the real src/ tree is currently clean (regression guard on rk's own code)", () => {
    const { checked, violations } = checkPurity(join(import.meta.dir, ".."));
    expect(checked.length).toBeGreaterThan(0); // at least the M0.6 pure modules exist
    expect(violations).toEqual([]);
  });

  // rk-bdd: a prior version of this scan only looked at each file's first 5 lines for the
  // marker. src/gates/{defs,refs,linker,runs}.ts (6-8 lines of header prose) and provenance.ts
  // (9 lines) all carry the marker past that window — meaning `checkPurity` silently never
  // scanned five of the six real gate implementations for forbidden patterns at all, despite them
  // declaring purity. This reproduces that shape directly (a marker on line 7) rather than
  // relying on rk's own gate files staying exactly this long forever.
  test("finds the 'PURITY: pure' marker anywhere in the leading comment block, not just the first 5 lines", () => {
    const root = makeTree({
      "src/refs/long-header.ts":
        "// line 1\n// line 2\n// line 3\n// line 4\n// line 5\n// line 6\n// PURITY: pure — no fs/network/clock (L3).\nimport { readFileSync } from 'node:fs';\n",
    });
    const { checked, violations } = checkPurity(root);
    expect(checked).toHaveLength(1);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.pattern).toContain("node:");
    rmSync(root, { recursive: true, force: true });
  });

  // M0.3 round-3 review follow-up 4 (selftest.ts:163): a file with MULTIPLE forbidden-pattern
  // matches must still only ever count as ONE unclean file for the "pure files clean" numerator
  // — the pre-fix arithmetic (`checked.length - violations.length`) treated N matches in one
  // file as N unclean files, understating (or driving negative) the reported count.
  test("checkPurity + violatingFileCount: one file with multiple forbidden-pattern matches counts as exactly one violating file", () => {
    const root = makeTree({
      "src/refs/multi-violation.ts":
        "// PURITY: pure — no fs/network/clock (L3).\n" +
        "import { readFileSync } from 'node:fs';\n" +
        "const now = Date.now();\n" +
        "console.log(process.env.FOO);\n",
      "src/refs/clean.ts": "// PURITY: pure — no fs/network/clock (L3).\nexport const x = 1;\n",
    });
    const { checked, violations } = checkPurity(root);
    expect(checked).toHaveLength(2);
    // Three separate forbidden-pattern matches (node:, Date., process.), all in the same file.
    expect(violations.length).toBeGreaterThanOrEqual(3);
    expect(new Set(violations.map((v) => v.file)).size).toBe(1);

    // The pre-fix numerator (`checked.length - violations.length` = 2 - 3 = -1) was already
    // wrong/negative here; the fixed numerator counts unique files: 2 checked - 1 violating = 1.
    const filesClean = checked.length - violatingFileCount(violations);
    expect(filesClean).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  test("violatingFileCount: pure function over a synthetic PurityViolation[] — empty input, single file, multi-file", () => {
    expect(violatingFileCount([])).toBe(0);

    const oneFileThreeHits: PurityViolation[] = [
      { file: "a.ts", line: 1, pattern: "node:", text: "" },
      { file: "a.ts", line: 2, pattern: "Date.", text: "" },
      { file: "a.ts", line: 3, pattern: "process.", text: "" },
    ];
    expect(violatingFileCount(oneFileThreeHits)).toBe(1);

    const twoFiles: PurityViolation[] = [
      { file: "a.ts", line: 1, pattern: "node:", text: "" },
      { file: "b.ts", line: 1, pattern: "node:", text: "" },
    ];
    expect(violatingFileCount(twoFiles)).toBe(2);
  });
});

describe("checkGatesDirImpureAllowlist (rk-bdd finding 6)", () => {
  test("flags a non-test .ts file directly in src/gates/ that is neither PURITY-marked nor allowlisted", () => {
    const root = makeTree({
      "src/gates/rogue-edge.ts": "// EDGE — touches fs, landed here by mistake.\nimport { readFileSync } from 'node:fs';\n",
    });
    const { checked, violations } = checkGatesDirImpureAllowlist(root);
    expect(checked.map((f) => f.split("/").pop())).toContain("rogue-edge.ts");
    expect(violations.map((v) => v.file.split("/").pop())).toContain("rogue-edge.ts");
    rmSync(root, { recursive: true, force: true });
  });

  test("a PURITY-marked file in src/gates/ is never flagged", () => {
    const root = makeTree({
      "src/gates/pure-gate.ts": "// PURITY: pure — no fs/network/clock (L3).\nexport const x = 1;\n",
    });
    const { violations } = checkGatesDirImpureAllowlist(root);
    expect(violations).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });

  test("load.ts / config-load.ts are allowlisted (documented, deliberate edges, not yet relocated)", () => {
    const root = makeTree({
      "src/gates/load.ts": "// EDGE — fs.\nimport { readFileSync } from 'node:fs';\n",
      "src/gates/config-load.ts": "// EDGE — fs.\nimport { readFileSync } from 'node:fs';\n",
    });
    const { violations } = checkGatesDirImpureAllowlist(root);
    expect(violations).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });

  test("the real src/gates/ tree is currently clean: every file is either PURITY-marked or allowlisted (regression guard for the corpus-run.ts/corpus-discovery.ts placement bug this WP fixed)", () => {
    const { checked, violations } = checkGatesDirImpureAllowlist(join(import.meta.dir, ".."));
    expect(checked.length).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});
