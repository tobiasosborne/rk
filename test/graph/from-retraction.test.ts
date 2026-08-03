// 1:1 test file for src/graph/from-retraction.ts (rk-0ehr / P1) — the registry↔retraction join.
// Every record becomes an edge, resolved or not (the fr precedent), and an unresolvable itemId
// additionally lands in the first-class `unresolved` bucket, never a silent drop (L2).

import { describe, expect, test } from "bun:test";
import { buildRetractionEdges, type RetractionSourceRecord } from "../../src/graph/from-retraction";
import type { RegistryNode } from "../../src/graph/types";

const HASH_A = "a".repeat(64);

function node(id: string): RegistryNode {
  return {
    id, kind: "lemma", path: `argument/lemmas/${id}.md`, contract: "c", af: "none",
    deps: [], routes: [], defs: [], balloons: { count: 0, classifications: [] },
  };
}

function record(over: Partial<RetractionSourceRecord> = {}): RetractionSourceRecord {
  return {
    itemId: "lem-a", ordinal: 0, contentHash: HASH_A, hashDomain: "l5-shard-bytes",
    retractedBy: "audit:sweep", reason: "defective step 3", live: true, currentHashObserved: true,
    ...over,
  };
}

describe("buildRetractionEdges", () => {
  test("a record whose itemId names a node becomes a resolved edge, no bucket entry", () => {
    const { edges, unresolved } = buildRetractionEdges([node("lem-a")], [record()]);
    expect(unresolved).toEqual([]);
    expect(edges).toEqual([{
      nodeId: "lem-a", ordinal: 0, contentHash: HASH_A, hashDomain: "l5-shard-bytes",
      retractedBy: "audit:sweep", reason: "defective step 3", resolved: true, live: true,
      currentHashObserved: true,
    }]);
  });

  test("a record naming no node is STILL an edge (visible), plus a bucket entry", () => {
    const { edges, unresolved } = buildRetractionEdges([node("lem-a")], [record({ itemId: "lem-ghost" })]);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.resolved).toBe(false);
    expect(edges[0]!.nodeId).toBe("lem-ghost");
    expect(unresolved).toEqual([{
      edge: "retraction",
      ref: "lem-ghost",
      reason: "retraction record (ordinal 0) names itemId 'lem-ghost', which is not a registry node",
    }]);
  });

  test("a not-live record is still an edge — an expired retraction is a fact, not a deletion", () => {
    const { edges } = buildRetractionEdges([node("lem-a")], [record({ live: false })]);
    expect(edges[0]!.live).toBe(false);
    expect(edges[0]!.resolved).toBe(true);
  });

  test("currentHashObserved passes through untouched (the fail-closed af-canonical case)", () => {
    const { edges } = buildRetractionEdges(
      [node("lem-a")],
      [record({ hashDomain: "af-canonical", live: true, currentHashObserved: false })],
    );
    expect(edges[0]!.currentHashObserved).toBe(false);
    expect(edges[0]!.live).toBe(true);
  });

  test("two unresolved records naming the SAME ghost id stay two distinct edges and two entries", () => {
    const { edges, unresolved } = buildRetractionEdges([], [record({ itemId: "g" }), record({ itemId: "g", ordinal: 1 })]);
    expect(edges).toHaveLength(2);
    expect(unresolved).toHaveLength(2);
  });

  test("no records at all -> no edges, no bucket entries", () => {
    expect(buildRetractionEdges([node("lem-a")], [])).toEqual({ edges: [], unresolved: [] });
  });
});
