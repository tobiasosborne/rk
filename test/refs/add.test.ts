import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
