// 1:1 test file for src/drive/l5-dispatch-plan.ts (M3.7's second deliverable, planning half): the
// `--dry-run`-shaped projection over src/drive/batch-composer.ts's `composeBatches` (tier `l5`).

import { describe, expect, test } from "bun:test";
import { planL5Dispatch } from "../../src/drive/l5-dispatch-plan";
import type { GraphDocument, RegistryNode } from "../../src/graph/types";
import { GRAPH_SCHEMA_VERSION } from "../../src/graph/types";

function node(id: string, overrides: Partial<RegistryNode> = {}): RegistryNode {
  return {
    id,
    kind: "lemma",
    path: `argument/${id}.md`,
    contract: `${id} holds.`,
    af: "none",
    deps: [],
    routes: [],
    defs: [],
    balloons: { count: 0, classifications: [] },
    ...overrides,
  };
}

function doc(nodes: RegistryNode[]): GraphDocument {
  return { schema_version: GRAPH_SCHEMA_VERSION, nodes, edges: { af: [], bd: [], fr: [], report: [] }, unresolved: [], conflicts: [] };
}

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("planL5Dispatch", () => {
  test("two independent candidates with known hashes form one batch, carrying the l5: claimId prefix", () => {
    const d = doc([node("z"), node("a"), node("b")]);
    const currentHashes = new Map([["a", HASH_A], ["b", HASH_B]]);
    const plan = planL5Dispatch(d, ["a", "b"], "z", currentHashes);
    expect(plan.batches).toHaveLength(1);
    const batch = plan.batches[0]!;
    expect(batch.claimId).toBe(`l5:${batch.batchId}`);
    expect(batch.members.map((m) => m.itemId)).toEqual(["a", "b"]);
    expect(batch.members.map((m) => m.contentHash)).toEqual([HASH_A, HASH_B]);
  });

  test("a candidate missing from currentHashes is excluded with reason missing-current-hash, never silently dispatched", () => {
    const d = doc([node("z"), node("a"), node("b")]);
    const currentHashes = new Map([["a", HASH_A]]); // "b" never read
    const plan = planL5Dispatch(d, ["a", "b"], "z", currentHashes);
    expect(plan.excluded).toContainEqual({ id: "b", reason: "missing-current-hash" });
    expect(plan.batches[0]!.members.map((m) => m.itemId)).toEqual(["a"]);
  });

  test("a batch that loses every member to missing hashes contributes nothing to plan.batches", () => {
    const d = doc([node("z"), node("a")]);
    const plan = planL5Dispatch(d, ["a"], "z", new Map());
    expect(plan.batches).toEqual([]);
    expect(plan.excluded).toContainEqual({ id: "a", reason: "missing-current-hash" });
  });

  test("critical-path exclusion still applies (composeBatches's own guardrail, passed through unchanged)", () => {
    const d = doc([node("star", { deps: ["crit"] }), node("crit"), node("routine")]);
    const plan = planL5Dispatch(d, ["crit", "routine"], "star", new Map([["crit", HASH_A], ["routine", HASH_B]]));
    expect(plan.excluded).toContainEqual({ id: "crit", reason: "critical-path" });
  });

  test("member order is preserved from the composer's own dependency-order position", () => {
    const d = doc([node("z"), node("a"), node("b")]);
    const currentHashes = new Map([["a", HASH_A], ["b", HASH_B]]);
    const plan = planL5Dispatch(d, ["a", "b"], "z", currentHashes);
    expect(plan.batches[0]!.members.map((m) => m.order)).toEqual([0, 1]);
  });
});
