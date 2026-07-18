import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
    // The repo-ROOT .git is the sole skip: neither recorded nor descended into.
    expect(snap.dirs.has(".git")).toBe(false);
    expect(fileSha256(snap, ".git/objects/ab/cdef")).toBeUndefined();
  });

  // round-3 landing-blocker 1 (BLOCKER): the walk skip-set must NOT match basenames anywhere in
  // the tree. A source payload present on disk but shadowed by a coincidental VCS/dep-named parent
  // (e.g. `notes/node_modules/payload.bin`) previously received no hash, so Gate 4 check 4 read it
  // as genuinely absent and downgraded a present+stale source to a WARN false-pass, contradicting
  // gate-contracts.md's "present stale ⇒ ERROR". The skip is now anchored to the repo root and
  // narrowed to `.git` alone; every NESTED same-named directory is walked and hashed.
  test("blocker 1: a NESTED directory named like a VCS/dep dir is still walked and hashed", () => {
    const root = makeTree({
      "notes/node_modules/payload.bin": "shadowed by a coincidental node_modules parent",
      "notes/.svn/payload.tex": "shadowed by a coincidental .svn parent",
      "notes/.hg/payload.md": "shadowed by a coincidental .hg parent",
      "vendor/dep/.git/config": "a nested .git is NOT the repo-root .git — must be walked",
    });
    dirs.push(root);
    const snap = loadSnapshot(root);
    // Every present file gets a hash fact — no path a provenance source row could name is left
    // present-on-disk yet hash-fact-absent (the absolute invariant).
    expect(fileSha256(snap, "notes/node_modules/payload.bin")).toBeDefined();
    expect(fileSha256(snap, "notes/.svn/payload.tex")).toBeDefined();
    expect(fileSha256(snap, "notes/.hg/payload.md")).toBeDefined();
    expect(fileSha256(snap, "vendor/dep/.git/config")).toBeDefined();
  });

  test("blocker 1: ONLY the repo-root .git is skipped (cost driver), not a nested one", () => {
    const root = makeTree({
      ".git/objects/ab/cdef": "root git internals — skipped (cost)",
      "sub/.git/objects/de/adbe": "a nested .git is ordinary content from this root's vantage",
    });
    dirs.push(root);
    const snap = loadSnapshot(root);
    expect(fileSha256(snap, ".git/objects/ab/cdef")).toBeUndefined(); // root .git skipped
    expect(snap.dirs.has(".git")).toBe(false);
    expect(fileSha256(snap, "sub/.git/objects/de/adbe")).toBeDefined(); // nested .git walked
    expect(snap.dirs.has("sub/.git")).toBe(true);
  });

  // round-3 landing-blocker 3 (MAJOR): the walkers used statSync, which FOLLOWS symlinks — a
  // dangling link crashes the walk, a self/parent-referential link recurses forever, and an
  // escaping link reads (or walks) outside the root. `loadSnapshot` runs BEFORE the per-gate
  // exception boundary (src/cli/check.ts), so any such throw kills the whole composed check. The
  // policy is now lstat-based: symlinks are recorded as neither file nor directory and are never
  // followed, so none of the three can throw or escape.
  describe("symlink policy (blocker 3): symlinks are never followed", () => {
    test("a DANGLING symlink does not crash the walk and is not hashed", () => {
      const root = makeTree({ "definitions/a.md": "A" });
      dirs.push(root);
      symlinkSync("./nonexistent-target", join(root, "notes-dangling.md")); // target absent
      // statSync would throw ENOENT here (following the dead link); lstat does not.
      expect(() => loadSnapshot(root)).not.toThrow();
      const snap = loadSnapshot(root);
      expect(fileSha256(snap, "notes-dangling.md")).toBeUndefined();
    });

    test("a CYCLIC (self/parent-referential) symlink terminates, never infinite-recurses", () => {
      const root = makeTree({ "loopdir/real.md": "R" });
      dirs.push(root);
      symlinkSync(join(root, "loopdir"), join(root, "loopdir", "self")); // self -> its own parent dir
      // statSync would follow `self` as a directory and recurse forever (RangeError: stack).
      expect(() => loadSnapshot(root)).not.toThrow();
      const snap = loadSnapshot(root);
      // the real file is still hashed; the symlink is neither hashed nor recorded as a directory.
      expect(fileSha256(snap, "loopdir/real.md")).toBeDefined();
      expect(fileSha256(snap, "loopdir/self")).toBeUndefined();
      expect(snap.dirs.has("loopdir/self")).toBe(false);
    });

    test("an ESCAPING symlink (target outside the root) is not followed — no root escape", () => {
      const outside = mkdtempSync(join(tmpdir(), "rk-load-outside-"));
      dirs.push(outside);
      writeFileSync(join(outside, "secret.txt"), "must never enter the snapshot via a symlink");
      const root = makeTree({ "definitions/a.md": "A" });
      dirs.push(root);
      symlinkSync(join(outside, "secret.txt"), join(root, "escape.md")); // absolute, outside root
      const snap = loadSnapshot(root);
      // statSync would follow and hash the outside file's bytes under "escape.md"; lstat does not.
      expect(fileSha256(snap, "escape.md")).toBeUndefined();
    });

    test("even an IN-TREE symlink to a real file is not followed (policy is: symlinks are content-invisible)", () => {
      const root = makeTree({ "definitions/a.md": "A" });
      dirs.push(root);
      symlinkSync(join(root, "definitions", "a.md"), join(root, "link-to-a.md"));
      const snap = loadSnapshot(root);
      expect(fileSha256(snap, "link-to-a.md")).toBeUndefined();
      expect(snap.has("link-to-a.md")).toBe(false);
    });
  });
});
