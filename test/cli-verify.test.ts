// Tests for `rk verify` (src/cli/verify.ts, M3.6): argument handling, the --dry-run plan (ready set,
// dispatch plan, balloon tripwire status) with an INJECTED af workspace reader (never a real af
// binary), and the honest live-run gate. Same small-real-repo + injected-edge pattern as
// test/cli-graph.test.ts.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyCommand } from "../src/cli/verify";
import type { AfParseResult, AfWorkspaceView } from "../src/drive/driver-af";
import type { SessionSpec, TurnItem, WorkerBackend } from "../src/drive/backend-types";
import type { WorkersConfig } from "../src/drive/backend-registry";
import { DEFAULT_MODEL_BY_BACKEND } from "../src/drive/driver-live";

function usageLine(o: { contractId: string; claimId: string; nodeId: string; sessionId: string; usage: { input: number; output: number; cache_read: number; cache_creation: number } }): string {
  return JSON.stringify({ kind: "usage", at: "2026-07-19T00:00:00Z", role: "verifier", ...o });
}

const ABSENT = ["definitely-not-a-real-binary-xyz"];

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}
function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "rk-verify-cli-"));
}
function writeShard(root: string, id: string, extra: Record<string, string> = {}): void {
  mkdirSync(join(root, "argument"), { recursive: true });
  const fm = { id, kind: "lemma", contract: `${id} holds.`, af: "none", ...extra };
  const body = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n");
  writeFileSync(join(root, "argument", `${id}.md`), `---\n${body}\n---\n\n${id}'s narrative.\n`);
}

function fakeWorkspace(nodeCount: number): (a: string, id: string) => AfParseResult<AfWorkspaceView> {
  return (_a, id) => ({
    ok: true,
    value: {
      workspaceId: id,
      rootStatement: "P",
      nodeCount,
      nodes: Array.from({ length: nodeCount }, (_, i) => ({
        id: i === 0 ? "1" : `1.${i}`,
        epistemicState: "pending",
        workflowState: i === 0 ? "blocked" : "available",
        crux: i === 1,
        contentHash: "a".repeat(64),
        // af's authoritative flags (rk-gn4): the blocked root is ready for nothing; each available
        // leaf is verifier_ready (af's breadth-first classifier — a verifier reviews it first).
        verifierReady: i !== 0,
      })),
    },
  });
}

describe("rk verify — CLI wiring", () => {
  const dirs: string[] = [];
  afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  test("no --af: exit 2, self-teaching message", async () => {
    const root = tmpRoot(); dirs.push(root);
    const { out, lines } = capture();
    const code = await verifyCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(2);
    expect(lines.join("\n")).toContain("no target selected");
  });

  test("--af on an unknown id: exit 1, honest message", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a");
    const { out, lines } = capture();
    const code = await verifyCommand(["--af", "nope", "--root", root, "--dry-run"], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("no node 'nope'");
  });

  test("--dry-run plans a workspace: ready set, per-node plan, tripwire clear, nothing written", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const { out, lines } = capture();
    const code = await verifyCommand(["--af", "lem-a", "--root", root, "--dry-run"], out, {
      afCommand: ABSENT, frCommand: ABSENT, readWorkspace: fakeWorkspace(4),
    });
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("DRY RUN");
    expect(text).toContain("4 node(s)");
    expect(text).toContain("balloon tripwire: 4 <= cap");
    // rk-gn4: the dry-run now shows BOTH halves of the loop from af's OWN flags. These 3 available
    // leaves are verifier_ready per af's authoritative classifier (breadth-first); nothing is
    // prover-ready this round. The blocked root is ready for neither.
    expect(text).toContain("prover-ready now (0): none");
    expect(text).toContain("verifier-ready now (3): 1.1, 1.2, 1.3");
    expect(text).toContain("crux (per-node cross-vendor, never batched): 1.1");
    expect(text).toContain("token usage: 0");
  });

  test("--dry-run shows the BALLOON tripwire firing when node count exceeds the cap", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-big", { af: "seeded", workspace: "proofs/lem-big" });
    const { out, lines } = capture();
    const code = await verifyCommand(["--af", "lem-big", "--root", root, "--dry-run"], out, {
      afCommand: ABSENT, frCommand: ABSENT, readWorkspace: fakeWorkspace(99),
    });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("BALLOON TRIPWIRE");
  });

  test("no --dry-run and no --live: dry-run is still the DEFAULT (M3.5-prep: a real spend must always be explicit)", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const { out, lines } = capture();
    const code = await verifyCommand(["--af", "lem-a", "--root", root], out, {
      afCommand: ABSENT, frCommand: ABSENT, readWorkspace: fakeWorkspace(2),
    });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("DRY RUN");
  });

  test("--live with no .rk/config.json workers assignment: loud error naming the exact config shape, exit 1, no worker ever called", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const { out, lines } = capture();
    // cap supplied so the run clears the rk-s9t budget gate and reaches the workers-config check.
    const code = await verifyCommand(["--af", "lem-a", "--root", root, "--live", "--max-campaign-tokens", "1000000"], out, {
      afCommand: ABSENT, frCommand: ABSENT, readWorkspace: fakeWorkspace(2),
    });
    expect(code).toBe(1);
    const text = lines.join("\n");
    expect(text).toContain("workers.assignments.verifier.hard");
    expect(text).toContain('"backend": "claude"');
  });

  test("--live and --dry-run together: the explicit safety flag wins, still dry-run", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const { out, lines } = capture();
    const code = await verifyCommand(["--af", "lem-a", "--root", root, "--live", "--dry-run"], out, {
      afCommand: ABSENT, frCommand: ABSENT, readWorkspace: fakeWorkspace(2),
    });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("DRY RUN");
  });
});

/** A fake, never-real-subprocess backend for the full `--live` CLI wiring tests below (task
 * constraint: no real subprocess/LLM call anywhere in this suite). */
function fakeLiveBackend(): WorkerBackend {
  return {
    name: "fake",
    modelFamily: "claude",
    capabilities: { sessionResume: true },
    async createSession(_spec: SessionSpec) {
      return { sessionId: "session-1" };
    },
    async runTurn(_sessionId: string, _item: TurnItem) {
      return { exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify({ verdict: { outcome: "accept" }, justification: "ok" }) };
    },
  };
}
// rk-gn4: a live run needs BOTH roles configured (the prover produces proofs, the verifier judges).
const FAKE_WORKERS_CONFIG: WorkersConfig = { assignments: { verifier: { hard: { backend: "fake", fallbacks: [] } }, prover: { hard: { backend: "fake", fallbacks: [] } } } };

/** Two verification-ready leaf nodes, never advancing state (irrelevant -- the tests below all
 * abort or fail before a second round would ever matter). */
function twoReadyNodesWorkspace(): (a: string, id: string) => AfParseResult<AfWorkspaceView> {
  return (_a, id) => ({
    ok: true,
    value: {
      workspaceId: id,
      rootStatement: "P",
      nodeCount: 2,
      // rk-gn4: both verifier_ready per af's authoritative flag (available pending leaves).
      nodes: [
        { id: "1.1", epistemicState: "pending", workflowState: "available", crux: false, contentHash: "a".repeat(64), verifierReady: true },
        { id: "1.2", epistemicState: "pending", workflowState: "available", crux: false, contentHash: "a".repeat(64), verifierReady: true },
      ],
    },
  });
}

/** A prover-ready node and a DIFFERENT verifier-ready node -- both dispatched within round 0, so a
 * single run exercises BOTH the prover and verifier sessions (rk-7hi: the two-dispatcher case). */
function proverAndVerifierReadyWorkspace(): (a: string, id: string) => AfParseResult<AfWorkspaceView> {
  return (_a, id) => ({
    ok: true,
    value: {
      workspaceId: id,
      rootStatement: "P",
      nodeCount: 2,
      nodes: [
        { id: "1.1", epistemicState: "pending", workflowState: "available", crux: false, contentHash: "a".repeat(64), proverReady: true, verifierReady: false },
        { id: "1.2", epistemicState: "pending", workflowState: "available", crux: false, contentHash: "a".repeat(64), proverReady: false, verifierReady: true },
      ],
    },
  });
}

/** A fake backend whose NAME matches one of DEFAULT_MODEL_BY_BACKEND's real keys ("claude"/"codex")
 * so the default-model fallback path is exercised honestly, while never spawning a real subprocess.
 * Records the `spec.model` every `createSession` call actually received, keyed by backend name. */
function fakeNamedBackend(name: string, seenModels: Record<string, string>): WorkerBackend {
  return {
    name,
    modelFamily: "claude",
    capabilities: { sessionResume: true },
    async createSession(spec: SessionSpec) {
      seenModels[name] = spec.model;
      return { sessionId: `session-${name}` };
    },
    async runTurn(_sessionId: string, _item: TurnItem) {
      return { exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify({ verdict: { outcome: "accept" }, justification: "ok" }) };
    },
  };
}

describe("rk verify --af --live (rk-7hi): per-assignment model reaches EACH backend independently", () => {
  const dirs: string[] = [];
  afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  // THE M3.5 STOP-2 case: the TJO pin "claude side = claude-opus-4-8, codex side = its default" is
  // expressed ENTIRELY through .rk/config.json's per-assignment `model` field -- no --model flag at
  // all. Before this bead there was no way to express this; the single global --model flag applied
  // to BOTH roles verbatim (src/cli/verify-live.ts:117,130 pre-fix).
  test("prover=claude pinned to claude-opus-4-8, verifier=codex on its own default -- in the SAME run, with NO --model flag", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const seenModels: Record<string, string> = {};
    const workers: WorkersConfig = {
      assignments: {
        prover: { hard: { backend: "claude", model: "claude-opus-4-8", fallbacks: [] } },
        verifier: { hard: { backend: "codex", fallbacks: [] } },
      },
    };
    const { out, lines } = capture();
    const code = await verifyCommand(["--af", "lem-a", "--root", root, "--live", "--max-turns", "5", "--max-campaign-tokens", "1000000"], out, {
      afCommand: ABSENT,
      frCommand: ABSENT,
      readWorkspace: proverAndVerifierReadyWorkspace(),
      loadWorkersConfig: async () => workers,
      backends: [fakeNamedBackend("claude", seenModels), fakeNamedBackend("codex", seenModels)],
      preflightAf: () => ({ ok: true }),
    });
    void code;
    const text = lines.join("\n");
    expect(text).toContain("backend resolved: prover/hard -> 'claude' (model 'claude-opus-4-8')");
    expect(text).toContain(`backend resolved: verifier/hard -> 'codex' (model '${DEFAULT_MODEL_BY_BACKEND.codex}')`);
    // the ACTUAL createSession call each backend received -- not merely the preflight log line.
    expect(seenModels.claude).toBe("claude-opus-4-8");
    expect(seenModels.codex).toBe(DEFAULT_MODEL_BY_BACKEND.codex);
    expect(seenModels.claude).not.toBe(seenModels.codex);
  });

  test("a global --model flag is now the FALLBACK, not the winner, once a per-assignment model is configured", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const seenModels: Record<string, string> = {};
    const workers: WorkersConfig = {
      assignments: {
        prover: { hard: { backend: "claude", model: "claude-opus-4-8", fallbacks: [] } },
        verifier: { hard: { backend: "codex", fallbacks: [] } }, // no per-assignment model -- inherits --model
      },
    };
    const { out, lines } = capture();
    await verifyCommand(["--af", "lem-a", "--root", root, "--live", "--max-turns", "5", "--max-campaign-tokens", "1000000", "--model", "gpt-5.1-codex-explicit"], out, {
      afCommand: ABSENT,
      frCommand: ABSENT,
      readWorkspace: proverAndVerifierReadyWorkspace(),
      loadWorkersConfig: async () => workers,
      backends: [fakeNamedBackend("claude", seenModels), fakeNamedBackend("codex", seenModels)],
      preflightAf: () => ({ ok: true }),
    });
    // per-assignment model still wins for the prover, unaffected by the global flag...
    expect(seenModels.claude).toBe("claude-opus-4-8");
    // ...while the verifier (no per-assignment model) falls back to the global --model flag.
    expect(seenModels.codex).toBe("gpt-5.1-codex-explicit");
    expect(lines.join("\n")).toContain("backend resolved: verifier/hard -> 'codex' (model 'gpt-5.1-codex-explicit')");
  });
});

describe("rk verify --af --live (M3.5-prep): full CLI wiring with a fake backend", () => {
  const dirs: string[] = [];
  afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  test("--max-turns 1 with 2 ready nodes: preflight printed, session created once, ABORTS on the 2nd turn with a named reason, never reaches af apply", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const { out, lines } = capture();
    const code = await verifyCommand(["--af", "lem-a", "--root", root, "--live", "--max-turns", "1", "--max-campaign-tokens", "1000000"], out, {
      afCommand: ABSENT,
      frCommand: ABSENT,
      readWorkspace: twoReadyNodesWorkspace(),
      loadWorkersConfig: async () => FAKE_WORKERS_CONFIG,
      backends: [fakeLiveBackend()],
      preflightAf: () => ({ ok: true }),
    });
    const text = lines.join("\n");
    expect(text).toContain("preflight");
    expect(text).toContain("backend resolved: verifier/hard -> 'fake'");
    expect(text).toContain("campaign token cap: 1000000");
    expect(text).toContain("ABORTED (safety valve)");
    expect(text).toContain("max-turns (1) reached");
    expect(code).toBe(4);
    // the M3.9 report is still printed at the end, even on an early abort (honest accounting).
    expect(text).toContain("final accounting");
  });

  // rk FU5: an af too old to advertise the readiness/closure/dependencies capabilities must fail
  // LOUDLY at preflight, before any model call — never silently read as "nothing ready".
  test("--live with a FAILING af capability preflight: loud abort, exit 1, no worker EVER called", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const called: string[] = [];
    const spyBackend: WorkerBackend = {
      name: "fake", modelFamily: "claude", capabilities: { sessionResume: true },
      async createSession() { called.push("createSession"); return { sessionId: "s1" }; },
      async runTurn() { called.push("runTurn"); return { exit: 0, usage: { input: 0, output: 0, cache_read: 0, cache_creation: 0 }, rawText: "{}" }; },
    };
    const { out, lines } = capture();
    const code = await verifyCommand(["--af", "lem-a", "--root", root, "--live", "--max-campaign-tokens", "1000000"], out, {
      afCommand: ABSENT, frCommand: ABSENT, readWorkspace: twoReadyNodesWorkspace(),
      loadWorkersConfig: async () => FAKE_WORKERS_CONFIG, backends: [spyBackend],
      preflightAf: () => ({ ok: false, reason: "this af binary is too old for rk's live driver" }),
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("capability preflight failed");
    expect(lines.join("\n")).toContain("too old");
    expect(called).toEqual([]); // fail closed: no session ever created, no turn ever run
  });

  test("--live prints the M3.9 report automatically at the end even when nothing was ever measured", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const { out, lines } = capture();
    await verifyCommand(["--af", "lem-a", "--root", root, "--live", "--max-turns", "1", "--max-campaign-tokens", "1000000"], out, {
      afCommand: ABSENT,
      frCommand: ABSENT,
      readWorkspace: twoReadyNodesWorkspace(),
      loadWorkersConfig: async () => FAKE_WORKERS_CONFIG,
      backends: [fakeLiveBackend()],
      preflightAf: () => ({ ok: true }),
    });
    // no usage was ever logged before the abort tripped on the very first call it counted...
    // actually one turn WAS dispatched (max-turns=1 permits exactly one) before the 2nd aborts, so
    // the log carries that one usage record -- confirm the report reads it back honestly.
    expect(lines.join("\n")).toContain("rk verify --report: campaign");
  });

  // rk-s9t: the fail-closed campaign token cap. A --live run with no --max-campaign-tokens must
  // REFUSE to start before any backend call (the exact hole the M3 milestone review named).
  test("--live WITHOUT --max-campaign-tokens: refuses to start, exit 1, no worker EVER called", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const called: string[] = [];
    const spyBackend: WorkerBackend = {
      name: "fake", modelFamily: "claude", capabilities: { sessionResume: true },
      async createSession() { called.push("createSession"); return { sessionId: "s1" }; },
      async runTurn() { called.push("runTurn"); return { exit: 0, usage: { input: 0, output: 0, cache_read: 0, cache_creation: 0 }, rawText: "{}" }; },
    };
    const { out, lines } = capture();
    const code = await verifyCommand(["--af", "lem-a", "--root", root, "--live", "--max-turns", "5"], out, {
      afCommand: ABSENT, frCommand: ABSENT, readWorkspace: twoReadyNodesWorkspace(),
      loadWorkersConfig: async () => FAKE_WORKERS_CONFIG, backends: [spyBackend],
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("REQUIRES a campaign token cap");
    expect(called).toEqual([]); // fail closed: nothing was dispatched
  });

  test("--live with a non-positive-int --max-campaign-tokens: loud refusal, exit 1", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const { out, lines } = capture();
    const code = await verifyCommand(["--af", "lem-a", "--root", root, "--live", "--max-campaign-tokens", "0"], out, {
      afCommand: ABSENT, frCommand: ABSENT, readWorkspace: twoReadyNodesWorkspace(),
      loadWorkersConfig: async () => FAKE_WORKERS_CONFIG, backends: [fakeLiveBackend()], preflightAf: () => ({ ok: true }),
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("must be a positive integer");
  });

  test("--live with a tiny cap the FIRST turn cannot afford: budget-exhausted abort, exit 4, no apply", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const { out, lines } = capture();
    // cap 1 < the per-call reserve (DEFAULT_MAX_OUTPUT_TOKENS 8000), so the pre-dispatch check
    // refuses the very first verify turn -- the run aborts budget-exhausted before requesting it.
    const code = await verifyCommand(["--af", "lem-a", "--root", root, "--live", "--max-campaign-tokens", "1"], out, {
      afCommand: ABSENT, frCommand: ABSENT, readWorkspace: twoReadyNodesWorkspace(),
      loadWorkersConfig: async () => FAKE_WORKERS_CONFIG, backends: [fakeLiveBackend()], preflightAf: () => ({ ok: true }),
    });
    expect(code).toBe(4);
    expect(lines.join("\n")).toContain("budget");
  });
});

describe("rk verify --report (M3.9)", () => {
  const dirs: string[] = [];
  afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  test("no driver log at all: honest 'never measured', exit 1", async () => {
    const root = tmpRoot(); dirs.push(root);
    const { out, lines } = capture();
    const code = await verifyCommand(["--report", "--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("no driver log");
  });

  test("a log with zero usage records: parses fine, still honestly 'never measured'", async () => {
    const root = tmpRoot(); dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "driver-log.jsonl"), JSON.stringify({ kind: "verdict-outcome", at: "t", node: "1.1", verdict: "accept", status: "applied", exit: 0 }) + "\n");
    const { out, lines } = capture();
    const code = await verifyCommand(["--report", "--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("ZERO usage records");
  });

  test("a synthetic log fixture with real usage: prints campaign/claim/node tokens, calls, cache fraction", async () => {
    const root = tmpRoot(); dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    const text =
      usageLine({ contractId: "lem-x", claimId: "claim-1", nodeId: "1.1", sessionId: "s1", usage: { input: 10, output: 5, cache_read: 0, cache_creation: 20 } }) + "\n" +
      usageLine({ contractId: "lem-x", claimId: "claim-1", nodeId: "1.2", sessionId: "s1", usage: { input: 10, output: 5, cache_read: 100, cache_creation: 0 } }) + "\n";
    writeFileSync(join(root, ".rk", "driver-log.jsonl"), text);
    const { out, lines } = capture();
    const code = await verifyCommand(["--report", "--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    const joined = lines.join("\n");
    expect(joined).toContain("turns=2");
    expect(joined).toContain("claim claim-1");
    expect(joined).toContain("node 1.1");
    expect(joined).toContain("node 1.2");
    expect(joined).toContain("no baseline recorded");
  });

  test("a corrupted line is surfaced loudly, never silently dropped", async () => {
    const root = tmpRoot(); dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    const text = usageLine({ contractId: "lem-x", claimId: "claim-1", nodeId: "1.1", sessionId: "s1", usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 } }) + "\n{garbage\n";
    writeFileSync(join(root, ".rk", "driver-log.jsonl"), text);
    const { out, lines } = capture();
    const code = await verifyCommand(["--report", "--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("could not be parsed");
  });

  test("--baseline pointing at a real memo: prints the ratio", async () => {
    const root = tmpRoot(); dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "driver-log.jsonl"), usageLine({ contractId: "lem-x", claimId: "claim-1", nodeId: "lem-x", sessionId: "s1", usage: { input: 100, output: 50, cache_read: 0, cache_creation: 0 } }) + "\n");
    const baselinePath = join(root, "baseline.json");
    // M3 repair-wave blocker 8: baseline entries now carry claimId (the join key fix) under a
    // versioned {schemaVersion, entries} envelope, not a bare array (src/drive/report.ts).
    writeFileSync(baselinePath, JSON.stringify({ schemaVersion: 2, entries: [{ claimId: "claim-1", lemma: "lem-x", tokens: 450, calls: 5 }] }));
    const { out, lines } = capture();
    const code = await verifyCommand(["--report", "--root", root, "--baseline", baselinePath], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("3.00x");
  });

  test("--baseline pointing at a missing file: honest error, exit 1, never a fabricated ratio", async () => {
    const root = tmpRoot(); dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "driver-log.jsonl"), usageLine({ contractId: "lem-x", claimId: "claim-1", nodeId: "lem-x", sessionId: "s1", usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 } }) + "\n");
    const { out, lines } = capture();
    const code = await verifyCommand(["--report", "--root", root, "--baseline", join(root, "nope.json")], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("does not exist");
  });
});
