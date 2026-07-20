// 1:1 test for src/drive/driver-plan.ts (M3.6). Readiness reads af's own axes; the plan splits
// crux → per-node, wires composeBatches for an eligible pool, and reports unknown ids (never drops).

import { describe, expect, test } from "bun:test";
import { isProoflessNode, isProverReady, isVerifierReady, planDispatch, selectProverReadyNodes, selectVerifierReadyNodes, type AfNodeView } from "../../src/drive/driver-plan";
import type { GraphDocument, RegistryNode } from "../../src/graph/types";
import { GRAPH_SCHEMA_VERSION } from "../../src/graph/types";

function afNode(id: string, o: Partial<AfNodeView> = {}): AfNodeView {
  // Default `type: "claim"` — af's fresh-init root AND every prover child are `claim` nodes
  // (../vibefeld/internal/schema/nodetype.go); a case sets a different type explicitly.
  return { id, type: "claim", epistemicState: "pending", workflowState: "available", crux: false, contentHash: "a".repeat(64), ...o };
}

function regNode(id: string, o: Partial<RegistryNode> = {}): RegistryNode {
  return { id, kind: "lemma", path: `argument/${id}.md`, contract: `${id}`, af: "none", deps: [], routes: [], defs: [], balloons: { count: 0, classifications: [] }, ...o };
}
function doc(nodes: RegistryNode[]): GraphDocument {
  return { schema_version: GRAPH_SCHEMA_VERSION, nodes, edges: { af: [], bd: [], fr: [], report: [] }, unresolved: [], conflicts: [] };
}

describe("isProoflessNode — the bootstrap-ROOT emptiness predicate (rk-jit / STOP-4, blocker-1 narrowed)", () => {
  test("the fresh af-init root (id 1, type claim, no children/deps) → proofless (the STOP-4 deadlock)", () => {
    // Mirrors ../rk-m3.5-baseline pristine node 1: statement, inference:'assumption', no child_ids,
    // no dependencies. inference default is NOT read as proof (af defaults a bare root to 'assumption').
    expect(isProoflessNode(afNode("1", { statement: "min_i n_i <= sum_i p_i n_i." }))).toBe(true);
    expect(isProoflessNode(afNode("1", { statement: "S", inference: "assumption" }))).toBe(true);
    expect(isProoflessNode(afNode("1", { statement: "S", inference: "" }))).toBe(true);
  });
  test("the root with children is NOT proofless (it decomposed into sub-steps)", () => {
    expect(isProoflessNode(afNode("1", { statement: "S", childIds: ["1.1"] }))).toBe(false);
  });
  test("the root that CITES a dependency is NOT proofless (proof content: 'by step 1.2')", () => {
    expect(isProoflessNode(afNode("1", { statement: "S", deps: ["1.2"] }))).toBe(false);
  });
  test("the root with a REAL inference rule is NOT proofless (a recorded justification)", () => {
    expect(isProoflessNode(afNode("1", { statement: "0 <= 1", inference: "arithmetic" }))).toBe(false);
    expect(isProoflessNode(afNode("1", { statement: "S", inference: "by_definition" }))).toBe(false);
  });
  test("a root with no statement at all is NOT flagged (out of scope — the bootstrap case has a statement)", () => {
    expect(isProoflessNode(afNode("1", { statement: undefined }))).toBe(false);
    expect(isProoflessNode(afNode("1", { statement: "   " }))).toBe(false);
  });

  // --- blocker-1 regressions (docs/reviews/2026-07-20-vacuous-accept-guard-codex.md) --------------
  // af has NO distinct axiom node type; a LEGITIMATE terminal-assumption LEAF is exactly
  // type:"claim", inference:"assumption", childless, dependency-free. The earlier (any-id) predicate
  // would have discarded such accepts forever — parents never bottom-up-ready, valid proofs never
  // close. Narrowing to the fresh ROOT shape (id "1" AND type "claim") fixes it: these leaves get
  // NORMAL verifier review (af's designed epistemics), never a vacuous discard.
  test("a tutorial-shape terminal assumption LEAF (non-root claim/assumption, childless) is NOT proofless", () => {
    // ../vibefeld/docs/tutorial-sqrt2.md:271-282 — a childless claim/assumption node the af tutorial
    // accepts. Non-root, so it is never the bootstrap deadlock.
    expect(isProoflessNode(afNode("1.2", { statement: "sqrt(2) is irrational (assumed for contradiction)", inference: "assumption" }))).toBe(false);
  });
  test("the real AISM leaf 1.1.1 shape (deep claim/assumption leaf, VALIDATED live) is NOT proofless", () => {
    // ../almost-idempotent-stochastic-maps/proofs/lem-classical-equiv/ledger — node 1.1.1 was a
    // childless, dependency-free claim/assumption step that af VALIDATED. It must reach the verifier.
    expect(isProoflessNode(afNode("1.1.1", { statement: "p_i >= 0 for each i", inference: "assumption" }))).toBe(false);
  });
  test("a root whose type is NOT 'claim' (e.g. a qed/local_assume root) is NOT flagged — the type conjunct", () => {
    expect(isProoflessNode(afNode("1", { type: "qed", statement: "S", inference: "assumption" }))).toBe(false);
    expect(isProoflessNode(afNode("1", { type: "local_assume", statement: "S", inference: "assumption" }))).toBe(false);
  });
});

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
