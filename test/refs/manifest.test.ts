import { describe, expect, test } from "bun:test";
import { appendManifestRow, formatManifestRow, parseManifestTable } from "../../src/refs/manifest";
import { sourceId } from "../../src/types";

const AISM_SOURCES_MD = `<!--
ROLE: catalogue of ground-truth reference sources for this repo.
-->

# SOURCES — ground-truth reference registry

**Policy.** Every \`cited\` definition names a source-id here.

## Source registry

| source-id | citation | locator | retrieved | local path | key file (sha256-16) | role |
|-----------|----------|---------|-----------|------------|----------------------|------|
| \`baake-sumner-2007.11433\` | Baake, Sumner, *On equal-input* | arXiv:2007.11433 [math.PR] | 2026-07-02 | \`refs/baake-sumner-2007.11433/equal-fin.tex\` | \`f358c71c066293f8\` | idempotent structure |
| \`hognas-mukherjea\` | G. Hognas, A. Mukherjea, *Probability Measures* | Springer | 2026-06-11 | \`refs/hognas-mukherjea/hognas-mukherjea-2011.pdf\` | \`d74844072a1b96a2\` | the delta=0 anchor |

**Provenance status.** Both sources are FOUND-AND-PINNED.
`;

describe("parseManifestTable", () => {
  test("parses every data row of a real AISM-shaped SOURCES.md table", () => {
    const rows = parseManifestTable(AISM_SOURCES_MD);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      sourceId: sourceId("baake-sumner-2007.11433"),
      citation: "Baake, Sumner, *On equal-input*",
      locator: "arXiv:2007.11433 [math.PR]",
      retrieved: "2026-07-02",
      localPath: "refs/baake-sumner-2007.11433/equal-fin.tex",
      sha16: "f358c71c066293f8",
      role: "idempotent structure",
    });
  });

  test("skips the header and separator rows", () => {
    const rows = parseManifestTable(AISM_SOURCES_MD);
    expect(rows.some((r) => r.sourceId === "source-id")).toBe(false);
  });

  test("strips backtick code-span markers from cell contents", () => {
    const rows = parseManifestTable(AISM_SOURCES_MD);
    expect(rows[1]!.sourceId).toBe("hognas-mukherjea");
    expect(rows[1]!.sha16).toBe("d74844072a1b96a2");
  });

  test("a SOURCES.md with no table yields an empty array, not an error", () => {
    expect(parseManifestTable("# SOURCES\n\nno table here.\n")).toEqual([]);
  });
});

describe("formatManifestRow", () => {
  test("formats a row as a single markdown table line", () => {
    const line = formatManifestRow({
      sourceId: sourceId("foo-2026.00001"),
      citation: "A. Author, *A Paper*",
      locator: "arXiv:2026.00001",
      retrieved: "2026-07-17",
      localPath: "refs/foo-2026.00001/paper.tex",
      sha16: "0123456789abcdef",
      role: "test fixture",
    });
    expect(line).toBe(
      "| `foo-2026.00001` | A. Author, *A Paper* | arXiv:2026.00001 | 2026-07-17 | " +
        "`refs/foo-2026.00001/paper.tex` | `0123456789abcdef` | test fixture |",
    );
  });
});

describe("appendManifestRow — round-trip with parseManifestTable", () => {
  test("appending a row and re-parsing yields the original rows plus the new one", () => {
    const before = parseManifestTable(AISM_SOURCES_MD);
    const newRow = {
      sourceId: sourceId("new-source-2026"),
      citation: "B. Author, *New Paper*",
      locator: "arXiv:2026.99999",
      retrieved: "2026-07-17",
      localPath: "refs/new-source-2026/paper.tex",
      sha16: "fedcba9876543210",
      role: "new fixture",
    };
    const after = appendManifestRow(AISM_SOURCES_MD, newRow);
    const rows = parseManifestTable(after);
    expect(rows).toEqual([...before, newRow]);
  });

  test("does not disturb prose before/after the table", () => {
    const after = appendManifestRow(AISM_SOURCES_MD, {
      sourceId: sourceId("x"),
      citation: "c",
      locator: "l",
      retrieved: "2026-01-01",
      localPath: "refs/x/x.pdf",
      sha16: "0".repeat(16),
      role: "r",
    });
    expect(after).toContain("**Provenance status.** Both sources are FOUND-AND-PINNED.");
    expect(after).toContain("# SOURCES — ground-truth reference registry");
  });
});
