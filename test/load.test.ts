import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSnapshot } from "../src/gates/load";
import { fileSha256 } from "../src/gates/snapshot";

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

  test("loads refs/<source-id>/* payload files recursively (refs gate Checks 2-4 input, " +
    "rk-skd)", () => {
    const root = makeTree({
      "refs/src-x/paper.md": "The always-tight hulls K_T(u) and K_O(u) are disjoint.",
      "refs/src-p/sub/approximate_algebras.tex": "\\section{Tight hulls}",
    });
    dirs.push(root);
    const snap = loadSnapshot(root);
    expect(snap.get("refs/src-x/paper.md")).toContain("always-tight hulls");
    expect(snap.get("refs/src-p/sub/approximate_algebras.tex")).toContain("Tight hulls");
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

  // review N1 (BLOCKER): hash-verifiability must NOT be bounded by the include rules. A source
  // payload present on disk but OUTSIDE the include rules AND untracked (makeTree builds a non-git
  // tree, so `git ls-files` returns nothing — every file here is untracked) must still receive a
  // byte-faithful hash fact, so the pure gate can tell "present on disk + stale ⇒ ERROR" from
  // "absent ⇒ WARN" (docs/gate-contracts.md Gate 4 check 4). Text content stays bounded to the
  // include rules (no kitchen-sink); only the hash+dirs FACTS span the whole tree.
  test("hashes every present file, including untracked ones outside the include rules (N1)", () => {
    const root = makeTree({
      "definitions/a.md": "A",
      "notes/data.txt": "untracked payload outside every include rule",
      "top-level-note.md": "also outside the include rules",
    });
    dirs.push(root);
    const snap = loadSnapshot(root);
    // Present on disk => a hash fact exists (mechanically distinguishable from absent).
    expect(fileSha256(snap, "notes/data.txt")).toBeDefined();
    expect(fileSha256(snap, "top-level-note.md")).toBeDefined();
    // ...but NOT pulled into the text map (content stays bounded to the include rules).
    expect(snap.has("notes/data.txt")).toBe(false);
    expect(snap.has("top-level-note.md")).toBe(false);
    // A genuinely-absent path has NO hash fact — the WARN case, never conflated with present.
    expect(fileSha256(snap, "notes/absent.txt")).toBeUndefined();
  });

  test("records every directory (empty ones included) across the whole tree, skipping .git (N1/N2)", () => {
    const root = makeTree({
      "definitions/a.md": "A",
      "notes/deep/data.txt": "x",
      ".git/objects/ab/cdef": "git internals must never be walked",
    });
    dirs.push(root);
    const snap = loadSnapshot(root);
    expect(snap.dirs.has("notes")).toBe(true);
    expect(snap.dirs.has("notes/deep")).toBe(true);
    // .git is a skip-dir: neither recorded nor descended into.
    expect(snap.dirs.has(".git")).toBe(false);
    expect(fileSha256(snap, ".git/objects/ab/cdef")).toBeUndefined();
  });
});
