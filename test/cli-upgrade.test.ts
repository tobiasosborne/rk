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
      if (!["authored-append-only", "generated", "campaign-seed"].includes(entry.classification)) continue;
      // named in the never-overwrite list (a campaign-seed path carries a trailing gloss), and
      // never handed a diff command
      expect(lines.some((l) => l.trim() === entry.path || l.trim().startsWith(`${entry.path}  (`))).toBe(true);
      expect(lines.some((l) => l.trim().startsWith("diff ") && l.includes(entry.path))).toBe(false);
    }

    // stub never writes anything
    expect(readFileSync(join(root, ".rk", "template-version"), "utf8")).toBe(before);
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
  });
});

describe("rk upgrade: rewritten-whole files are framed as a structural diff, never a safe overwrite (rk-czv)", () => {
  test("never calls rewritten-whole files a 'safe' overwrite candidate", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "template-version"), "0.0.1\n");
    const { out, lines } = capture();
    await upgradeCommand(["--root", root], out);
    const text = lines.join("\n");
    expect(text).not.toContain("safe, deliberate overwrite");
    expect(text.toLowerCase()).not.toMatch(/\(safe,? deliberate overwrite/);
    expect(text).toContain("structural diff — preserve your filled slots");
    expect(text).toContain("NEVER a safe overwrite");
  });

  test("names the campaign-owned slots for CLAUDE.md/AGENTS.md/PRD.md/HANDOFF.md", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "template-version"), "0.0.1\n");
    const { out, lines } = capture();
    await upgradeCommand(["--root", root], out);
    const text = lines.join("\n");
    expect(text).toContain("goal, north-star contract, shard-id prefix");
    expect(text).toContain("State / Current work / Next steps");
    expect(text).toContain("BLANK scaffold");
  });
});

// Bumping template_version is itself the `rk upgrade` path (finding M2). A bump whose changes a
// per-file diff CANNOT reveal — a brand-new stamped path that does not exist in the old repo, a
// new `.rk/config.json` key that is not a stamped file at all — turns the manual-diff plan into a
// list of files where nothing appears to have changed. The changelog is what closes that gap.
describe("rk upgrade: the changelog names what a per-file diff cannot show", () => {
  async function upgradeFrom(stamped: string) {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "template-version"), `${stamped}\n`);
    const { out, lines } = capture();
    const code = await upgradeCommand(["--root", root], out);
    return { code, lines, text: lines.join("\n") };
  }

  test("prints every changelog entry newer than the stamped version, and none older", async () => {
    const { text } = await upgradeFrom("1.3.0");
    const changelog = TEMPLATE_MANIFEST.changelog ?? [];
    const newer = changelog.filter((e) => e.version !== "1.3.0" && e.version > "1.3.0");
    expect(newer.length).toBeGreaterThan(0);
    for (const entry of newer) {
      expect(text).toContain(entry.version);
      for (const change of entry.changes) expect(text).toContain(change);
    }
    for (const entry of changelog.filter((e) => e.version <= "1.3.0")) {
      for (const change of entry.changes) expect(text).not.toContain(change);
    }
  });

  test("a repo older than every changelog entry still gets the whole log", async () => {
    const { text } = await upgradeFrom("0.0.1");
    for (const entry of TEMPLATE_MANIFEST.changelog ?? []) {
      for (const change of entry.changes) expect(text).toContain(change);
    }
  });

  // rk-i2o (dogfood-2): the closing instruction said "update .rk/template-version to the new
  // value" and named neither the mechanism nor the value. A user had to open .rk/ to discover it
  // is a plain one-line text file.
  test("the closing instruction names the file, its format, and a copy-pasteable command", async () => {
    const { text } = await upgradeFrom("1.3.0");
    expect(text).toContain(".rk/template-version");
    expect(text.toLowerCase()).toContain("plain text");
    expect(text).toContain(`printf '${TEMPLATE_MANIFEST.template_version}\\n' > `);
  });
});
