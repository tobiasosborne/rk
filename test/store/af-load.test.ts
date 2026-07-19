import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAfSources } from "../../src/store/af-load";
import { loadSnapshot } from "../../src/store/snapshot-load";

const FAKE_AF = [Bun.which("bun")!, join(import.meta.dir, "fixtures", "fake-af.ts")];

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "rk-af-load-test-"));
}

describe("loadAfSources (edge: primary path via a fake af binary)", () => {
  test("a well-formed export resolves fully", () => {
    const root = tempRoot();
    const ws = "proofs/lem-x";
    mkdirSync(join(root, ws), { recursive: true });
    writeFileSync(
      join(root, ws, "fake-af-response.json"),
      JSON.stringify({
        schema_version: "1",
        nodes: [{ id: "1", statement: "The contract text.", epistemic_state: "validated", taint_state: "clean" }],
        validation: { total_nodes: 7 },
      }),
    );
    const snapshot = loadSnapshot(root);
    const [record] = loadAfSources(root, snapshot, [ws], FAKE_AF);
    expect(record).toEqual({
      workspace: ws,
      found: true,
      schemaVersion: "1",
      rootNodeId: "1",
      rootStatement: "The contract text.",
      epistemicState: "validated",
      taintState: "clean",
      nodeCount: 7,
    });
    rmSync(root, { recursive: true, force: true });
  });

  test("a nonzero exit (workspace genuinely absent/invalid) reports found:false with the stderr reason", () => {
    const root = tempRoot();
    const ws = "proofs/lem-missing";
    mkdirSync(join(root, ws), { recursive: true });
    writeFileSync(join(root, ws, "fake-af-exit-code"), "3");
    writeFileSync(join(root, ws, "fake-af-stderr"), "error accessing proof directory: path does not exist");
    const snapshot = loadSnapshot(root);
    const [record] = loadAfSources(root, snapshot, [ws], FAKE_AF);
    expect(record!.found).toBe(false);
    expect(record!.reason).toContain("path does not exist");
    rmSync(root, { recursive: true, force: true });
  });
});

describe("loadAfSources (edge: direct-ledger fallback when the af binary is unavailable)", () => {
  test("reconstructs contract + node count from the ledger, degraded, with the safe pending/unresolved defaults", () => {
    const root = tempRoot();
    const ws = "proofs/lem-y";
    const ledger = join(root, ws, "ledger");
    mkdirSync(ledger, { recursive: true });
    writeFileSync(
      join(ledger, "000001.json"),
      JSON.stringify({ type: "proof_initialized", conjecture: "fallback conjecture" }),
    );
    writeFileSync(
      join(ledger, "000002.json"),
      JSON.stringify({ type: "node_created", node: { id: "1", statement: "the root statement" } }),
    );
    writeFileSync(
      join(ledger, "000003.json"),
      JSON.stringify({ type: "node_created", node: { id: "1.1", statement: "a child" } }),
    );
    const snapshot = loadSnapshot(root);
    const [record] = loadAfSources(root, snapshot, [ws], ["definitely-not-a-real-af-binary-xyz"]);
    expect(record).toEqual({
      workspace: ws,
      found: true,
      degraded: true,
      schemaVersion: "ledger-fallback",
      rootNodeId: "1",
      rootStatement: "the root statement",
      epistemicState: "pending",
      taintState: "unresolved",
      nodeCount: 2,
    });
    rmSync(root, { recursive: true, force: true });
  });

  test("no ledger at all reports found:false, distinctly from a resolved-but-empty workspace", () => {
    const root = tempRoot();
    const ws = "proofs/lem-no-ledger";
    mkdirSync(join(root, ws), { recursive: true });
    const snapshot = loadSnapshot(root);
    const [record] = loadAfSources(root, snapshot, [ws], ["definitely-not-a-real-af-binary-xyz"]);
    expect(record!.found).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});
