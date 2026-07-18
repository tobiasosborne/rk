// Integration tests for `rk upgrade` (src/cli/upgrade.ts, M1.4 stub). Verifies: no-record repo,
// up-to-date match, mismatch reporting with manual-diff instructions, and that nothing is ever
// written to disk (a stub never mutates the repo it inspects).

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upgradeCommand } from "../src/cli/upgrade";
import { TEMPLATE_MANIFEST } from "../src/scaffold/templates-embed";

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "rk-upgrade-cli-"));
}

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("rk upgrade: no .rk/template-version record", () => {
  test("reports 'cannot advise', exit nonzero", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out, lines } = capture();
    const code = await upgradeCommand(["--root", root], out);
    expect(code).not.toBe(0);
    expect(lines[0]).toContain("pre-1.0 or hand-rolled repo, cannot advise");
  });
});

describe("rk upgrade: matching template_version", () => {
  test("reports up to date, exit 0", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "template-version"), `${TEMPLATE_MANIFEST.template_version}\n`);
    const { out, lines } = capture();
    const code = await upgradeCommand(["--root", root], out);
    expect(code).toBe(0);
    expect(lines[0]).toContain("up to date");
    expect(lines[0]).toContain(TEMPLATE_MANIFEST.template_version);
  });
});

describe("rk upgrade: mismatched template_version", () => {
  test("reports both versions and manual-diff instructions, exit nonzero, nothing written", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "template-version"), "0.0.1\n");
    const before = readFileSync(join(root, ".rk", "template-version"), "utf8");

    const { out, lines } = capture();
    const code = await upgradeCommand(["--root", root], out);
    expect(code).not.toBe(0);
    expect(lines[0]).toContain("MISMATCH");
    expect(lines[0]).toContain("0.0.1");
    expect(lines[0]).toContain(TEMPLATE_MANIFEST.template_version);

    // every rewritten-whole manifest path gets a concrete diff command
    for (const entry of TEMPLATE_MANIFEST.stamped) {
      if (entry.classification !== "rewritten-whole") continue;
      expect(lines.some((l) => l.includes("diff") && l.includes(entry.path))).toBe(true);
    }
    // every authored/generated path is named as never-overwritten, not given a diff command
    for (const entry of TEMPLATE_MANIFEST.stamped) {
      if (entry.classification !== "authored-append-only" && entry.classification !== "generated") continue;
      expect(lines.some((l) => l.trim() === entry.path)).toBe(true);
    }

    // stub never writes anything
    expect(readFileSync(join(root, ".rk", "template-version"), "utf8")).toBe(before);
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
  });
});
