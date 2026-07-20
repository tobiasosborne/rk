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
  // Default `type: "claim"` — af's fresh-init root and every prover child are `claim` nodes
  // (../vibefeld/internal/schema/nodetype.go), and isProoflessNode's blocker-1 narrowing requires
  // `type:"claim"` on the root; a case overrides it explicitly.
  const base: AfNodeView = { id, type: "claim", epistemicState: "pending", workflowState: "available", crux: false, contentHash: HASH, ...o };
  // rk-gn4: readiness now reads af's exported flags. Default `verifierReady` from the fixture's axes
  // (pending + not blocked) unless the case sets a flag explicitly — mirrors af's authoritative
  // classifier for these simple, challenge-free fixtures, preserving every pre-existing test's intent.
  // rk B3: default `closed` from the axes too — a validated, available node with no challenge is
  // closed in these simple challenge-free fixtures. A case simulating a post-validation challenge
  // sets `closed: false` explicitly (a validated root that af no longer reports closed).
  return {
    verifierReady: base.epistemicState === "pending" && base.workflowState !== "blocked",
    closed: base.epistemicState === "validated" && base.workflowState === "available",
    ...base,
  };
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
    // rk-gn4: prover half defaults. No pre-existing test sets a `proverReady` node, so these never
    // fire for them; dedicated prover tests below override them. Default = no prover worker + a
    // no-op recorder, so an accidental prover-ready node is a loud skip, never a silent apply.
    dispatchProve: () => undefined,
    recordProof: () => ({ ok: true }),
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

// rk-qxp: the M3.5 live-debug fix. A verdict that fails to bind must (1) skip with a DIAGNOSIS-QUALITY
// reason carrying the issue PATH (not just the bare message — driver-verify-node.ts:64 previously
// joined only i.message), and (2) persist a 'bind-failed' driver-log record with node + issue paths +
// a BOUNDED raw snippet so the next live stop is self-diagnosing (the raw model output was previously
// discarded on bind failure, forcing diagnosis by guessing).
describe("bind-failure evidence (rk-qxp) — diagnosis-quality skip reason + persisted record", () => {
  test("a bind failure logs a 'bind-failed' record (node + issue PATHS + bounded raw snippet) and the node-skipped reason carries the path", async () => {
    const h = harness({
      workspaces: [ws([node("1")])],
      config: { maxStuckRounds: 1, maxRounds: 2 },
      // A non-integer number target is rejected (a dotted id like "1.10" would parse to 1.1 and name
      // the WRONG child), so this bind genuinely fails and exercises the evidence path end to end.
      dispatchVerify: () => ({ raw: { verdict: { outcome: "challenge", target: 1.5, severity: "major", reason: "gap" }, justification: "j" }, role: "verifier", exit: 0 }),
    });
    await runVerifyDriver(h.deps);
    const bindFailed = h.logs.find((l) => l.includes('"kind":"bind-failed"'));
    expect(bindFailed).toBeDefined();
    expect(bindFailed!).toContain('"node":"1"');
    expect(bindFailed!).toContain("$.verdict.target"); // the PATH is preserved in the persisted issues
    expect(bindFailed!).toContain('"rawSnippet"');
    expect(bindFailed!.toLowerCase()).toContain("challenge"); // the snippet carries the offending raw output
    // the node-skipped reason ALSO now carries the path, not just the bare "must be ..." message.
    const skip = h.logs.find((l) => l.includes("node-skipped") && l.includes("verdict bind failed"));
    expect(skip).toBeDefined();
    expect(skip!).toContain("$.verdict.target");
  });

  test("an INTEGER-number challenge target (e.g. 1) is coerced to the string '1', binds, and reaches apply — no bind-failed record", async () => {
    const applied: FilledVerdictFile[] = [];
    const h = harness({
      workspaces: [ws([node("1")])],
      config: { maxStuckRounds: 1, maxRounds: 2 },
      dispatchVerify: () => ({ raw: { verdict: { outcome: "challenge", target: 1, severity: "major", reason: "gap in node 1" }, justification: "j" }, role: "verifier", exit: 0 }),
      applyVerdicts: (f) => { applied.push(f); return appliedReport(f.items.map((i) => i.node)); },
    });
    await runVerifyDriver(h.deps);
    expect(h.logs.some((l) => l.includes('"kind":"bind-failed"'))).toBe(false);
    const challengeItem = applied.flatMap((f) => f.items).find((i) => i.verdict === "challenge");
    expect(challengeItem).toBeDefined();
    expect(challengeItem!.target).toBe("1"); // coerced to the STRING form, not the number 1
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

// rk-jit (STOP-4): the bootstrap deadlock. af marks a fresh proofless root verifier-ready; a real
// verifier ACCEPTS the bare true statement; that accept is vacuous (nothing was proven). The NEW
// structural backstop discards it BEFORE apply regardless of provenance (fail-closed, additive), and
// the run's abort names the real cause instead of an opaque stuck-no-progress.
describe("vacuous-accept discard on a proofless node (rk-jit / STOP-4)", () => {
  test("an accept on a PROOFLESS node is discarded + logged, never applied — even when cross-vendor would PASS", async () => {
    let applyCalls = 0;
    const h = harness({
      workspaces: [ws([node("1", { statement: "min_i n_i <= sum_i p_i n_i." })])], // bare conjecture: no children, no deps
      config: { maxStuckRounds: 1, maxRounds: 2 },
      isLoadBearing: () => false, // non-load-bearing → the cross-vendor gate WOULD accept; the discard must still fire
      applyVerdicts: (file) => { applyCalls++; return appliedReport(file.items.map((i) => i.node)); },
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.appliedNodeIds).toEqual([]);
    expect(applyCalls).toBe(0); // never composed into a verdict file, let alone applied
    expect(h.logs.some((l) => l.includes("vacuous-accept-discarded") && l.includes('"node":"1"'))).toBe(true);
  });

  test("a CONTENTFUL node's accept still APPLIES — the discard is additive-only, never over-discards", async () => {
    const round0 = ws([node("1", { statement: "S", deps: ["1.1"] })]); // cites a dependency → has proof content
    const round1 = ws([node("1", { statement: "S", deps: ["1.1"], epistemicState: "validated" })]);
    const h = harness({ workspaces: [round0, round1] });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("converged");
    expect(r.appliedNodeIds).toEqual(["1"]);
    expect(h.logs.some((l) => l.includes("vacuous-accept-discarded"))).toBe(false);
  });

  test("a run that only ever produced vacuous accepts aborts stopReason 'bootstrap-vacuous-accepts', naming the node/count and the missing prover", async () => {
    const h = harness({
      workspaces: [ws([node("1", { statement: "S" })])],
      config: { maxStuckRounds: 3, maxRounds: 10 },
      isLoadBearing: () => true,
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.stopReason).toBe("bootstrap-vacuous-accepts"); // NOT the opaque "stuck-no-progress"
    expect(r.message).toContain("node '1'");
    expect(r.message.toLowerCase()).toContain("prover");
  });

  // blocker-review FU2: an EARLY vacuous discard, then genuine PROGRESS, then a LATER unrelated stall
  // must NOT be mislabeled "bootstrap-vacuous-accepts". The tally is cleared on progress, so the final
  // stall reports its real cause. Pre-fix (cumulative, never cleared): stopReason was wrongly
  // "bootstrap-vacuous-accepts". Post-fix: "stuck-no-progress".
  test("a vacuous discard cleared by later progress does NOT mislabel a subsequent unrelated stall", async () => {
    // round 0: bare root '1' → vacuous accept discarded (proofless), no progress.
    // round 1: '1.1' (contentful, cites a dep) accepts + APPLIES → progress, clears the tally.
    // round 2+: '1' now contentful (has deps) and verifier-ready, but its accept is af-BLOCKED every
    //           round → no progress → stuck. The tally is empty, so this is stuck-no-progress.
    const ws0 = ws([node("1", { statement: "S" })]);
    const ws1 = ws([node("1", { statement: "S", deps: ["1.1"], verifierReady: false }), node("1.1", { statement: "T", deps: ["x"] })]);
    const ws2 = ws([node("1", { statement: "S", deps: ["1.1"], verifierReady: true }), node("1.1", { statement: "T", deps: ["x"], epistemicState: "validated" })]);
    const h = harness({
      workspaces: [ws0, ws1, ws2],
      config: { maxStuckRounds: 3, maxRounds: 20 },
      isLoadBearing: () => false,
      applyVerdicts: (file) => {
        const nId = file.items[0]!.node;
        if (nId === "1.1") return appliedReport(["1.1"]);
        // af refuses to apply the root's accept (a real, non-vacuous block) — the "unrelated stall".
        return { exit: 5, batchId: file.batch_id, items: [{ node: nId, verdict: "accept", status: "blocked-by:dependency-not-cleared" }], applied: 0, blocked: 1, rejected: 0, aborted: false };
      },
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    // a vacuous discard DID happen early (proving the tally was populated then cleared)...
    expect(h.logs.some((l) => l.includes("vacuous-accept-discarded") && l.includes('"node":"1"'))).toBe(true);
    // ...yet the final stall is named by its REAL cause, not the stale bootstrap discard.
    expect(r.stopReason).toBe("stuck-no-progress");
    expect(r.stopReason).not.toBe("bootstrap-vacuous-accepts");
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

  // rk B3 (the exact defect): a root that reached epistemic 'validated' but then acquired a blocking
  // challenge keeps epistemicState==='validated', so the old predicate reported CONVERGED. af now
  // exports `closed:false` for it (blocking challenge on a validated node); the driver must abort
  // with the DISTINCT root-not-closed reason, never converge.
  test("a VALIDATED-but-challenged root (closed:false) does NOT converge — root-not-closed", async () => {
    // Frontier empty (a blocking challenge on a validated node makes it neither prover- nor
    // verifier-ready), yet epistemicState is still 'validated'. Only the closure flag catches it.
    const round0 = ws([node("1", { epistemicState: "validated", closed: false, proverReady: false, verifierReady: false })]);
    const h = harness({ workspaces: [round0], config: { maxRounds: 3 } });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.stopReason).toBe("root-not-closed");
  });

  // rk B3: a claimed root (work in flight) is never a convergence, even if validated.
  test("a claimed root does NOT converge — root-claimed", async () => {
    const round0 = ws([node("1", { epistemicState: "validated", workflowState: "claimed", closed: false, proverReady: false, verifierReady: false })]);
    const h = harness({ workspaces: [round0], config: { maxRounds: 3 } });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.stopReason).toBe("root-claimed");
  });

  // rk B3: a blocked root is never a convergence.
  test("a blocked root does NOT converge — root-blocked", async () => {
    const round0 = ws([node("1", { epistemicState: "pending", workflowState: "blocked", proverReady: false, verifierReady: false })]);
    const h = harness({ workspaces: [round0], config: { maxRounds: 3 } });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.stopReason).toBe("root-blocked");
  });

  // rk B3: a validated AND closed root converges (the positive control).
  test("a validated + closed root converges", async () => {
    const round0 = ws([node("1", { epistemicState: "validated", closed: true, proverReady: false, verifierReady: false })]);
    const h = harness({ workspaces: [round0], config: { maxRounds: 3 } });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("converged");
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

// rk-gn4: the PROVER half of the loop. A prover-ready node gets a prover turn whose decomposition is
// recorded into af; the node then becomes verifier-ready and the EXISTING verifier path takes over —
// per-node prove-then-verify. Validity is untouchable: a prover NEVER mints a verdict, and a
// validated root is still required to converge.
describe("prover dispatch (rk-gn4) — prove-then-verify per node, never a prover verdict", () => {
  const proverBody = { children: [{ statement: "sub-step", justification: "modus_ponens" }] };

  test("a prover-ready node is proved (recorded), then verified next round, then converges", async () => {
    const recordedNodes: string[] = [];
    // round 0: node 1 prover-ready (fresh). round 1: 1 is now verifier-ready (af re-classified after
    // refine). round 2: 1 validated → converge. The fake advances af's state on recordProof/apply.
    const r0 = ws([node("1", { proverReady: true, verifierReady: false })]);
    const r1 = ws([node("1", { proverReady: false, verifierReady: true })]);
    const r2 = ws([node("1", { epistemicState: "validated", proverReady: false, verifierReady: false })]);
    const h = harness({
      workspaces: [r0, r1, r2],
      dispatchProve: () => ({ raw: proverBody, role: "prover", exit: 0 }) as DispatchedTurn,
      recordProof: (n) => { recordedNodes.push(n.id); return { ok: true }; },
    });
    const r = await runVerifyDriver(h.deps);
    expect(recordedNodes).toEqual(["1"]);                       // the prover produced + recorded a proof
    expect(h.logs.some((l) => l.includes('"kind":"proof-recorded"'))).toBe(true);
    expect(r.status).toBe("converged");                         // root validated
    expect(r.appliedNodeIds).toEqual(["1"]);                    // the verifier accepted it
  });

  test("a prover turn that smuggles a VERDICT is discarded — never recorded, never applied", async () => {
    let applyCalls = 0;
    const r0 = ws([node("1", { proverReady: true, verifierReady: false })]);
    const h = harness({
      workspaces: [r0],
      config: { maxStuckRounds: 1, maxRounds: 2 },
      dispatchProve: () => ({ raw: { verdict: { outcome: "accept" }, children: [{ statement: "x" }] }, role: "prover", exit: 0 }) as DispatchedTurn,
      recordProof: () => { throw new Error("recordProof must not be called for an overreaching prover"); },
      applyVerdicts: (file) => { applyCalls++; return appliedReport(file.items.map((i) => i.node)); },
    });
    const r = await runVerifyDriver(h.deps);
    expect(applyCalls).toBe(0);                                  // no verdict was ever applied
    expect(r.appliedNodeIds).toEqual([]);
    expect(r.status).toBe("aborted");                           // no progress → stuck; never a false converge
    expect(h.logs.some((l) => l.includes('"kind":"prover-overreach"'))).toBe(true);
  });

  test("a prover turn accrues to the SAME campaign cap; the (cap+1)th token is never requested", async () => {
    let proveCalls = 0;
    const usage = { input: 100, output: 0, cache_read: 0, cache_creation: 0 };
    const r0 = ws([node("1", { proverReady: true, verifierReady: false }), node("1.2", { proverReady: true, verifierReady: false })]);
    const h = harness({
      workspaces: [r0, r0],
      budget: { maxCampaignTokens: 100, perCallReserve: 1 },
      dispatchProve: () => { proveCalls++; return { raw: proverBody, role: "prover", exit: 0, usage } as DispatchedTurn; },
      recordProof: () => ({ ok: true }),
    });
    const r = await runVerifyDriver(h.deps);
    expect(proveCalls).toBe(1);                                  // first prover turn spends 100; the 2nd is refused pre-dispatch
    expect(r.stopReason).toBe("budget-exhausted");
  });
});

// rk-cpk (review 2026-07-20 FU2): the stuck guard resets on ANY structural write, so a spinning
// verifier-challenge → prover-refine chain (a proof recorded every round, ZERO nodes ever reaching
// validated) resets it every round and never trips — it would burn the whole campaign token cap on
// one branch before maxRounds/valves abort. The churn cap counts structural writes, NOT progress:
// per-node proof records and rounds of tree growth SINCE the last epistemic advancement (an accept).
// It aborts EARLIER than maxRounds/budget, with the offending node id(s) — never converges a run.
describe("churn cap (rk-cpk) — spinning prove/refine cycle aborts with node attribution", () => {
  const proverBody = { children: [{ statement: "sub-step", justification: "modus_ponens" }] };

  test("one node re-proved past nodeChurnCap with no accept aborts 'churn-cap' naming that node", async () => {
    // Node "1" stays prover-ready every round and records a proof every round; NOTHING ever validates.
    // The stuck guard never fires (each proof resets it); the churn cap catches the spin at cap 3.
    const spin = ws([node("1", { proverReady: true, verifierReady: false })]);
    const h = harness({
      workspaces: [spin], // queryWorkspace clamps to the last element, so every round returns `spin`
      config: { nodeChurnCap: 3, maxChurnRounds: 6, maxRounds: 50 },
      dispatchProve: () => ({ raw: proverBody, role: "prover", exit: 0 }) as DispatchedTurn,
      recordProof: () => ({ ok: true }),
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.stopReason).toBe("churn-cap");           // pre-fix: no such guard — spins to maxRounds
    expect(r.rounds).toBe(3);                          // aborts EARLY (round 3), not maxRounds 50
    expect(r.message).toContain("1");                  // names the offending node
    expect(r.appliedNodeIds).toEqual([]);              // never validated anything
    const churnLog = h.logs.map((l) => JSON.parse(l)).find((o) => o.kind === "churn-cap");
    expect(churnLog).toBeDefined();
    expect(churnLog.offenders).toEqual([{ nodeId: "1", proofRecords: 3 }]);
  });

  test("a chain extending a fresh leaf each round (no single node repeats) aborts via maxChurnRounds", async () => {
    // Each round a DIFFERENT node is prover-ready → per-node counts stay at 1, but the tree keeps
    // GROWING with zero validation. The rounds-of-growth counter catches it at maxChurnRounds 6.
    const leaves = ["1", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7"];
    const workspaces = leaves.map((id) => ws([node(id, { proverReady: true, verifierReady: false })]));
    const h = harness({
      workspaces,
      config: { nodeChurnCap: 3, maxChurnRounds: 6, maxRounds: 50 },
      dispatchProve: () => ({ raw: proverBody, role: "prover", exit: 0 }) as DispatchedTurn,
      recordProof: () => ({ ok: true }),
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("aborted");
    expect(r.stopReason).toBe("churn-cap");
    expect(r.rounds).toBe(6);                          // six growth rounds → abort, well before maxRounds
    expect(r.message).toContain("no epistemic advancement");
    const churnLog = h.logs.map((l) => JSON.parse(l)).find((o) => o.kind === "churn-cap");
    expect(churnLog.offenders.length).toBe(6);         // six distinct leaves, each ×1
  });

  test("a genuinely advancing run (an accept every round) NEVER trips the churn cap, then converges", async () => {
    // Every round records a proof (structural growth) AND lands an accept (epistemic advancement).
    // The accept resets the churn state each round, so the cap never fires despite 7 proof records.
    const active = ws([node("1.1", { proverReady: true, verifierReady: false }), node("2.1", { verifierReady: true })]);
    const done = ws([node("1", { epistemicState: "validated", closed: true, proverReady: false, verifierReady: false })]);
    const workspaces = [active, active, active, active, active, active, active, done]; // 7 active rounds then converge
    const h = harness({
      workspaces,
      config: { nodeChurnCap: 3, maxChurnRounds: 6, maxRounds: 50 },
      dispatchProve: () => ({ raw: proverBody, role: "prover", exit: 0 }) as DispatchedTurn,
      recordProof: () => ({ ok: true }),
    });
    const r = await runVerifyDriver(h.deps);
    expect(r.status).toBe("converged");                                   // genuine progress, not churn
    expect(h.logs.some((l) => l.includes('"kind":"churn-cap"'))).toBe(false);
    const proofs = h.logs.filter((l) => l.includes('"kind":"proof-recorded"')).length;
    expect(proofs).toBeGreaterThanOrEqual(6);                            // the tree grew a lot, yet no churn abort
  });
});
