import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSnapshot } from "../src/gates/load";

function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "rk-load-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}

describe("loadSnapshot", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test("loads definitions/*.md non-recursively", () => {
    const root = makeTree({
      "definitions/a.md": "A",
      "definitions/sub/nested.md": "should not be loaded (definitions/ is non-recursive)",
    });
    dirs.push(root);
    const snap = loadSnapshot(root);
    expect(snap.get("definitions/a.md")).toBe("A");
    expect(snap.has("definitions/sub/nested.md")).toBe(false);
  });

  test("loads argument/{INDEX,DAG}.md and argument/lemmas/*.md, but does not double-recurse", () => {
    const root = makeTree({
      "argument/INDEX.md": "index",
      "argument/DAG.md": "dag",
      "argument/lemmas/lem-x.md": "lemma x",
    });
    dirs.push(root);
    const snap = loadSnapshot(root);
    expect(snap.get("argument/INDEX.md")).toBe("index");
    expect(snap.get("argument/DAG.md")).toBe("dag");
    expect(snap.get("argument/lemmas/lem-x.md")).toBe("lemma x");
  });

  test("loads proofs/** recursively (ledger jsons, meta.json, externals jsons)", () => {
    const root = makeTree({
      "proofs/lem-x/meta.json": "{}",
      "proofs/lem-x/ledger/000001.json": "{}",
      "proofs/lem-x/externals/GT-1.json": "{}",
    });
    dirs.push(root);
    const snap = loadSnapshot(root);
    expect(snap.get("proofs/lem-x/meta.json")).toBe("{}");
    expect(snap.get("proofs/lem-x/ledger/000001.json")).toBe("{}");
    expect(snap.get("proofs/lem-x/externals/GT-1.json")).toBe("{}");
  });

  test("loads refs/manifest/* (defs gate's manifest input)", () => {
    const root = makeTree({ "refs/manifest/checksums.sha256": "deadbeef  refs/x.tex\n" });
    dirs.push(root);
    const snap = loadSnapshot(root);
    expect(snap.get("refs/manifest/checksums.sha256")).toContain("deadbeef");
  });

  test("loads runs/** recursively, including a nested bundle README", () => {
    const root = makeTree({ "runs/2026-07-01-example/README.md": "hypothesis..." });
    dirs.push(root);
    const snap = loadSnapshot(root);
    expect(snap.get("runs/2026-07-01-example/README.md")).toContain("hypothesis");
  });

  test("loads report/** but only .tex/.md files, excluding other extensions", () => {
    const root = makeTree({
      "report/main.tex": "\\documentclass{article}",
      "report/README.md": "readme",
      "report/sections/01_intro.tex": "intro",
      "report/.build/main.pdf": "binary junk", // never loaded: not .tex/.md
    });
    dirs.push(root);
    const snap = loadSnapshot(root);
    expect(snap.get("report/main.tex")).toContain("documentclass");
    expect(snap.get("report/sections/01_intro.tex")).toBe("intro");
    expect(snap.has("report/.build/main.pdf")).toBe(false);
  });

  test("loads the repo-root INDEX.md (runs gate's reverse-lookup input)", () => {
    const root = makeTree({ "INDEX.md": "# Index\n2026-07-01-example" });
    dirs.push(root);
    const snap = loadSnapshot(root);
    expect(snap.get("INDEX.md")).toContain("2026-07-01-example");
  });

  test("an absent directory for any rule is silent, never throws (e.g. day-1 empty runs/)", () => {
    const root = makeTree({ "definitions/a.md": "A" });
    dirs.push(root);
    expect(() => loadSnapshot(root)).not.toThrow();
    const snap = loadSnapshot(root);
    expect([...snap.keys()].some((k) => k.startsWith("runs/"))).toBe(false);
  });

  test("does not pull in files outside the include rules (no kitchen-sink)", () => {
    const root = makeTree({
      "package.json": "{}",
      "definitions/a.md": "A",
      "src/gates/defs.ts": "export {}",
    });
    dirs.push(root);
    const snap = loadSnapshot(root);
    expect(snap.has("package.json")).toBe(false);
    expect(snap.has("src/gates/defs.ts")).toBe(false);
  });
});
