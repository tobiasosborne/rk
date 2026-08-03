// 1:1 test for src/drive/driver-run-round.ts (rk-y83/rk-tbg shard-cap split) — the per-round
// PROVE-half + VERIFY-half + verdict-apply dispatch pulled out of src/drive/driver-run.ts's loop.
// The pre-existing end-to-end coverage of this exact logic lives in test/drive/driver-run.test.ts
// (unmodified by the split — it exercises `dispatchRound` indirectly through `runVerifyDriver`);
// this file adds FRESH direct coverage of `dispatchRound` itself: no prior dedicated unit test
// existed for it (only the indirect loop-level coverage), same as driver-verify-node.ts/
// driver-prove-node.ts's split precedent. Every fake here is synchronous; no real LLM/af call.

import { describe, expect, test } from "bun:test";
import { dispatchRound, type RoundState } from "../../src/drive/driver-run-round";
import type { DriverDeps, DispatchedTurn } from "../../src/drive/driver-run";
import type { ApplyReport, FilledVerdictFile } from "../../src/drive/driver-af";
import type { AfNodeView } from "../../src/drive/driver-plan";
import type { VerifierIdentity } from "../../src/drive/identity";

const IDENTITY: VerifierIdentity = { modelFamily: "gpt", backend: "codex", model: "gpt-5.6", sessionId: "s1" };
const HASH = "a".repeat(64);

function node(id: string, o: Partial<AfNodeView> = {}): AfNodeView {
  const base: AfNodeView = { id, type: "claim", epistemicState: "pending", workflowState: "available", crux: false, contentHash: HASH, ...o };
  return {
    verifierReady: base.epistemicState === "pending" && base.workflowState !== "blocked",
    closed: base.epistemicState === "validated" && base.workflowState === "available",
    ...base,
  };
}

function freshState(): RoundState {
  return { attempts: new Map(), proofRecordsByNode: new Map(), vacuousSinceProgress: new Map(), appliedNodeIds: [], outcomes: [] };
}

interface Harness { logs: string[]; noteSkipCalls: string[]; noteChallengeCalls: { nodeId: string; category: string | undefined }[]; deps: DriverDeps }
function harness(over: Partial<DriverDeps> = {}): Harness {
  const logs: string[] = [];
  const noteSkipCalls: string[] = [];
  const noteChallengeCalls: { nodeId: string; category: string | undefined }[] = [];
  const deps: DriverDeps = {
    contractId: "lem-x", claimId: "claim-lem-x", identity: IDENTITY,
    queryWorkspace: () => ({ ok: true, value: { workspaceId: "w", nodes: [], nodeCount: 0 } }),
    dispatchVerify: () => undefined,
    dispatchProve: () => undefined,
    recordProof: () => ({ ok: true }),
    dispatchClassification: () => undefined,
    applyVerdicts: (file) => ({ exit: 0, batchId: file.batch_id, items: file.items.map((i) => ({ node: i.node, verdict: i.verdict, status: "applied" })), applied: file.items.length, blocked: 0, rejected: 0, aborted: false }),
    isLoadBearing: () => false,
    reReadContentHashes: () => new Map(),
    readShard: () => undefined, writeShard: () => {}, createBdTask: () => true,
    appendLog: (l) => logs.push(l), now: () => "T", priorBalloonCount: 0, priorClassifications: [],
    ...over,
  };
  return { logs, noteSkipCalls, noteChallengeCalls, deps };
}
const noteSkip = (h: Harness) => (reason: string) => h.noteSkipCalls.push(reason);
const noteChallengeStall = (h: Harness) => (nodeId: string, category: string | undefined) => h.noteChallengeCalls.push({ nodeId, category });
const proverTurn = (raw: unknown, o: Partial<DispatchedTurn> = {}): DispatchedTurn => ({ raw, role: "prover", exit: 0, ...o });

describe("dispatchRound — retry cap", () => {
  test("a node already at its retry cap is skipped without dispatching (prove half)", async () => {
    let dispatched = false;
    const h = harness({ dispatchProve: () => { dispatched = true; return proverTurn({ children: [{ statement: "x" }] }); } });
    const n = node("1");
    const state = freshState();
    state.attempts.set("1", 3);
    const r = await dispatchRound(h.deps, 0, /* nodeRetryCap */ 3, ["1"], [], [n], new Map([["1", n]]), "seam", 0, state, noteSkip(h), noteChallengeStall(h));
    expect(dispatched).toBe(false);
    expect(r).toMatchObject({ done: false, progressed: false, structuralWrite: false, epistemicAdvance: false });
  });

  test("a node already at its retry cap is skipped without dispatching (verify half)", async () => {
    let dispatched = false;
    const h = harness({ dispatchVerify: () => { dispatched = true; return { raw: { verdict: { outcome: "accept" } }, role: "verifier", exit: 0 }; } });
    const n = node("1", { statement: "S", deps: ["1.1"] });
    const state = freshState();
    state.attempts.set("1", 3);
    const r = await dispatchRound(h.deps, 0, 3, [], ["1"], [n], new Map([["1", n]]), "seam", 0, state, noteSkip(h), noteChallengeStall(h));
    expect(dispatched).toBe(false);
    expect(r).toMatchObject({ done: false, progressed: false });
  });
});

describe("dispatchRound — budget guard (rk-s9t)", () => {
  test("an unaffordable budget aborts before a prover dispatch, returning done:true with rounds = round + 1", async () => {
    let dispatched = false;
    const h = harness({ dispatchProve: () => { dispatched = true; return undefined; }, budget: { maxCampaignTokens: 0, perCallReserve: 0 } });
    const n = node("1");
    const state = freshState();
    const r = await dispatchRound(h.deps, 4, 3, ["1"], [], [n], new Map([["1", n]]), "seam", 0, state, noteSkip(h), noteChallengeStall(h));
    expect(dispatched).toBe(false);
    expect(r.done).toBe(true);
    if (r.done) {
      expect(r.result.status).toBe("aborted");
      expect(r.result.stopReason).toBe("budget-exhausted");
      expect(r.result.rounds).toBe(5);
      // the abort result carries the SAME (shared) tallies as the caller's state, not fresh empty ones
      expect(r.result.appliedNodeIds).toBe(state.appliedNodeIds);
      expect(r.result.outcomes).toBe(state.outcomes);
    }
  });

  test("an unaffordable budget aborts before a verifier dispatch, returning done:true", async () => {
    const h = harness({ budget: { maxCampaignTokens: 0, perCallReserve: 0 } });
    const n = node("1", { statement: "S", deps: ["1.1"] });
    const state = freshState();
    const r = await dispatchRound(h.deps, 0, 3, [], ["1"], [n], new Map([["1", n]]), "seam", 0, state, noteSkip(h), noteChallengeStall(h));
    expect(r.done).toBe(true);
    if (r.done) expect(r.result.stopReason).toBe("budget-exhausted");
  });
});

describe("dispatchRound — PROVE half (rk-gn4)", () => {
  test("a recorded proof sets progressed + structuralWrite (not epistemicAdvance) and tallies proofRecordsByNode", async () => {
    const h = harness({ dispatchProve: () => proverTurn({ children: [{ statement: "step" }] }) });
    const n = node("1");
    const state = freshState();
    const r = await dispatchRound(h.deps, 0, 3, ["1"], [], [n], new Map([["1", n]]), "seam", 0, state, noteSkip(h), noteChallengeStall(h));
    expect(r).toMatchObject({ done: false, progressed: true, structuralWrite: true, epistemicAdvance: false });
    expect(state.proofRecordsByNode.get("1")).toBe(1);
  });

  test("a discarded prover turn is noted as a skip and bumps attempts, no progress", async () => {
    const h = harness({ dispatchProve: () => undefined });
    const n = node("1");
    const state = freshState();
    const r = await dispatchRound(h.deps, 0, 3, ["1"], [], [n], new Map([["1", n]]), "seam", 0, state, noteSkip(h), noteChallengeStall(h));
    expect(r).toMatchObject({ done: false, progressed: false, structuralWrite: false });
    expect(state.attempts.get("1")).toBe(1);
    expect(h.noteSkipCalls).toEqual(["no prover worker available"]);
  });
});

describe("dispatchRound — VERIFY half + apply (M3 blockers 1/3)", () => {
  test("an applied accept pushes appliedNodeIds/outcomes and sets progressed + epistemicAdvance", async () => {
    const h = harness({
      dispatchVerify: () => ({ raw: { verdict: { outcome: "accept" }, justification: "ok" }, role: "verifier", exit: 0 }),
      reReadContentHashes: () => new Map([["1", HASH]]),
    });
    const n = node("1", { statement: "S", deps: ["1.1"] });
    const state = freshState();
    const r = await dispatchRound(h.deps, 0, 3, [], ["1"], [n], new Map([["1", n]]), "seam", 0, state, noteSkip(h), noteChallengeStall(h));
    expect(r).toMatchObject({ done: false, progressed: true, epistemicAdvance: true, structuralWrite: false });
    expect(state.appliedNodeIds).toEqual(["1"]);
    expect(state.outcomes).toEqual([{ node: "1", verdict: "accept", status: "applied" }]);
  });

  test("a stale content hash (changed between dispatch and apply) discards the verdict — never applied (M3 blocker 1)", async () => {
    let applyCalls = 0;
    const h = harness({
      dispatchVerify: () => ({ raw: { verdict: { outcome: "accept" }, justification: "ok" }, role: "verifier", exit: 0 }),
      reReadContentHashes: () => new Map([["1", "b".repeat(64)]]), // != node's bound HASH
      applyVerdicts: (file) => { applyCalls++; return { exit: 0, batchId: file.batch_id, items: [], applied: 0, blocked: 0, rejected: 0, aborted: false }; },
    });
    const n = node("1", { statement: "S", deps: ["1.1"] });
    const state = freshState();
    const r = await dispatchRound(h.deps, 0, 3, [], ["1"], [n], new Map([["1", n]]), "seam", 0, state, noteSkip(h), noteChallengeStall(h));
    expect(applyCalls).toBe(0);
    expect(r).toMatchObject({ done: false, progressed: false });
    expect(state.appliedNodeIds).toEqual([]);
    expect(state.attempts.get("1")).toBe(1);
    expect(h.noteSkipCalls.some((s) => s.includes("stale verdict discarded"))).toBe(true);
  });

  test("a vacuous accept on a proofless node is discarded, tallied into vacuousSinceProgress, never applied (rk-jit)", async () => {
    let applyCalls = 0;
    const h = harness({
      dispatchVerify: () => ({ raw: { verdict: { outcome: "accept" }, justification: "ok" }, role: "verifier", exit: 0 }),
      reReadContentHashes: () => new Map([["1", HASH]]),
      applyVerdicts: (file) => { applyCalls++; return { exit: 0, batchId: file.batch_id, items: [], applied: 0, blocked: 0, rejected: 0, aborted: false }; },
    });
    const n = node("1", { statement: "S" }); // no children, no deps → proofless
    const state = freshState();
    const r = await dispatchRound(h.deps, 0, 3, [], ["1"], [n], new Map([["1", n]]), "seam", 0, state, noteSkip(h), noteChallengeStall(h));
    expect(applyCalls).toBe(0);
    expect(r.progressed).toBe(false);
    expect(state.vacuousSinceProgress.get("1")).toBe(1);
    expect(h.logs.some((l) => l.includes("vacuous-accept-discarded"))).toBe(true);
  });

  test("an accept binds the REVIEWED node's own hash as expect_hash (blamed == reviewed: byte-identical)", async () => {
    const files: FilledVerdictFile[] = [];
    const h = harness({
      dispatchVerify: () => ({ raw: { verdict: { outcome: "accept" }, justification: "ok" }, role: "verifier", exit: 0 }),
      reReadContentHashes: () => new Map([["1", HASH]]),
      applyVerdicts: (file: FilledVerdictFile): ApplyReport => { files.push(file); return { exit: 0, batchId: file.batch_id, items: file.items.map((i) => ({ node: i.node, verdict: i.verdict, status: "applied" })), applied: 1, blocked: 0, rejected: 0, aborted: false }; },
    });
    const n = node("1", { statement: "S", deps: ["1.1"] });
    const state = freshState();
    await dispatchRound(h.deps, 0, 3, [], ["1"], [n], new Map([["1", n]]), "seam", 0, state, noteSkip(h), noteChallengeStall(h));
    expect(files.length).toBe(1);
    expect(files[0]!.items[0]!.node).toBe("1");
    expect(files[0]!.items[0]!.expect_hash).toBe(HASH);
  });

  test("an APPLIED challenge calls noteChallengeStall with the node id + category (rk-dp1), never noteSkip", async () => {
    const h = harness({
      dispatchVerify: () => ({ raw: { verdict: { outcome: "challenge", target: "1", severity: "major", reason: "dep content missing", category: "dependency" }, justification: "cannot verify" }, role: "verifier", exit: 0 }),
      reReadContentHashes: () => new Map([["1", HASH]]),
      applyVerdicts: (file: FilledVerdictFile): ApplyReport => ({ exit: 0, batchId: file.batch_id, items: file.items.map((i) => ({ node: i.node, verdict: i.verdict, status: "applied" })), applied: 0, blocked: 0, rejected: 0, aborted: false }),
    });
    const n = node("1", { statement: "S", deps: ["1.1"] });
    const state = freshState();
    const r = await dispatchRound(h.deps, 0, 3, [], ["1"], [n], new Map([["1", n]]), "seam", 0, state, noteSkip(h), noteChallengeStall(h));
    expect(r.progressed).toBe(false);
    expect(state.appliedNodeIds).toEqual([]);
    expect(h.noteChallengeCalls).toEqual([{ nodeId: "1", category: "dependency" }]);
    expect(h.noteSkipCalls).toEqual([]);
  });
});

// LB1 (M3-close review): a challenge is recorded on the BLAMED node (driver-verdict-map.ts's
// `item.node := outcome.target`), which may be a DIFFERENT node than the one under review. The
// apply-time stale-hash guard must therefore compare the hash of the node the item ACTUALLY
// TARGETS. Pre-fix the reviewed node's hash was bound unconditionally, so every blamed != reviewed
// challenge mismatched, was discarded under a message asserting an unobserved content change, and
// burned the retry budget of a node that was never dispatched.
describe("dispatchRound — cross-node challenge binding (LB1)", () => {
  const BLAMED_HASH = "b".repeat(64);
  const EDITED_HASH = "c".repeat(64);
  const reviewed = () => node("1", { statement: "S", deps: ["1.1"] });          // contentHash HASH
  const blamed = () => node("1.1", { statement: "T", contentHash: BLAMED_HASH }); // the node at fault
  const both = (): [readonly AfNodeView[], ReadonlyMap<string, AfNodeView>] => {
    const r = reviewed();
    const b = blamed();
    return [[r, b], new Map([["1", r], ["1.1", b]])];
  };
  const challengeTurn = (): DispatchedTurn => ({
    raw: { verdict: { outcome: "challenge", target: "1.1", severity: "major", reason: "dep 1.1 is wrong", category: "incorrect" }, justification: "cannot verify" },
    role: "verifier",
    exit: 0,
  });

  test("unchanged bytes: the challenge REACHES apply, carrying the BLAMED node's hash as expect_hash", async () => {
    const files: FilledVerdictFile[] = [];
    const h = harness({
      dispatchVerify: () => challengeTurn(),
      // Both nodes unchanged since dispatch — nothing is stale, so nothing may be discarded.
      reReadContentHashes: () => new Map([["1", HASH], ["1.1", BLAMED_HASH]]),
      applyVerdicts: (file: FilledVerdictFile): ApplyReport => { files.push(file); return { exit: 0, batchId: file.batch_id, items: file.items.map((i) => ({ node: i.node, verdict: i.verdict, status: "applied" })), applied: 0, blocked: 0, rejected: 0, aborted: false }; },
    });
    const [all, byId] = both();
    const state = freshState();
    await dispatchRound(h.deps, 0, 3, [], ["1"], all, byId, "seam", 0, state, noteSkip(h), noteChallengeStall(h));
    expect(h.noteSkipCalls).toEqual([]);           // pre-fix: one false "stale verdict discarded"
    expect(files.length).toBe(1);                  // pre-fix: 0 — structurally unapplyable
    expect(files[0]!.items[0]!.node).toBe("1.1");  // recorded on the blamed node
    expect(files[0]!.items[0]!.expect_hash).toBe(BLAMED_HASH); // af CASes the TARGET's bytes
    expect(h.noteChallengeCalls).toEqual([{ nodeId: "1.1", category: "incorrect" }]);
    // The dispatch consumed was the REVIEWED node's; the blamed node was never dispatched.
    expect(state.attempts.get("1")).toBe(1);
    expect(state.attempts.has("1.1")).toBe(false);
  });

  test("the BLAMED node's bytes changed between dispatch and apply: discarded, message names the TARGET's hashes", async () => {
    let applyCalls = 0;
    const h = harness({
      dispatchVerify: () => challengeTurn(),
      reReadContentHashes: () => new Map([["1", HASH], ["1.1", EDITED_HASH]]), // 1.1 edited mid-turn
      applyVerdicts: (file) => { applyCalls++; return { exit: 0, batchId: file.batch_id, items: [], applied: 0, blocked: 0, rejected: 0, aborted: false }; },
    });
    const [all, byId] = both();
    const state = freshState();
    await dispatchRound(h.deps, 0, 3, [], ["1"], all, byId, "seam", 0, state, noteSkip(h), noteChallengeStall(h));
    expect(applyCalls).toBe(0);                       // the guard's purpose survives, per-target
    expect(h.noteSkipCalls.length).toBe(1);
    const msg = h.noteSkipCalls[0]!;
    expect(msg).toContain("content hash changed between dispatch and apply");
    expect(msg).toContain(`target 1.1`);
    expect(msg).toContain(`bound ${BLAMED_HASH}`);    // pre-fix: bound the REVIEWED node's hash
    expect(msg).toContain(`current ${EDITED_HASH}`);
    // Retry accounting: the reviewed node consumed the dispatch; the blamed node never did, so
    // charging it an attempt would let checkRetryCap starve a node that was never given a turn.
    expect(state.attempts.get("1")).toBe(1);
    expect(state.attempts.has("1.1")).toBe(false);
  });

  test("the BLAMED node is ABSENT from the pre-apply re-read: discarded, and the message never asserts an unobserved change", async () => {
    const h = harness({
      dispatchVerify: () => challengeTurn(),
      reReadContentHashes: () => new Map([["1", HASH]]), // 1.1 deleted/renamed since dispatch
    });
    const [all, byId] = both();
    const state = freshState();
    await dispatchRound(h.deps, 0, 3, [], ["1"], all, byId, "seam", 0, state, noteSkip(h), noteChallengeStall(h));
    expect(h.noteSkipCalls.length).toBe(1);
    const msg = h.noteSkipCalls[0]!;
    expect(msg).toContain("absent from the pre-apply re-read");
    expect(msg).not.toContain("content hash changed"); // pre-fix: claimed a change never observed
    expect(state.attempts.get("1")).toBe(1);
    expect(state.attempts.has("1.1")).toBe(false);
  });
});
