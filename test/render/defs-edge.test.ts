// EDGE test for src/render/defs-edge.ts. `loadDefsData` reads `definitions/*.md` frontmatter
// (id/term/kind/status/aliases/source/sha256 — Gate 1's own field set, src/gates/defs.ts) plus an
// optional repo-root CONVENTIONS.md, off disk via src/store/snapshot-load.ts's `loadSnapshot`
// (read-only import). Fixture: corpus/render/defs-index/repo/ — one cited/locked def with
// aliases, one consensus/draft def, and a real CONVENTIONS.md (the stamped template, filled in).

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadDefsData } from "../../src/render/defs-edge";

const REPO = join(import.meta.dir, "..", "..", "corpus", "render", "defs-index", "repo");

describe("render/defs-edge", () => {
  test("parses every definitions/*.md shard's frontmatter fields", () => {
    const data = loadDefsData(REPO);
    const ids = data.defs.map((d) => d.id).sort();
    expect(ids).toEqual(["def-bar", "def-foo"]);
    const foo = data.defs.find((d) => d.id === "def-foo")!;
    expect(foo.term).toBe("Foo");
    expect(foo.kind).toBe("cited");
    expect(foo.status).toBe("locked");
    expect(foo.aliases).toEqual(["Foobar", "F"]);
    expect(foo.source).toBe("kitaev-2405.02434");
    expect(foo.sha256).toBe("0123456789abcdef");
  });

  test("a consensus def carries no source/sha256 (those are cited-only fields)", () => {
    const data = loadDefsData(REPO);
    const bar = data.defs.find((d) => d.id === "def-bar")!;
    expect(bar.kind).toBe("consensus");
    expect(bar.source).toBeUndefined();
    expect(bar.sha256).toBeUndefined();
  });

  test("reads CONVENTIONS.md verbatim when present", () => {
    const data = loadDefsData(REPO);
    expect(data.conventions).toBeDefined();
    expect(data.conventions).toContain("# CONVENTIONS");
    expect(data.conventions).toContain("Ledger");
  });

  test("CONVENTIONS.md absent is a legitimate, honestly-reported state (never a crash)", () => {
    const data = loadDefsData(join(import.meta.dir, "..", ".."));
    expect(data.conventions).toBeUndefined();
  });
});
