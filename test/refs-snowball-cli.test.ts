// Tests for `rk refs snowball` (src/cli/refs.ts's refsSnowball handler). Every test injects a
// fake `buildOracle` — never the real network edge — so nothing here touches Semantic Scholar or
// a real clock (rule 13). Covers: bad-args exit codes, the happy path's closure.json/triage.md
// output, the merge-preserves-triage behavior, --min-year, --out, and the partial/exit-1 path.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refsSnowball } from "../src/cli/refs";
import type { BuildSnowballResult, SnowballFetchOptions } from "../src/refs/snowball-fetch";
import type { ClosureEntry } from "../src/refs/snowball-closure";

const dirs: string[] = [];
function tmpRoot(): string {
  const d = mkdtempSync(join(tmpdir(), "rk-snowball-cli-"));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

function seedsFile(root: string, text: string): string {
  const p = join(root, "seeds.txt");
  writeFileSync(p, text);
  return p;
}

/** A fake buildOracle returning a fixed oracle map — never calls fetch. */
function fakeBuilder(byId: Record<string, { self?: any; refs: any[]; cites: any[] }>, partial = false, errors: string[] = []) {
  return async (_seeds: string[], _depth: number, _opts: SnowballFetchOptions): Promise<BuildSnowballResult> => ({
    oracle: (id: string) => byId[id] ?? { refs: [], cites: [] },
    partial,
    errors,
  });
}

describe("refsSnowball — bad args", () => {
  test("missing --seeds: usage, exit 2", async () => {
    const { out, lines } = capture();
    const code = await refsSnowball(["--root", tmpRoot()], out);
    expect(code).toBe(2);
    expect(lines.some((l) => l.includes("usage:"))).toBe(true);
  });

  test("--depth not a non-negative integer: exit 2", async () => {
    const root = tmpRoot();
    const seeds = seedsFile(root, "2510.01333\n");
    const { out, lines } = capture();
    const code = await refsSnowball(["--seeds", seeds, "--depth", "-1", "--root", root], out);
    expect(code).toBe(2);
    expect(lines.some((l) => l.includes("--depth"))).toBe(true);
  });

  test("seeds file does not exist: exit 2", async () => {
    const root = tmpRoot();
    const { out, lines } = capture();
    const code = await refsSnowball(["--seeds", join(root, "nope.txt"), "--root", root], out);
    expect(code).toBe(2);
    expect(lines.some((l) => l.toLowerCase().includes("cannot read"))).toBe(true);
  });

  test("seeds file has no ids: exit 2", async () => {
    const root = tmpRoot();
    const seeds = seedsFile(root, "# only comments\n\n");
    const { out, lines } = capture();
    const code = await refsSnowball(["--seeds", seeds, "--root", root], out);
    expect(code).toBe(2);
    expect(lines.some((l) => l.includes("no arXiv ids"))).toBe(true);
  });
});

describe("refsSnowball — happy path", () => {
  test("writes closure.json and refs/triage.md, prints the count line, exit 0", async () => {
    const root = tmpRoot();
    const seeds = seedsFile(root, "S1\n");
    const build = fakeBuilder({
      S1: { self: { id: "S1", arxiv: "S1", title: "Seed", year: 2020 }, refs: [{ id: "A1", arxiv: "A1", title: "Ref A", year: 2018 }], cites: [] },
    });
    const { out, lines } = capture();
    const code = await refsSnowball(["--seeds", seeds, "--depth", "1", "--root", root], out, build);
    expect(code).toBe(0);

    const closure = JSON.parse(readFileSync(join(root, "refs", "snowball", "closure.json"), "utf8"));
    expect(closure.partial).toBe(false);
    expect(closure.depth).toBe(1);
    expect(closure.seeds).toEqual(["S1"]);
    expect(closure.papers.map((p: ClosureEntry) => p.id)).toEqual(["S1", "A1"]);

    const triage = readFileSync(join(root, "refs", "triage.md"), "utf8");
    expect(triage).toContain("| S1 | Seed | 2020 | 0 |  | seed |  |");
    expect(triage).toContain("| A1 | Ref A | 2018 | 1 | S1 |  |  |");
    expect(triage).toContain("ROLE:");

    expect(lines[0]).toContain("closure depth 1 over 1 seeds: 2 papers (2 new)");
  });

  test("merging: an existing refs/triage.md's triage/reason survive a rerun", async () => {
    const root = tmpRoot();
    const seeds = seedsFile(root, "S1\n");
    mkdirSync(join(root, "refs"), { recursive: true });
    writeFileSync(
      join(root, "refs", "triage.md"),
      [
        "# refs/triage.md",
        "",
        "| id | title | year | depth | via | triage | reason |",
        "|----|-------|------|-------|-----|--------|--------|",
        "| S1 | Seed | 2020 | 0 |  | in | load-bearing north star |",
        "",
      ].join("\n"),
    );
    const build = fakeBuilder({ S1: { self: { id: "S1", arxiv: "S1", title: "Seed", year: 2020 }, refs: [], cites: [] } });
    const { out } = capture();
    const code = await refsSnowball(["--seeds", seeds, "--depth", "0", "--root", root], out, build);
    expect(code).toBe(0);
    const triage = readFileSync(join(root, "refs", "triage.md"), "utf8");
    expect(triage).toContain("| S1 | Seed | 2020 | 0 |  | in | load-bearing north star |");
  });

  test("--min-year filters the closure written to disk", async () => {
    const root = tmpRoot();
    const seeds = seedsFile(root, "S1\n");
    const build = fakeBuilder({
      S1: {
        self: { id: "S1", arxiv: "S1", title: "Seed", year: 2020 },
        refs: [{ id: "OLD", arxiv: "OLD", title: "Old paper", year: 1990 }],
        cites: [],
      },
    });
    const { out, lines } = capture();
    const code = await refsSnowball(["--seeds", seeds, "--depth", "1", "--min-year", "1999", "--root", root], out, build);
    expect(code).toBe(0);
    const closure = JSON.parse(readFileSync(join(root, "refs", "snowball", "closure.json"), "utf8"));
    expect(closure.papers.map((p: ClosureEntry) => p.id)).toEqual(["S1"]); // OLD (1990) dropped
    expect(lines[0]).toContain("1 papers");
  });

  test("--out writes the triage ledger to a custom path, leaving refs/triage.md untouched", async () => {
    const root = tmpRoot();
    const seeds = seedsFile(root, "S1\n");
    const build = fakeBuilder({ S1: { self: { id: "S1", arxiv: "S1", title: "Seed", year: 2020 }, refs: [], cites: [] } });
    const customOut = join(root, "custom", "ledger.md");
    const { out } = capture();
    const code = await refsSnowball(["--seeds", seeds, "--depth", "0", "--out", customOut, "--root", root], out, build);
    expect(code).toBe(0);
    expect(existsSync(customOut)).toBe(true);
    expect(existsSync(join(root, "refs", "triage.md"))).toBe(false);
  });
});

describe("refsSnowball — partial closure (network failure)", () => {
  test("exit 1, closure.json carries partial:true, count line and errors are printed", async () => {
    const root = tmpRoot();
    const seeds = seedsFile(root, "S1\n");
    const build = fakeBuilder(
      { S1: { self: { id: "S1", arxiv: "S1", title: "Seed", year: 2020 }, refs: [], cites: [] } },
      true,
      ["S1: HTTP 500 fetching ..."],
    );
    const { out, lines } = capture();
    const code = await refsSnowball(["--seeds", seeds, "--root", root], out, build);
    expect(code).toBe(1);
    const closure = JSON.parse(readFileSync(join(root, "refs", "snowball", "closure.json"), "utf8"));
    expect(closure.partial).toBe(true);
    expect(lines.some((l) => l.toLowerCase().includes("partial"))).toBe(true);
    expect(lines.some((l) => l.includes("HTTP 500"))).toBe(true);
  });
});
