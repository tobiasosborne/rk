import { describe, expect, test, afterAll } from "bun:test";
import { sha256Bytes, sha256File } from "../../src/refs/hash";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "rk-hash-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("sha256Bytes", () => {
  test("matches the known sha256 of 'hello'", () => {
    expect(sha256Bytes(new TextEncoder().encode("hello"))).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  test("matches the known sha256 of the empty string", () => {
    expect(sha256Bytes(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("sha256File", () => {
  test("hashes real bytes on disk", async () => {
    const p = join(dir, "a.txt");
    writeFileSync(p, "hello");
    expect(await sha256File(p)).toBe(sha256Bytes(new TextEncoder().encode("hello")));
  });

  test("different content, different hash", async () => {
    const p1 = join(dir, "b.txt");
    const p2 = join(dir, "c.txt");
    writeFileSync(p1, "content one");
    writeFileSync(p2, "content two");
    expect(await sha256File(p1)).not.toBe(await sha256File(p2));
  });
});
