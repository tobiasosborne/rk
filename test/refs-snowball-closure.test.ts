// Tests for src/refs/snowball-closure.ts (bead rk-hzla, `rk refs snowball`'s pure BFS core).
// Property-style coverage per the WP spec: depth-0 closure is exactly the seeds; the paper SET
// grows monotonically with depth (never shrinks, never changes an already-fixed depth value);
// the result is independent of array/oracle iteration order; a min-year filter only ever removes
// rows, never adds one back and never drops an unknown-year row.

import { describe, expect, test } from "bun:test";
import { snowballClosure, type OracleResult, type SnowballPaper } from "../src/refs/snowball-closure";

type Fixture = Record<string, OracleResult>;

function oracleFrom(map: Fixture) {
  return (id: string): OracleResult => map[id] ?? { refs: [], cites: [] };
}

// S1 --refs--> A1 (id "A1id"), C1 (id "C1id")
// S1 --cites--> A1 (id "A1id2", same canonical arxiv "A1" — merges, direction becomes "both")
// A1 --refs--> B1 (year 2010)
// A1 --cites--> C1 (id "C1id2", same canonical arxiv "C1" as the depth-1 C1 — merges, "both")
function graph(): Fixture {
  return {
    S1: {
      self: { id: "S1", arxiv: "S1", title: "Seed One", year: 2020 },
      refs: [
        { id: "A1id", arxiv: "A1", title: "A one", year: 2018 },
        { id: "C1id", arxiv: "C1", title: "C one" }, // no year — must survive any minYear filter
      ],
      cites: [{ id: "A1id2", arxiv: "A1", title: "A one (cite view)", year: 2018 }],
    },
    A1id: {
      refs: [{ id: "B1id", arxiv: "B1", title: "B one", year: 2010 }],
      cites: [{ id: "C1id2", arxiv: "C1", title: "C one (cite view)" }],
    },
    B1id: { refs: [], cites: [] },
    C1id: { refs: [], cites: [] },
  };
}

function byId(entries: { id: string }[], id: string) {
  return entries.find((e) => e.id === id);
}

describe("snowballClosure — depth 0", () => {
  test("closure of depth 0 is exactly the seeds", () => {
    const result = snowballClosure(["S1"], 0, oracleFrom(graph()));
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "S1",
      arxiv: "S1",
      title: "Seed One",
      year: 2020,
      depth: 0,
      via: [],
      direction: "seed",
    });
  });

  test("a seed with no `self` in the oracle still appears, with no title/year", () => {
    const result = snowballClosure(["ghost"], 0, () => ({ refs: [], cites: [] }));
    expect(result).toEqual([{ id: "ghost", depth: 0, via: [], direction: "seed" }]);
  });
});

describe("snowballClosure — BFS structure at depth 2", () => {
  const result = snowballClosure(["S1"], 2, oracleFrom(graph()));

  test("discovers all four papers, sorted by (depth, id)", () => {
    expect(result.map((e) => e.id)).toEqual(["S1", "A1", "C1", "B1"]);
  });

  test("A1 is reached via both ref and cite from S1 (from S1's own refs+cites arrays) — direction 'both'", () => {
    const a1 = byId(result, "A1")!;
    expect(a1.depth).toBe(1);
    expect(a1.direction).toBe("both");
    expect(a1.via).toEqual(["S1"]);
  });

  test("C1 is reached via ref at depth 1 (from S1) AND via cite at depth 2 (from A1) — stays depth 1, direction becomes 'both', via gains A1", () => {
    const c1 = byId(result, "C1")!;
    expect(c1.depth).toBe(1); // shortest path wins — NOT bumped to 2 by the later cite edge
    expect(c1.direction).toBe("both");
    expect(c1.via).toEqual(["A1", "S1"]); // sorted, deduped
    expect(c1.year).toBeUndefined(); // never fabricated
  });

  test("B1 is only reached via ref from A1, at depth 2", () => {
    const b1 = byId(result, "B1")!;
    expect(b1.depth).toBe(2);
    expect(b1.direction).toBe("ref");
    expect(b1.via).toEqual(["A1"]);
    expect(b1.year).toBe(2010);
  });
});

describe("snowballClosure — monotone in depth", () => {
  test("the id set is non-decreasing as depth grows, and every shared entry keeps the same depth", () => {
    const byDepth = [0, 1, 2, 3].map((d) => snowballClosure(["S1"], d, oracleFrom(graph())));
    for (let d = 0; d < byDepth.length - 1; d++) {
      const idsHere = new Set(byDepth[d]!.map((e) => e.id));
      const idsNext = new Set(byDepth[d + 1]!.map((e) => e.id));
      for (const id of idsHere) expect(idsNext.has(id)).toBe(true);
      for (const entry of byDepth[d]!) {
        const later = byId(byDepth[d + 1]!, entry.id)!;
        expect(later.depth).toBe(entry.depth);
      }
    }
    // depth 3 adds nothing beyond depth 2 — B1/C1id have no outgoing edges.
    expect(byDepth[3]).toEqual(byDepth[2]);
  });
});

describe("snowballClosure — order independence", () => {
  test("reversing every refs/cites array yields an identical sorted closure", () => {
    const original = snowballClosure(["S1"], 2, oracleFrom(graph()));

    const reversed: Fixture = {};
    for (const [id, r] of Object.entries(graph())) {
      reversed[id] = { ...r, refs: [...r.refs].reverse(), cites: [...r.cites].reverse() };
    }
    const withReversedArrays = snowballClosure(["S1"], 2, oracleFrom(reversed));
    expect(withReversedArrays).toEqual(original);
  });

  test("seed order does not affect the result", () => {
    const twoSeeds: Fixture = {
      X: { self: { id: "X", arxiv: "X", title: "X", year: 2019 }, refs: [], cites: [] },
      Y: { self: { id: "Y", arxiv: "Y", title: "Y", year: 2021 }, refs: [], cites: [] },
    };
    const forward = snowballClosure(["X", "Y"], 0, oracleFrom(twoSeeds));
    const backward = snowballClosure(["Y", "X"], 0, oracleFrom(twoSeeds));
    expect(forward).toEqual(backward);
  });
});

describe("snowballClosure — minYear filter", () => {
  test("drops known-year rows below the cutoff, keeps unknown-year rows, never adds", () => {
    const unfiltered = snowballClosure(["S1"], 2, oracleFrom(graph()));
    const filtered = snowballClosure(["S1"], 2, oracleFrom(graph()), { minYear: 2015 });

    expect(filtered.map((e) => e.id)).toEqual(["S1", "A1", "C1"]); // B1 (2010) dropped
    expect(filtered.length).toBeLessThan(unfiltered.length);
    // every filtered row is byte-identical to its unfiltered counterpart (filter never mutates)
    for (const row of filtered) {
      expect(row).toEqual(byId(unfiltered, row.id)!);
    }
  });

  test("a filter that excludes everything still never adds a paper", () => {
    const filtered = snowballClosure(["S1"], 2, oracleFrom(graph()), { minYear: 2100 });
    // only the undated C1 survives — an unknown year is never treated as "below the cutoff"
    expect(filtered.map((e) => e.id)).toEqual(["C1"]);
  });
});

describe("snowballClosure — duplicate seeds", () => {
  test("the same seed listed twice collapses to one entry, no crash", () => {
    const result = snowballClosure(["S1", "S1"], 0, oracleFrom(graph()));
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("S1");
  });
});

// keep the imported type used (SnowballPaper is part of the public surface CLI/fetch consume)
const _typeCheck: SnowballPaper = { id: "x" };
void _typeCheck;
