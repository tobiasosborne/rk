// N1.2 (rk-lmtr): the GOAL frontier — the top-down read of the argument DAG that the payout
// ledger and the allocator consume. Distinct from query-blocks.ts's critical-path frontier:
// this query covers ALL live routes (competing decompositions are a population, PRD Amendment
// A1), classifies attachment (reachable-from-root vs not — the admission/prospecting boundary),
// and names dead-ends (every route dead) as first-class facts.
import { describe, expect, it } from "bun:test";
import { computeGoalFrontier } from "../../src/graph/query-frontier";
import type { GraphDocument, RegistryNode } from "../../src/graph/types";

function node(partial: Partial<RegistryNode> & { id: string }): RegistryNode {
  return {
    kind: "lemma",
    path: `argument/lemmas/${partial.id}.md`,
    contract: `${partial.id}'s claim.`,
    af: "none",
    deps: [],
    routes: [],
    defs: [],
    balloons: { count: 0, classifications: [] },
    ...partial,
  };
}

function doc(nodes: RegistryNode[]): GraphDocument {
  return {
    schema_version: "2",
    nodes,
    edges: { af: [], bd: [], fr: [], report: [], retraction: [] },
    unresolved: [],
    conflicts: [],
  } as GraphDocument;
}

/** Root with two competing decompositions: route A = [a1, a2] (a1 open, a2 proved),
 * route B = [b1] (b1 disproved -> route B is DEAD). One unattached open node floats free. */
function competingDoc(): GraphDocument {
  return doc([
    node({ id: "goal", kind: "theorem", status: "open", routes: [["a1", "a2"], ["b1"]] }),
    node({ id: "a1", status: "open", kind: "open-problem" }),
    node({ id: "a2", status: "proved", af: "validated" }),
    node({ id: "b1", status: "disproved" }),
    node({ id: "float", status: "open", kind: "open-problem" }),
  ]);
}

describe("computeGoalFrontier", () => {
  it("reports found:false for an unknown root", () => {
    const r = computeGoalFrontier(competingDoc(), "nope");
    expect(r.found).toBe(false);
    expect(r.obligations).toEqual([]);
  });

  it("collects obligations across LIVE routes only, and classifies attachment", () => {
    const r = computeGoalFrontier(competingDoc(), "goal");
    expect(r.found).toBe(true);
    const ids = r.obligations.map((o) => o.id);
    // goal itself is open -> an obligation; a1 open via live route A -> obligation.
    expect(ids).toEqual(["a1", "goal"]);
    // b1 is disproved: dead, not an obligation; a2 is available: satisfied, not an obligation.
    expect(ids).not.toContain("b1");
    expect(ids).not.toContain("a2");
    // float is not reachable from goal -> unattached, never an obligation.
    expect(r.unattachedIds).toEqual(["float"]);
    expect(r.attachedIds).toContain("a1");
    expect(r.attachedIds).not.toContain("float");
  });

  it("marks a node whose EVERY route is dead as a dead-end obligation", () => {
    const d = doc([
      node({ id: "goal", kind: "theorem", status: "open", routes: [["dead1"], ["dead2"]] }),
      node({ id: "dead1", status: "disproved" }),
      node({ id: "dead2", status: "obstruction", kind: "obstruction" }),
    ]);
    const r = computeGoalFrontier(d, "goal");
    const goalOb = r.obligations.find((o) => o.id === "goal");
    expect(goalOb).toBeDefined();
    expect(goalOb!.deadEnd).toBe(true);
    // dead members are not obligations.
    expect(r.obligations.map((o) => o.id)).toEqual(["goal"]);
  });

  it("distinguishes actionable obligations (prerequisites met) from blocked ones", () => {
    const d = doc([
      node({ id: "goal", kind: "theorem", status: "open", deps: ["mid"] }),
      node({ id: "mid", status: "open", deps: ["leaf"] }),
      node({ id: "leaf", status: "open" }),
    ]);
    const r = computeGoalFrontier(d, "goal");
    const byId = new Map(r.obligations.map((o) => [o.id, o]));
    expect(byId.get("leaf")!.actionable).toBe(true); // no prerequisites of its own
    expect(byId.get("mid")!.actionable).toBe(false); // waits on leaf
    expect(byId.get("goal")!.actionable).toBe(false); // waits on mid
  });

  it("is monotone under CLOSE: closing an obligation never grows the obligation set", () => {
    const before = computeGoalFrontier(competingDoc(), "goal");
    const closed = competingDoc();
    const a1 = closed.nodes.find((n) => n.id === "a1")!;
    a1.status = "proved";
    a1.af = "validated";
    const after = computeGoalFrontier(closed, "goal");
    const beforeIds = new Set(before.obligations.map((o) => o.id));
    for (const o of after.obligations) expect(beforeIds.has(o.id)).toBe(true);
    expect(after.obligations.map((o) => o.id)).not.toContain("a1");
  });

  it("stops traversal at available nodes: a proved subtree's open descendants are not obligations", () => {
    const d = doc([
      node({ id: "goal", kind: "theorem", status: "open", deps: ["done"] }),
      node({ id: "done", status: "proved", af: "validated", deps: ["forgotten"] }),
      node({ id: "forgotten", status: "open" }),
    ]);
    const r = computeGoalFrontier(d, "goal");
    expect(r.obligations.map((o) => o.id)).toEqual(["goal"]);
    // forgotten is still attached (reachable), just not an obligation through a settled proof.
    expect(r.unattachedIds).toEqual([]);
  });

  it("degrades on cycles instead of hanging (acyclicity is the linker's job, not ours)", () => {
    const d = doc([
      node({ id: "goal", kind: "theorem", status: "open", deps: ["x"] }),
      node({ id: "x", status: "open", deps: ["goal"] }),
    ]);
    const r = computeGoalFrontier(d, "goal");
    expect(r.obligations.map((o) => o.id).sort()).toEqual(["goal", "x"]);
  });
});
