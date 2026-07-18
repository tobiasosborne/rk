import { describe, expect, test } from "bun:test";
import { compareSemver, parseSemver, semverEqual } from "../../src/scaffold/version";

describe("parseSemver (pure)", () => {
  test("parses a valid x.y.z", () => {
    expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  });
  test("rejects garbage without throwing", () => {
    expect(parseSemver("not-a-version")).toBeNull();
    expect(parseSemver("1.2")).toBeNull();
    expect(parseSemver("1.2.3-rc1")).toBeNull();
    expect(parseSemver("")).toBeNull();
  });
});

describe("compareSemver (pure)", () => {
  test("equal triples compare 0", () => {
    expect(compareSemver({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 })).toBe(0);
  });
  test("major dominates", () => {
    expect(compareSemver({ major: 1, minor: 9, patch: 9 }, { major: 2, minor: 0, patch: 0 })).toBe(-1);
    expect(compareSemver({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 9, patch: 9 })).toBe(1);
  });
  test("minor dominates when major equal", () => {
    expect(compareSemver({ major: 1, minor: 1, patch: 9 }, { major: 1, minor: 2, patch: 0 })).toBe(-1);
  });
  test("patch dominates when major/minor equal", () => {
    expect(compareSemver({ major: 1, minor: 2, patch: 3 }, { major: 1, minor: 2, patch: 4 })).toBe(-1);
    expect(compareSemver({ major: 1, minor: 2, patch: 4 }, { major: 1, minor: 2, patch: 3 })).toBe(1);
  });
});

describe("semverEqual (pure)", () => {
  test("same version strings, even with surrounding whitespace", () => {
    expect(semverEqual("1.0.0", " 1.0.0\n")).toBe(true);
  });
  test("different versions", () => {
    expect(semverEqual("1.0.0", "1.0.1")).toBe(false);
  });
  test("unparseable input on either side is never equal", () => {
    expect(semverEqual("garbage", "1.0.0")).toBe(false);
    expect(semverEqual("1.0.0", "garbage")).toBe(false);
    expect(semverEqual("garbage", "garbage")).toBe(false);
  });
});
