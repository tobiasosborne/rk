import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRegistrySource } from "../../src/store/registry-load";

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "rk-registry-load-test-"));
}

describe("loadRegistrySource (edge: reuses loadSnapshot + parseRegistry, no second frontmatter parser)", () => {
  test("reads a real argument/ shard and definitions/ id off disk", () => {
    const root = tempRoot();
    mkdirSync(join(root, "argument"), { recursive: true });
    mkdirSync(join(root, "definitions"), { recursive: true });
    writeFileSync(
      join(root, "argument", "lem-x.md"),
      "---\nid: lem-x\nkind: lemma\ncontract: X holds.\naf: none\n---\nBody.\n",
    );
    writeFileSync(join(root, "definitions", "def-x.md"), "---\nid: def-x\nterm: X\nkind: original\nstatus: draft\n---\nBody.\n");
    const source = loadRegistrySource(root);
    expect(source.lemmas.map((l) => l.id)).toEqual(["lem-x"]);
    expect(source.total).toBe(1);
    expect(source.parseFindings).toEqual([]);
    expect(source.defIds.has("def-x")).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  test("an empty tree is a legitimate zero-shard state, not an error", () => {
    const root = tempRoot();
    const source = loadRegistrySource(root);
    expect(source.lemmas).toEqual([]);
    expect(source.total).toBe(0);
    rmSync(root, { recursive: true, force: true });
  });
});
