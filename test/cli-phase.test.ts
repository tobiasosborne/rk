// Tests for `rk phase [exploration|consolidation]` (src/cli/phase.ts, M1.3). Covers: print
// current phase (default + from a real .rk/config.json), writing the phase, preserving unrelated
// config keys, and the consolidation-ward worklog logging (docs/gate-contracts.md "Phase matrix";
// PRD.md sec 2/C1: "The transition consolidation-> is a logged, deliberate act.").

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { phaseCommand, insertWorklogEntry } from "../src/cli/phase";

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "rk-phase-cli-"));
}

describe("rk phase (no args): prints the current phase", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test("no .rk/config.json at all: consolidation, the strictest default", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out, lines } = capture();
    const code = await phaseCommand(["--root", root], out);
    expect(code).toBe(0);
    expect(lines[0]).toBe("current phase: consolidation");
    expect(lines.join("\n")).toContain("default");
  });

  test("an existing .rk/config.json with phase:exploration is read back", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "config.json"), JSON.stringify({ phase: "exploration" }));
    const { out, lines } = capture();
    await phaseCommand(["--root", root], out);
    expect(lines[0]).toBe("current phase: exploration");
  });
});

describe("rk phase exploration|consolidation: writes .rk/config.json", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test("writes phase into a fresh .rk/config.json", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out, lines } = capture();
    const code = await phaseCommand(["exploration", "--root", root], out);
    expect(code).toBe(0);
    const written = JSON.parse(readFileSync(join(root, ".rk", "config.json"), "utf8"));
    expect(written.phase).toBe("exploration");
    expect(lines[0]).toBe("phase: consolidation -> exploration (written to .rk/config.json).");
  });

  test("preserves unrelated keys already in .rk/config.json", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "config.json"), JSON.stringify({ shardsMaxLines: 350 }));
    const { out } = capture();
    await phaseCommand(["exploration", "--root", root], out);
    const written = JSON.parse(readFileSync(join(root, ".rk", "config.json"), "utf8"));
    expect(written.phase).toBe("exploration");
    expect(written.shardsMaxLines).toBe(350);
  });

  test("never bakes DEFAULT_GATE_CONFIG values into the file — only 'phase' is written", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out } = capture();
    await phaseCommand(["exploration", "--root", root], out);
    const written = JSON.parse(readFileSync(join(root, ".rk", "config.json"), "utf8"));
    expect(Object.keys(written)).toEqual(["phase"]);
  });

  test("rejects an unknown phase name, exit code 2, no file written", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out, lines } = capture();
    const code = await phaseCommand(["bogus", "--root", root], out);
    expect(code).toBe(2);
    expect(lines[0]).toContain("unknown phase 'bogus'");
  });
});

describe("rk phase consolidation: the consolidation-ward transition logs to docs/worklog.md", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test("exploration -> consolidation, docs/worklog.md EXISTS: entry prepended after '## Sessions', notice printed", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "config.json"), JSON.stringify({ phase: "exploration" }));
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "worklog.md"), "# Worklog\n\n## Sessions\n\n### [2026-01-01] earlier session\n- did stuff\n");

    const { out, lines } = capture();
    const code = await phaseCommand(["consolidation", "--root", root], out, { today: () => "2026-07-18" });
    expect(code).toBe(0);
    expect(lines.some((l) => l.includes("logged the consolidation-ward transition"))).toBe(true);

    const worklog = readFileSync(join(root, "docs", "worklog.md"), "utf8");
    expect(worklog).toContain("### [2026-07-18] phase: exploration -> consolidation");
    // "newest first; append above the previous entry" (templates/docs/worklog.md.tmpl) — the new
    // entry's heading must appear BEFORE the pre-existing 2026-01-01 entry.
    expect(worklog.indexOf("2026-07-18")).toBeLessThan(worklog.indexOf("2026-01-01"));
  });

  test("exploration -> consolidation, docs/worklog.md ABSENT: notice printed, nothing thrown, no file created", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "config.json"), JSON.stringify({ phase: "exploration" }));

    const { out, lines } = capture();
    const code = await phaseCommand(["consolidation", "--root", root], out);
    expect(code).toBe(0);
    expect(lines.some((l) => l.includes("docs/worklog.md not found"))).toBe(true);
  });

  test("consolidation -> consolidation (no-op transition): NOT logged even if worklog.md exists", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "worklog.md"), "# Worklog\n\n## Sessions\n");
    const { out, lines } = capture();
    await phaseCommand(["consolidation", "--root", root], out); // already consolidation (default)
    expect(lines.some((l) => l.includes("logged the consolidation-ward transition"))).toBe(false);
    const worklog = readFileSync(join(root, "docs", "worklog.md"), "utf8");
    expect(worklog).toBe("# Worklog\n\n## Sessions\n");
  });
});

describe("insertWorklogEntry (pure helper)", () => {
  test("inserts right after '## Sessions', before any existing content", () => {
    const content = "# Worklog\n\n## Sessions\n\n### [2026-01-01] old\n";
    const out = insertWorklogEntry(content, "### [2026-07-18] new\n\n");
    expect(out.indexOf("2026-07-18")).toBeLessThan(out.indexOf("2026-01-01"));
  });

  test("falls back to a trailing append when '## Sessions' is missing", () => {
    const content = "# Worklog\n\nno sessions heading here\n";
    const out = insertWorklogEntry(content, "### [2026-07-18] new\n");
    expect(out).toContain("no sessions heading here");
    expect(out.indexOf("2026-07-18")).toBeGreaterThan(out.indexOf("no sessions heading here"));
  });
});
