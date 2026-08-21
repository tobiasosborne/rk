// Tests for src/refs/snowball-triage.ts — the pure triage-ledger table parse/merge/format logic
// `rk refs snowball` uses to write refs/triage.md. Covers the merge contract: generated columns
// (title/year/depth/via) always refresh from the latest closure; authored columns (triage/reason)
// are preserved across reruns; a row is never deleted even when it falls out of a later closure.

import { describe, expect, test } from "bun:test";
import type { ClosureEntry } from "../src/refs/snowball-closure";
import {
  formatTriageDocument,
  mergeTriageRows,
  parseTriageTable,
  type TriageRow,
} from "../src/refs/snowball-triage";

function entry(partial: Partial<ClosureEntry> & { id: string }): ClosureEntry {
  return { depth: 0, via: [], direction: "seed", ...partial };
}

describe("parseTriageTable", () => {
  test("a text with no table parses to []", () => {
    expect(parseTriageTable("just some prose\nno table here\n")).toEqual([]);
  });

  test("round-trips through formatTriageDocument", () => {
    const rows: TriageRow[] = [
      { id: "2510.01333", title: "A Paper", year: "2025", depth: "0", via: "", triage: "seed", reason: "" },
      { id: "A1", title: "Another", year: "", depth: "1", via: "2510.01333", triage: "in", reason: "core lemma" },
    ];
    const doc = formatTriageDocument(rows);
    expect(parseTriageTable(doc)).toEqual(rows);
  });
});

describe("mergeTriageRows — fresh (no existing rows)", () => {
  test("every row is new; seeds pre-filled 'seed', non-seeds blank", () => {
    const entries: ClosureEntry[] = [
      entry({ id: "S1", title: "Seed", year: 2020, depth: 0, direction: "seed" }),
      entry({ id: "A1", title: "Ref A", year: 2018, depth: 1, via: ["S1"], direction: "ref" }),
    ];
    const { rows, newCount } = mergeTriageRows(entries, []);
    expect(newCount).toBe(2);
    expect(rows).toEqual([
      { id: "S1", title: "Seed", year: "2020", depth: "0", via: "", triage: "seed", reason: "" },
      { id: "A1", title: "Ref A", year: "2018", depth: "1", via: "S1", triage: "", reason: "" },
    ]);
  });
});

describe("mergeTriageRows — merge with existing", () => {
  test("preserves triage/reason for a known id, refreshes generated columns", () => {
    const entries: ClosureEntry[] = [
      entry({ id: "A1", title: "Ref A (refreshed title)", year: 2018, depth: 1, via: ["S1", "S2"], direction: "both" }),
    ];
    const existing: TriageRow[] = [
      { id: "A1", title: "Ref A (stale title)", year: "2018", depth: "1", via: "S1", triage: "in", reason: "load-bearing" },
    ];
    const { rows, newCount } = mergeTriageRows(entries, existing);
    expect(newCount).toBe(0);
    expect(rows).toEqual([
      { id: "A1", title: "Ref A (refreshed title)", year: "2018", depth: "1", via: "S1, S2", triage: "in", reason: "load-bearing" },
    ]);
  });

  test("a stale row (id no longer in the closure) is kept verbatim at the end, never deleted, never counted as new", () => {
    const entries: ClosureEntry[] = [entry({ id: "S1", title: "Seed", depth: 0, direction: "seed" })];
    const existing: TriageRow[] = [
      { id: "S1", title: "Seed (old)", year: "", depth: "0", via: "", triage: "seed", reason: "" },
      { id: "GONE", title: "No longer reachable", year: "1999", depth: "2", via: "X", triage: "out", reason: "off-topic" },
    ];
    const { rows, newCount } = mergeTriageRows(entries, existing);
    expect(newCount).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.id).toBe("S1");
    expect(rows[0]!.title).toBe("Seed"); // refreshed
    expect(rows[1]).toEqual(existing[1]); // stale row untouched, appended
  });

  test("mixed: one refreshed, one brand new, one stale — counts and order are all correct", () => {
    const entries: ClosureEntry[] = [
      entry({ id: "S1", title: "Seed", depth: 0, direction: "seed" }),
      entry({ id: "NEW1", title: "Newly found", year: 2021, depth: 1, via: ["S1"], direction: "cite" }),
    ];
    const existing: TriageRow[] = [
      { id: "S1", title: "Seed", year: "", depth: "0", via: "", triage: "seed", reason: "" },
      { id: "STALE", title: "Was here before", year: "2000", depth: "1", via: "S1", triage: "context", reason: "background" },
    ];
    const { rows, newCount } = mergeTriageRows(entries, existing);
    expect(newCount).toBe(1);
    expect(rows.map((r) => r.id)).toEqual(["S1", "NEW1", "STALE"]);
    expect(rows[1]!.triage).toBe(""); // new non-seed row starts blank
    expect(rows[2]).toEqual(existing[1]);
  });
});

describe("pipe characters in generated cells (2026-08-21 truncation incident)", () => {
  // A title containing '|' (e.g. "Entanglement of |ψ⟩ states") used to split into an extra cell;
  // parseTriageTable then stopped at that row and the next writer (`rk refs triage --auto`)
  // rewrote a 6437-row ledger with 1478 rows. Writer escapes, parser unescapes, and a LEGACY
  // unescaped row (written before this fix) is recovered by folding the extra cells into title.
  test("formatTriageDocument escapes '|' and parseTriageTable round-trips it", () => {
    const rows: TriageRow[] = [
      { id: "a", title: "Entanglement of |psi> states", year: "2010", depth: "1", via: "s", triage: "", reason: "" },
      { id: "b", title: "After the pipe row", year: "2011", depth: "1", via: "s", triage: "in", reason: "x | y" },
    ];
    const doc = formatTriageDocument(rows);
    expect(doc).toContain("Entanglement of \\|psi> states");
    expect(parseTriageTable(doc)).toEqual(rows);
  });

  test("a legacy unescaped pipe title is folded back into the title column and parsing continues", () => {
    const legacy = [
      "| id | title | year | depth | via | triage | reason |",
      "|----|-------|------|-------|-----|--------|--------|",
      "| a | Entanglement of |psi> states | 2010 | 1 | s |  |  |",
      "| b | After | 2011 | 1 | s | in | ok |",
    ].join("\n");
    const rows = parseTriageTable(legacy);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    // spacing around the folded pipe is not recoverable (cells are trimmed) and does not matter:
    // the title column is regenerated from the closure on every rerun; alignment is what counts.
    expect(rows[0]!.title).toMatch(/^Entanglement of \|\s?psi> states$/);
    expect(rows[0]!.year).toBe("2010");
    expect(rows[1]!.triage).toBe("in");
  });

  test("a row with FEWER than 7 cells is still a hard stop (malformed table, not a pipe title)", () => {
    const doc = ["| id | title | year | depth | via | triage | reason |", "|----|---|---|---|---|---|---|", "| a | t |", "| b | t | 1 | 1 | s |  |  |"].join("\n");
    expect(parseTriageTable(doc)).toEqual([]);
  });
});
