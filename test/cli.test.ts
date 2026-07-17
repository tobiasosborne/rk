import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { sha256Bytes } from "../src/refs/hash";

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "rk-cli-test-"));
  mkdirSync(join(root, "refs", "manifest"), { recursive: true });
  mkdirSync(join(root, "refs", "src-a"), { recursive: true });
  const content = "Theorem: every idempotent map is a projection.";
  writeFileSync(join(root, "refs", "src-a", "a.tex"), content);
  writeFileSync(
    join(root, "refs", "manifest", "sources.lock.json"),
    JSON.stringify({
      files: [
        { path: "src-a/a.tex", sha256: sha256Bytes(new TextEncoder().encode(content)), source_id: "src-a", fetch: null },
        { path: "src-b/b.pdf", sha256: "f".repeat(64), source_id: "src-b", fetch: { kind: "arxiv-pdf", id: "1.2" } },
      ],
    }),
  );
  writeFileSync(
    join(root, "refs", "manifest", "SOURCES.md"),
    "# SOURCES\n\n## Source registry\n\n| source-id | citation | locator | retrieved | local path | key file (sha256-16) | role |\n|---|---|---|---|---|---|---|\n",
  );
  writeFileSync(join(root, "refs", "manifest", "checksums.sha256"), "");
  return root;
}

describe("rk cli — dispatch", () => {
  test("no args prints top-level self-teaching help and exits 0", async () => {
    const { out, lines } = capture();
    const code = await run([], { out });
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("rk refs");
    expect(text.toLowerCase()).toContain("status");
  });

  test("an unknown top-level command prints help and exits nonzero", async () => {
    const { out, lines } = capture();
    const code = await run(["frobnicate"], { out });
    expect(code).not.toBe(0);
    expect(lines.join("\n")).toContain("unknown command");
  });

  test("'rk refs' with no subcommand lists status/add/quote as next steps", async () => {
    const { out, lines } = capture();
    const code = await run(["refs"], { out });
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("rk refs status");
    expect(text).toContain("rk refs add");
    expect(text).toContain("rk refs quote");
  });

  test("an unknown refs subcommand prints help and exits nonzero", async () => {
    const { out, lines } = capture();
    const code = await run(["refs", "frobnicate"], { out });
    expect(code).not.toBe(0);
    expect(lines.join("\n")).toContain("unknown");
  });
});

describe("rk refs status", () => {
  test("prints a row per source plus a coverage summary line, self-teaching on missing", async () => {
    const root = makeRepo();
    const { out, lines } = capture();
    const code = await run(["refs", "status", "--root", root], { out });
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("src-a/a.tex");
    expect(text).toContain("src-b/b.pdf");
    expect(text).toMatch(/2 files?/);
    expect(text).toContain("present=1");
    expect(text).toContain("fetchable=1");
    rmSync(root, { recursive: true, force: true });
  });
});

describe("rk refs quote", () => {
  test("prints a grep -F-verifiable path:line anchor and the verbatim quote", async () => {
    const root = makeRepo();
    const { out, lines } = capture();
    const code = await run(
      ["refs", "quote", "src-a", "every idempotent map is a projection", "--root", root],
      { out },
    );
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("refs/src-a/a.tex:1");
    expect(text).toContain("every idempotent map is a projection");
    rmSync(root, { recursive: true, force: true });
  });

  test("a not-found pattern exits nonzero with a next-step suggestion", async () => {
    const root = makeRepo();
    const { out, lines } = capture();
    const code = await run(["refs", "quote", "src-a", "nowhere in the source", "--root", root], { out });
    expect(code).not.toBe(0);
    expect(lines.join("\n").toLowerCase()).toContain("not found");
    rmSync(root, { recursive: true, force: true });
  });

  test("missing arguments print usage and exit nonzero", async () => {
    const { out, lines } = capture();
    const code = await run(["refs", "quote", "only-one-arg"], { out });
    expect(code).not.toBe(0);
    expect(lines.join("\n")).toContain("usage");
  });
});

describe("rk refs add", () => {
  test("adds a local-file source and prints the installed path + hash", async () => {
    const root = makeRepo();
    const srcFile = join(root, "incoming.tex");
    writeFileSync(srcFile, "new payload");
    const { out, lines } = capture();
    const code = await run(["refs", "add", srcFile, "--id", "new-src", "--root", root], { out });
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("refs/new-src/incoming.tex");
    expect(text).toContain(sha256Bytes(new TextEncoder().encode("new payload")));
    rmSync(root, { recursive: true, force: true });
  });

  test("missing --id prints usage and exits nonzero", async () => {
    const { out, lines } = capture();
    const code = await run(["refs", "add", "some-locator"], { out });
    expect(code).not.toBe(0);
    expect(lines.join("\n")).toContain("--id");
  });
});
