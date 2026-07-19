import { describe, expect, test } from "bun:test";
import type { FrSourceRecord } from "../../src/graph/from-fr";
import { buildFrEdges } from "../../src/graph/from-fr";
import type { RegistryNode } from "../../src/graph/types";

function node(id: string, path: string): RegistryNode {
  return {
    id,
    kind: "lemma",
    path,
    contract: "some contract",
    af: "none",
    deps: [],
    routes: [],
    defs: [],
    balloons: { count: 0, classifications: [] },
  };
}

describe("buildFrEdges — exact-string resolution only (fr's own bank-gate hazard)", () => {
  test("resolves via path match", () => {
    const nodes = [node("lem-x", "argument/lemmas/lem-x.md")];
    const rec: FrSourceRecord = { cycle: 3, kind: "artifact", ref: "argument/lemmas/lem-x.md" };
    const { edges, unresolved } = buildFrEdges(nodes, [rec]);
    expect(edges).toEqual([{ cycle: 3, artifact: "argument/lemmas/lem-x.md", resolutionMethod: "path", resolvedNodeId: "lem-x" }]);
    expect(unresolved).toEqual([]);
  });

  test("resolves via bare registry id ('oracle')", () => {
    const nodes = [node("lem-x", "argument/lemmas/lem-x.md")];
    const rec: FrSourceRecord = { cycle: 4, kind: "artifact", ref: "lem-x" };
    const { edges } = buildFrEdges(nodes, [rec]);
    expect(edges[0]!.resolutionMethod).toBe("oracle");
  });

  test("a graduate marker resolves via graduated_to", () => {
    const nodes = [node("lem-y", "argument/lemmas/lem-y.md")];
    const rec: FrSourceRecord = { cycle: 9, kind: "graduate", ref: "lem-y" };
    const { edges } = buildFrEdges(nodes, [rec]);
    expect(edges[0]!.resolutionMethod).toBe("graduates");
  });

  test("no substring/fuzzy match — a near-miss path does not resolve", () => {
    const nodes = [node("lem-x", "argument/lemmas/lem-x.md")];
    const rec: FrSourceRecord = { cycle: 5, kind: "artifact", ref: "argument/lemmas/lem-x" }; // missing .md
    const { edges, unresolved } = buildFrEdges(nodes, [rec]);
    expect(edges[0]!.resolutionMethod).toBe("unresolved");
    expect(unresolved).toHaveLength(1);
  });
});

describe("buildFrEdges — Tier A review blocker 4 lineage: exact one-to-one accounting", () => {
  test("two DISTINCT unresolved cycles naming the SAME artifact text stay two distinct bucket entries", () => {
    const artifact = "notes/shared-scratch.md";
    const records: FrSourceRecord[] = [
      { cycle: 5, kind: "artifact", ref: artifact },
      { cycle: 9, kind: "artifact", ref: artifact },
    ];
    const { unresolved } = buildFrEdges([], records);
    expect(unresolved).toHaveLength(2);
    expect(new Set(unresolved.map((u) => u.sourceCycle))).toEqual(new Set([5, 9]));
    expect(unresolved.every((u) => u.ref === artifact)).toBe(true);
  });

  test("TOTAL: every record produces exactly one edge; unresolved count == edges with resolutionMethod:'unresolved'", () => {
    const nodes = [node("lem-a", "argument/a.md")];
    const records: FrSourceRecord[] = [
      { cycle: 1, kind: "artifact", ref: "argument/a.md" }, // resolves
      { cycle: 2, kind: "artifact", ref: "nowhere.md" }, // unresolved
      { cycle: 3, kind: "artifact", ref: "still-nowhere.md" }, // unresolved
      { cycle: 4, kind: "graduate", ref: "lem-a" }, // resolves
    ];
    const { edges, unresolved } = buildFrEdges(nodes, records);
    expect(edges.length).toBe(records.length);
    const unresolvedEdges = edges.filter((e) => e.resolutionMethod === "unresolved");
    expect(unresolvedEdges.length).toBe(unresolved.length);
    expect(unresolvedEdges.length).toBe(2);
  });

  test("mutation guard: collapsing the bucket key to (edge, ref) alone would merge the two-cycle case into one entry", () => {
    // Direct proof the accounting is keyed on (sourceCycle, ref), not (ref) alone: build the
    // bucket key the OLD (buggy) way and show it collapses what buildFrEdges keeps distinct.
    const artifact = "notes/shared-scratch.md";
    const records: FrSourceRecord[] = [
      { cycle: 5, kind: "artifact", ref: artifact },
      { cycle: 9, kind: "artifact", ref: artifact },
    ];
    const { unresolved } = buildFrEdges([], records);
    const collapsedByRefOnly = new Set(unresolved.map((u) => u.ref));
    expect(collapsedByRefOnly.size).toBe(1); // same ref text
    expect(unresolved.length).toBe(2); // yet buildFrEdges kept them as two distinct rows
  });
});
