import { describe, expect, test } from "bun:test";
import { hasPath, hasPrefix, listDir, parseFrontmatter } from "../src/gates/snapshot";

describe("listDir / hasPath / hasPrefix", () => {
  const snap = new Map([
    ["definitions/a.md", "A"],
    ["definitions/b.md", "B"],
    ["proofs/lem-x/ledger/000001.json", "{}"],
    ["proofs/lem-x/meta.json", "{}"],
  ]);

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
});
