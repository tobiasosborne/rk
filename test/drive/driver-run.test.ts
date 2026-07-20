// 1:1 test for src/drive/driver-run.ts (M3.6) — the synthetic acceptance clause of the plan:
// "a synthetic over-decomposed conjecture triggers the balloon path and produces the frontmatter
// mark + bd task", plus the verify cycle and guardrails, ALL with FAKE workers (no real LLM/af).
// Ground truth: PRD C9 balloon routing + IMPLEMENTATION_PLAN.md M3.6.

import { describe, expect, test } from "bun:test";
import { runVerifyDriver, type DriverDeps, type DispatchedTurn } from "../../src/drive/driver-run";
import type { AfWorkspaceView, ApplyReport } from "../../src/drive/driver-af";
import type { AfNodeView } from "../../src/drive/driver-plan";
import type { VerifierIdentity } from "../../src/drive/identity";
import type { BalloonClassification } from "../../src/graph/types";

const IDENTITY: VerifierIdentity = { modelFamily: "gpt", backend: "codex", model: "gpt-5.6", sessionId: "s1" };
const HASH = "a".repeat(64);

function node(id: string, o: Partial<AfNodeView> = {}): AfNodeView {
  return { id, epistemicState: "pending", workflowState: "available", crux: false, contentHash: HASH, ...o };
}
function ws(nodes: AfNodeView[], count?: number): AfWorkspaceView {
  return { workspaceId: "proofs/lem-x", rootStatement: "P", nodes, nodeCount: count ?? nodes.length };
}
function appliedReport(nodeIds: string[]): ApplyReport {
  return { exit: 0, batchId: "b", items: nodeIds.map((n) => ({ node: n, verdict: "accept", status: "applied" })), applied: nodeIds.length, blocked: 0, rejected: 0, aborted: false };
}

interface Harness {
  logs: string[];
  bdTasks: { title: string; description: string }[];
  written: string[];
  deps: DriverDeps;
}
function harness(over: Partial<DriverDeps> & { workspaces: AfWorkspaceView[] }): Harness {
  const logs: string[] = [];
  const bdTasks: { title: string; description: string }[] = [];
  const written: string[] = [];
  let q = 0;
  const deps: DriverDeps = {
    contractId: "lem-x",
    claimId: "claim-lem-x",
    identity: IDENTITY,
    queryWorkspace: () => ({ ok: true, value: over.workspaces[Math.min(q++, over.workspaces.length - 1)]! }),
    dispatchVerify: () => ({ raw: { verdict: { outcome: "accept" }, justification: "ok" }, role: "verifier", exit: 0 }) as DispatchedTurn,
    dispatchClassification: () => ({ classification: "missing-fact", rationale: "def X unprovided" }),
    applyVerdicts: (file) => appliedReport(file.items.map((i) => i.node)),
    // M3.8: permissive default so every PRE-EXISTING test above (none of which sets `node.author`
    // or cares about cross-vendor) is unaffected — `false` means "not load-bearing," under which
    // decideCrossVendor is always satisfied regardless of family. Dedicated cross-vendor tests
    // below override this per-case.
    isLoadBearing: () => false,
    readShard: () => "---\nid: lem-x\nkind: lemma\ncontract: P\n---\nbody\n",
    writeShard: (c) => written.push(c),
    createBdTask: (t) => { bdTasks.push(t); return true; },
    appendLog: (l) => logs.push(l),
    now: () => "2026-07-19T00:00:00Z",
    priorBalloonCount: 0,
    priorClassifications: [],
    ...over,
  };
  return { logs, bdTasks, written, deps };
}

describe("balloon path (synthetic acceptance) — tripwire → classify → route → mark/task → ABORT", () => {
  const over = [node("1"), node("1.1"), node("1.2"), node("1.3"), node("1.4")]; // 5 > cap 3

  test("missing-fact (first balloon) → bd provisioning task filed, shard NOT marked, aborts", async () => {
    const h = harness({ workspaces: [ws(over, 5)], config: { balloonCap: 3 } });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.stopReason).toBe("balloon-abort"); // the signal AUGMENTS the abort, never replaces it
    expect(r.balloon?.classification).toBe("missing-fact");
    expect(r.balloon?.routing).toBe("bd-provision");
    expect(h.bdTasks.length).toBe(1);
    expect(h.bdTasks[0]!.title).toContain("provisioning");
    expect(h.written.length).toBe(0); // bd routing does NOT mark the shard
    expect(h.logs.some((l) => l.includes('"kind":"balloon"'))).toBe(true);
  });

  test("genuine-gap → mandatory-review: frontmatter mark WRITTEN, no bd task, aborts", async () => {
    const h = harness({ workspaces: [ws(over, 5)], config: { balloonCap: 3 }, dispatchClassification: () => ({ classification: "genuine-gap", rationale: "hypotheses too weak" }) });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.balloon?.routing).toBe("mandatory-review");
    expect(h.written.length).toBe(1);
    expect(h.written[0]!).toContain("balloons: 1");
    expect(h.written[0]!).toContain("genuine-gap");
    expect(h.bdTasks.length).toBe(0);
  });

  test("REPEAT balloon on the same contract → mandatory-review (mark) even for missing-fact", async () => {
    const h = harness({
      workspaces: [ws(over, 5)],
      config: { balloonCap: 3 },
      priorBalloonCount: 1,
      priorClassifications: ["missing-fact"],
      dispatchClassification: () => ({ classification: "missing-fact", rationale: "again" }),
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.balloon?.routing).toBe("mandatory-review");
    expect(h.written.length).toBe(1);
    expect(h.written[0]!).toContain("balloons: 2"); // prior 1 + this
    expect(h.written[0]!).toContain("balloon_classifications:\n- missing-fact\n- missing-fact");
  });

  test("bd absent → task is NOT filed but a loud skip is logged (never silent)", async () => {
    const h = harness({ workspaces: [ws(over, 5)], config: { balloonCap: 3 }, createBdTask: () => false });
    await runVerifyDriver(h.deps);
    expect(h.bdTasks.length).toBe(0);
    expect(h.logs.some((l) => l.includes("balloon-bd-skipped"))).toBe(true);
  });

  test("an unclassifiable balloon still ABORTS and marks nothing (never guesses a class)", async () => {
    const h = harness({ workspaces: [ws(over, 5)], config: { balloonCap: 3 }, dispatchClassification: () => ({ nonsense: true }) });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.stopReason).toBe("balloon-abort");
    expect(h.written.length).toBe(0);
    expect(h.bdTasks.length).toBe(0);
    expect(h.logs.some((l) => l.includes("balloon-unclassified"))).toBe(true);
  });
});

describe("verify cycle — bottom-up convergence with fake accepts", () => {
  test("applies leaf then parent across rounds, then converges", async () => {
    const round0 = ws([node("1", { workflowState: "blocked" }), node("1.1")]); // 1.1 ready, 1 blocked
    const round1 = ws([node("1"), node("1.1", { epistemicState: "validated" })]); // 1 now ready
    const round2 = ws([node("1", { epistemicState: "validated" }), node("1.1", { epistemicState: "validated" })]); // done
    const h = harness({ workspaces: [round0, round1, round2] });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("converged");
    expect(r.appliedNodeIds.sort()).toEqual(["1", "1.1"]);
    expect(h.logs.some((l) => l.includes('"kind":"verdict-outcome"'))).toBe(true);
  });
});

describe("M3.9: usage logging", () => {
  test("a turn carrying usage appends a 'usage' record with the claim/contract/node/session identity", async () => {
    const h = harness({
      workspaces: [ws([node("1.1")])],
      config: { maxRounds: 1 },
      dispatchVerify: () => ({ raw: { verdict: { outcome: "accept" }, justification: "ok" }, role: "verifier", exit: 0, usage: { input: 10, output: 5, cache_read: 100, cache_creation: 0 } }),
    });
    await runVerifyDriver(h.deps);
    const usageLines = h.logs.filter((l) => l.includes('"kind":"usage"')).map((l) => JSON.parse(l));
    expect(usageLines).toHaveLength(1);
    expect(usageLines[0]).toEqual({
      kind: "usage", at: "2026-07-19T00:00:00Z", contractId: "lem-x", claimId: "claim-lem-x", nodeId: "1.1", role: "verifier", sessionId: "s1",
      usage: { input: 10, output: 5, cache_read: 100, cache_creation: 0 },
    });
  });

  test("no usage on the dispatched turn -> no 'usage' record appended (never fabricates a zero)", async () => {
    const h = harness({ workspaces: [ws([node("1.1")])], config: { maxRounds: 1 } }); // default dispatchVerify carries no `usage`
    await runVerifyDriver(h.deps);
    expect(h.logs.some((l) => l.includes('"kind":"usage"'))).toBe(false);
  });

  test("usage is logged even when the turn is later discarded (prover overreach) — tokens were spent regardless", async () => {
    const h = harness({
      workspaces: [ws([node("1.1")])],
      config: { maxStuckRounds: 1, maxRounds: 1 },
      dispatchVerify: () => ({ raw: { verdict: { outcome: "accept" } }, role: "prover", exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 } }),
    });
    await runVerifyDriver(h.deps);
    expect(h.logs.some((l) => l.includes('"kind":"usage"'))).toBe(true);
    expect(h.logs.some((l) => l.includes("prover-overreach"))).toBe(true);
  });
});

describe("guardrails inside the loop", () => {
  test("a PROVER turn that emits a verdict is discarded + logged, and drives the loop to a stuck abort", async () => {
    const h = harness({
      workspaces: [ws([node("1.1")])],
      config: { maxStuckRounds: 2, maxRounds: 10 },
      dispatchVerify: () => ({ raw: { verdict: { outcome: "accept" }, justification: "x" }, role: "prover", exit: 0 }),
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.stopReason).toBe("stuck-no-progress");
    expect(h.logs.some((l) => l.includes("prover-overreach"))).toBe(true);
  });

  test("no bindable verdict every round → stuck abort with a named reason", async () => {
    const h = harness({
      workspaces: [ws([node("1.1")])],
      config: { maxStuckRounds: 2, maxRounds: 10 },
      dispatchVerify: () => ({ raw: { verdict: { outcome: "accept" }, justification: "x" }, role: "verifier", exit: 13 }), // nonzero exit → never applied
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.stopReason).toBe("stuck-no-progress");
    expect(r.message).toContain("stuck");
  });
});

// M3.8: apply-time cross-vendor enforcement (PRD C9), wired into verifyOneNode. IDENTITY (the
// driver's own verifier identity, declared at the top of this file) is gpt/codex/gpt-5.6/s1 —
// verifiedBySeam = "gpt|codex|gpt-5.6|s1".
describe("cross-vendor rule (M3.8) — apply-time, load-bearing (critical-path) nodes", () => {
  test("same-family accept on a load-bearing node is REJECTED per-item BEFORE any verdict file is applied", async () => {
    let applyCalls = 0;
    const h = harness({
      workspaces: [ws([node("1.1", { author: "gpt|other-backend|gpt-4|sx" })])], // same family (gpt) as the verifier
      config: { maxStuckRounds: 1, maxRounds: 2 },
      isLoadBearing: () => true,
      applyVerdicts: (file) => {
        applyCalls++;
        return appliedReport(file.items.map((i) => i.node));
      },
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.appliedNodeIds).toEqual([]);
    expect(applyCalls).toBe(0); // the verdict file was never even composed, let alone applied
    expect(h.logs.some((l) => l.includes("cross-vendor-rejected") && l.includes('"reason":"same-family"'))).toBe(true);
  });

  test("cross-family accept on a load-bearing node PASSES and applies normally", async () => {
    const round0 = ws([node("1.1", { author: "claude|claude-code|opus|sy" })]); // different family (claude) from the verifier (gpt)
    const round1 = ws([node("1.1", { author: "claude|claude-code|opus|sy", epistemicState: "validated" })]);
    const h = harness({ workspaces: [round0, round1], isLoadBearing: () => true });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("converged");
    expect(r.appliedNodeIds).toEqual(["1.1"]);
  });

  test("unparseable/absent author on a load-bearing node fails closed with the DISTINCT 'identity-unparseable' reason, never conflated with same-family", async () => {
    const h = harness({
      workspaces: [ws([node("1.1")])], // no `author` set at all
      config: { maxStuckRounds: 1, maxRounds: 2 },
      isLoadBearing: () => true,
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.appliedNodeIds).toEqual([]);
    expect(h.logs.some((l) => l.includes("cross-vendor-rejected") && l.includes('"reason":"identity-unparseable"'))).toBe(true);
    expect(h.logs.some((l) => l.includes('"reason":"same-family"'))).toBe(false);
  });

  test("same-family accept on a NON-load-bearing node is allowed (recorded, never rejected)", async () => {
    const round0 = ws([node("1.1", { author: "gpt|other-backend|gpt-4|sx" })]);
    const round1 = ws([node("1.1", { author: "gpt|other-backend|gpt-4|sx", epistemicState: "validated" })]);
    const h = harness({ workspaces: [round0, round1], isLoadBearing: () => false });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("converged");
    expect(r.appliedNodeIds).toEqual(["1.1"]);
  });
});
