// 1:1 test file for src/gates/notation-shards.ts — the notation register's parser
// (`definitions/**/*.md` shards with `shard_type: notation`). Contract: docs/gate-contracts.md
// Gate 1, "Notation shards". rk-5lzf / LB5.

import { describe, expect, test } from "bun:test";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { parseNotationShards, parseTranslationRows, registeredSymbols } from "../../src/gates/notation-shards";

const SHARD = `---
id: sym-eps
term: promise gap
shard_type: notation
symbol: \\epsilon
class: promise-gap
kind: consensus
consensus: campaign convention
status: locked
---

Translations:

- kitaev-2405.02434: \\eps @ refs/kitaev-2405.02434/paper.tex:12
  "the promise gap \\eps"
- aav-1309.7495: \\gamma_0 @ refs/aav-1309.7495/paper.tex:40
  "gap parameter \\gamma_0"
`;

describe("parseTranslationRows", () => {
  test("reads every row with its anchor quote on the following line", () => {
    const rows = parseTranslationRows(SHARD);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sourceId: "kitaev-2405.02434",
      theirSymbol: "\\eps",
      sourcePath: "refs/kitaev-2405.02434/paper.tex",
      locusText: "12",
      anchorQuote: "the promise gap \\eps",
    });
    expect(rows[1]!.sourceId).toBe("aav-1309.7495");
  });

  test("row line numbers are 1-indexed against the WHOLE file, not the body", () => {
    const rows = parseTranslationRows(SHARD);
    expect(SHARD.split("\n")[rows[0]!.line - 1]).toContain("kitaev-2405.02434");
  });

  test("a row with no anchor line carries anchorQuote undefined (Gate 1 ERRORs on it)", () => {
    const rows = parseTranslationRows(`---\nid: x\n---\n- src: \\e @ refs/src/p.tex:3\nprose, not an anchor\n`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.anchorQuote).toBeUndefined();
  });

  test("rows inside the FRONTMATTER are not body rows (the grammar is body-only)", () => {
    const rows = parseTranslationRows(`---\nid: x\ntranslations:\n- src: \\e @ refs/src/p.tex:3\n---\nbody\n`);
    expect(rows).toEqual([]);
  });

  test("prose merely mentioning refs/ is not a row — the grammar is strict and standalone", () => {
    const rows = parseTranslationRows(`---\nid: x\n---\nSee refs/src/p.tex:3 for the definition.\n"a quote"\n`);
    expect(rows).toEqual([]);
  });

  test("a row missing the ' @ ' separator is not a row", () => {
    const rows = parseTranslationRows(`---\nid: x\n---\n- src: \\e refs/src/p.tex:3\n"q"\n`);
    expect(rows).toEqual([]);
  });
});

describe("parseNotationShards", () => {
  test("finds nested notation shards and ignores ordinary definition shards", () => {
    const snap = snapshotFromFiles({
      "definitions/notation/sym-eps.md": SHARD,
      "definitions/def-plain.md": "---\nid: def-plain\nterm: T\nkind: original\nstatus: locked\n---\nbody\n",
      "definitions/notation/README.md": "---\nid: r\nshard_type: notation\nsymbol: \\x\n---\n",
    });
    const shards = parseNotationShards(snap);
    expect(shards).toHaveLength(1);
    expect(shards[0]).toMatchObject({ path: "definitions/notation/sym-eps.md", symbol: "\\epsilon", className: "promise-gap" });
    expect(shards[0]!.translations).toHaveLength(2);
  });

  test("a shard with unparseable frontmatter is not a notation shard (never invents structure)", () => {
    const snap = snapshotFromFiles({ "definitions/notation/x.md": "shard_type: notation\nsymbol: \\x\n" });
    expect(parseNotationShards(snap)).toEqual([]);
  });

  test("translations: in the FRONTMATTER is flagged, not silently swallowed", () => {
    const snap = snapshotFromFiles({
      "definitions/notation/x.md": "---\nid: x\nshard_type: notation\nsymbol: \\x\nclass: c\ntranslations:\n- a: \\b @ refs/a/p.tex:1\n---\nbody\n",
    });
    const shards = parseNotationShards(snap);
    expect(shards[0]!.translationsInFrontmatter).toBe(true);
    expect(shards[0]!.translations).toEqual([]);
  });
});

describe("registeredSymbols", () => {
  test("indexes each shard by its symbol; a shard with no symbol registers nothing", () => {
    const snap = snapshotFromFiles({
      "definitions/notation/sym-eps.md": SHARD,
      "definitions/notation/sym-none.md": "---\nid: sym-none\nshard_type: notation\nclass: promise-gap\n---\n",
    });
    const index = registeredSymbols(parseNotationShards(snap));
    expect([...index.keys()]).toEqual(["\\epsilon"]);
  });
});
