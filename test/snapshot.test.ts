import { describe, expect, test } from "bun:test";
import {
  childDirs,
  dirExists,
  fileSha256,
  hasPath,
  hasPrefix,
  isTracked,
  listDir,
  parseFrontmatter,
  snapshotFromFiles,
} from "../src/gates/snapshot";
import type { RepoSnapshot, SnapshotFacts } from "../src/gates/snapshot";
import { sha256Hex } from "../src/gates/sha256";
import { sha256Bytes } from "../src/refs/hash";

describe("snapshotFromFiles — pure test/probe builder (N2: facts are REQUIRED, never optional)", () => {
  test("synthesizes all three required facts from an in-memory file map", () => {
    const snap = snapshotFromFiles({
      "runs/2026-01-01-x/README.md": "hi",
      "report/main.tex": "m",
    });
    // Text map intact.
    expect(snap.get("report/main.tex")).toBe("m");
    // dirs DERIVED from every ancestor of every file path.
    expect(snap.dirs.has("runs")).toBe(true);
    expect(snap.dirs.has("runs/2026-01-01-x")).toBe(true);
    expect(snap.dirs.has("report")).toBe(true);
    // tracked defaults to every file path.
    expect(isTracked(snap, "report/main.tex")).toBe(true);
  });

  // M0.3 round-3 landing-blocker 2 (snapshot.ts:85/108): the builder must produce COHERENT facts —
  // a modeled-present file must carry a hash, exactly as the real edge (`loadSnapshot`) guarantees.
  // The old empty-`sha256` default created {present, tracked, no-hash}, an impossible edge state
  // Gate 4 check 4 reads as genuine disk-absence (false WARN). This pins present ⟺ hashed, and that
  // the default hash is BYTE-FAITHFUL (equal to the edge hasher over the file's UTF-8 bytes).
  test("every modeled-present file carries a byte-faithful hash (present ⟺ hashed — no impossible edge state)", () => {
    const snap = snapshotFromFiles({
      "runs/2026-01-01-x/README.md": "hi",
      "report/main.tex": "m",
    });
    // The reviewer's exact probe {has:true, tracked:true, hash:null} must no longer be reachable.
    expect(snap.has("report/main.tex")).toBe(true);
    expect(isTracked(snap, "report/main.tex")).toBe(true);
    expect(fileSha256(snap, "report/main.tex")).toBeDefined();
    // Byte-faithful: identical to the edge hasher over the same UTF-8 bytes.
    expect(fileSha256(snap, "report/main.tex")).toBe(sha256Bytes(new TextEncoder().encode("m")));
    expect(fileSha256(snap, "runs/2026-01-01-x/README.md")).toBe(sha256Hex(new TextEncoder().encode("hi")));
    // A genuinely-absent path still has NO hash fact — the WARN case, never conflated with present.
    expect(fileSha256(snap, "report/absent.tex")).toBeUndefined();
  });

  test("opts.dirs adds EMPTY directories that hold no file (path-derivation cannot see them)", () => {
    const snap = snapshotFromFiles({ "runs/README.md": "schema doc" }, { dirs: ["runs/2026-01-01-empty"] });
    expect(snap.dirs.has("runs/2026-01-01-empty")).toBe(true);
    expect(childDirs(snap, "runs")).toEqual(["2026-01-01-empty"]);
  });

  test("opts.tracked and opts.sha256 override the defaults", () => {
    const snap = snapshotFromFiles(
      { "refs/x/payload.tex": "body" },
      { tracked: [], sha256: { "refs/x/payload.tex": "deadbeefdeadbeef" } },
    );
    expect(isTracked(snap, "refs/x/payload.tex")).toBe(false); // untracked-but-present
    expect(fileSha256(snap, "refs/x/payload.tex")).toBe("deadbeefdeadbeef");
  });
});

describe("accessors read facts with NO silent degradation (N2)", () => {
  test("dirExists reads the dirs fact strictly — no file-prefix fallback on a factless snapshot", () => {
    // A hand-built factless snapshot is a TYPE error now; forced via `as` to prove the runtime no
    // longer silently papers over the missing fact (old dirExists fell back to hasPrefix and
    // returned TRUE here from the file prefix, making a present-but-empty dir indistinguishable
    // from an absent-but-file-shadowed one — the exact N2 ambiguity).
    const factless = new Map([["report/sections/a.tex", "x"]]) as unknown as RepoSnapshot;
    expect(() => dirExists(factless, "report/sections")).toThrow();
  });

  test("childDirs reads the dirs fact strictly — no silent [] on a factless snapshot", () => {
    const factless = new Map([["runs/2026-01-01-x/README.md", "x"]]) as unknown as RepoSnapshot;
    expect(() => childDirs(factless, "runs")).toThrow();
  });
});

describe("listDir / hasPath / hasPrefix", () => {
  const snap = snapshotFromFiles({
    "definitions/a.md": "A",
    "definitions/b.md": "B",
    "proofs/lem-x/ledger/000001.json": "{}",
    "proofs/lem-x/meta.json": "{}",
  });

  test("listDir returns immediate children only, sorted", () => {
    expect(listDir(snap, "definitions")).toEqual(["a.md", "b.md"]);
    expect(listDir(snap, "proofs/lem-x")).toEqual(["ledger", "meta.json"]);
  });

  test("listDir tolerates a trailing slash and returns [] for an absent dir", () => {
    expect(listDir(snap, "definitions/")).toEqual(["a.md", "b.md"]);
    expect(listDir(snap, "nowhere")).toEqual([]);
  });

  test("hasPath is exact", () => {
    expect(hasPath(snap, "definitions/a.md")).toBe(true);
    expect(hasPath(snap, "definitions/a")).toBe(false);
  });

  test("hasPrefix finds directory existence without a directory index", () => {
    expect(hasPrefix(snap, "proofs/lem-x/ledger")).toBe(true);
    expect(hasPrefix(snap, "proofs/lem-y")).toBe(false);
  });
});

describe("parseFrontmatter", () => {
  test("present + terminated + fields, on a well-formed block", () => {
    const fm = parseFrontmatter("---\nid: foo\nterm: Foo Term\nkind: original\nstatus: draft\n---\nbody\n");
    expect(fm.present).toBe(true);
    expect(fm.terminated).toBe(true);
    expect(fm.fields).toEqual({ id: "foo", term: "Foo Term", kind: "original", status: "draft" });
    expect(fm.malformedLines).toEqual([]);
  });

  test("absent when the file does not open with ---", () => {
    const fm = parseFrontmatter("id: foo\n---\n");
    expect(fm.present).toBe(false);
    expect(fm.terminated).toBe(false);
    expect(fm.fields).toEqual({});
  });

  test("unterminated when no closing --- is ever found", () => {
    const fm = parseFrontmatter("---\nid: foo\nterm: bar\n");
    expect(fm.present).toBe(true);
    expect(fm.terminated).toBe(false);
  });

  test("a line with no ':' is recorded as malformed by 1-indexed line number, not silently dropped", () => {
    const fm = parseFrontmatter("---\nid: foo\nthis line has no colon\nterm: bar\n---\n");
    expect(fm.malformedLines).toEqual([3]);
    // The malformed line contributes no field, but parsing continues past it.
    expect(fm.fields).toEqual({ id: "foo", term: "bar" });
  });

  test("blank lines inside the block are skipped, not flagged malformed", () => {
    const fm = parseFrontmatter("---\nid: foo\n\nterm: bar\n---\n");
    expect(fm.malformedLines).toEqual([]);
    expect(fm.fields).toEqual({ id: "foo", term: "bar" });
  });

  test("a repeated key keeps only its last value", () => {
    const fm = parseFrontmatter("---\nid: foo\nid: bar\n---\n");
    expect(fm.fields.id).toBe("bar");
  });

  test("a value itself containing ':' splits only on the first colon", () => {
    const fm = parseFrontmatter("---\nlocus: p. 12, eq. 3:1\n---\n");
    expect(fm.fields.locus).toBe("p. 12, eq. 3:1");
  });

  test("empty file: absent, not a crash", () => {
    const fm = parseFrontmatter("");
    expect(fm.present).toBe(false);
  });

  // rk-wc3 (dogfood-2): a natural multi-line YAML block list under a `;`-list field (deps/defs/
  // routes) used to leave the key's value permanently "" (the continuation line has no ':' and
  // was recorded as merely malformed) — every downstream `;`-split consumer (parseList in
  // linker-parse.ts) silently saw an empty list, defeating the DAG/unknown-id checks with zero
  // diagnostic. Fixed: a `- item` line directly (modulo blank lines) following a `key:` line whose
  // OWN value was empty accumulates into that key's value as the SAME `;`-joined string the
  // single-line grammar already produces — parseList/parseRoutes need no awareness the source was
  // multi-line at all.
  describe("multi-line YAML block-list continuation (rk-wc3)", () => {
    test("a `key:` line with an empty value followed by `- item` lines joins them `;`-style", () => {
      const fm = parseFrontmatter("---\nid: foo\ndeps:\n  - a\n  - b\n  - c\n---\n");
      expect(fm.fields.deps).toBe("a; b; c");
      expect(fm.malformedLines).toEqual([]);
    });

    test("works uniformly for any list-valued key (defs, routes), not just deps", () => {
      const fm = parseFrontmatter("---\nid: foo\ndefs:\n  - RD1-def-two-coloring\n  - RD1-def-mono-triangle\n---\n");
      expect(fm.fields.defs).toBe("RD1-def-two-coloring; RD1-def-mono-triangle");
    });

    test("a blank line inside the block list does not terminate the continuation", () => {
      const fm = parseFrontmatter("---\nid: foo\ndeps:\n  - a\n\n  - b\n---\n");
      expect(fm.fields.deps).toBe("a; b");
    });

    test("continuation stops at the next real `key:` line, which parses normally", () => {
      const fm = parseFrontmatter("---\nid: foo\ndeps:\n  - a\n  - b\nkind: lemma\n---\n");
      expect(fm.fields.deps).toBe("a; b");
      expect(fm.fields.kind).toBe("lemma");
    });

    test("single-line `;`-list values are completely unchanged (no regression)", () => {
      const fm = parseFrontmatter("---\nid: foo\ndeps: a; b; c\n---\n");
      expect(fm.fields.deps).toBe("a; b; c");
    });

    test("a `- item` line with NO preceding empty-valued key is a genuine malformed line, loud, " +
      "never silently absorbed", () => {
      const fm = parseFrontmatter("---\nid: foo\n  - stray\n---\n");
      expect(fm.malformedLines).toEqual([3]);
      expect(fm.fields.id).toBe("foo");
    });

    test("an unterminated block still accumulates the list into the field before EOF", () => {
      const fm = parseFrontmatter("---\nid: foo\ndeps:\n  - a\n  - b\n");
      expect(fm.terminated).toBe(false);
      expect(fm.fields.deps).toBe("a; b");
    });
  });
});
