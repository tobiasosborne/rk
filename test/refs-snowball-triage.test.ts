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
