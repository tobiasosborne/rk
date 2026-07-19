import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBdSource } from "../../src/store/bd-load";

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "rk-bd-load-test-"));
}

describe("loadBdSource", () => {
  test("reads real issue rows, skips memory rows, counts every line", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".beads"), { recursive: true });
    const lines = [
      JSON.stringify({ _type: "memory", key: "k", value: "v" }),
      JSON.stringify({ id: "rk-abc", issue_type: "task", status: "open" }),
      JSON.stringify({ id: "aism-047", issue_type: "task", status: "closed" }),
    ].join("\n");
    writeFileSync(join(root, ".beads", "issues.jsonl"), `${lines}\n`);
    const source = loadBdSource(root);
    expect(source.present).toBe(true);
    if (!source.present) throw new Error("unreachable");
    expect(source.totalRecords).toBe(3);
    expect(source.issues).toEqual([
      { id: "rk-abc", status: "open" },
      { id: "aism-047", status: "closed" },
    ]);
    rmSync(root, { recursive: true, force: true });
  });

  test("absent .beads/issues.jsonl is a distinct, visible state", () => {
    const root = tempRoot();
    const source = loadBdSource(root);
    expect(source.present).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});
