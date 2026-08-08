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

// rk-p1p4a / rk-pk8o: the CLI surface of the two window-1 campaign findings.
describe("rk refs status — a repo that has never adopted a source (rk-p1p4a)", () => {
  test("reports 'not adopted' cleanly and exits 0, never an ENOENT stack trace", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-refs-bare-"));
    dirs.push(root);
    const { out, lines } = capture();
    const code = await refsDispatch(["status", "--root", root], out);
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("not adopted");
    expect(text).toContain("refs/manifest/sources.lock.json");
    expect(text).not.toContain("ENOENT");
    expect(text).toContain("rk refs adopt");
  });

  test("a lock file that exists but does not parse is a LOUD failure, exit 1 (corrupt is not absent)", async () => {
    const root = tmpRoot();
    dirs.push(root);
    writeFileSync(join(root, "refs", "manifest", "sources.lock.json"), "{not json");
    const { out, lines } = capture();
    const code = await refsDispatch(["status", "--root", root], out);
    expect(code).toBe(1);
    expect(lines.join("\n")).not.toContain("not adopted");
  });
});

describe("rk refs adopt (rk-pk8o)", () => {
  function repoWithPayload(text: string): string {
    const root = mkdtempSync(join(tmpdir(), "rk-refs-adopt-cli-"));
    dirs.push(root);
    mkdirSync(join(root, "refs", "sources"), { recursive: true });
    writeFileSync(join(root, "refs", "sources", "paper.txt"), text);
    return root;
  }

  test("adopts an existing payload offline, then status reports it present and quote verifies it", async () => {
    const root = repoWithPayload("A quotable sentence about idempotence.\n");
    const { out, lines } = capture();
    expect(await refsDispatch(["adopt", "refs/sources/paper.txt", "--source", "arxiv:1811.08017", "--root", root], out)).toBe(0);
    expect(lines.join("\n")).toContain("adopted");

    const s = capture();
    expect(await refsDispatch(["status", "--root", root], s.out)).toBe(0);
    expect(s.lines.join("\n")).toContain("sources/paper.txt");
    expect(s.lines.join("\n")).toContain("present=1");

    const q = capture();
    expect(await refsDispatch(["quote", "paper", "quotable sentence about idempotence", "--root", root], q.out)).toBe(0);
    expect(q.lines.join("\n")).toContain("refs/sources/paper.txt:1");
  });

  test("a --sha256 mismatch exits nonzero and names both hashes", async () => {
    const root = repoWithPayload("bytes that will not match\n");
    const { out, lines } = capture();
    const code = await refsDispatch(
      ["adopt", "refs/sources/paper.txt", "--source", "arxiv:1811.08017", "--sha256", "d".repeat(64), "--root", root],
      out,
    );
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("d".repeat(64));
  });

  test("usage (exit 2) when --source is missing", async () => {
    const root = repoWithPayload("x\n");
    const { out, lines } = capture();
    expect(await refsDispatch(["adopt", "refs/sources/paper.txt", "--root", root], out)).toBe(2);
    expect(lines.join("\n")).toContain("usage: rk refs adopt");
  });

  test("'rk refs' help lists adopt", async () => {
    const { out, lines } = capture();
    await refsDispatch([], out);
    expect(lines.join("\n")).toContain("rk refs adopt");
  });
});

// rk-p1p4a, same fault family as `refs status`: `rk refs quote` in a repo with no manifest printed a
// raw ENOENT string. It must still FAIL (a quote request against no registry is a real failure, not
// "nothing to report"), but with the actionable reason, not a syscall name.
describe("rk refs quote — no manifest at all (rk-p1p4a)", () => {
  test("exits 1 with an actionable 'not adopted' message, not an ENOENT string", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-refs-quote-bare-"));
    dirs.push(root);
    const { out, lines } = capture();
    const code = await refsDispatch(["quote", "some-id", "some pattern", "--root", root], out);
    expect(code).toBe(1);
    const text = lines.join("\n");
    expect(text).not.toContain("ENOENT");
    expect(text).toContain("not adopted");
    expect(text).toContain("rk refs adopt");
  });
});
