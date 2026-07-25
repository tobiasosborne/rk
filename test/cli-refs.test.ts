// Integration tests for `rk refs` (src/cli/refs.ts). Covers the rk-54a deprecation warning: `rk
// refs status` must warn ONCE, clearly, when a cache env var is honored only via its deprecated
// EXTPROP_* name, and must say nothing when the current RK_REFS_CACHE* name is what supplied the
// value (including when both are set — see resolveRenamedEnv's "new wins silently" rule).

import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refsDispatch } from "../src/cli/refs";

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "rk-refs-cli-"));
  mkdirSync(join(root, "refs", "manifest"), { recursive: true });
  writeFileSync(join(root, "refs", "manifest", "sources.lock.json"), JSON.stringify({ files: [] }));
  return root;
}

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const NEW = "RK_REFS_CACHE";
const OLD = "EXTPROP_REFS_CACHE";
const NEW_URL = "RK_REFS_CACHE_URL";
const OLD_URL = "EXTPROP_REFS_CACHE_URL";

afterEach(() => {
  delete process.env[NEW];
  delete process.env[OLD];
  delete process.env[NEW_URL];
  delete process.env[OLD_URL];
});

describe("rk refs status — rk-54a deprecation warning", () => {
  test("neither env var set: no deprecation warning", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out, lines } = capture();
    await refsDispatch(["status", "--root", root], out);
    expect(lines.some((l) => l.includes("DEPRECATED"))).toBe(false);
  });

  test("new name only: no deprecation warning", async () => {
    const root = tmpRoot();
    dirs.push(root);
    process.env[NEW] = "/some/dir";
    const { out, lines } = capture();
    await refsDispatch(["status", "--root", root], out);
    expect(lines.some((l) => l.includes("DEPRECATED"))).toBe(false);
  });

  test("old (deprecated) name only: warns once, names both the old and new var", async () => {
    const root = tmpRoot();
    dirs.push(root);
    process.env[OLD] = "/some/dir";
    const { out, lines } = capture();
    await refsDispatch(["status", "--root", root], out);
    const warnings = lines.filter((l) => l.includes("DEPRECATED") && l.includes(OLD));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(NEW);
  });

  test("both set: NEW wins, no warning printed (nothing actionable left to say)", async () => {
    const root = tmpRoot();
    dirs.push(root);
    process.env[NEW] = "/new/dir";
    process.env[OLD] = "/old/dir";
    const { out, lines } = capture();
    await refsDispatch(["status", "--root", root], out);
    expect(lines.some((l) => l.includes("DEPRECATED"))).toBe(false);
  });

  test("the cache-URL var pair warns independently of the cache-dir pair", async () => {
    const root = tmpRoot();
    dirs.push(root);
    process.env[OLD_URL] = "http://example.invalid/cache";
    const { out, lines } = capture();
    await refsDispatch(["status", "--root", root], out);
    const warnings = lines.filter((l) => l.includes("DEPRECATED") && l.includes(OLD_URL));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(NEW_URL);
  });

  test("the 'missing' remediation line names the current RK_REFS_CACHE, not EXTPROP_REFS_CACHE", async () => {
    const root = tmpRoot();
    dirs.push(root);
    writeFileSync(
      join(root, "refs", "manifest", "sources.lock.json"),
      JSON.stringify({ files: [{ path: "missing-src/c.pdf", sha256: "b".repeat(64), source_id: "missing-src", fetch: null }] }),
    );
    const { out, lines } = capture();
    await refsDispatch(["status", "--root", root], out);
    const remediation = lines.find((l) => l.includes("missing with no reproducible route"));
    expect(remediation).toBeDefined();
    expect(remediation).toContain("RK_REFS_CACHE=<dir>");
    expect(remediation).not.toContain("EXTPROP_REFS_CACHE");
  });
});
