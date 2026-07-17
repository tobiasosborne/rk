import { describe, expect, test } from "bun:test";
import { assertSafeRelPath, isSafeRelPath } from "../../src/refs/path-safety";

// DIVERGENCE from fetch-refs.py: the python script joins a lock-file/manifest `path` field
// straight into a filesystem path with no validation (fetch-refs.py:137-140, `install`). A
// malformed or malicious sources.lock.json entry (`path: "../../etc/passwd"`) would let it
// write outside refs/. Neither PRD C7 nor docs/gate-contracts.md specifies this, but it is a
// real correctness gap, not a parity question — rk closes it. Classification: rk-correct.

describe("isSafeRelPath", () => {
  test("accepts an ordinary relative path", () => {
    expect(isSafeRelPath("foo-2026/paper.tex")).toBe(true);
    expect(isSafeRelPath("a.pdf")).toBe(true);
  });

  test("rejects a path containing a '..' segment, anywhere in it", () => {
    expect(isSafeRelPath("../../etc/passwd")).toBe(false);
    expect(isSafeRelPath("foo/../../bar")).toBe(false);
    expect(isSafeRelPath("foo/..")).toBe(false);
    expect(isSafeRelPath("..")).toBe(false);
  });

  test("rejects an absolute path", () => {
    expect(isSafeRelPath("/etc/passwd")).toBe(false);
  });

  test("rejects the empty string", () => {
    expect(isSafeRelPath("")).toBe(false);
  });

  test("a '..' merely as a substring of a legitimate segment is fine (not a traversal)", () => {
    expect(isSafeRelPath("foo..bar/baz...tex")).toBe(true);
  });
});

describe("assertSafeRelPath", () => {
  test("does not throw for a safe path", () => {
    expect(() => assertSafeRelPath("a/b.tex")).not.toThrow();
  });

  test("throws a descriptive error for an unsafe path", () => {
    expect(() => assertSafeRelPath("../evil")).toThrow(/unsafe|traversal/i);
  });
});
