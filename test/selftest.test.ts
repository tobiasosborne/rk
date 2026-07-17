import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPurity } from "../scripts/selftest";

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
});
