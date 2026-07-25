// 1:1 test file for src/drive/l5-dispatch-plan.ts (M3.7's second deliverable, planning half): the
// `--dry-run`-shaped projection over src/drive/batch-composer.ts's `composeBatches` (tier `l5`).
// rk-74o adds the actual-member-provenance half: a batch that DROPS a member must re-derive its
// own identity, or `af unvalidate --batch <id>` revokes a set that was never dispatched.

import { describe, expect, test } from "bun:test";
import { planL5Dispatch } from "../../src/drive/l5-dispatch-plan";
import { deriveBatchId } from "../../src/drive/batch-composer";
import type { BatchCandidate } from "../../src/drive/batch-eligibility";
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

/** rk-74o: fully-evidenced l5 candidates — the only shape src/drive/batch-eligibility.ts admits. */
function l5(...ids: string[]): BatchCandidate[] {
  return ids.map((id) => ({ id, tier: "l5" as const, crux: false }));
}

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("planL5Dispatch", () => {
  test("two independent candidates with known hashes form one batch, carrying the l5: claimId prefix", () => {
    const d = doc([node("z"), node("a"), node("b")]);
    const currentHashes = new Map([["a", HASH_A], ["b", HASH_B]]);
    const plan = planL5Dispatch(d, l5("a", "b"), "z", currentHashes);
    expect(plan.batches).toHaveLength(1);
    const batch = plan.batches[0]!;
    expect(batch.claimId).toBe(`l5:${batch.batchId}`);
    expect(batch.members.map((m) => m.itemId)).toEqual(["a", "b"]);
    expect(batch.members.map((m) => m.contentHash)).toEqual([HASH_A, HASH_B]);
  });

  test("a candidate missing from currentHashes is excluded with reason missing-current-hash, never silently dispatched", () => {
    const d = doc([node("z"), node("a"), node("b")]);
    const currentHashes = new Map([["a", HASH_A]]); // "b" never read
    const plan = planL5Dispatch(d, l5("a", "b"), "z", currentHashes);
    expect(plan.excluded.map((e) => [e.id, e.reason])).toContainEqual(["b", "missing-current-hash"]);
    expect(plan.batches[0]!.members.map((m) => m.itemId)).toEqual(["a"]);
  });

  test("a batch that loses every member to missing hashes contributes nothing to plan.batches", () => {
    const d = doc([node("z"), node("a")]);
    const plan = planL5Dispatch(d, l5("a"), "z", new Map());
    expect(plan.batches).toEqual([]);
    expect(plan.excluded.map((e) => [e.id, e.reason])).toContainEqual(["a", "missing-current-hash"]);
  });

  test("critical-path exclusion still applies (the composer's own guardrail, passed through unchanged)", () => {
    const d = doc([node("star", { deps: ["crit"] }), node("crit"), node("routine")]);
    const plan = planL5Dispatch(d, l5("crit", "routine"), "star", new Map([["crit", HASH_A], ["routine", HASH_B]]));
    expect(plan.excluded.map((e) => [e.id, e.reason])).toContainEqual(["crit", "critical-path"]);
  });

  test("rk-74o: an un-evidenced candidate composes nothing here either — the planner cannot launder a caller promise", () => {
    const d = doc([node("z"), node("a"), node("b")]);
    const plan = planL5Dispatch(d, [{ id: "a" }, { id: "b" }], "z", new Map([["a", HASH_A], ["b", HASH_B]]));
    expect(plan.batches).toEqual([]);
    expect(plan.excluded.map((e) => e.reason).sort()).toEqual(["tier-undeclared", "tier-undeclared"]);
  });

  test("member order is preserved from the composer's own dependency-order position", () => {
    const d = doc([node("z"), node("a"), node("b")]);
    const currentHashes = new Map([["a", HASH_A], ["b", HASH_B]]);
    const plan = planL5Dispatch(d, l5("a", "b"), "z", currentHashes);
    expect(plan.batches[0]!.members.map((m) => m.order)).toEqual([0, 1]);
  });
});

// rk-74o / M3 review follow-up 3: "planL5Dispatch should also recompute batch identity after
// dropping members with missing hashes." Before this fix the surviving members were dispatched
// under the batchId derived from the ORIGINAL composed membership, so the recorded id described a
// set that was never dispatched — and `af unvalidate --batch <id>` would claim to revoke items the
// batch never touched (and miss nothing, but lie about what it covered).
describe("planL5Dispatch — actual-member provenance", () => {
  const d = doc([node("z"), node("a"), node("b"), node("c")]);
  const allThree = new Map([["a", HASH_A], ["b", HASH_B], ["c", "c".repeat(64)]]);

  test("a batch that drops a member re-derives its batchId over the SURVIVORS, not the composed set", () => {
    const full = planL5Dispatch(d, l5("a", "b", "c"), "z", allThree);
    expect(full.batches[0]!.members.map((m) => m.itemId)).toEqual(["a", "b", "c"]);
    const composedId = full.batches[0]!.batchId;

    const dropped = planL5Dispatch(d, l5("a", "b", "c"), "z", new Map([["a", HASH_A], ["b", HASH_B]]));
    const batch = dropped.batches[0]!;
    expect(batch.members.map((m) => m.itemId)).toEqual(["a", "b"]);
    expect(batch.batchId).toBe(deriveBatchId("z", ["a", "b"]));
    expect(batch.batchId).not.toBe(composedId);
  });

  test("the claimId follows the RE-DERIVED batchId, so the session isolation tuple matches the dispatched set", () => {
    const dropped = planL5Dispatch(d, l5("a", "b", "c"), "z", new Map([["a", HASH_A], ["b", HASH_B]]));
    const batch = dropped.batches[0]!;
    expect(batch.claimId).toBe(`l5:${batch.batchId}`);
  });

  test("the composed id is still REPORTED (as composedBatchId), so a drop is visible rather than erased", () => {
    const full = planL5Dispatch(d, l5("a", "b", "c"), "z", allThree);
    const dropped = planL5Dispatch(d, l5("a", "b", "c"), "z", new Map([["a", HASH_A], ["b", HASH_B]]));
    expect(dropped.batches[0]!.composedBatchId).toBe(full.batches[0]!.batchId);
    expect(dropped.batches[0]!.composedBatchId).not.toBe(dropped.batches[0]!.batchId);
  });

  test("dependency-order positions are renumbered contiguously after a drop — no phantom gap where a dropped member was", () => {
    const dropped = planL5Dispatch(d, l5("a", "b", "c"), "z", new Map([["a", HASH_A], ["c", "c".repeat(64)]]));
    const batch = dropped.batches[0]!;
    expect(batch.members.map((m) => m.itemId)).toEqual(["a", "c"]);
    expect(batch.members.map((m) => m.order)).toEqual([0, 1]);
  });

  test("a batch that drops NOTHING keeps the composer's own id (re-derivation is idempotent)", () => {
    const full = planL5Dispatch(d, l5("a", "b", "c"), "z", allThree);
    expect(full.batches[0]!.batchId).toBe(full.batches[0]!.composedBatchId);
    expect(full.batches[0]!.batchId).toBe(deriveBatchId("z", ["a", "b", "c"]));
  });
});
