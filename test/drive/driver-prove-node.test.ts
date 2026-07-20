// 1:1 test for src/drive/driver-prove-node.ts (rk-gn4) — the per-node PROVER machinery. Ground
// truth: a prover PRODUCES proof content (a children[] decomposition) and NEVER mints a verdict
// (PRD C9 / M3 blocker 3's inverse). Every fake here is synchronous; no real LLM/af call.

import { describe, expect, test } from "bun:test";
import { extractProofContent, proveOneNode } from "../../src/drive/driver-prove-node";
import type { DispatchedTurn, DriverDeps } from "../../src/drive/driver-run";
import type { AfNodeView } from "../../src/drive/driver-plan";
import type { VerifierIdentity } from "../../src/drive/identity";

const IDENTITY: VerifierIdentity = { modelFamily: "claude", backend: "claude", model: "m", sessionId: "s1" };
const HASH = "a".repeat(64);
function pnode(id: string, o: Partial<AfNodeView> = {}): AfNodeView {
  return { id, epistemicState: "pending", workflowState: "available", crux: false, contentHash: HASH, proverReady: true, ...o };
}

interface Rec { logs: string[]; recorded: { node: string; children: number }[]; deps: DriverDeps }
function rec(over: Partial<DriverDeps>): Rec {
  const logs: string[] = [];
  const recorded: { node: string; children: number }[] = [];
  const deps: DriverDeps = {
    contractId: "lem-x", claimId: "claim-x", identity: IDENTITY,
    queryWorkspace: () => ({ ok: true, value: { workspaceId: "w", nodes: [], nodeCount: 0 } }),
    dispatchVerify: () => undefined,
    dispatchProve: () => undefined,
    recordProof: (n, p, _known) => { recorded.push({ node: n.id, children: p.children.length }); return { ok: true }; },
    dispatchClassification: () => undefined,
    applyVerdicts: () => ({ exit: 0, batchId: "", items: [], applied: 0, blocked: 0, rejected: 0, aborted: false }),
    isLoadBearing: () => false,
    reReadContentHashes: () => new Map(),
    readShard: () => undefined, writeShard: () => {}, createBdTask: () => true,
    appendLog: (l) => logs.push(l), now: () => "T", priorBalloonCount: 0, priorClassifications: [],
    ...over,
  };
  return { logs, recorded, deps };
}
const proverTurn = (raw: unknown, o: Partial<DispatchedTurn> = {}): DispatchedTurn => ({ raw, role: "prover", exit: 0, ...o });

describe("extractProofContent — a non-empty children[] decomposition, never a verdict", () => {
  test("valid children (string + optional justification/depends) parse", () => {
    const p = extractProofContent({ children: [{ statement: "A" }, { statement: "B", justification: "modus_ponens", depends: ["1.1"] }] });
    expect(p?.children.length).toBe(2);
    expect(p?.children[1]).toEqual({ statement: "B", justification: "modus_ponens", depends: ["1.1"] });
  });
  test("empty / missing / blank-statement / non-object children → undefined", () => {
    expect(extractProofContent({ children: [] })).toBeUndefined();
    expect(extractProofContent({})).toBeUndefined();
    expect(extractProofContent({ children: [{ statement: "  " }] })).toBeUndefined();
    expect(extractProofContent("just text")).toBeUndefined();
    // a verdict-shaped body carries no children → not usable proof content (and is separately caught
    // by detectProverOverreach in proveOneNode).
    expect(extractProofContent({ verdict: { outcome: "accept" } })).toBeUndefined();
  });
});

describe("proveOneNode — role guard, overreach discard, record, usage logging", () => {
  test("a valid prover decomposition is recorded and logged; NO verdict is ever produced", async () => {
    const h = rec({ dispatchProve: () => proverTurn({ children: [{ statement: "step" }] }) });
    const r = await proveOneNode(h.deps, pnode("1"), new Set(["1"]));
    expect(r).toMatchObject({ recorded: true, nodeId: "1" });
    expect(h.recorded).toEqual([{ node: "1", children: 1 }]);
    expect(h.logs.some((l) => l.includes('"kind":"proof-recorded"'))).toBe(true);
  });

  test("a prover turn carrying a VERDICT is discarded, logged prover-overreach, and NEVER recorded", async () => {
    // mutation: remove the detectProverOverreach guard in proveOneNode → this records a verdict-
    // bearing body, going RED. The prover must never mint a verdict (PRD C9).
    const h = rec({ dispatchProve: () => proverTurn({ verdict: { outcome: "accept" }, children: [{ statement: "x" }] }) });
    const r = await proveOneNode(h.deps, pnode("1"), new Set(["1"]));
    expect("skip" in r).toBe(true);
    expect(h.recorded).toEqual([]);
    expect(h.logs.some((l) => l.includes('"kind":"prover-overreach"'))).toBe(true);
  });

  test("a non-prover role handed to proveOneNode is refused — only 'prover' authors proof content", async () => {
    // mutation: drop the `turn.role !== "prover"` guard → a verifier turn would author proof content.
    const h = rec({ dispatchProve: () => proverTurn({ children: [{ statement: "x" }] }, { role: "verifier" }) });
    const r = await proveOneNode(h.deps, pnode("1"), new Set(["1"]));
    expect("skip" in r && r.skip.includes("only 'prover'")).toBe(true);
    expect(h.recorded).toEqual([]);
  });

  test("recordProof failure is a skip (fail closed), not a false success", async () => {
    const h = rec({ dispatchProve: () => proverTurn({ children: [{ statement: "x" }] }), recordProof: () => ({ ok: false, reason: "af refine exit 1" }) });
    const r = await proveOneNode(h.deps, pnode("1"), new Set(["1"]));
    expect("skip" in r && r.skip.includes("af refine exit 1")).toBe(true);
  });

  // GAP 8 observability (STOP-REPORT-7): an af record-proof failure must BANK evidence — the node,
  // af's reason, and a bounded snippet of the children JSON — not only the skip string, so the raw
  // rejected decomposition is inspectable without a re-run (mirrors rk-2cm's bind/parse-failed trail).
  test("a recordProof failure banks a record-proof-failed evidence record with node + reason + children snippet", async () => {
    const h = rec({
      dispatchProve: () => proverTurn({ children: [{ statement: "step alpha", depends: ["1.1"] }] }),
      recordProof: () => ({ ok: false, reason: "af record-proof exit 1: child 2: dependency node 1.1 does not exist" }),
    });
    const r = await proveOneNode(h.deps, pnode("1"), new Set(["1"]));
    expect("skip" in r).toBe(true);
    const ev = h.logs.map((l) => JSON.parse(l)).find((o) => o.kind === "record-proof-failed");
    expect(ev).toBeDefined();
    expect(ev.node).toBe("1");
    expect(ev.reason).toContain("dependency node 1.1 does not exist");
    expect(ev.rawSnippet).toContain("step alpha"); // the raw children JSON is banked
    expect(ev.rawSnippet.length).toBeLessThanOrEqual(500);
  });

  test("usage is logged with role 'prover' before any discard (tokens are spent on dispatch)", async () => {
    const usage = { input: 7, output: 3, cache_read: 0, cache_creation: 0 };
    const h = rec({ dispatchProve: () => proverTurn({ children: [{ statement: "x" }] }, { usage }) });
    const r = await proveOneNode(h.deps, pnode("1"), new Set(["1"]));
    expect(r.spentTokens).toBe(10);
    const u = h.logs.map((l) => JSON.parse(l)).find((o) => o.kind === "usage");
    expect(u?.role).toBe("prover");
    expect(u?.usage).toEqual(usage);
  });
});
