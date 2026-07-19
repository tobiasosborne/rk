// Tests for `rk graph` (src/cli/graph.ts, M2.5): --focus, --critical-path, --blocks, --taint, and
// the north-star resolution precedence (--north-star flag overrides .rk/config.json's
// "northStarId"; absent-both is a loud, non-crashing error). Builds a small real repo tree
// (argument/*.md shards) and drives the CLI end to end via src/store/build-graph.ts's real
// registry reader; `afCommand`/`frCommand` point at a guaranteed-absent binary (same pattern as
// test/graph/corpus-rename-hazard.test.ts) so this test never depends on a real af/fr install.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { graphCommand } from "../src/cli/graph";

const ABSENT = ["definitely-not-a-real-binary-xyz"];

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "rk-graph-cli-"));
}

function writeShard(root: string, id: string, extra: Record<string, string> = {}): void {
  mkdirSync(join(root, "argument"), { recursive: true });
  const fm = { id, kind: "lemma", contract: `${id} holds.`, af: "none", ...extra };
  const body = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n");
  writeFileSync(join(root, "argument", `${id}.md`), `---\n${body}\n---\n\n${id}'s narrative.\n`);
}

describe("rk graph — CLI wiring", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test("no view flag: exit 2, self-teaching message", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out, lines } = capture();
    const code = await graphCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(2);
    expect(lines.join("\n")).toContain("no view selected");
  });

  test("--focus on an unknown id: exit 1, honest message, never a crash", async () => {
    const root = tmpRoot();
    dirs.push(root);
    writeShard(root, "lem-a");
    const { out, lines } = capture();
    const code = await graphCommand(["--focus", "nope", "--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("no node 'nope'");
  });

  test("--focus on a real node with a dep: prints deps/availability/contract", async () => {
    const root = tmpRoot();
    dirs.push(root);
    writeShard(root, "lem-b", { status: "cited" });
    writeShard(root, "lem-a", { deps: "lem-b" });
    const { out, lines } = capture();
    const code = await graphCommand(["--focus", "lem-a", "--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("focus: lem-a");
    expect(text).toContain("lem-a holds.");
    expect(text).toContain("lem-b [available]"); // status:cited -> available
    expect(text).toContain("own requirements met: true");
  });

  test("--critical-path with no north star configured and no --north-star: exit 2, loud message", async () => {
    const root = tmpRoot();
    dirs.push(root);
    writeShard(root, "lem-a");
    const { out, lines } = capture();
    const code = await graphCommand(["--critical-path", "--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(2);
    expect(lines.join("\n")).toContain("no north star configured");
  });

  test("--critical-path --north-star <id>: explicit flag resolves the path", async () => {
    const root = tmpRoot();
    dirs.push(root);
    writeShard(root, "lem-b");
    writeShard(root, "lem-a", { deps: "lem-b" });
    const { out, lines } = capture();
    const code = await graphCommand(["--critical-path", "--north-star", "lem-a", "--root", root], out, {
      afCommand: ABSENT, frCommand: ABSENT,
    });
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("2 node(s)");
    expect(text).toContain("lem-a");
    expect(text).toContain("lem-b");
  });

  test("--critical-path: .rk/config.json's northStarId is used when --north-star is absent", async () => {
    const root = tmpRoot();
    dirs.push(root);
    writeShard(root, "lem-a");
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "config.json"), JSON.stringify({ northStarId: "lem-a" }));
    const { out, lines } = capture();
    const code = await graphCommand(["--critical-path", "--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("north star lem-a");
  });

  test("--critical-path: an explicit --north-star flag overrides .rk/config.json's northStarId", async () => {
    const root = tmpRoot();
    dirs.push(root);
    writeShard(root, "lem-a");
    writeShard(root, "lem-z");
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "config.json"), JSON.stringify({ northStarId: "lem-a" }));
    const { out, lines } = capture();
    const code = await graphCommand(["--critical-path", "--north-star", "lem-z", "--root", root], out, {
      afCommand: ABSENT, frCommand: ABSENT,
    });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("north star lem-z");
  });

  test("--critical-path: unknown north star id names no node: exit 1", async () => {
    const root = tmpRoot();
    dirs.push(root);
    writeShard(root, "lem-a");
    const { out, lines } = capture();
    const code = await graphCommand(["--critical-path", "--north-star", "ghost", "--root", root], out, {
      afCommand: ABSENT, frCommand: ABSENT,
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("names no node");
  });

  test("--blocks --north-star <id>: reports frontier and blocked counts", async () => {
    const root = tmpRoot();
    dirs.push(root);
    writeShard(root, "lem-b", { status: "open" });
    writeShard(root, "lem-a", { deps: "lem-b", status: "conjecture" });
    const { out, lines } = capture();
    const code = await graphCommand(["--blocks", "--north-star", "lem-a", "--root", root], out, {
      afCommand: ABSENT, frCommand: ABSENT,
    });
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("0/2 critical-path node(s) already available");
    expect(text).toContain("frontier (actionable now, 1)");
    expect(text).toContain("blocked (not yet actionable, 1)");
  });

  test("--taint with no argument: campaign-wide summary, all clean here", async () => {
    const root = tmpRoot();
    dirs.push(root);
    writeShard(root, "lem-a");
    const { out, lines } = capture();
    const code = await graphCommand(["--taint", "--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("0/1 node(s) not clean");
  });

  test("--taint <unknown-id>: exit 1, honest message", async () => {
    const root = tmpRoot();
    dirs.push(root);
    writeShard(root, "lem-a");
    const { out, lines } = capture();
    const code = await graphCommand(["--taint", "nope", "--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("no node 'nope'");
  });

  test("registered in the top-level dispatcher (src/cli.ts) and its --help is side-effect-free", async () => {
    const { out, lines } = capture();
    const code = await run(["graph", "--help"], { out });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("rk graph");
  });

  test("top-level 'rk' help mentions graph", async () => {
    const { out, lines } = capture();
    await run([], { out });
    expect(lines.join("\n")).toContain("rk graph");
  });
});
