import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addSource } from "../../src/refs/add";
import { sha256Bytes } from "../../src/refs/hash";
import { parseChecksumsFile } from "../../src/refs/checksum";
import { parseLockFile } from "../../src/refs/lock";
import { parseManifestTable } from "../../src/refs/manifest";

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "rk-add-test-"));
  mkdirSync(join(root, "refs", "manifest"), { recursive: true });
  writeFileSync(join(root, "refs", "manifest", "sources.lock.json"), JSON.stringify({ files: [] }));
  writeFileSync(join(root, "refs", "manifest", "checksums.sha256"), "");
  writeFileSync(
    join(root, "refs", "manifest", "SOURCES.md"),
    "# SOURCES\n\n## Source registry\n\n| source-id | citation | locator | retrieved | local path | key file (sha256-16) | role |\n|---|---|---|---|---|---|---|\n",
  );
  return root;
}

/** A repo directory with NO refs/ tree at all — what `rk init` produced before this bead's
 * companion fix, and what any hand-made repo looks like before its first source. */
function makeBareRepo(): string {
  return mkdtempSync(join(tmpdir(), "rk-add-bare-"));
}

const mdPath = (root: string) => join(root, "refs", "manifest", "SOURCES.md");
const lockPath = (root: string) => join(root, "refs", "manifest", "sources.lock.json");
const sumsPath = (root: string) => join(root, "refs", "manifest", "checksums.sha256");

describe("addSource — local-file locator (the fully offline route)", () => {
  test("hashes and installs the payload, and updates all three manifest artifacts", async () => {
    const root = makeRepo();
    const srcFile = join(root, "incoming.tex");
    writeFileSync(srcFile, "\\documentclass{article}");
    const expectedSha = sha256Bytes(new TextEncoder().encode("\\documentclass{article}"));

    const result = await addSource(root, srcFile, {
      id: "my-source-2026",
      citation: "A. Author, *A Paper*",
      role: "test fixture",
      retrieved: "2026-07-17",
    });

    expect(result.sourceId).toBe("my-source-2026");
    expect(result.sha256).toBe(expectedSha);
    expect(result.path).toBe("refs/my-source-2026/incoming.tex");

    // payload installed
    const installed = readFileSync(join(root, "refs", "my-source-2026", "incoming.tex"), "utf8");
    expect(installed).toBe("\\documentclass{article}");

    // checksums.sha256 updated
    const checksums = parseChecksumsFile(readFileSync(join(root, "refs", "manifest", "checksums.sha256"), "utf8"));
    expect(checksums).toEqual([{ sha256: expectedSha, path: "my-source-2026/incoming.tex" }]);

    // sources.lock.json updated: local-file => fetch: null, cache-only (AISM convention)
    const lock = parseLockFile(readFileSync(join(root, "refs", "manifest", "sources.lock.json"), "utf8"));
    expect(lock.files).toHaveLength(1);
    expect(lock.files[0]!.fetch).toBeNull();
    expect(lock.files[0]!.sha256).toBe(expectedSha);

    // SOURCES.md updated
    const rows = parseManifestTable(readFileSync(join(root, "refs", "manifest", "SOURCES.md"), "utf8"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sha16).toBe(expectedSha.slice(0, 16));
    expect(rows[0]!.retrieved).toBe("2026-07-17");

    rmSync(root, { recursive: true, force: true });
  });

  test("throws when the local-file locator does not exist (never fabricates a hash)", async () => {
    const root = makeRepo();
    await expect(
      addSource(root, join(root, "does-not-exist.pdf"), { id: "x", retrieved: "2026-07-17" }),
    ).rejects.toThrow();
    rmSync(root, { recursive: true, force: true });
  });
});

describe("addSource — url locator (injected getter, no live network)", () => {
  test("records a reproducible fetch spec pointing at the URL", async () => {
    const root = makeRepo();
    const payload = new TextEncoder().encode("fetched url payload");
    const result = await addSource(root, "https://example.org/paper.pdf", {
      id: "url-source",
      retrieved: "2026-07-17",
      get: async () => payload,
    });
    expect(result.sha256).toBe(sha256Bytes(payload));
    const lock = parseLockFile(readFileSync(join(root, "refs", "manifest", "sources.lock.json"), "utf8"));
    expect(lock.files[0]!.fetch).toEqual({ kind: "url", url: "https://example.org/paper.pdf" });
    rmSync(root, { recursive: true, force: true });
  });
});

describe("addSource — arxiv: locator", () => {
  test("records an arxiv-pdf fetch spec", async () => {
    const root = makeRepo();
    const payload = new TextEncoder().encode("%PDF fake");
    const result = await addSource(root, "arxiv:2007.11433", {
      id: "baake-sumner-2007.11433",
      retrieved: "2026-07-17",
      get: async () => payload,
    });
    expect(result.sha256).toBe(sha256Bytes(payload));
    const lock = parseLockFile(readFileSync(join(root, "refs", "manifest", "sources.lock.json"), "utf8"));
    expect(lock.files[0]!.fetch).toEqual({ kind: "arxiv-pdf", id: "2007.11433" });
    rmSync(root, { recursive: true, force: true });
  });
});

// rk-tyl6 (found live by ../rk-campaign-D): on a fresh scaffold refs/manifest/SOURCES.md does not
// exist, and `add` read it with a bare `Bun.file(...).text()` — no seed-if-absent fallback, unlike
// `adopt`. The ENOENT fired AFTER checksums.sha256 and sources.lock.json had already been written,
// so the tree was left holding two machine pins for a payload with no human-facing manifest row:
// non-atomic partial state. The workaround was to hand-seed SOURCES.md and rerun.
//
// Two separate contracts are asserted here, and they are separate on purpose — the seed alone
// would have fixed the reported symptom while leaving the ordering bug live for every OTHER way
// the SOURCES.md write can fail:
//   (1) seed-if-absent, exactly as `adopt` does it;
//   (2) THE ORDERING INVARIANT — at no intermediate failure point does the tree hold a lock or
//       checksum entry whose SOURCES.md row is missing. All parsing/appending happens before any
//       write, and the row is written before the two machine artifacts.
describe("addSource — fresh scaffold / partial-state ordering (rk-tyl6)", () => {
  test("a repo with no refs/manifest/ at all: seeds SOURCES.md and lands the row (no ENOENT)", async () => {
    const root = makeBareRepo();
    const payload = new TextEncoder().encode("%PDF fresh scaffold");

    const result = await addSource(root, "arxiv:2508.01234", {
      id: "fresh-2508.01234",
      retrieved: "2026-08-14",
      get: async () => payload,
    });

    // The row that used to be lost.
    const rows = parseManifestTable(readFileSync(mdPath(root), "utf8"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.localPath).toBe("refs/fresh-2508.01234/2508.01234.pdf");
    expect(rows[0]!.sha16).toBe(result.sha256.slice(0, 16));
    // The seeded document is a real, re-parseable registry doc, not a bare table fragment.
    const seeded = readFileSync(mdPath(root), "utf8");
    expect(seeded).toContain("ROLE:");
    expect(seeded).toContain("## Source registry");
    // ... and the machine artifacts agree with it.
    expect(parseChecksumsFile(readFileSync(sumsPath(root), "utf8"))).toHaveLength(1);
    expect(parseLockFile(readFileSync(lockPath(root), "utf8")).files).toHaveLength(1);

    rmSync(root, { recursive: true, force: true });
  });

  test("a blank hand-created SOURCES.md is seeded too (the campaign-D `touch` workaround)", async () => {
    const root = makeBareRepo();
    mkdirSync(join(root, "refs", "manifest"), { recursive: true });
    writeFileSync(mdPath(root), "\n  \n");

    await addSource(root, "arxiv:2508.09999", {
      id: "blank-md",
      retrieved: "2026-08-14",
      get: async () => new TextEncoder().encode("bytes"),
    });

    expect(parseManifestTable(readFileSync(mdPath(root), "utf8"))).toHaveLength(1);
    rmSync(root, { recursive: true, force: true });
  });

  // The ordering invariant, proven by making the LAST fallible read/append fail: a SOURCES.md with
  // no `## Source registry` table at all. `appendManifestRow` throws on it — and because every
  // parse/append now happens before the first write, nothing at all reaches disk.
  test("SOURCES.md with no registry table: throws and writes NOTHING (no payload, no lock, no checksums)", async () => {
    const root = makeRepo();
    writeFileSync(mdPath(root), "# SOURCES\n\nprose only, no table\n");

    await expect(
      addSource(root, "arxiv:2508.00001", {
        id: "no-table",
        retrieved: "2026-08-14",
        get: async () => new TextEncoder().encode("bytes"),
      }),
    ).rejects.toThrow();

    expect(existsSync(join(root, "refs", "no-table", "2508.00001.pdf"))).toBe(false);
    expect(parseLockFile(readFileSync(lockPath(root), "utf8")).files).toEqual([]);
    expect(parseChecksumsFile(readFileSync(sumsPath(root), "utf8"))).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });

  // And by making the SOURCES.md WRITE itself fail (a directory sits where the file belongs — the
  // generic stand-in for a full disk / read-only tree): the two machine artifacts must still be
  // untouched, because they are written after it.
  test("when the SOURCES.md write fails, neither the lock nor checksums.sha256 gained the entry", async () => {
    const root = makeRepo();
    rmSync(mdPath(root));
    mkdirSync(mdPath(root)); // EISDIR on write

    await expect(
      addSource(root, "arxiv:2508.00002", {
        id: "unwritable-md",
        retrieved: "2026-08-14",
        get: async () => new TextEncoder().encode("bytes"),
      }),
    ).rejects.toThrow();

    expect(parseLockFile(readFileSync(lockPath(root), "utf8")).files).toEqual([]);
    expect(parseChecksumsFile(readFileSync(sumsPath(root), "utf8"))).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("addSource — doi: locator", () => {
  test("records a url fetch spec pointing at the doi.org resolver", async () => {
    const root = makeRepo();
    const payload = new TextEncoder().encode("doi resolved bytes");
    const result = await addSource(root, "doi:10.1017/apr.2021.39", {
      id: "doi-source",
      retrieved: "2026-07-17",
      get: async () => payload,
    });
    const lock = parseLockFile(readFileSync(join(root, "refs", "manifest", "sources.lock.json"), "utf8"));
    expect(lock.files[0]!.fetch).toEqual({ kind: "url", url: "https://doi.org/10.1017/apr.2021.39" });
    expect(result.sha256).toBe(sha256Bytes(payload));
    rmSync(root, { recursive: true, force: true });
  });
});
