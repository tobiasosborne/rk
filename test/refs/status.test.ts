import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeStatus, computeStatusReport, resolveRenamedEnv } from "../../src/refs/status";
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

  test("rejects a path-traversal entry in the lock file rather than joining it blindly (rk-correct divergence from fetch-refs.py, which has no such guard)", async () => {
    const root = makeRepo();
    writeFileSync(
      join(root, "refs", "manifest", "sources.lock.json"),
      JSON.stringify({
        files: [{ path: "../../etc/passwd", sha256: "0".repeat(64), source_id: "evil", fetch: null }],
      }),
    );
    await expect(computeStatus(root)).rejects.toThrow(/unsafe|traversal/i);
    rmSync(root, { recursive: true, force: true });
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

// rk-54a (generality audit 2026-07-25, finding M7): EXTPROP_REFS_CACHE(_URL) was AISM's own
// acronym sitting in rk's public env-var namespace. Renamed to RK_REFS_CACHE(_URL), reading the
// old names as a deprecated fallback (someone's shell profile may still export them).
describe("resolveRenamedEnv — the RK_REFS_CACHE* rename's deprecation fallback (rk-54a)", () => {
  const NEW = "RK_REFS_CACHE_TEST_VAR";
  const OLD = "EXTPROP_REFS_CACHE_TEST_VAR";

  afterEach(() => {
    delete process.env[NEW];
    delete process.env[OLD];
  });

  test("neither set -> unset, value undefined", () => {
    const r = resolveRenamedEnv(NEW, OLD);
    expect(r.source).toBe("unset");
    expect(r.value).toBeUndefined();
  });

  test("new name only -> 'new', its value", () => {
    process.env[NEW] = "/from/new";
    const r = resolveRenamedEnv(NEW, OLD);
    expect(r.source).toBe("new");
    expect(r.value).toBe("/from/new");
  });

  test("old (deprecated) name only -> works, reported as 'old' so a caller can warn", () => {
    process.env[OLD] = "/from/old";
    const r = resolveRenamedEnv(NEW, OLD);
    expect(r.source).toBe("old");
    expect(r.value).toBe("/from/old");
  });

  test("both set -> the NEW name wins, silently (source 'new', old value never surfaces)", () => {
    process.env[NEW] = "/from/new";
    process.env[OLD] = "/from/old";
    const r = resolveRenamedEnv(NEW, OLD);
    expect(r.source).toBe("new");
    expect(r.value).toBe("/from/new");
  });
});

describe("computeStatus — RK_REFS_CACHE(_URL) env fallback, real end-to-end (rk-54a)", () => {
  const CACHE_ENV = "RK_REFS_CACHE";
  const CACHE_ENV_OLD = "EXTPROP_REFS_CACHE";

  afterEach(() => {
    delete process.env[CACHE_ENV];
    delete process.env[CACHE_ENV_OLD];
  });

  test("a cache-dir hit via the NEW env var name classifies as 'cache' with no explicit opts", async () => {
    const root = makeRepo();
    const cacheDir = mkdtempSync(join(tmpdir(), "rk-status-cache-new-"));
    const content = "payload located via RK_REFS_CACHE";
    const sha = sha256Bytes(new TextEncoder().encode(content));
    writeFileSync(join(cacheDir, sha), content);
    writeFileSync(
      join(root, "refs", "manifest", "sources.lock.json"),
      JSON.stringify({ files: [{ path: "missing-src/c.pdf", sha256: sha, source_id: "missing-src", fetch: null }] }),
    );
    process.env[CACHE_ENV] = cacheDir;
    const rows = await computeStatus(root);
    expect(rows[0]!.status).toBe("cache");
    rmSync(root, { recursive: true, force: true });
    rmSync(cacheDir, { recursive: true, force: true });
  });

  test("a cache-dir hit via the OLD (deprecated) env var name still works with no explicit opts", async () => {
    const root = makeRepo();
    const cacheDir = mkdtempSync(join(tmpdir(), "rk-status-cache-old-"));
    const content = "payload located via EXTPROP_REFS_CACHE";
    const sha = sha256Bytes(new TextEncoder().encode(content));
    writeFileSync(join(cacheDir, sha), content);
    writeFileSync(
      join(root, "refs", "manifest", "sources.lock.json"),
      JSON.stringify({ files: [{ path: "missing-src/c.pdf", sha256: sha, source_id: "missing-src", fetch: null }] }),
    );
    process.env[CACHE_ENV_OLD] = cacheDir;
    const rows = await computeStatus(root);
    expect(rows[0]!.status).toBe("cache");
    rmSync(root, { recursive: true, force: true });
    rmSync(cacheDir, { recursive: true, force: true });
  });

  test("both env vars set -> the NEW name's directory is used, not the old one's", async () => {
    const root = makeRepo();
    const newCacheDir = mkdtempSync(join(tmpdir(), "rk-status-cache-both-new-"));
    const oldCacheDir = mkdtempSync(join(tmpdir(), "rk-status-cache-both-old-"));
    const content = "payload only present under the NEW cache dir";
    const sha = sha256Bytes(new TextEncoder().encode(content));
    writeFileSync(join(newCacheDir, sha), content); // present only here
    writeFileSync(
      join(root, "refs", "manifest", "sources.lock.json"),
      JSON.stringify({ files: [{ path: "missing-src/c.pdf", sha256: sha, source_id: "missing-src", fetch: null }] }),
    );
    process.env[CACHE_ENV] = newCacheDir;
    process.env[CACHE_ENV_OLD] = oldCacheDir; // old dir does NOT have the payload
    const rows = await computeStatus(root);
    expect(rows[0]!.status).toBe("cache"); // proves the NEW dir (which has the file) was consulted
    rmSync(root, { recursive: true, force: true });
    rmSync(newCacheDir, { recursive: true, force: true });
    rmSync(oldCacheDir, { recursive: true, force: true });
  });
});

// rk-p1p4a: a repo with no refs/manifest/ at all is NOT-ADOPTED, a legitimate state — never an
// ENOENT crash (window-1 campaign finding #4). A manifest that EXISTS but does not parse stays a
// loud error: "nothing was ever adopted" and "we cannot tell what was adopted" are opposite claims
// and must never be conflated (same three-state discipline the retraction store follows).
describe("computeStatusReport — absent vs corrupt manifest (rk-p1p4a)", () => {
  test("no refs/manifest/sources.lock.json: adopted=false, no throw", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-status-bare-"));
    const report = await computeStatusReport(root);
    expect(report.adopted).toBe(false);
    if (!report.adopted) expect(report.lockPath).toBe("refs/manifest/sources.lock.json");
    rmSync(root, { recursive: true, force: true });
  });

  test("a lock file that exists and parses: adopted=true with the rows", async () => {
    const root = makeRepo();
    writeFileSync(join(root, "refs", "present-src", "a.tex"), presentContent);
    writeLock(root);
    const report = await computeStatusReport(root);
    expect(report.adopted).toBe(true);
    if (report.adopted) expect(report.rows).toHaveLength(3);
    rmSync(root, { recursive: true, force: true });
  });

  test("a lock file that exists but is unparseable still THROWS (corrupt is not absent)", async () => {
    const root = makeRepo();
    writeFileSync(join(root, "refs", "manifest", "sources.lock.json"), "{not json");
    await expect(computeStatusReport(root)).rejects.toThrow();
    rmSync(root, { recursive: true, force: true });
  });
});
