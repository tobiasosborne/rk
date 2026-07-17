import { describe, expect, test } from "bun:test";
import { checksumMatches, parseChecksumsFile, serializeChecksumsFile, sha16 } from "../../src/refs/checksum";

describe("sha16", () => {
  test("takes the first 16 hex chars of a full sha256", () => {
    const full = "f358c71c066293f80c1f2cebd1bfb6b46489bf25320bccef7c5ec6b464b3aa0";
    expect(sha16(full)).toBe("f358c71c066293f8");
  });

  test("is stable on an already-16-char input", () => {
    expect(sha16("abcdef0123456789")).toBe("abcdef0123456789");
  });
});

describe("checksumMatches", () => {
  test("matches identical hex, case-insensitively", () => {
    expect(checksumMatches("ABCDEF01", "abcdef01")).toBe(true);
  });

  test("rejects a differing hash", () => {
    expect(checksumMatches("abcdef01", "abcdef02")).toBe(false);
  });

  test("rejects a differing-length hash (no accidental prefix match)", () => {
    expect(checksumMatches("abcdef01", "abcdef0100")).toBe(false);
  });
});

describe("parseChecksumsFile", () => {
  test("parses AISM's sha256sum -c format (hash, two spaces, ./relpath)", () => {
    const text =
      "f358c71c066293f80c1f2cebd1bfb6b46489bf25320bccef7c5ec6b464b3aa01  ./baake-sumner-2007.11433/equal-fin.tex\n" +
      "d74844072a1b96a29acbae5586e42c641fcc17721f55b89184b95dbcf25fa649  ./hognas-mukherjea/hognas-mukherjea-2011.pdf\n";
    const rows = parseChecksumsFile(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      sha256: "f358c71c066293f80c1f2cebd1bfb6b46489bf25320bccef7c5ec6b464b3aa01",
      path: "baake-sumner-2007.11433/equal-fin.tex",
    });
    expect(rows[1]!.path).toBe("hognas-mukherjea/hognas-mukherjea-2011.pdf");
  });

  test("ignores blank lines", () => {
    const text = "\nf358c71c066293f80c1f2cebd1bfb6b46489bf25320bccef7c5ec6b464b3aa01  ./a.tex\n\n";
    expect(parseChecksumsFile(text)).toHaveLength(1);
  });

  test("empty file yields empty array", () => {
    expect(parseChecksumsFile("")).toEqual([]);
  });
});

describe("serializeChecksumsFile", () => {
  test("round-trips through parseChecksumsFile", () => {
    const rows = [
      { sha256: "aa".repeat(32), path: "foo/bar.tex" },
      { sha256: "bb".repeat(32), path: "baz.pdf" },
    ];
    const text = serializeChecksumsFile(rows);
    expect(parseChecksumsFile(text)).toEqual(rows);
  });

  test("uses the sha256sum -c double-space + ./ prefix convention", () => {
    const text = serializeChecksumsFile([{ sha256: "aa".repeat(32), path: "foo.tex" }]);
    expect(text).toBe(`${"aa".repeat(32)}  ./foo.tex\n`);
  });
});
