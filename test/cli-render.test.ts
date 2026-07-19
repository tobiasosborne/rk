// Tests for `rk render` (src/cli/render.ts, M2.4): builds a small real repo tree, renders the
// self-contained site to a temp --out dir, and asserts the edge wrote index.html with the expected
// content. Same harness shape as test/cli-graph.test.ts — a real registry reader,
// afCommand/frCommand pointed at a guaranteed-absent binary so the test needs no af/fr install. The
// render CORE is exhaustively tested in test/render/; this file only proves the fs/CLI edge.

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { renderCommand } from "../src/cli/render";

const ABSENT = ["definitely-not-a-real-binary-xyz"];

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

function writeShard(root: string, id: string, extra: Record<string, string> = {}): void {
  mkdirSync(join(root, "argument"), { recursive: true });
  const fm = { id, kind: "lemma", contract: `${id} holds.`, status: "open", af: "none", ...extra };
  const body = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n");
  writeFileSync(join(root, "argument", `${id}.md`), `---\n${body}\n---\n\n${id}'s narrative.\n`);
}

describe("rk render — CLI edge", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  function repo(): string {
    const root = mkdtempSync(join(tmpdir(), "rk-render-cli-"));
    dirs.push(root);
    writeShard(root, "lem-base", { status: "cited" });
    writeShard(root, "thm-main", { status: "open", deps: "lem-base" });
    return root;
  }

  test("writes a self-contained index.html to the default out dir, exit 0", async () => {
    const root = repo();
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    const index = join(root, "build", "site", "index.html");
    expect(existsSync(index)).toBe(true);
    const html = readFileSync(index, "utf8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("rk-dashboard");
    expect(html).toContain('id="node-lem-base"');
    expect(html).toContain('id="node-thm-main"');
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
    expect(lines.join("\n")).toContain("2 nodes");
  });

  test("--out redirects the output directory", async () => {
    const root = repo();
    const { out } = capture();
    await renderCommand(["--root", root, "--out", "public"], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(existsSync(join(root, "public", "index.html"))).toBe(true);
  });

  // M2 boundary review, ratified verdict (e): --out must be a repo-relative MANAGED path.
  test("BLOCKER: an absolute --out is rejected (never written), self-teaching, exit nonzero", async () => {
    const root = repo();
    const { out, lines } = capture();
    const absOut = join(tmpdir(), "rk-render-absolute-escape");
    const code = await renderCommand(["--root", root, "--out", absOut], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).not.toBe(0);
    expect(lines.join("\n")).toContain("repo-relative");
    expect(existsSync(absOut)).toBe(false);
  });

  test("BLOCKER: a '..'-escaping --out is rejected, never written, exit nonzero", async () => {
    const root = repo();
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root, "--out", "../escape"], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).not.toBe(0);
    expect(lines.join("\n")).toContain("..");
    expect(existsSync(join(root, "..", "escape"))).toBe(false);
  });

  test("adopts its output in .rk/generated.json (creates the manifest, generator render-site-v1)", async () => {
    const root = repo();
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    const manifestPath = join(root, ".rk", "generated.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.schema_version).toBe("1");
    expect(manifest.entries).toEqual([{ path: "build/site/index.html", generator: "render-site-v1" }]);
    expect(lines.join("\n")).toContain("adopted build/site/index.html");
  });

  test("re-running adopts the entry in place, preserving every other manifest entry byte-exactly", async () => {
    const root = repo();
    mkdirSync(join(root, ".rk"), { recursive: true });
    const preexisting = { schema_version: "1", entries: [{ path: "argument/INDEX.md", generator: "linker-index" }] };
    writeFileSync(join(root, ".rk", "generated.json"), JSON.stringify(preexisting));
    const { out } = capture();
    await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT }); // twice: idempotent upsert
    const manifest = JSON.parse(readFileSync(join(root, ".rk", "generated.json"), "utf8"));
    expect(manifest.entries).toContainEqual({ path: "argument/INDEX.md", generator: "linker-index" });
    expect(manifest.entries).toContainEqual({ path: "build/site/index.html", generator: "render-site-v1" });
    expect(manifest.entries.length).toBe(2); // no duplicate on the second run
  });

  test("a pre-existing manifest that is not valid JSON is never silently clobbered", async () => {
    const root = repo();
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "generated.json"), "{ not json");
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).not.toBe(0);
    expect(lines.join("\n")).toContain("not valid JSON");
    expect(readFileSync(join(root, ".rk", "generated.json"), "utf8")).toBe("{ not json");
  });

  test("--north-star threads into the what-blocks summary", async () => {
    const root = repo();
    const { out } = capture();
    await renderCommand(["--root", root, "--north-star", "thm-main"], out, { afCommand: ABSENT, frCommand: ABSENT });
    const html = readFileSync(join(root, "build", "site", "index.html"), "utf8");
    expect(html).toContain("what blocks the north star (thm-main)");
  });

  test("registered on the top-level dispatcher; --help is side-effect-free", async () => {
    const { out, lines } = capture();
    const code = await run(["render", "--help"], { out });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("rk render");
    expect(lines.join("\n")).toContain("--out");
  });
});
