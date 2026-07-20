// Unit tests for src/gates/linker-workspace.ts's `introspectRootIdentity` (M3.8, deliverable 2):
// reconstructs the root node's ("1") author/validatedBy/validationBatchId provenance straight off
// the ledger, the same pure-read-path `introspectWorkspace` already uses for contract/node-count
// (Gate 2 is pure, L3, and may not shell out to `af export`).

import { describe, expect, test } from "bun:test";
import { introspectRootIdentity } from "../../src/gates/linker-workspace";
import type { RepoSnapshot } from "../../src/gates/snapshot";
import { snapshotFromFiles } from "../../src/gates/snapshot";

function snapshotOf(workspace: string, events: unknown[]): RepoSnapshot {
  const m = new Map<string, string>();
  events.forEach((e, i) => {
    const seq = String(i + 1).padStart(6, "0");
    m.set(`${workspace}/ledger/${seq}.json`, JSON.stringify(e));
  });
  return snapshotFromFiles(m);
}

describe("introspectRootIdentity — absent ledger", () => {
  test("no ledger at all -> null (mirrors introspectWorkspace's own contract)", () => {
    expect(introspectRootIdentity(snapshotFromFiles({}), "proofs/lem-x")).toBeNull();
  });
});

describe("introspectRootIdentity — author (node_created.node.author, node '1' only)", () => {
  test("root node_created carries author -> recorded", () => {
    const snapshot = snapshotOf("proofs/lem-x", [
      { type: "node_created", node: { id: "1", statement: "s", author: "claude|claude-code|opus|s1" } },
    ]);
    expect(introspectRootIdentity(snapshot, "proofs/lem-x")?.author).toBe("claude|claude-code|opus|s1");
  });

  test("AISM's real shape: proof_initialized carries its OWN top-level author, node_created carries none -> root author is undefined (never conflated with proof_initialized.author)", () => {
    const snapshot = snapshotOf("proofs/lem-x", [
      { type: "proof_initialized", conjecture: "c", author: "orchestrator" },
      { type: "node_created", node: { id: "1", statement: "s" } },
    ]);
    expect(introspectRootIdentity(snapshot, "proofs/lem-x")?.author).toBeUndefined();
  });

  test("a non-root node_created's author is never attributed to the root", () => {
    const snapshot = snapshotOf("proofs/lem-x", [
      { type: "node_created", node: { id: "1", statement: "s" } },
      { type: "node_created", node: { id: "1.1", statement: "child", author: "gpt|codex|gpt-5.6|s2" } },
    ]);
    expect(introspectRootIdentity(snapshot, "proofs/lem-x")?.author).toBeUndefined();
  });
});

describe("introspectRootIdentity — validatedBy / validationBatchId (node_validated, node '1' only)", () => {
  test("node_validated on node '1' records verified_by + batch_id", () => {
    const snapshot = snapshotOf("proofs/lem-x", [
      { type: "node_created", node: { id: "1", statement: "s" } },
      { type: "node_validated", node_id: "1", verified_by: "gpt|codex|gpt-5.6|s2", batch_id: "b-1" },
    ]);
    const facts = introspectRootIdentity(snapshot, "proofs/lem-x");
    expect(facts?.validatedBy).toBe("gpt|codex|gpt-5.6|s2");
    expect(facts?.validationBatchId).toBe("b-1");
  });

  test("singly-validated (no batch_id) -> validationBatchId stays undefined", () => {
    const snapshot = snapshotOf("proofs/lem-x", [
      { type: "node_created", node: { id: "1", statement: "s" } },
      { type: "node_validated", node_id: "1", verified_by: "gpt|codex|gpt-5.6|s2" },
    ]);
    expect(introspectRootIdentity(snapshot, "proofs/lem-x")?.validationBatchId).toBeUndefined();
  });

  test("node_unvalidated on node '1' CLEARS validatedBy + validationBatchId (mirrors af's own projection)", () => {
    const snapshot = snapshotOf("proofs/lem-x", [
      { type: "node_created", node: { id: "1", statement: "s" } },
      { type: "node_validated", node_id: "1", verified_by: "gpt|codex|gpt-5.6|s2", batch_id: "b-1" },
      { type: "node_unvalidated", node_id: "1" },
    ]);
    const facts = introspectRootIdentity(snapshot, "proofs/lem-x");
    expect(facts?.validatedBy).toBeUndefined();
    expect(facts?.validationBatchId).toBeUndefined();
  });

  test("a node_validated on a non-root node id does not touch the root's facts", () => {
    const snapshot = snapshotOf("proofs/lem-x", [
      { type: "node_created", node: { id: "1", statement: "s" } },
      { type: "node_validated", node_id: "1.1", verified_by: "gpt|codex|gpt-5.6|s2" },
    ]);
    expect(introspectRootIdentity(snapshot, "proofs/lem-x")?.validatedBy).toBeUndefined();
  });

  test("AISM's real shape: 0/44 workspaces carry verified_by/batch_id at all -> undefined, undefined", () => {
    const snapshot = snapshotOf("proofs/lem-x", [
      { type: "proof_initialized", conjecture: "c", author: "orchestrator" },
      { type: "node_created", node: { id: "1", statement: "s" } },
      { type: "node_validated", node_id: "1" },
    ]);
    const facts = introspectRootIdentity(snapshot, "proofs/lem-x");
    expect(facts?.author).toBeUndefined();
    expect(facts?.validatedBy).toBeUndefined();
    expect(facts?.validationBatchId).toBeUndefined();
  });
});
