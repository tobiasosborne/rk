// 1:1 test file for src/gates/definitions-scan.ts — THE canonical recursive `definitions/**/*.md`
// reader and the ONE shared non-shard policy. Contract: docs/gate-contracts.md Gate 1 Inputs.
// rk-5lzf repair wave, blocker B6 (Tier A review 2026-08-20, finding 6).

import { describe, expect, test } from "bun:test";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import {
  definitionShardPaths,
  idCollisions,
  isNonShardBasename,
  readDefinitionShards,
} from "../../src/gates/definitions-scan";

function shard(id: string): string {
  return `---\nid: ${id}\nterm: ${id}\nkind: original\nstatus: locked\nconsensus: x\n---\nbody\n`;
}

describe("isNonShardBasename — the ONE shared policy", () => {
  test("the three generated/mirror names are non-shards", () => {
    for (const n of ["README.md", "INDEX.md", "DAG.md"]) expect(isNonShardBasename(n)).toBe(true);
  });

  test("an underscore-prefixed basename is a non-shard (scratch/partial convention)", () => {
    expect(isNonShardBasename("_draft.md")).toBe(true);
    expect(isNonShardBasename("_.md")).toBe(true);
  });

  test("a notes* basename is a non-shard at any depth", () => {
    for (const n of ["notes.md", "notes-2026-08-20.md", "NOTES.md"]) expect(isNonShardBasename(n)).toBe(true);
  });

  test("an ordinary shard name is NOT a non-shard, including one merely containing 'notes'", () => {
    for (const n of ["def-a.md", "sym-eps.md", "def-notes-on-gaps.md"]) expect(isNonShardBasename(n)).toBe(false);
  });
});

describe("definitionShardPaths", () => {
  test("recurses to any depth and applies the shared policy at every level", () => {
    const snap = snapshotFromFiles({
      "definitions/def-a.md": shard("def-a"),
      "definitions/notation/sym-eps.md": shard("sym-eps"),
      "definitions/notation/deep/sym-gam.md": shard("sym-gam"),
      "definitions/notation/README.md": "x",
      "definitions/notation/DAG.md": "x",
      "definitions/_scratch.md": "x",
      "definitions/notation/notes.md": "x",
      "definitions/not-markdown.txt": "x",
    });
    expect(definitionShardPaths(snap)).toEqual([
      "definitions/def-a.md",
      "definitions/notation/deep/sym-gam.md",
      "definitions/notation/sym-eps.md",
    ]);
  });
});

describe("readDefinitionShards", () => {
  test("returns path + id + content + fields for every shard", () => {
    const snap = snapshotFromFiles({ "definitions/notation/sym-eps.md": shard("sym-eps") });
    const shards = readDefinitionShards(snap);
    expect(shards).toHaveLength(1);
    expect(shards[0]!.path).toBe("definitions/notation/sym-eps.md");
    expect(shards[0]!.id).toBe("sym-eps");
    expect(shards[0]!.stem).toBe("sym-eps");
    expect(shards[0]!.fields.term).toBe("sym-eps");
  });

  test("a shard with unparseable frontmatter is returned with no id, never dropped", () => {
    const snap = snapshotFromFiles({ "definitions/def-bad.md": "no frontmatter\n" });
    const shards = readDefinitionShards(snap);
    expect(shards).toHaveLength(1);
    expect(shards[0]!.id).toBeUndefined();
    expect(shards[0]!.frontmatterOk).toBe(false);
  });
});

describe("idCollisions — B6's ambiguous flat ids", () => {
  test("two nested shards sharing one id are reported with both paths", () => {
    const snap = snapshotFromFiles({
      "definitions/notation/sym-eps.md": shard("sym-eps"),
      "definitions/legacy/sym-eps.md": shard("sym-eps"),
    });
    const collisions = idCollisions(readDefinitionShards(snap));
    expect(collisions).toHaveLength(1);
    expect(collisions[0]!.id).toBe("sym-eps");
    expect(collisions[0]!.paths).toEqual(["definitions/legacy/sym-eps.md", "definitions/notation/sym-eps.md"]);
  });

  test("distinct ids collide with nothing", () => {
    const snap = snapshotFromFiles({
      "definitions/a/sym-eps.md": shard("sym-eps"),
      "definitions/b/sym-gam.md": shard("sym-gam"),
    });
    expect(idCollisions(readDefinitionShards(snap))).toEqual([]);
  });

  test("shards with no id do not collide with each other", () => {
    const snap = snapshotFromFiles({
      "definitions/a/x.md": "---\nterm: t\n---\n",
      "definitions/b/y.md": "---\nterm: t\n---\n",
    });
    expect(idCollisions(readDefinitionShards(snap))).toEqual([]);
  });
});
