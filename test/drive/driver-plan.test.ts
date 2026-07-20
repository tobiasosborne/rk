// 1:1 test for src/drive/driver-plan.ts (M3.6). Readiness reads af's own axes; the plan splits
// crux → per-node, wires composeBatches for an eligible pool, and reports unknown ids (never drops).

import { describe, expect, test } from "bun:test";
import { isProverReady, isVerifierReady, planDispatch, selectProverReadyNodes, selectVerifierReadyNodes, type AfNodeView } from "../../src/drive/driver-plan";
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

describe("readiness split — prover-ready (needs proof) vs verifier-ready (has a checkable proof)", () => {
  // Ground truth: af's status.go classifier (internal/render/status.go:167-189 — the "ready for
  // review" one the operator sees), defaulted to the STRICTER validity semantics (L5): a childless
  // pending node has NO recorded proof to check, so it is prover-ready, never verifier-ready.
  test("a fresh, childless pending node is PROVER-ready, NOT verifier-ready (the rk-gn4 bug)", () => {
    const fresh = afNode("1"); // pending, available, no childIds — the M3.5 fresh-workspace root
    expect(isProverReady(fresh)).toBe(true);
    // mutation: if isVerifierReady drops the `has children` clause it wrongly returns true here → red.
    expect(isVerifierReady(fresh, new Map([["1", fresh]]))).toBe(false);
  });

  test("a pending parent whose children are ALL cleared is verifier-ready, not prover-ready", () => {
    const parent = afNode("1", { childIds: ["1.1", "1.2"] });
    const byId = new Map([
      ["1", parent],
      ["1.1", afNode("1.1", { epistemicState: "validated" })],
      ["1.2", afNode("1.2", { epistemicState: "admitted" })],
    ]);
    expect(isVerifierReady(parent, byId)).toBe(true);
    expect(isProverReady(parent)).toBe(false);
  });

  test("a pending parent with a NOT-yet-cleared child is NEITHER ready (waiting on descendants)", () => {
    const parent = afNode("1", { childIds: ["1.1"] });
    const byId = new Map([["1", parent], ["1.1", afNode("1.1")]]); // 1.1 still pending
    expect(isVerifierReady(parent, byId)).toBe(false);
    expect(isProverReady(parent)).toBe(false);
  });

  test("draft and needs_refinement are prover-ready regardless of children; blocked never is", () => {
    expect(isProverReady(afNode("1", { epistemicState: "draft" }))).toBe(true);
    expect(isProverReady(afNode("1", { epistemicState: "needs_refinement", childIds: ["1.1"] }))).toBe(true);
    // mutation: drop the `!blocked` clause → these go red.
    expect(isProverReady(afNode("1", { workflowState: "blocked" }))).toBe(false);
    const blockedParent = afNode("1", { workflowState: "blocked", childIds: ["1.1"] });
    expect(isVerifierReady(blockedParent, new Map([["1", blockedParent], ["1.1", afNode("1.1", { epistemicState: "validated" })]]))).toBe(false);
  });

  test("a validated (terminal) node is neither prover- nor verifier-ready", () => {
    const done = afNode("1", { epistemicState: "validated" });
    expect(isProverReady(done)).toBe(false);
    expect(isVerifierReady(done, new Map([["1", done]]))).toBe(false);
  });

  test("select* return sorted, mutually-exclusive id lists", () => {
    const nodes = [
      afNode("1", { childIds: ["1.1", "1.2"] }),      // parent: 1.1 validated, 1.2 pending-leaf → waiting (neither)
      afNode("1.2"),                                    // childless pending → prover
      afNode("1.1", { epistemicState: "validated" }),   // terminal → neither
    ];
    expect(selectProverReadyNodes(nodes)).toEqual(["1.2"]);
    expect(selectVerifierReadyNodes(nodes)).toEqual([]);
    // now clear 1.2 → parent 1 becomes verifier-ready, 1.2 leaves the prover set
    const nodes2 = [afNode("1", { childIds: ["1.1", "1.2"] }), afNode("1.2", { epistemicState: "validated" }), afNode("1.1", { epistemicState: "validated" })];
    expect(selectProverReadyNodes(nodes2)).toEqual([]);
    expect(selectVerifierReadyNodes(nodes2)).toEqual(["1"]);
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
