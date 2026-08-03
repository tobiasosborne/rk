// Tests for `rk verify` (src/cli/verify.ts, M3.6): argument handling, the --dry-run plan (ready set,
// dispatch plan, balloon tripwire status) with an INJECTED af workspace reader (never a real af
// binary), and the honest live-run gate. Same small-real-repo + injected-edge pattern as
// test/cli-graph.test.ts.

import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyCommand } from "../src/cli/verify";
import type { AfParseResult, AfWorkspaceView } from "../src/drive/driver-af";
import type { SessionSpec, TurnItem, WorkerBackend } from "../src/drive/backend-types";
import type { WorkersConfig } from "../src/drive/backend-registry";
import { DEFAULT_MODEL_BY_BACKEND, DEFAULT_SESSION_TIMEOUT_MS, DEFAULT_TURN_TIMEOUT_MS } from "../src/drive/driver-live";

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
 * Records the `spec.model` every `createSession` call actually received, keyed by backend name.
 *
 * rk-9zd: `modelFamily` is now an EXPLICIT parameter with no default. It used to be hard-coded
 * `"claude"` on every fake regardless of name — harmless while the CLI re-derived the family from
 * the name string, and actively misleading now that the CLI reads the field: these fixtures were
 * declaring a codex-named backend as family "claude". Each call site now states the family it
 * means, which is also what makes the name-vs-declaration test below meaningful. */
function fakeNamedBackend(name: string, seenModels: Record<string, string>, modelFamily: WorkerBackend["modelFamily"]): WorkerBackend {
  return {
    name,
    modelFamily,
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
      backends: [fakeNamedBackend("claude", seenModels, "claude"), fakeNamedBackend("codex", seenModels, "gpt")],
      preflightAf: () => ({ ok: true }),
    });
    void code;
    const text = lines.join("\n");
    expect(text).toContain("backend resolved: prover/hard -> 'claude' (model 'claude-opus-4-8', family 'claude')");
    expect(text).toContain(`backend resolved: verifier/hard -> 'codex' (model '${DEFAULT_MODEL_BY_BACKEND.codex}', family 'gpt')`);
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
      backends: [fakeNamedBackend("claude", seenModels, "claude"), fakeNamedBackend("codex", seenModels, "gpt")],
      preflightAf: () => ({ ok: true }),
    });
    // per-assignment model still wins for the prover, unaffected by the global flag...
    expect(seenModels.claude).toBe("claude-opus-4-8");
    // ...while the verifier (no per-assignment model) falls back to the global --model flag.
    expect(seenModels.codex).toBe("gpt-5.1-codex-explicit");
    expect(lines.join("\n")).toContain("backend resolved: verifier/hard -> 'codex' (model 'gpt-5.1-codex-explicit', family 'gpt')");
  });
});

/** rk-k0m1: like `fakeNamedBackend`, but records the TIMEOUTS each backend call received --
 * `spec.timeoutMs` for the session-creating turn 1 and every `item.timeoutMs` after it -- keyed by
 * backend name, so a per-role override can be shown to reach that role's calls and no other's. */
function fakeTimeoutBackend(name: string, seen: Record<string, { session?: number; turns: number[] }>, modelFamily: WorkerBackend["modelFamily"]): WorkerBackend {
  seen[name] = { turns: [] };
  return {
    name,
    modelFamily,
    capabilities: { sessionResume: true },
    async createSession(spec: SessionSpec) {
      seen[name]!.session = spec.timeoutMs;
      return { sessionId: `session-${name}` };
    },
    async runTurn(_sessionId: string, item: TurnItem) {
      seen[name]!.turns.push(item.timeoutMs);
      return { exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify({ verdict: { outcome: "accept" }, justification: "ok" }) };
    },
  };
}

// rk-k0m1 (P2, RUN-REPORT-12): the codex prover's full-decomposition turn on a hard lemma timed out
// at exactly the hard-coded 120s twice (exit 10 -- a correct loud skip), and the operator had no way
// to raise the ceiling. `.rk/config.json` can now express it PER ASSIGNMENT.
describe("rk verify --af --live (rk-k0m1): configured timeouts reach EACH role's backend calls", () => {
  const dirs: string[] = [];
  afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  test("prover/hard turnTimeoutMs raised to 900s; the verifier -- which configured none -- still runs at the 120s default", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const seen: Record<string, { session?: number; turns: number[] }> = {};
    const workers: WorkersConfig = {
      assignments: {
        prover: { hard: { backend: "claude", fallbacks: [], turnTimeoutMs: 900_000, sessionTimeoutMs: 300_000 } },
        verifier: { hard: { backend: "codex", fallbacks: [] } },
      },
    };
    const { out } = capture();
    await verifyCommand(["--af", "lem-a", "--root", root, "--live", "--max-turns", "5", "--max-campaign-tokens", "1000000"], out, {
      afCommand: ABSENT,
      frCommand: ABSENT,
      readWorkspace: proverAndVerifierReadyWorkspace(),
      loadWorkersConfig: async () => workers,
      backends: [fakeTimeoutBackend("claude", seen, "claude"), fakeTimeoutBackend("codex", seen, "gpt")],
      preflightAf: () => ({ ok: true }),
    });
    expect(seen.claude!.turns.length).toBeGreaterThan(0);
    expect(seen.claude!.turns.every((t) => t === 900_000)).toBe(true);
    expect(seen.claude!.session).toBe(300_000);
    // the verifier role is untouched by the prover's override -- the whole point of per-ASSIGNMENT.
    expect(seen.codex!.turns.length).toBeGreaterThan(0);
    expect(seen.codex!.turns.every((t) => t === DEFAULT_TURN_TIMEOUT_MS)).toBe(true);
    expect(seen.codex!.session).toBe(DEFAULT_SESSION_TIMEOUT_MS);
  });

  test("a workers-LEVEL turnTimeoutMs is the campaign-wide default both roles inherit, and a per-assignment value still outranks it", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const seen: Record<string, { session?: number; turns: number[] }> = {};
    const workers: WorkersConfig = {
      turnTimeoutMs: 240_000,
      assignments: {
        prover: { hard: { backend: "claude", fallbacks: [], turnTimeoutMs: 900_000 } },
        verifier: { hard: { backend: "codex", fallbacks: [] } },
      },
    };
    const { out } = capture();
    await verifyCommand(["--af", "lem-a", "--root", root, "--live", "--max-turns", "5", "--max-campaign-tokens", "1000000"], out, {
      afCommand: ABSENT,
      frCommand: ABSENT,
      readWorkspace: proverAndVerifierReadyWorkspace(),
      loadWorkersConfig: async () => workers,
      backends: [fakeTimeoutBackend("claude", seen, "claude"), fakeTimeoutBackend("codex", seen, "gpt")],
      preflightAf: () => ({ ok: true }),
    });
    expect(seen.claude!.turns.every((t) => t === 900_000)).toBe(true);
    expect(seen.codex!.turns.every((t) => t === 240_000)).toBe(true);
  });

  test("no timeouts configured anywhere: every call still runs at the DEFAULT_* constants (unchanged behavior)", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const seen: Record<string, { session?: number; turns: number[] }> = {};
    const workers: WorkersConfig = {
      assignments: {
        prover: { hard: { backend: "claude", fallbacks: [] } },
        verifier: { hard: { backend: "codex", fallbacks: [] } },
      },
    };
    const { out } = capture();
    await verifyCommand(["--af", "lem-a", "--root", root, "--live", "--max-turns", "5", "--max-campaign-tokens", "1000000"], out, {
      afCommand: ABSENT,
      frCommand: ABSENT,
      readWorkspace: proverAndVerifierReadyWorkspace(),
      loadWorkersConfig: async () => workers,
      backends: [fakeTimeoutBackend("claude", seen, "claude"), fakeTimeoutBackend("codex", seen, "gpt")],
      preflightAf: () => ({ ok: true }),
    });
    for (const name of ["claude", "codex"]) {
      expect(seen[name]!.session).toBe(DEFAULT_SESSION_TIMEOUT_MS);
      expect(seen[name]!.turns.every((t) => t === DEFAULT_TURN_TIMEOUT_MS)).toBe(true);
    }
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

  // rk-9zd (BUG, Tier A — cross-vendor input): a backend whose registry-declared `modelFamily` is
  // absent or outside vocab.ts's closed MODEL_FAMILIES set must abort the run at PREFLIGHT, before
  // any spend. The OLD `familyForBackend` ternary silently filed it as family "claude", which is
  // fail-OPEN in an input to PRD C9's cross-vendor gate.
  test("--live with a backend declaring NO model family: refuses at preflight, exit 1, no worker EVER called", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const called: string[] = [];
    // Deliberately hand-rolled WITHOUT `modelFamily` — the exact shape a third backend author would
    // produce by following the two existing adapters' constructor shape but forgetting the field.
    const familylessBackend = {
      name: "fake", capabilities: { sessionResume: true },
      async createSession() { called.push("createSession"); return { sessionId: "s1" }; },
      async runTurn() { called.push("runTurn"); return { exit: 0, usage: { input: 0, output: 0, cache_read: 0, cache_creation: 0 }, rawText: "{}" }; },
    } as unknown as WorkerBackend;
    const { out, lines } = capture();
    const code = await verifyCommand(["--af", "lem-a", "--root", root, "--live", "--max-campaign-tokens", "1000000"], out, {
      afCommand: ABSENT, frCommand: ABSENT, readWorkspace: twoReadyNodesWorkspace(),
      loadWorkersConfig: async () => FAKE_WORKERS_CONFIG, backends: [familylessBackend],
      preflightAf: () => ({ ok: true }),
    });
    expect(code).toBe(1);
    const text = lines.join("\n");
    expect(text).toContain("model family");
    expect(text).toContain("refuses to guess");
    // the specific fail-OPEN that must never happen again: silently filed as the claude family
    expect(text).not.toContain("family 'claude'");
    expect(called).toEqual([]); // fail closed: no session ever created, no turn ever run
  });

  test("--live with a backend declaring a family OUTSIDE the closed set: same refusal, exit 1, no worker called", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const called: string[] = [];
    const bogusFamilyBackend = {
      name: "fake", modelFamily: "openai", capabilities: { sessionResume: true },
      async createSession() { called.push("createSession"); return { sessionId: "s1" }; },
      async runTurn() { called.push("runTurn"); return { exit: 0, usage: { input: 0, output: 0, cache_read: 0, cache_creation: 0 }, rawText: "{}" }; },
    } as unknown as WorkerBackend;
    const { out, lines } = capture();
    const code = await verifyCommand(["--af", "lem-a", "--root", root, "--live", "--max-campaign-tokens", "1000000"], out, {
      afCommand: ABSENT, frCommand: ABSENT, readWorkspace: twoReadyNodesWorkspace(),
      loadWorkersConfig: async () => FAKE_WORKERS_CONFIG, backends: [bogusFamilyBackend],
      preflightAf: () => ({ ok: true }),
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("openai");
    expect(called).toEqual([]);
  });

  // rk-9zd: the CLI reads the family off the resolved backend INSTANCE, never off its name. A
  // backend NAMED "codex" that declares family "claude" is family "claude" — under the old ternary
  // it would have read "gpt" purely from its name, i.e. the identity seam recorded into af (and
  // therefore the cross-vendor comparison) could disagree with the registry's own declaration.
  test("--live: the family printed/recorded comes from the backend's declaration, NOT its name", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const seenModels: Record<string, string> = {};
    const workers: WorkersConfig = {
      assignments: {
        prover: { hard: { backend: "codex", fallbacks: [] } },
        verifier: { hard: { backend: "codex", fallbacks: [] } },
      },
    };
    const { out, lines } = capture();
    await verifyCommand(["--af", "lem-a", "--root", root, "--live", "--max-turns", "1", "--max-campaign-tokens", "1000000"], out, {
      afCommand: ABSENT, frCommand: ABSENT, readWorkspace: twoReadyNodesWorkspace(),
      loadWorkersConfig: async () => workers,
      backends: [fakeNamedBackend("codex", seenModels, "claude")],
      preflightAf: () => ({ ok: true }),
    });
    const text = lines.join("\n");
    expect(text).toContain("backend resolved: verifier/hard -> 'codex'");
    expect(text).toContain("family 'claude'");
    expect(text).not.toContain("family 'gpt'");
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

// -------------------------------------------------------------------------------------------------
// rk-bun / rk-id1: REAL critical-path membership drives the apply-time cross-vendor rule, replacing
// `isLoadBearing: () => true`. Ground truth: PRD §4 C2 (the critical-path provenance check runs
// "continuously ... because path membership changes when edges are added") and C9 ("promotion to
// `proved` requires verifier model family != prover model family for load-bearing claims";
// "Non-critical-path: same-family allowed, recorded").
//
// The OBSERVABLE for the gate's outcome is the M3.9 report line the live run always prints:
// `discards: cross-vendor-rejected=N`. `af` itself is never reached in these tests (afCommand is a
// guaranteed-absent binary), so the gate's decision is the only thing being measured.

/** Two verifier-ready leaves, each carrying a PROVER author seam of the CLAUDE family, so the
 * apply-time check compares two DECODABLE identities against a claude-family verifier — i.e. PRD
 * C9's `same-family` branch, not `identity-unparseable`. `crux` marks node 1.1 the way af's export
 * marks a critical-path node inside a proof tree. */
function sameFamilyAuthoredWorkspace(cruxFirst = false): (a: string, id: string) => AfParseResult<AfWorkspaceView> {
  const author = "claude|some-prover-cli|some-model|prover-session";
  return (_a, id) => ({
    ok: true,
    value: {
      workspaceId: id, rootStatement: "P", nodeCount: 2,
      nodes: [
        { id: "1.1", epistemicState: "pending", workflowState: "available", crux: cruxFirst, contentHash: "a".repeat(64), verifierReady: true, author, deps: ["1.2"] },
        { id: "1.2", epistemicState: "pending", workflowState: "available", crux: false, contentHash: "a".repeat(64), verifierReady: true, author, deps: ["1.1"] },
      ],
    },
  });
}

const CLAUDE_ONLY_WORKERS: WorkersConfig = { assignments: { verifier: { hard: { backend: "claude-fake", fallbacks: [] } }, prover: { hard: { backend: "claude-fake", fallbacks: [] } } } };

function acceptingBackend(name: string, modelFamily: WorkerBackend["modelFamily"]): WorkerBackend {
  return {
    name, modelFamily, capabilities: { sessionResume: true },
    async createSession(_spec: SessionSpec) { return { sessionId: `session-${name}` }; },
    async runTurn(_sessionId: string, _item: TurnItem) {
      return { exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify({ verdict: { outcome: "accept" }, justification: "ok" }) };
    },
  };
}

/** Runs the two-node claim `lem-a` live against a single-vendor (claude-only) roster. `northStar` is
 * what `.rk/config.json` would carry; `onPath` decides whether the north-star shard depends on
 * `lem-a` (putting it on the critical path) or not (leaving it genuinely off). */
async function runMembership(opts: { dirs: string[]; northStar?: string; onPath: boolean; cruxFirst?: boolean; flag?: string; verifierFamily?: WorkerBackend["modelFamily"] }) {
  const root = tmpRoot(); opts.dirs.push(root);
  writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
  writeShard(root, "star", opts.onPath ? { deps: "lem-a" } : {});
  // A real (empty) workspace dir plus a deterministic af STUB: an accept that CLEARS the
  // cross-vendor gate goes on to the af apply, so the run needs an `af verdicts apply` that answers
  // without recording anything (exit 6, "none applied"). Every other af subcommand exits 1, which is
  // the same "af unavailable" degradation the ABSENT-binary tests above rely on — so the projection
  // is built with no af edges, exactly as elsewhere in this file. These tests measure the GATE's
  // decision (the `cross-vendor-rejected` discard count), never af's.
  mkdirSync(join(root, "proofs", "lem-a"), { recursive: true });
  const afStub = join(root, "fake-af");
  writeFileSync(afStub, '#!/usr/bin/env bash\nif [ "$1" = "verdicts" ]; then echo \'{"items":[]}\'; exit 6; fi\nexit 1\n');
  chmodSync(afStub, 0o755);
  const { out, lines } = capture();
  const backends = opts.verifierFamily === undefined
    ? [acceptingBackend("claude-fake", "claude")]
    : [acceptingBackend("claude-fake", "claude"), acceptingBackend("gpt-fake", opts.verifierFamily)];
  const workers: WorkersConfig = opts.verifierFamily === undefined
    ? CLAUDE_ONLY_WORKERS
    : { assignments: { verifier: { hard: { backend: "gpt-fake", fallbacks: [] } }, prover: { hard: { backend: "claude-fake", fallbacks: [] } } } };
  const args = ["--af", "lem-a", "--root", root, "--live", "--max-turns", "2", "--max-campaign-tokens", "1000000"];
  if (opts.flag !== undefined) args.push("--north-star", opts.flag);
  const code = await verifyCommand(args, out, {
    afCommand: [afStub], frCommand: ABSENT,
    readWorkspace: sameFamilyAuthoredWorkspace(opts.cruxFirst ?? false),
    loadWorkersConfig: async () => workers,
    loadNorthStarId: async () => opts.northStar,
    backends,
    preflightAf: () => ({ ok: true }),
  });
  return { code, text: lines.join("\n") };
}

describe("rk verify --af --live: rk-bun — real critical-path membership feeds the cross-vendor rule", () => {
  const dirs: string[] = [];
  afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  test("claim ON the critical path, single-vendor roster: every accept is REFUSED same-family, and the preflight said so first", async () => {
    const { text } = await runMembership({ dirs, northStar: "star", onPath: true });
    expect(text).toContain("critical-path membership: LOAD-BEARING");
    expect(text).toContain("SINGLE-VENDOR ROSTER");
    expect(text).toContain("NO node in this claim can be promoted to proved");
    expect(text).toContain("discards: cross-vendor-rejected=2");
  });

  // THE behavior change rk-bun buys: PRD C9's "Non-critical-path: same-family allowed, recorded"
  // branch becomes reachable at all. Under the old hard-coded `() => true` this was 2 rejections.
  test("claim genuinely OFF the critical path: same-family accepts are NO LONGER refused", async () => {
    const { text } = await runMembership({ dirs, northStar: "star", onPath: false });
    expect(text).toContain("critical-path membership: off the critical path");
    expect(text).toContain("discards: cross-vendor-rejected=0");
  });

  test("NO north star configured (today's common case): INDETERMINATE, fails closed, and says which unknown", async () => {
    const { text } = await runMembership({ dirs, northStar: undefined, onPath: false });
    expect(text).toContain("critical-path membership: INDETERMINATE (north-star-unconfigured)");
    expect(text).toContain("every node is treated as load-bearing");
    expect(text).toContain('set "northStarId" in .rk/config.json or pass --north-star');
    expect(text).toContain("discards: cross-vendor-rejected=2"); // fails closed, exactly as before rk-bun
  });

  test("a north star naming NO registry node: INDETERMINATE with a DISTINCT reason, still fails closed", async () => {
    const { text } = await runMembership({ dirs, northStar: "typo-star", onPath: false });
    expect(text).toContain("critical-path membership: INDETERMINATE (north-star-unresolved)");
    expect(text).toContain("typo-star");
    expect(text).not.toContain("north-star-unconfigured");
    expect(text).toContain("discards: cross-vendor-rejected=2");
  });

  // The strictly-stricter af backstop: off the REGISTRY path, but af marked the node critical-path.
  test("off the registry path but af-CRUX: the crux node is still treated as load-bearing and refused", async () => {
    const { text } = await runMembership({ dirs, northStar: "star", onPath: false, cruxFirst: true });
    expect(text).toContain("critical-path membership: off the critical path");
    expect(text).toContain("Any af-crux node inside this claim is still treated as load-bearing");
    expect(text).toContain("discards: cross-vendor-rejected=1"); // node 1.1 (crux) refused; 1.2 allowed
  });

  test("--north-star OVERRIDES .rk/config.json's northStarId (same precedence as rk graph --critical-path)", async () => {
    // config says the resolvable 'star' (claim off its path); the flag names a typo → indeterminate.
    const { text } = await runMembership({ dirs, northStar: "star", onPath: false, flag: "typo-star" });
    expect(text).toContain("critical-path membership: INDETERMINATE (north-star-unresolved)");
    expect(text).toContain("discards: cross-vendor-rejected=2");
  });

  test("a genuine CROSS-vendor roster on a load-bearing claim: nothing is refused, and the preflight says the rule is satisfiable", async () => {
    const { text } = await runMembership({ dirs, northStar: "star", onPath: true, verifierFamily: "gpt" });
    expect(text).toContain("critical-path membership: LOAD-BEARING");
    expect(text).toContain("prover family 'claude' != verifier family 'gpt'");
    expect(text).not.toContain("SINGLE-VENDOR ROSTER");
    expect(text).toContain("discards: cross-vendor-rejected=0");
  });
});
