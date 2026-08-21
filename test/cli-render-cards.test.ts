// Tests for `rk render cards` (src/cli/render-cards.ts, bead rk-nsex): the fs edge that writes
// refs/cards/<source-id>/L1-<n>.md from the extraction records and adopts each one in
// .rk/generated.json so Gate 7 byte-diffs it. The render CORE is tested in test/render/cards.test.ts;
// this file proves the edge — where files land, what the manifest ends up saying, and that a
// re-render is a no-op.
//
// L1 red-green: written before src/cli/render-cards.ts existed (import error = RED).

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderCommand } from "../src/cli/render";
import { canonicalRecordSha256 } from "../src/gates/canonical-json";
import { sha256Hex } from "../src/gates/sha256";

const PAPER = ["Section 2. Preliminaries", "Theorem 1.1. Every widget is round,", "where the widget is d-regular.", "Proof. Omitted.", ""].join("\n");
const hashOf = (t: string) => sha256Hex(new TextEncoder().encode(t));

const RECORD = {
  schema_version: "1",
  record_kind: "L1",
  source: "widget-2026",
  payload_sha256: hashOf(PAPER),
  result_label: "Theorem 1.1",
  statement_range: "refs/sources/widget.txt:2-3",
  statement_verbatim: "Theorem 1.1. Every widget is round,\nwhere the widget is d-regular.",
  statement_blessed: "Every widget is round when d-regular.",
  hypotheses: [{ text: "where the widget is d-regular", anchor: "refs/sources/widget.txt:3" }],
  conclusion: "The widget is round.",
  signature: { schema_version: "1", profile: "qpcp.v1", pre: [], post: [] },
  profile: "qpcp.v1",
  proof_locus: "refs/sources/widget.txt:4-4",
};

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

describe("rk render cards — CLI edge", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  function repo(opts: { review?: boolean } = {}): string {
    const root = mkdtempSync(join(tmpdir(), "rk-cards-cli-"));
    dirs.push(root);
    mkdirSync(join(root, "refs", "sources"), { recursive: true });
    mkdirSync(join(root, "refs", "manifest"), { recursive: true });
    mkdirSync(join(root, "refs", "records", "widget-2026"), { recursive: true });
    writeFileSync(join(root, "refs", "sources", "widget.txt"), PAPER);
    writeFileSync(
      join(root, "refs", "manifest", "sources.lock.json"),
      JSON.stringify({ files: [{ path: "sources/widget.txt", sha256: hashOf(PAPER), source_id: "widget-2026" }] }, null, 2),
    );
    writeFileSync(join(root, "refs", "records", "widget-2026", "L1-1.json"), JSON.stringify(RECORD, null, 2));
    if (opts.review !== false) {
      const clause = (note: string) => ({ value: true, note });
      writeFileSync(
        join(root, "refs", "records", "widget-2026", "L1-1.review.json"),
        JSON.stringify(
          {
            schema_version: "1",
            card_sha256: canonicalRecordSha256(RECORD),
            verdict: "VALID",
            reviewer: { family: "gpt", backend: "codex", model: "gpt-5.6-sol", session: "s1" },
            checked: {
              statement_complete: clause("read the range"),
              hypotheses_complete: clause("one"),
              translation_faithful: clause("faithful"),
              signature_faithful: clause("faithful"),
            },
            findings: [],
          },
          null,
          2,
        ),
      );
    }
    return root;
  }

  test("writes one card per record and adopts it in .rk/generated.json for Gate 7", async () => {
    const root = repo();
    const { out, lines } = capture();
    expect(await renderCommand(["cards", "--root", root], out)).toBe(0);
    const card = join(root, "refs", "cards", "widget-2026", "L1-1.md");
    expect(existsSync(card)).toBe(true);
    expect(readFileSync(card, "utf8")).toContain("Every widget is round when d-regular.");
    const manifest = JSON.parse(readFileSync(join(root, ".rk", "generated.json"), "utf8"));
    expect(manifest.schema_version).toBe("1");
    expect(manifest.entries).toEqual([{ path: "refs/cards/widget-2026/L1-1.md", generator: "cards-v1" }]);
    expect(lines.join("\n")).toContain("1 card");
  });

  test("re-rendering is a byte-identical no-op (deterministic, no clock)", async () => {
    const root = repo();
    const { out } = capture();
    await renderCommand(["cards", "--root", root], out);
    const first = readFileSync(join(root, "refs", "cards", "widget-2026", "L1-1.md"), "utf8");
    await renderCommand(["cards", "--root", root], out);
    expect(readFileSync(join(root, "refs", "cards", "widget-2026", "L1-1.md"), "utf8")).toBe(first);
    const manifest = JSON.parse(readFileSync(join(root, ".rk", "generated.json"), "utf8"));
    expect(manifest.entries).toHaveLength(1);
  });

  test("an unreviewed record still renders — as the NOT ADMISSIBLE stub, named in the output", async () => {
    const root = repo({ review: false });
    const { out, lines } = capture();
    expect(await renderCommand(["cards", "--root", root], out)).toBe(0);
    const card = readFileSync(join(root, "refs", "cards", "widget-2026", "L1-1.md"), "utf8");
    expect(card).toContain("NOT ADMISSIBLE");
    expect(card).not.toContain("Every widget is round when d-regular.");
    expect(lines.join("\n")).toContain("1 not admissible");
  });

  test("a repo with no records writes nothing and says so, exit 0", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-cards-empty-"));
    dirs.push(root);
    const { out, lines } = capture();
    expect(await renderCommand(["cards", "--root", root], out)).toBe(0);
    expect(existsSync(join(root, "refs", "cards"))).toBe(false);
    expect(lines.join("\n")).toContain("0 card");
  });

  test("an existing manifest entry for another artifact is preserved", async () => {
    const root = repo();
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(
      join(root, ".rk", "generated.json"),
      JSON.stringify({ schema_version: "1", entries: [{ path: "argument/INDEX.md", generator: "linker-index" }] }, null, 2),
    );
    const { out } = capture();
    await renderCommand(["cards", "--root", root], out);
    const manifest = JSON.parse(readFileSync(join(root, ".rk", "generated.json"), "utf8"));
    expect(manifest.entries).toEqual([
      { path: "argument/INDEX.md", generator: "linker-index" },
      { path: "refs/cards/widget-2026/L1-1.md", generator: "cards-v1" },
    ]);
  });
});
