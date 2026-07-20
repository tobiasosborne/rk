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

describe("readiness split — rk reads af's OWN exported prover_ready/verifier_ready flags", () => {
  // Ground truth: af's authoritative internal/jobs classifier, surfaced per-node in
  // `af export --graph json` (vibefeld d4493c8). rk NEVER re-derives af's job state machine and
  // NEVER parses the cruder `af status` summary — it reads the flags. A node with NEITHER flag
  // (or an af predating them) is not ready for either role.
  test("verifierReady flag → verifier-ready only; proverReady flag → prover-ready only", () => {
    const v = afNode("1", { verifierReady: true }); // af's call for a fresh reviewable conjecture
    expect(isVerifierReady(v)).toBe(true);
    expect(isProverReady(v)).toBe(false);
    const p = afNode("2", { proverReady: true }); // af's call for a challenged/needs-refinement node
    expect(isProverReady(p)).toBe(true);
    expect(isVerifierReady(p)).toBe(false);
  });

  test("a node with neither flag (old af, or terminal/waiting) is ready for NOTHING — fail closed", () => {
    const none = afNode("1"); // no flags set
    expect(isProverReady(none)).toBe(false);
    expect(isVerifierReady(none)).toBe(false);
  });

  test("readiness ignores raw epistemic/workflow axes — only af's flags decide (no re-derivation)", () => {
    // A pending+available node that af did NOT flag verifier_ready (e.g. because it has an open
    // blocking challenge) must NOT be treated as verifier-ready by rk re-deriving from the axes.
    const challenged = afNode("1", { epistemicState: "pending", workflowState: "available", proverReady: true });
    expect(isVerifierReady(challenged)).toBe(false);
    expect(isProverReady(challenged)).toBe(true);
  });

  test("select* return sorted lists filtered by the respective flag", () => {
    const nodes = [
      afNode("1", { verifierReady: true }),
      afNode("1.2", { proverReady: true }),
      afNode("1.1", { epistemicState: "validated" }), // terminal, no flags
      afNode("1.3", { verifierReady: true }),
    ];
    expect(selectVerifierReadyNodes(nodes)).toEqual(["1", "1.3"]);
    expect(selectProverReadyNodes(nodes)).toEqual(["1.2"]);
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
