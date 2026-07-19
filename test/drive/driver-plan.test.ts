// 1:1 test for src/drive/driver-plan.ts (M3.6). Readiness reads af's own axes; the plan splits
// crux → per-node, wires composeBatches for an eligible pool, and reports unknown ids (never drops).

import { describe, expect, test } from "bun:test";
import { isVerificationReady, planDispatch, selectReadyNodes, type AfNodeView } from "../../src/drive/driver-plan";
import type { GraphDocument, RegistryNode } from "../../src/graph/types";
import { GRAPH_SCHEMA_VERSION } from "../../src/graph/types";

function afNode(id: string, o: Partial<AfNodeView> = {}): AfNodeView {
  return { id, epistemicState: "pending", workflowState: "available", crux: false, contentHash: "a".repeat(64), ...o };
}

function regNode(id: string, o: Partial<RegistryNode> = {}): RegistryNode {
  return { id, kind: "lemma", path: `argument/${id}.md`, contract: `${id}`, af: "none", deps: [], routes: [], defs: [], balloons: { count: 0, classifications: [] }, ...o };
}
function doc(nodes: RegistryNode[]): GraphDocument {
  return { schema_version: GRAPH_SCHEMA_VERSION, nodes, edges: { af: [], bd: [], fr: [], report: [] }, unresolved: [], conflicts: [] };
}

describe("isVerificationReady / selectReadyNodes — af's recorded axes are the truth", () => {
  test("pending + not-blocked is ready; validated or blocked is not", () => {
    expect(isVerificationReady(afNode("1.1"))).toBe(true);
    expect(isVerificationReady(afNode("1.2", { epistemicState: "validated" }))).toBe(false);
    // mutation: drop the `workflowState !== "blocked"` clause → this goes red.
    expect(isVerificationReady(afNode("1.3", { workflowState: "blocked" }))).toBe(false);
  });
  test("selectReadyNodes returns sorted ready ids only", () => {
    const nodes = [afNode("1.2"), afNode("1.1"), afNode("1.3", { epistemicState: "validated" })];
    expect(selectReadyNodes(nodes)).toEqual(["1.1", "1.2"]);
  });
});

describe("planDispatch — crux → per-node, eligible pool → composeBatches, unknown reported", () => {
  test("hard-tier default (no eligible pool): every ready node dispatches per-node", () => {
    const plan = planDispatch({ readyNodeIds: ["1.1", "1.2"], cruxIds: ["1.2"] });
    expect(plan.perNode).toEqual(["1.1", "1.2"]);
    expect(plan.batches).toEqual([]);
  });

  test("crux nodes are forced per-node even when named in the eligible pool", () => {
    const d = doc([regNode("z"), regNode("a"), regNode("b")]);
    const plan = planDispatch({ readyNodeIds: ["a", "b"], cruxIds: ["a"], batchEligibleIds: ["a", "b"], graph: { doc: d, northStarId: "z" } });
    // a is crux → per-node; b is eligible and independent → a batch of its own
    expect(plan.perNode).toContain("a");
    expect(plan.perNode).not.toContain("b");
  });

  test("an eligible pool of independent siblings composes real batches", () => {
    const d = doc([regNode("z"), regNode("a"), regNode("b")]);
    const plan = planDispatch({ readyNodeIds: ["a", "b"], batchEligibleIds: ["a", "b"], graph: { doc: d, northStarId: "z" } });
    expect(plan.batches.length).toBeGreaterThan(0);
    expect(plan.batches.flatMap((x) => x.members).sort()).toEqual(["a", "b"]);
  });

  test("an unknown eligible id is REPORTED, never dropped or dispatched", () => {
    const d = doc([regNode("z"), regNode("a")]);
    const plan = planDispatch({ readyNodeIds: ["a"], batchEligibleIds: ["a", "ghost"], graph: { doc: d, northStarId: "z" } });
    expect(plan.unknown).toEqual(["ghost"]);
    expect(plan.perNode).not.toContain("ghost");
  });
});
