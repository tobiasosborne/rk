import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

describe("rk check", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test("with all six gates still stubs, exits 0 and prints a loud NOT IMPLEMENTED per gate", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-check-test-"));
    dirs.push(root);
    mkdirSync(join(root, "definitions"), { recursive: true });
    writeFileSync(join(root, "definitions", "a.md"), "---\nid: a\n---\n");

    const { out, lines } = capture();
    const code = await run(["check", "--root", root], { out });
    expect(code).toBe(0);
    const text = lines.join("\n");
    // Ordered per check-all.sh: defs, refs, argument(linker), runs, provenance, report-shards.
    expect(text).toContain("gate defs: NOT IMPLEMENTED");
    expect(text).toContain("gate refs: NOT IMPLEMENTED");
    expect(text).toContain("gate linker: NOT IMPLEMENTED");
    expect(text).toContain("gate runs: NOT IMPLEMENTED");
    expect(text).toContain("gate provenance: NOT IMPLEMENTED");
    expect(text).toContain("gate shards: NOT IMPLEMENTED");
    expect(text).toContain("rk check: OK");
  });

  test("'rk check' with no --root defaults to cwd and still exits 0 on an empty tree", async () => {
    const { out, lines } = capture();
    const code = await run(["check", "--root", mkdtempSync(join(tmpdir(), "rk-check-empty-"))], { out });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("rk check: OK");
  });

  test("top-level help now mentions 'rk check' as a next step", async () => {
    const { out, lines } = capture();
    const code = await run([], { out });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("rk check");
  });
});
