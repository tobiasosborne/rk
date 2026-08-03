// 1:1 test file for src/drive/batch-plan.ts (M3.4). Ground truth: docs/worker-contract.md section
// (f)'s pinned hash domains, and ../vibefeld/docs/verdicts-apply.md's file shape (schema_version /
// batch_id / verified_by / items[].node) — the cross-repo seam fixture in
// batch-plan-vibefeld-seam.test.ts additionally proves these field names never drift from that
// document's own JSON snippets.

import { describe, expect, test } from "bun:test";
import { composeBatches, type ComposedBatch } from "../../src/drive/batch-composer";
import type { BatchCandidate } from "../../src/drive/batch-eligibility";
import { toBatchPlan, toVerdictFileSkeleton, VERIFIED_BY_PLACEHOLDER } from "../../src/drive/batch-plan";
import type { GraphDocument, RegistryNode } from "../../src/graph/types";
import { GRAPH_SCHEMA_VERSION } from "../../src/graph/types";
import { decodeVerifierSeam } from "../../src/drive/identity";

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
  return {
    schema_version: GRAPH_SCHEMA_VERSION,
    nodes,
    edges: { af: [], bd: [], fr: [], report: [], retraction: [] },
    unresolved: [],
    conflicts: [],
  };
}

/** rk-74o: a batch is only ever produced from screened evidence, and it CARRIES its own tier — so
 * a sample batch must name the tier it was composed at, not have one attached afterwards. */
function sampleBatch(tier: "l5" | "hard"): ComposedBatch {
  const d = doc([node("star"), node("a"), node("b"), node("c")]);
  const candidates: BatchCandidate[] = ["a", "b", "c"].map((id) => ({
    id, tier, crux: false, afWorkspace: "proofs/ws", afNodeId: `1.${id}`,
  }));
  const afParents = new Map<string, readonly string[]>([
    ["proofs/ws\u00001", []],
    ["proofs/ws\u00001.a", ["proofs/ws\u00001"]],
    ["proofs/ws\u00001.b", ["proofs/ws\u00001"]],
    ["proofs/ws\u00001.c", ["proofs/ws\u00001"]],
  ]);
  const r = composeBatches(d, candidates, "star", { tier, afParents });
  return r.batches[0]!;
}

describe("toBatchPlan", () => {
  test("threads batchId, dependency-order position, and the hash domain per tier", () => {
    const batch = sampleBatch("hard");
    const hardPlan = toBatchPlan(batch);
    expect(hardPlan.batchId).toBe(batch.batchId);
    expect(hardPlan.tier).toBe("hard");
    expect(hardPlan.members.map((m) => m.nodeId)).toEqual(batch.members);
    expect(hardPlan.members.map((m) => m.order)).toEqual(batch.members.map((_, i) => i));
    expect(hardPlan.members.every((m) => m.contentHashDomain === "hard")).toBe(true);

    const l5Plan = toBatchPlan(sampleBatch("l5"));
    expect(l5Plan.members.every((m) => m.contentHashDomain === "l5")).toBe(true);
  });

  // rk-74o: the tier used to be a SECOND, independent caller argument, so a hard-tier batch could
  // be planned as l5 (or the reverse) and get the wrong pinned hash domain
  // (docs/worker-contract.md (f): the two domains are never comparable). It now comes from the
  // batch the composer screened.
  test("the plan's tier is the batch's OWN screened tier — a caller cannot re-declare it", () => {
    expect(toBatchPlan(sampleBatch("l5")).tier).toBe("l5");
    expect(toBatchPlan(sampleBatch("hard")).tier).toBe("hard");
  });
});

describe("toVerdictFileSkeleton", () => {
  test("hard-tier plan: produces the af verdicts-apply skeleton with a placeholder verifier and dependency-ordered items", () => {
    const batch = sampleBatch("hard");
    const plan = toBatchPlan(batch);
    const result = toVerdictFileSkeleton(plan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skeleton.schema_version).toBe("1");
    expect(result.skeleton.batch_id).toBe(batch.batchId);
    expect(result.skeleton.verified_by).toBe(VERIFIED_BY_PLACEHOLDER);
    expect(result.skeleton.items.map((i) => i["node"])).toEqual(batch.members);
    // The placeholder is not a valid verifier-identity seam -- a driver that forgets to
    // overwrite it before calling `af verdicts apply` fails loudly at decode time, never silently.
    expect(decodeVerifierSeam(result.skeleton.verified_by).ok).toBe(false);
  });

  test("l5-tier plan: rejected -- af verdicts apply is hard-tier only", () => {
    const batch = sampleBatch("l5");
    const plan = toBatchPlan(batch);
    const result = toVerdictFileSkeleton(plan);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/hard-tier only/);
  });

  test("items are ordered by dependency-order position, not by however members were listed originally", () => {
    const batch: ComposedBatch = { batchId: "batch-test", tier: "hard", members: ["a", "b", "c"], score: 0 };
    const plan = toBatchPlan(batch);
    // Perturb the plan's member array order directly to prove the skeleton re-sorts by `order`,
    // not by array position.
    const scrambled = { ...plan, members: [plan.members[2]!, plan.members[0]!, plan.members[1]!] };
    const result = toVerdictFileSkeleton(scrambled);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skeleton.items.map((i) => i["node"])).toEqual(["a", "b", "c"]);
  });
});
