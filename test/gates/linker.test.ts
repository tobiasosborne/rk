// Unit tests for Gate 2 (linker) af-workspace ledger replay (src/gates/linker-workspace.ts).
// rk-co2: introspectWorkspace ignored `node_amended` events entirely, so a workspace whose root
// (node_id "1") was amended after creation kept reporting the stale pre-amendment statement.
// AISM's `af` CLI is event-sourced — `af get 1` replays the FULL ledger, so `node_amended` is
// authoritative over the original `node_created`. These tests pin that replay order directly
// against the real event shape found in AISM's own ledger
// (../almost-idempotent-stochastic-maps/proofs/lem-hx-financing-floor/ledger/000043.json):
// `{"type":"node_amended","node_id":"1","previous_statement":"...","new_statement":"..."}` — a
// flat `node_id` string field, not a nested `node.id` like `node_created`.
//
// corpus/linker/linker-22 and linker-23 (test/corpus.test.ts) cover the same fix end-to-end
// through checkContracts (Check 9); these tests isolate introspectWorkspace's replay logic.

import { describe, expect, test } from "bun:test";
import { introspectWorkspace } from "../../src/gates/linker-workspace";
import type { RepoSnapshot } from "../../src/gates/snapshot";

function snapshotOf(workspace: string, events: unknown[]): RepoSnapshot {
  const m = new Map<string, string>();
  events.forEach((e, i) => {
    const seq = String(i + 1).padStart(6, "0");
    m.set(`${workspace}/ledger/${seq}.json`, JSON.stringify(e));
  });
  return m;
}

describe("introspectWorkspace / node_amended replay (rk-co2)", () => {
  test("node_amended on node_id '1' overrides the node_created statement", () => {
    const snapshot = snapshotOf("proofs/lem-x", [
      { type: "proof_initialized", conjecture: "stale conjecture" },
      { type: "node_created", node: { id: "1", statement: "stale pre-amendment statement" } },
      { type: "node_amended", node_id: "1", previous_statement: "stale pre-amendment statement", new_statement: "amended current statement" },
    ]);
    const facts = introspectWorkspace(snapshot, "proofs/lem-x");
    expect(facts?.contract).toBe("amended current statement");
    // node_amended does not create a node — the count still reflects node_created events only.
    expect(facts?.nodes).toBe(1);
  });

  test("a later node_amended on a NON-root node_id does not touch the root statement", () => {
    const snapshot = snapshotOf("proofs/lem-x", [
      { type: "node_created", node: { id: "1", statement: "root statement" } },
      { type: "node_created", node: { id: "1.1", statement: "child statement" } },
      { type: "node_amended", node_id: "1.1", previous_statement: "child statement", new_statement: "amended child" },
    ]);
    const facts = introspectWorkspace(snapshot, "proofs/lem-x");
    expect(facts?.contract).toBe("root statement");
    expect(facts?.nodes).toBe(2);
  });

  test("a SECOND node_amended on node_id '1' wins over the first (last-write-wins replay order)", () => {
    const snapshot = snapshotOf("proofs/lem-x", [
      { type: "node_created", node: { id: "1", statement: "v0" } },
      { type: "node_amended", node_id: "1", previous_statement: "v0", new_statement: "v1" },
      { type: "node_amended", node_id: "1", previous_statement: "v1", new_statement: "v2" },
    ]);
    const facts = introspectWorkspace(snapshot, "proofs/lem-x");
    expect(facts?.contract).toBe("v2");
  });

  test("no node_amended at all falls back to node_created (pre-existing behavior unchanged)", () => {
    const snapshot = snapshotOf("proofs/lem-x", [
      { type: "proof_initialized", conjecture: "conjecture text" },
      { type: "node_created", node: { id: "1", statement: "created statement" } },
    ]);
    const facts = introspectWorkspace(snapshot, "proofs/lem-x");
    expect(facts?.contract).toBe("created statement");
  });
});
