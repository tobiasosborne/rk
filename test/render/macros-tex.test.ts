// 1:1 test file for src/render/macros-tex.ts — the GENERATED notation macro file
// (`definitions/notation/macros.tex`, Gate 7 generator `notation-macros`). Contract:
// docs/gate-contracts.md Gate 1, "Notation shards" + Gate 7. rk-5lzf / LB5.

import { describe, expect, test } from "bun:test";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { MACROS_GENERATOR, MACROS_PATH, renderMacros } from "../../src/render/macros-tex";

function shard(fields: Record<string, string>): string {
  return `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\nbody\n`;
}

const REGISTER = {
  "definitions/notation/sym-locality.md": shard({
    id: "sym-locality",
    term: "locality",
    shard_type: "notation",
    symbol: "\\locality",
    class: "locality",
    expansion: "\\ensuremath{k}",
    kind: "consensus",
    consensus: "campaign",
    status: "locked",
  }),
  "definitions/notation/sym-gapfrac.md": shard({
    id: "sym-gapfrac",
    term: "relative promise gap",
    shard_type: "notation",
    symbol: "\\gapfrac",
    class: "promise-gap",
    expansion: "\\ensuremath{\\epsilon}",
    kind: "consensus",
    consensus: "campaign",
    status: "locked",
  }),
  "definitions/def-plain.md": shard({ id: "def-plain", term: "T", kind: "original", status: "locked", consensus: "x" }),
};

describe("renderMacros", () => {
  test("one \\newcommand per notation shard, sorted BY ID, not by path or insertion order", () => {
    const out = renderMacros(snapshotFromFiles(REGISTER));
    const commands = out.split("\n").filter((l) => l.startsWith("\\newcommand"));
    expect(commands).toEqual([
      "\\newcommand{\\gapfrac}{\\ensuremath{\\epsilon}}",
      "\\newcommand{\\locality}{\\ensuremath{k}}",
    ]);
  });

  test("ordinary definition shards contribute nothing", () => {
    const out = renderMacros(snapshotFromFiles(REGISTER));
    expect(out).not.toContain("def-plain");
  });

  test("no timestamps, no host paths — the same register renders the same bytes forever", () => {
    const a = renderMacros(snapshotFromFiles(REGISTER));
    const b = renderMacros(snapshotFromFiles(REGISTER));
    expect(a).toBe(b);
    expect(a).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
    expect(a).not.toMatch(/\b\d\d:\d\d:\d\d\b/);
  });

  test("the file declares itself GENERATED and names its generator (rule 9)", () => {
    const out = renderMacros(snapshotFromFiles(REGISTER));
    expect(out).toContain("GENERATED");
    expect(out).toContain(MACROS_GENERATOR);
    expect(out).toContain(MACROS_PATH);
  });

  test("a shard with no expansion: still gets a macro, visibly marked", () => {
    const out = renderMacros(
      snapshotFromFiles({
        "definitions/notation/sym-x.md": shard({ id: "sym-x", shard_type: "notation", symbol: "\\specgap", class: "spectral" }),
      }),
    );
    expect(out).toContain("\\newcommand{\\specgap}{\\ensuremath{\\mathsf{specgap}}}");
    expect(out).toContain("no expansion:");
  });

  test("a shard with no symbol: contributes no macro (it registers nothing)", () => {
    const out = renderMacros(
      snapshotFromFiles({ "definitions/notation/sym-x.md": shard({ id: "sym-x", shard_type: "notation", class: "spectral" }) }),
    );
    expect(out.split("\n").filter((l) => l.startsWith("\\newcommand"))).toEqual([]);
  });

  test("an EMPTY register renders a valid, stable file — never a crash, never nothing", () => {
    const out = renderMacros(snapshotFromFiles({}));
    expect(out).toContain("GENERATED");
    expect(out.endsWith("\n")).toBe(true);
    expect(out.split("\n").filter((l) => l.startsWith("\\newcommand"))).toEqual([]);
  });

  test("the rendered file ends with exactly one newline (byte-diffed by Gate 7)", () => {
    const out = renderMacros(snapshotFromFiles(REGISTER));
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });
});
