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

  // rk-xfzg: extractProofContent now DEFERS to prover-raw.ts's validateRawProverOutput — a body is
  // accepted iff that validator reports zero issues. These four cases were previously SILENT-DROP
  // paths (the content vanished, the turn still counted as usable): they must now be a flat
  // rejection, never a partial acceptance.
  test("an unknown CHILD key (af's own 'inference' spelling) rejects the whole body — no silent drop", () => {
    // mutation: reinstate the old fresh-object copy (statement/justification/depends only, ignoring
    // everything else) → this body would come back {children:[{statement:'A'}]}, going RED.
    expect(extractProofContent({ children: [{ statement: "A", inference: "modus_ponens" }] })).toBeUndefined();
  });

  test("an unknown TOP-LEVEL key rejects the whole body — no silent drop", () => {
    expect(extractProofContent({ children: [{ statement: "A" }], itemId: "1.2" })).toBeUndefined();
  });

  test("a non-string 'depends' entry rejects the whole body — the entry is never silently filtered out", () => {
    // mutation: reinstate `obj.depends.filter((d): d is string => typeof d === "string")` → this body
    // would come back {children:[{statement:'A', depends:['#0']}]} (the `1` silently dropped), RED.
    expect(extractProofContent({ children: [{ statement: "A", depends: ["#0", 1] }] })).toBeUndefined();
  });

  test("a PRESENT but blank justification now rejects (stricter, CLAUDE.md L5) — previously silently dropped", () => {
    expect(extractProofContent({ children: [{ statement: "A", justification: "" }] })).toBeUndefined();
    expect(extractProofContent({ children: [{ statement: "A", justification: "   " }] })).toBeUndefined();
  });

  test("a fully clean body is still accepted, with justification and depends intact", () => {
    const p = extractProofContent({
      children: [
        { statement: "A", justification: "by_definition" },
        { statement: "B", justification: "modus_ponens", depends: ["#0", "1.3"] },
      ],
    });
    expect(p).toEqual({
      children: [
        { statement: "A", justification: "by_definition" },
        { statement: "B", justification: "modus_ponens", depends: ["#0", "1.3"] },
      ],
    });
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

  // rk-xfzg: an exit-0 body that fails the shared validator must never be a silent, unnamed skip —
  // the concrete issue(s) that sank it are named in BOTH the skip reason and a structured log record.
  test("a body that fails validateRawProverOutput names the concrete issues in the skip reason AND a log record", async () => {
    const h = rec({ dispatchProve: () => proverTurn({ children: [{ statement: "A", inference: "modus_ponens" }] }) });
    const r = await proveOneNode(h.deps, pnode("1"), new Set(["1"]));
    expect("skip" in r).toBe(true);
    expect(h.recorded).toEqual([]);
    if ("skip" in r) expect(r.skip).toContain("children[0].inference");
    const ev = h.logs.map((l) => JSON.parse(l)).find((o) => o.kind === "prover-body-invalid");
    expect(ev).toBeDefined();
    expect(ev.node).toBe("1");
    expect(Array.isArray(ev.issues)).toBe(true);
    expect(ev.issues.length).toBeGreaterThan(0);
    expect(JSON.stringify(ev.issues)).toContain("children[0].inference");
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

// rk-i19: the prover's bounded schema-repair reprompt (src/drive/driver-live.ts's
// `repairProverTurnOnce`) is a SECOND REAL BACKEND TURN. Its tokens are spent whether or not the
// repair worked, so `proveOneNode` must charge them to the campaign total and log them honestly —
// a repair the budget could not see would be an unbounded hole in the exact guard rk-s9t provides.
// The evidence record is the countable EVENT: what was wrong, whether the correction landed.
describe("proveOneNode — repair accounting + evidence (rk-i19)", () => {
  const USAGE = { input: 7, output: 3, cache_read: 0, cache_creation: 0 };      // 10
  const REPAIR_USAGE = { input: 40, output: 5, cache_read: 45, cache_creation: 0 }; // 90
  const ISSUES = [{ path: "$.children[1].statement", message: "missing required property 'statement'" }];

  test("a repair turn's tokens are charged to spentTokens, on TOP of the first turn's", async () => {
    // mutation: drop the `turn.repair?.usage` term in proveOneNode's spentTokens → 10, RED.
    const h = rec({
      dispatchProve: () => proverTurn({ children: [{ statement: "x" }] }, { usage: USAGE, repair: { ok: true, issues: ISSUES, usage: REPAIR_USAGE } }),
    });
    const r = await proveOneNode(h.deps, pnode("1"), new Set(["1"]));
    expect(r.spentTokens).toBe(100);
  });

  test("TWO honest usage records are logged — one per real backend turn, the repair's flagged repair:true", async () => {
    const h = rec({
      dispatchProve: () => proverTurn({ children: [{ statement: "x" }] }, { usage: USAGE, repair: { ok: true, issues: ISSUES, usage: REPAIR_USAGE } }),
    });
    await proveOneNode(h.deps, pnode("1"), new Set(["1"]));
    const us = h.logs.map((l) => JSON.parse(l)).filter((o) => o.kind === "usage");
    expect(us.length).toBe(2);
    expect(us[0].usage).toEqual(USAGE);
    expect(us[0].repair).toBeUndefined();
    expect(us[1].usage).toEqual(REPAIR_USAGE);
    expect(us[1].repair).toBe(true);
    expect(us[1].role).toBe("prover");
  });

  test("a succeeded repair banks a verdict-repair evidence record with role 'prover' and the echoed issues", async () => {
    const h = rec({
      dispatchProve: () => proverTurn({ children: [{ statement: "x" }] }, { usage: USAGE, repair: { ok: true, issues: ISSUES, usage: REPAIR_USAGE } }),
    });
    const r = await proveOneNode(h.deps, pnode("1"), new Set(["1"]));
    expect(r).toMatchObject({ recorded: true });          // the repaired body went through the NORMAL path
    const ev = h.logs.map((l) => JSON.parse(l)).find((o) => o.kind === "verdict-repair");
    expect(ev).toBeDefined();
    expect(ev.node).toBe("1");
    expect(ev.role).toBe("prover");
    expect(ev.outcome).toBe("repaired");
    expect(JSON.stringify(ev.issues)).toContain("$.children[1].statement");
    expect(ev.repairIssues).toBeUndefined();              // absent iff repaired (report-parse.ts enforces it)
  });

  test("a FAILED repair banks outcome 'failed' WITH repairIssues, and the turn stays terminal", async () => {
    const REPAIR_ISSUES = [{ path: "$.children", message: "must contain AT LEAST ONE child" }];
    const h = rec({
      dispatchProve: () => proverTurn(undefined, { exit: 12, rawText: "garbage", usage: USAGE, repair: { ok: false, issues: ISSUES, repairIssues: REPAIR_ISSUES, usage: REPAIR_USAGE } }),
    });
    const r = await proveOneNode(h.deps, pnode("1"), new Set(["1"]));
    expect("skip" in r && r.skip.includes("exit 12")).toBe(true);
    expect(r.spentTokens).toBe(100);                      // both turns still charged
    expect(h.recorded).toEqual([]);
    const ev = h.logs.map((l) => JSON.parse(l)).find((o) => o.kind === "verdict-repair");
    expect(ev.outcome).toBe("failed");
    expect(JSON.stringify(ev.repairIssues)).toContain("AT LEAST ONE child");
    // the ORIGINAL failure representation survives alongside it
    expect(h.logs.some((l) => l.includes('"kind":"parse-failed"'))).toBe(true);
  });

  test("a turn with NO repair logs no verdict-repair record and exactly one usage record", async () => {
    const h = rec({ dispatchProve: () => proverTurn({ children: [{ statement: "x" }] }, { usage: USAGE }) });
    await proveOneNode(h.deps, pnode("1"), new Set(["1"]));
    const kinds = h.logs.map((l) => JSON.parse(l).kind);
    expect(kinds.filter((k) => k === "usage").length).toBe(1);
    expect(kinds).not.toContain("verdict-repair");
  });

  test("a repair turn that reported NO usage is never credited with a zero-cost record", async () => {
    const h = rec({
      dispatchProve: () => proverTurn({ children: [{ statement: "x" }] }, { usage: USAGE, repair: { ok: true, issues: ISSUES } }),
    });
    const r = await proveOneNode(h.deps, pnode("1"), new Set(["1"]));
    expect(r.spentTokens).toBe(10);
    expect(h.logs.map((l) => JSON.parse(l)).filter((o) => o.kind === "usage").length).toBe(1);
    // the EVENT is still recorded — a repair happened, it just reported no usage
    expect(h.logs.some((l) => l.includes('"kind":"verdict-repair"'))).toBe(true);
  });
});
