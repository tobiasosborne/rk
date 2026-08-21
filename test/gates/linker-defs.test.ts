// 1:1 test file for src/gates/linker-defs.ts (split from linker-parse.ts, rk-c83). `loadDefIds`
// previously had no dedicated unit test — its only coverage was indirect, through
// test/store/registry-load.test.ts's fs-backed `loadRegistrySource` test and the gate-contracts
// Gate 2 check-7 corpus fixtures. These tests exercise it directly, against a pure snapshot, per
// its own doc comment: README.md/INDEX.md excluded, a shard with absent/unterminated frontmatter
// or no `id:` silently skipped (this module is a lookup table, not a validator of `definitions/`
// shards — that is the defs gate's job).

import { describe, expect, test } from "bun:test";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { loadDefIds } from "../../src/gates/linker-defs";

describe("loadDefIds", () => {
  test("collects ids from well-formed definitions/*.md shards", () => {
    const snapshot = snapshotFromFiles({
      "definitions/def-x.md": "---\nid: def-x\nterm: X\n---\nBody.\n",
      "definitions/def-y.md": "---\nid: def-y\nterm: Y\n---\nBody.\n",
    });
    expect(loadDefIds(snapshot)).toEqual(new Set(["def-x", "def-y"]));
  });

  test("README.md and INDEX.md are excluded even when they carry frontmatter", () => {
    const snapshot = snapshotFromFiles({
      "definitions/def-x.md": "---\nid: def-x\n---\nBody.\n",
      "definitions/README.md": "---\nid: readme-should-not-count\n---\nBody.\n",
      "definitions/INDEX.md": "---\nid: index-should-not-count\n---\nBody.\n",
    });
    expect(loadDefIds(snapshot)).toEqual(new Set(["def-x"]));
  });

  test("a shard with missing/unterminated frontmatter is silently skipped (not this module's job to flag)", () => {
    const snapshot = snapshotFromFiles({
      "definitions/def-x.md": "---\nid: def-x\n---\nBody.\n",
      "definitions/def-bad.md": "---\nid: def-bad\nno terminator here\n",
    });
    expect(loadDefIds(snapshot)).toEqual(new Set(["def-x"]));
  });

  test("a shard with no id: line is silently skipped", () => {
    const snapshot = snapshotFromFiles({
      "definitions/def-noid.md": "---\nterm: X\n---\nBody.\n",
    });
    expect(loadDefIds(snapshot)).toEqual(new Set());
  });

  // rk-5lzf: discovery is RECURSIVE (`definitions/**/*.md`) — a notation shard at
  // `definitions/notation/<symbol-id>.md` must resolve a `defs:` reference like any other, or
  // Gate 2 check 7 reports "unknown def id" for a shard that plainly exists.
  test("collects ids from NESTED definitions shards (definitions/**/*.md, rk-5lzf)", () => {
    const snapshot = snapshotFromFiles({
      "definitions/def-x.md": "---\nid: def-x\nterm: X\n---\nBody.\n",
      "definitions/notation/sym-eps.md": "---\nid: sym-eps\nterm: eps\n---\nBody.\n",
      "definitions/notation/deep/sym-gam.md": "---\nid: sym-gam\nterm: gam\n---\nBody.\n",
    });
    expect(loadDefIds(snapshot)).toEqual(new Set(["def-x", "sym-eps", "sym-gam"]));
  });

  test("README.md/INDEX.md are excluded at ANY depth (rk-5lzf)", () => {
    const snapshot = snapshotFromFiles({
      "definitions/notation/README.md": "---\nid: readme-should-not-count\n---\nBody.\n",
      "definitions/notation/sym-eps.md": "---\nid: sym-eps\n---\nBody.\n",
    });
    expect(loadDefIds(snapshot)).toEqual(new Set(["sym-eps"]));
  });

  test("an empty definitions/ directory yields an empty set, not an error", () => {
    const snapshot = snapshotFromFiles({});
    expect(loadDefIds(snapshot)).toEqual(new Set());
  });
});
