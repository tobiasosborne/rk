// 1:1 test for src/drive/driver-run.ts (M3.6) — the synthetic acceptance clause of the plan:
// "a synthetic over-decomposed conjecture triggers the balloon path and produces the frontmatter
// mark + bd task", plus the verify cycle and guardrails, ALL with FAKE workers (no real LLM/af).
// Ground truth: PRD C9 balloon routing + IMPLEMENTATION_PLAN.md M3.6.

import { describe, expect, test } from "bun:test";
import { runVerifyDriver, type DriverDeps, type DispatchedTurn } from "../../src/drive/driver-run";
import type { AfWorkspaceView, ApplyReport, FilledVerdictFile } from "../../src/drive/driver-af";
import type { AfNodeView } from "../../src/drive/driver-plan";
import type { VerifierIdentity } from "../../src/drive/identity";
import type { BalloonClassification } from "../../src/graph/types";

const IDENTITY: VerifierIdentity = { modelFamily: "gpt", backend: "codex", model: "gpt-5.6", sessionId: "s1" };
const HASH = "a".repeat(64);

function node(id: string, o: Partial<AfNodeView> = {}): AfNodeView {
  const base: AfNodeView = { id, epistemicState: "pending", workflowState: "available", crux: false, contentHash: HASH, ...o };
  // rk-gn4: readiness now reads af's exported flags. Default `verifierReady` from the fixture's axes
  // (pending + not blocked) unless the case sets a flag explicitly — mirrors af's authoritative
  // classifier for these simple, challenge-free fixtures, preserving every pre-existing test's intent.
  return { verifierReady: base.epistemicState === "pending" && base.workflowState !== "blocked", ...base };
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
  let lastWs: AfWorkspaceView | undefined;
  const deps: DriverDeps = {
    contractId: "lem-x",
    claimId: "claim-lem-x",
    identity: IDENTITY,
    queryWorkspace: () => { const value = over.workspaces[Math.min(q++, over.workspaces.length - 1)]!; lastWs = value; return { ok: true, value }; },
    // M3 blocker 1 default: the re-read agrees with the current round's query (no edit mid-turn),
    // so nothing is discarded and every pre-existing test is unaffected; dedicated blocker-1 tests
    // override this to simulate an af content edit between dispatch and apply.
    reReadContentHashes: () => new Map((lastWs?.nodes ?? []).map((n) => [n.id, n.contentHash] as const)),
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

  test("missing-fact (first balloon) → bd provisioning task filed AND counter persisted durably (blocker 7), aborts", async () => {
    const h = harness({ workspaces: [ws(over, 5)], config: { balloonCap: 3 } });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.stopReason).toBe("balloon-abort"); // the signal AUGMENTS the abort, never replaces it
    expect(r.balloon?.classification).toBe("missing-fact");
    expect(r.balloon?.routing).toBe("bd-provision");
    expect(h.bdTasks.length).toBe(1);
    expect(h.bdTasks[0]!.title).toContain("provisioning");
    // M3 blocker 7: EVERY classified balloon persists its counter (durable repeat-detection), so a
    // first missing-fact balloon now bumps the shard's `balloons:` count — not left at 0 for the
    // next event to keep reading as "first" forever.
    expect(h.written.length).toBe(1);
    expect(h.written[0]!).toContain("balloons: 1");
    expect(h.written[0]!).toContain("missing-fact");
    expect(h.logs.some((l) => l.includes('"kind":"balloon"'))).toBe(true);
  });

  test("FIRST dag-dep balloon persists the counter durably (balloons: 1) AND files a factoring task — blocker 7 red", async () => {
    const h = harness({ workspaces: [ws(over, 5)], config: { balloonCap: 3 }, dispatchClassification: () => ({ classification: "dag-dep", rationale: "cross-cutting dependency" }) });
    const r = await runVerifyDriver(h.deps);
    expect(r.balloon?.routing).toBe("bd-factoring");
    expect(h.written.length).toBe(1); // pre-fix: 0 — bd routings never persisted the counter
    expect(h.written[0]!).toContain("balloons: 1");
    expect(h.written[0]!).toContain("dag-dep");
    expect(h.bdTasks.length).toBe(1);
    expect(h.bdTasks[0]!.title).toContain("factoring");
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

// M3 blocker 3: only a verifier may mint an af acceptance; per-node mode uses one non-batch apply
// per node (no batch provenance) — the prover-overreach guard exempts the reviewer role, so without
// an explicit role check a reviewer turn would sail through and record an af accept.
describe("apply path — role and per-node provenance (M3 blocker 3)", () => {
  test("a REVIEWER turn producing a valid accept is DISCARDED — never composed, never applied", async () => {
    let applyCalls = 0;
    const h = harness({
      workspaces: [ws([node("1.1")])],
      config: { maxStuckRounds: 1, maxRounds: 2 },
      dispatchVerify: () => ({ raw: { verdict: { outcome: "accept" }, justification: "ok" }, role: "reviewer", exit: 0 }),
      applyVerdicts: (file) => { applyCalls++; return appliedReport(file.items.map((i) => i.node)); },
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.appliedNodeIds).toEqual([]); // pre-fix: ["1.1"] — reviewer minted an af accept
    expect(applyCalls).toBe(0);
    expect(r.status).toBe("aborted");
    expect(h.logs.some((l) => l.includes("node-skipped") && l.includes("only 'verifier'"))).toBe(true);
  });

  test("per-node mode applies EACH ready node as its own non-batch verdict file (no batch provenance)", async () => {
    const applies: FilledVerdictFile[] = [];
    const round0 = ws([node("1.1"), node("1.2")]);
    const round1 = ws([node("1.1", { epistemicState: "validated" }), node("1.2", { epistemicState: "validated" })]);
    const h = harness({
      workspaces: [round0, round1],
      applyVerdicts: (file) => { applies.push(file); return appliedReport(file.items.map((i) => i.node)); },
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("converged");
    expect(applies.length).toBe(2); // pre-fix: 1 — all nodes in one batch apply
    expect(applies.every((f) => f.items.length === 1)).toBe(true);
    expect(applies.every((f) => f.batch_id === "")).toBe(true); // per-node carries NO batch_id
  });
});

// M3 blocker 2: an empty frontier only converges when the root is af-validated; a recorded challenge
// is repair-required, never counted as an accept.
describe("convergence requires a validated root (M3 blocker 2)", () => {
  function challengeReport(file: FilledVerdictFile): ApplyReport {
    // af RECORDS the challenge successfully (status "applied") — the exact shape that pre-fix made
    // the driver count as progress and then falsely report convergence.
    return { exit: 0, batchId: file.batch_id, items: file.items.map((i) => ({ node: i.node, verdict: i.verdict, status: "applied" })), applied: file.items.length, blocked: 0, rejected: 0, aborted: false };
  }

  test("a challenged root does NOT converge and the challenge is not counted as an accept", async () => {
    const round0 = ws([node("1")]);
    const round1 = ws([node("1", { epistemicState: "needs_refinement" })]); // challenge recorded: root not validated, not ready
    const h = harness({
      workspaces: [round0, round1],
      config: { maxRounds: 5 },
      dispatchVerify: () => ({ raw: { verdict: { outcome: "challenge", target: "step 2", severity: "major", reason: "gap in step 2" }, justification: "the proof skips a case" }, role: "verifier", exit: 0 }),
      applyVerdicts: challengeReport,
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted"); // pre-fix: "converged"
    expect(r.stopReason).toBe("root-unvalidated");
    expect(r.appliedNodeIds).toEqual([]); // a challenge is NOT an accept
    expect(h.logs.some((l) => l.includes('"verdict":"challenge"'))).toBe(true);
  });
});

// rk-s9t (M3 repair-wave verdict (c)): a campaign-level token cap + a pre-dispatch remaining-budget
// check are the live spend guard --max-turns/--max-nodes never were (those bound call COUNT, not
// tokens). The counter lives in runVerifyDriver's loop; the check fires BEFORE every real dispatch.
describe("campaign token budget (rk-s9t)", () => {
  // Each turn reports 40 all-in tokens; cap 100, reserve 10 → 3 dispatches (0→40→80) then the 4th
  // node's pre-dispatch check (spent 120 >= cap 100) aborts. The reserve also blocks any call that
  // could not be afforded to completion.
  const usage40 = { input: 40, output: 0, cache_read: 0, cache_creation: 0 };

  test("the run ABORTS with 'budget-exhausted' once spend reaches the cap — never a mid-flight truncation", async () => {
    let dispatchCalls = 0;
    const h = harness({
      workspaces: [ws([node("1.1"), node("1.2"), node("1.3"), node("1.4")])],
      config: { maxRounds: 3 },
      budget: { maxCampaignTokens: 100, perCallReserve: 10 },
      dispatchVerify: () => { dispatchCalls++; return { raw: { verdict: { outcome: "accept" }, justification: "ok" }, role: "verifier", exit: 0, usage: usage40 }; },
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.stopReason).toBe("budget-exhausted"); // pre-fix: no such guard, would apply/converge
    // rule 2: the (cap+1)th token is NEVER requested — only 3 calls fired (0→40→80), the 4th refused.
    expect(dispatchCalls).toBe(3);
    expect(r.appliedNodeIds).toEqual([]); // aborted inside the dispatch loop, before any apply
  });

  test("a cap below one call's reserve refuses the FIRST dispatch — no token ever requested", async () => {
    let dispatchCalls = 0;
    const h = harness({
      workspaces: [ws([node("1.1")])],
      config: { maxRounds: 3 },
      budget: { maxCampaignTokens: 5, perCallReserve: 10 }, // 0 + 10 > 5
      dispatchVerify: () => { dispatchCalls++; return { raw: { verdict: { outcome: "accept" }, justification: "ok" }, role: "verifier", exit: 0, usage: usage40 }; },
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.stopReason).toBe("budget-exhausted");
    expect(dispatchCalls).toBe(0); // the very first call was never even attempted
  });

  test("a REJECTED turn still counts toward spend (tokens are spent whether or not it applies)", async () => {
    // Turns fail (exit 13 → discarded, never applied). If discarded turns did NOT count, spend would
    // stay 0 and the loop would abort 'stuck-no-progress'; because they DO count, spend reaches the
    // cap and the abort is 'budget-exhausted' instead — the assertion that distinguishes the two.
    const h = harness({
      workspaces: [ws([node("1.1"), node("1.2"), node("1.3"), node("1.4")])],
      config: { maxRounds: 3, maxStuckRounds: 3 },
      budget: { maxCampaignTokens: 100, perCallReserve: 10 },
      dispatchVerify: () => ({ raw: undefined, role: "verifier", exit: 13, usage: usage40 }), // rejected, but spent 40
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.stopReason).toBe("budget-exhausted"); // pre-fix (only accepts counted): "stuck-no-progress"
    expect(r.appliedNodeIds).toEqual([]);
  });

  test("no budget set (synthetic/dry harness) → the cap is not enforced at all (optional field)", async () => {
    const round0 = ws([node("1.1")]);
    const round1 = ws([node("1.1", { epistemicState: "validated" })]);
    const h = harness({ workspaces: [round0, round1] }); // no `budget`
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("converged"); // budget guard dormant when unset
  });

  test("the balloon classification call is ALSO refused when the budget cannot afford it (rule 2: every real call)", async () => {
    let classCalls = 0;
    const over = [node("1"), node("1.1"), node("1.2"), node("1.3"), node("1.4")]; // 5 > cap 3
    const h = harness({
      workspaces: [ws(over, 5)],
      config: { balloonCap: 3 },
      budget: { maxCampaignTokens: 5, perCallReserve: 10 }, // 0 + 10 > 5, cannot afford the classify turn
      dispatchClassification: () => { classCalls++; return { classification: "missing-fact", rationale: "x" }; },
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.stopReason).toBe("budget-exhausted"); // budget precedence over the balloon dispatch
    expect(classCalls).toBe(0); // the classification model call was never made
  });
});

// M3 blocker 1: a verdict bound to pre-dispatch bytes must be re-confirmed against the authoritative
// af node immediately before apply, and discarded on any hash mismatch.
describe("re-read before apply (M3 blocker 1)", () => {
  test("a verdict is DISCARDED when the af node's content hash changed between dispatch and apply", async () => {
    let applyCalls = 0;
    const h = harness({
      workspaces: [ws([node("1.1")])], // node bound to HASH ("a"*64)
      config: { maxStuckRounds: 1, maxRounds: 2 },
      reReadContentHashes: () => new Map([["1.1", "b".repeat(64)]]), // af now reports DIFFERENT bytes
      applyVerdicts: (file) => { applyCalls++; return appliedReport(file.items.map((i) => i.node)); },
    });
    const r = await runVerifyDriver(h.deps);
    expect(applyCalls).toBe(0); // pre-fix: 1 — applied a verdict bound to now-stale bytes
    expect(r.appliedNodeIds).toEqual([]);
    expect(r.status).toBe("aborted");
    expect(h.logs.some((l) => l.includes("node-skipped") && l.includes("content hash changed"))).toBe(true);
  });
});
