import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeStatus } from "../../src/refs/status";
import { sha256Bytes } from "../../src/refs/hash";

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "rk-status-test-"));
  mkdirSync(join(root, "refs", "manifest"), { recursive: true });
  mkdirSync(join(root, "refs", "present-src"), { recursive: true });
  return root;
}

const presentContent = "present payload bytes";
const presentSha = sha256Bytes(new TextEncoder().encode(presentContent));

function writeLock(root: string, extra: string = ""): void {
  writeFileSync(
    join(root, "refs", "manifest", "sources.lock.json"),
    JSON.stringify({
      files: [
        { path: "present-src/a.tex", sha256: presentSha, source_id: "present-src", fetch: null },
        {
          path: "fetchable-src/b.tex",
          sha256: "a".repeat(64),
          source_id: "fetchable-src",
          fetch: { kind: "arxiv-pdf", id: "1234.5678" },
        },
        { path: "missing-src/c.pdf", sha256: "b".repeat(64), source_id: "missing-src", fetch: null },
      ],
    }),
  );
}

describe("computeStatus — the fetch-refs.py --status dry-run port", () => {
  test("classifies present/fetchable/missing exactly per the lock file, no fetching or writing", async () => {
    const root = makeRepo();
    writeFileSync(join(root, "refs", "present-src", "a.tex"), presentContent);
    writeLock(root);
    const rows = await computeStatus(root);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.path === "present-src/a.tex")!.status).toBe("present");
    expect(rows.find((r) => r.path === "fetchable-src/b.tex")!.status).toBe("fetchable");
    expect(rows.find((r) => r.path === "missing-src/c.pdf")!.status).toBe("missing");
    rmSync(root, { recursive: true, force: true });
  });

  test("a file present on disk but with the WRONG hash is not 'present' (must re-derive, never trust a stale copy)", async () => {
    const root = makeRepo();
    writeFileSync(join(root, "refs", "present-src", "a.tex"), "corrupted content, wrong hash");
    writeLock(root);
    const rows = await computeStatus(root);
    expect(rows.find((r) => r.path === "present-src/a.tex")!.status).not.toBe("present");
    rmSync(root, { recursive: true, force: true });
  });

  test("a cache-dir hit classifies as 'cache', checked before 'fetchable'/'missing'", async () => {
    const root = makeRepo();
    writeLock(root);
    const cacheDir = mkdtempSync(join(tmpdir(), "rk-status-cache-"));
    writeFileSync(join(cacheDir, "a".repeat(64)), "cached fetchable-src bytes"); // wrong hash on purpose below
    // Write the ACTUAL bytes whose hash is "a".repeat(64)? We can't forge a preimage — instead
    // verify the cache-dir lookup path is exercised by using computeStatus's own sha check: a
    // file at <cacheDir>/<sha> is only a hit if its content truly hashes to <sha>. So point the
    // cache at the missing-src file instead, using its real hash.
    rmSync(cacheDir, { recursive: true, force: true });
    const cacheDir2 = mkdtempSync(join(tmpdir(), "rk-status-cache2-"));
    const missingContent = "the missing-src payload, seeded into the cache";
    const missingSha = sha256Bytes(new TextEncoder().encode(missingContent));
    writeFileSync(join(cacheDir2, missingSha), missingContent);
    writeFileSync(
      join(root, "refs", "manifest", "sources.lock.json"),
      JSON.stringify({
        files: [{ path: "missing-src/c.pdf", sha256: missingSha, source_id: "missing-src", fetch: null }],
      }),
    );
    const rows = await computeStatus(root, { cacheDir: cacheDir2 });
    expect(rows[0]!.status).toBe("cache");
    rmSync(root, { recursive: true, force: true });
    rmSync(cacheDir2, { recursive: true, force: true });
  });

  test("never writes any file (a true dry run)", async () => {
    const root = makeRepo();
    writeLock(root);
    await computeStatus(root);
    const { existsSync } = await import("node:fs");
    expect(existsSync(join(root, "refs", "fetchable-src"))).toBe(false);
    expect(existsSync(join(root, "refs", "missing-src"))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});
