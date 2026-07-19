import { describe, expect, test } from "bun:test";
import type { AfSourceRecord } from "../../src/graph/from-af";
import { buildAfEdges } from "../../src/graph/from-af";
import type { RegistryNode } from "../../src/graph/types";

function node(overrides: Partial<RegistryNode> = {}): RegistryNode {
  return {
    id: "lem-halo-collapse",
    kind: "lemma",
    path: "argument/lemmas/lem-halo-collapse.md",
    contract: "Every halo collapses within finite time under the flow.",
    af: "validated",
    workspace: "proofs/halo-collapse-v2",
    deps: [],
    routes: [],
    defs: [],
    balloons: { count: 0, classifications: [] },
    ...overrides,
  };
}

function resolvedRecord(overrides: Partial<AfSourceRecord> = {}): AfSourceRecord {
  return {
    workspace: "proofs/halo-collapse-v2",
    found: true,
    schemaVersion: "1",
    rootNodeId: "1",
    rootStatement: "Every halo collapses within finite time under the flow.",
    epistemicState: "validated",
    taintState: "clean",
    nodeCount: 14,
    ...overrides,
  };
}

describe("buildAfEdges — rename-hazard join discipline (bead rk-57t/rk-bsj)", () => {
  test("keys STRICTLY on workspace:, never on id — a record filed under the node's id is invisible", () => {
    const n = node({ id: "lem-halo-collapse", workspace: "proofs/halo-collapse-v2" });
    const recordUnderId: AfSourceRecord = { ...resolvedRecord(), workspace: "lem-halo-collapse" }; // the bug shape
    const { edges, unresolved } = buildAfEdges([n], [recordUnderId]);
    expect(edges[0]!.workspaceResolved).toBe(false); // no record found under the REAL workspace key
    expect(unresolved).toHaveLength(1);
  });

  test("a record filed under the real workspace: value resolves", () => {
    const n = node();
    const { edges, unresolved } = buildAfEdges([n], [resolvedRecord()]);
    expect(edges[0]).toEqual({
      nodeId: "lem-halo-collapse",
      workspace: "proofs/halo-collapse-v2",
      workspaceResolved: true,
      afSchemaVersion: "1",
      afRootNodeId: "1",
      contractMatch: true,
      epistemicState: "validated",
      taintState: "clean",
      nodeCount: 14,
    });
    expect(unresolved).toEqual([]);
  });
});

describe("buildAfEdges — af-evidence requirement (Tier A review blocker 1 lineage)", () => {
  test("af:'none' node gets no edge at all", () => {
    const n = node({ af: "none" });
    const { edges } = buildAfEdges([n], [resolvedRecord()]);
    expect(edges).toEqual([]);
  });

  test("af != 'none' with no workspace: field is unresolved, reason names the missing field", () => {
    const n = node({ workspace: undefined });
    const { edges, unresolved } = buildAfEdges([n], []);
    expect(edges[0]!.workspaceResolved).toBe(false);
    expect(unresolved[0]!.reason).toContain("no workspace");
  });

  test("no matching record at all is unresolved with a default reason", () => {
    const n = node();
    const { edges, unresolved } = buildAfEdges([n], []);
    expect(edges[0]!.workspaceResolved).toBe(false);
    expect(unresolved).toHaveLength(1);
  });

  test("a contract mismatch is still workspace-resolved (contractMatch:false), never unresolved", () => {
    const n = node();
    const { edges, unresolved } = buildAfEdges([n], [resolvedRecord({ rootStatement: "A totally different statement." })]);
    expect(edges[0]!.workspaceResolved).toBe(true);
    expect((edges[0] as { contractMatch: boolean }).contractMatch).toBe(false);
    expect(unresolved).toEqual([]);
  });

  test('M2-boundary-review blocker 5: a WHITESPACE-ONLY byte difference is a mismatch — graph v1 is a byte-match verdict, not whitespace-normalized equality', () => {
    const n = node({ contract: "Every halo  collapses within finite time under the flow." }); // two spaces
    const { edges } = buildAfEdges([n], [resolvedRecord({ rootStatement: "Every halo collapses within finite time under the flow." })]); // one space
    expect(edges[0]!.workspaceResolved).toBe(true);
    expect((edges[0] as { contractMatch: boolean }).contractMatch).toBe(false);
  });

  test("byte-identical strings still match (no false mismatch introduced by removing normalization)", () => {
    const n = node();
    const { edges } = buildAfEdges([n], [resolvedRecord()]);
    expect((edges[0] as { contractMatch: boolean }).contractMatch).toBe(true);
  });

  test("a non-root afRootNodeId (blocker 2 lineage) is reported unresolved, never silently accepted as a match", () => {
    const n = node();
    const { edges, unresolved } = buildAfEdges([n], [resolvedRecord({ rootNodeId: "1.2" })]);
    expect(edges[0]!.workspaceResolved).toBe(false);
    expect(unresolved[0]!.reason).toContain("1.2");
  });

  test("an unrecognized epistemic/taint state degrades to unresolved rather than fabricating a state", () => {
    const n = node();
    const { edges } = buildAfEdges([n], [resolvedRecord({ epistemicState: "not-a-real-state" })]);
    expect(edges[0]!.workspaceResolved).toBe(false);
  });
});
