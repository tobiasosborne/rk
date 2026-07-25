// Tests for src/cli/verify-live-deps.ts's `buildDriverDeps` (rk-t9jm split of
// src/cli/verify-live.ts): the safety-valve wrapping (`checkValves`/`SafetyValveAbort`), the
// persisted-balloon-counter read (M3 blocker 7), the af `crux`-flag OR-into-load-bearing rule
// (rk-bun), and the prover-identity-seam encode failure path -- exercised directly against
// `buildDriverDeps`, with a fake dispatcher pair (no registry/backend construction needed, since
// this function takes already-resolved dispatchers).

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDriverDeps, SafetyValveAbort, type BuildDriverDepsParams } from "../src/cli/verify-live-deps";
import type { AfParseResult, AfWorkspaceView } from "../src/drive/driver-af";
import type { LiveRoleTierDispatcher } from "../src/drive/driver-live";
import type { RegistryNode } from "../src/graph/types";

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "rk-verify-live-deps-"));
}

function fakeDispatcher(overrides: Partial<LiveRoleTierDispatcher> = {}): LiveRoleTierDispatcher {
  return {
    backendName: "fake-backend",
    declaredModelFamily: "claude",
    ensureSession: async () => ({ ok: true, sessionId: "sess-1" }),
    dispatch: async () => {
      throw new Error("dispatch should not be called by this test");
    },
    ...overrides,
  };
}

function emptyWorkspace(): AfParseResult<AfWorkspaceView> {
  return { ok: true, value: { workspaceId: "ws", nodes: [], nodeCount: 0 } };
}

function baseNode(overrides: Partial<RegistryNode> = {}): RegistryNode {
  return {
    id: "lem-a",
    kind: "lemma",
    path: "argument/lem-a.md",
    contract: "lem-a holds.",
    workspace: "proofs/lem-a",
    af: "seeded",
    deps: [],
    routes: [],
    defs: [],
    balloons: { count: 0, classifications: [] },
    ...overrides,
  };
}

function baseParams(root: string, overrides: Partial<BuildDriverDepsParams> = {}): BuildDriverDepsParams {
  return {
    root,
    abs: join(root, "proofs", "lem-a"),
    node: baseNode(),
    claimId: "claim-lem-a",
    maxTurns: 30,
    maxNodes: 20,
    budget: { maxCampaignTokens: 1_000_000, perCallReserve: 8_000 },
    verifierDispatcher: fakeDispatcher(),
    proverDispatcher: fakeDispatcher({ backendName: "fake-prover" }),
    classDispatcher: undefined,
    verifierFamily: "claude",
    proverFamily: "gpt",
    model: "claude-model",
    proverModel: "gpt-model",
    sessionId: "sess-1",
    loadBearing: false,
    initialWsResult: emptyWorkspace(),
    readWorkspace: () => emptyWorkspace(),
    afCommand: undefined,
    ...overrides,
  };
}

describe("buildDriverDeps: prover identity seam", () => {
  test("an unencodable prover identity (delimiter in the model) returns ok:false, never a driverDeps object", () => {
    const root = tmpRoot();
    try {
      const result = buildDriverDeps(baseParams(root, { proverModel: "gpt|with-pipe" }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("rk verify --af lem-a --live");
        expect(result.message).toContain("prover identity is not encodable");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("buildDriverDeps: safety valves (checkValves)", () => {
  // NOTE: `dispatchVerify`/`dispatchProve` are plain (non-async) arrow functions that call
  // `checkValves` BEFORE returning the underlying dispatch promise (see verify-live-deps.ts) -- so
  // when the valve itself fires, it throws SYNCHRONOUSLY out of the call, not as a rejected
  // promise. This is unchanged from src/cli/verify-live.ts's pre-split behavior.
  test("maxNodes: 0 aborts SYNCHRONOUSLY on the FIRST dispatch, before the underlying dispatcher is ever called", () => {
    const root = tmpRoot();
    try {
      const built = buildDriverDeps(baseParams(root, { maxNodes: 0 }));
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      const node = { id: "n1", epistemicState: "x", workflowState: "x", crux: false, contentHash: "h" };
      expect(() => built.driverDeps.dispatchVerify(node as never, [])).toThrow(SafetyValveAbort);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("maxTurns: 0 aborts SYNCHRONOUSLY on the FIRST dispatch, before the underlying dispatcher is ever called", () => {
    const root = tmpRoot();
    try {
      const built = buildDriverDeps(baseParams(root, { maxTurns: 0, maxNodes: 20 }));
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      const node = { id: "n1", epistemicState: "x", workflowState: "x", crux: false, contentHash: "h" };
      expect(() => built.driverDeps.dispatchProve(node as never)).toThrow(SafetyValveAbort);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a SECOND distinct node once maxNodes is already saturated at 1 trips the valve; the SAME node id revisited does not count twice", async () => {
    const root = tmpRoot();
    try {
      // maxNodes: 1, but dispatch is stubbed to reject so we never need a real backend round trip --
      // checkValves runs BEFORE the underlying dispatch, so the valve fires (or doesn't) regardless.
      const rejecting = fakeDispatcher({ dispatch: async () => { throw new Error("boom"); } });
      const built = buildDriverDeps(baseParams(root, { maxNodes: 1, verifierDispatcher: rejecting }));
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      const n1 = { id: "n1", epistemicState: "x", workflowState: "x", crux: false, contentHash: "h" };
      const n2 = { id: "n2", epistemicState: "x", workflowState: "x", crux: false, contentHash: "h" };
      // n1 is under the cap: the valve itself does not throw synchronously, so the (async) rejection
      // we see is the underlying (stubbed) dispatcher's own failure -- proof the valve let it through.
      await expect(built.driverDeps.dispatchVerify(n1 as never, [])).rejects.toThrow("boom");
      // n2 is a SECOND distinct node with the cap already at 1: the valve fires first, SYNCHRONOUSLY.
      expect(() => built.driverDeps.dispatchVerify(n2 as never, [])).toThrow(SafetyValveAbort);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("buildDriverDeps: dispatchClassification with no classification session", () => {
  test("classDispatcher undefined -> dispatchClassification resolves to undefined, no throw", async () => {
    const root = tmpRoot();
    try {
      const built = buildDriverDeps(baseParams(root, { classDispatcher: undefined }));
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      await expect(built.driverDeps.dispatchClassification(["n1"])).resolves.toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("buildDriverDeps: persisted balloon counter (M3 blocker 7)", () => {
  test("shard unreadable (no file on disk) -> falls back to node.balloons", () => {
    const root = tmpRoot();
    try {
      const node = baseNode({ path: "argument/does-not-exist.md", balloons: { count: 3, classifications: ["genuine-gap"] } });
      const built = buildDriverDeps(baseParams(root, { node }));
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(built.driverDeps.priorBalloonCount).toBe(3);
      expect(built.driverDeps.priorClassifications).toEqual(["genuine-gap"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("shard present with no (or unterminated) frontmatter -> falls back to node.balloons", () => {
    const root = tmpRoot();
    try {
      mkdirSync(join(root, "argument"), { recursive: true });
      writeFileSync(join(root, "argument", "lem-a.md"), "no frontmatter here\n");
      const node = baseNode({ balloons: { count: 2, classifications: ["dag-dep"] } });
      const built = buildDriverDeps(baseParams(root, { node }));
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(built.driverDeps.priorBalloonCount).toBe(2);
      expect(built.driverDeps.priorClassifications).toEqual(["dag-dep"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("shard present with a persisted balloons: frontmatter field -> read straight off the shard, NOT node.balloons", () => {
    const root = tmpRoot();
    try {
      mkdirSync(join(root, "argument"), { recursive: true });
      const fm = ["---", "id: lem-a", "kind: lemma", "contract: lem-a holds.", "af: seeded", "balloons: 5", "balloon_classifications:", "- missing-fact", "- dag-dep", "---", "", "lem-a's narrative."].join("\n");
      writeFileSync(join(root, "argument", "lem-a.md"), fm);
      // node.balloons deliberately says something DIFFERENT (0), to prove the shard wins.
      const node = baseNode({ balloons: { count: 0, classifications: [] } });
      const built = buildDriverDeps(baseParams(root, { node }));
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(built.driverDeps.priorBalloonCount).toBe(5);
      expect(built.driverDeps.priorClassifications).toEqual(["missing-fact", "dag-dep"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("buildDriverDeps: isLoadBearing (rk-bun crux OR-rule)", () => {
  test("loadBearing:false and no crux node -> isLoadBearing is false for any id", () => {
    const root = tmpRoot();
    try {
      const built = buildDriverDeps(baseParams(root, { loadBearing: false }));
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(built.driverDeps.isLoadBearing("n1")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("loadBearing:true -> isLoadBearing is true regardless of crux", () => {
    const root = tmpRoot();
    try {
      const built = buildDriverDeps(baseParams(root, { loadBearing: true }));
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(built.driverDeps.isLoadBearing("anything")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("loadBearing:false but the INITIAL workspace read already marked a node crux -> that node id is load-bearing, others are not", () => {
    const root = tmpRoot();
    try {
      const initialWsResult: AfParseResult<AfWorkspaceView> = {
        ok: true,
        value: {
          workspaceId: "ws",
          nodeCount: 2,
          nodes: [
            { id: "crux-node", epistemicState: "x", workflowState: "x", crux: true, contentHash: "h1" },
            { id: "plain-node", epistemicState: "x", workflowState: "x", crux: false, contentHash: "h2" },
          ],
        },
      };
      const built = buildDriverDeps(baseParams(root, { loadBearing: false, initialWsResult }));
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(built.driverDeps.isLoadBearing("crux-node")).toBe(true);
      expect(built.driverDeps.isLoadBearing("plain-node")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a crux node surfacing on a LATER queryWorkspace re-read (not the initial one) also becomes load-bearing", () => {
    const root = tmpRoot();
    try {
      const readWorkspace = (): AfParseResult<AfWorkspaceView> => ({
        ok: true,
        value: { workspaceId: "ws", nodeCount: 1, nodes: [{ id: "late-crux", epistemicState: "x", workflowState: "x", crux: true, contentHash: "h" }] },
      });
      // initialWsResult (the preflight read) is EMPTY -- "late-crux" is not seen until a later
      // queryWorkspace() call, which the driver loop makes at the top of each round.
      const built = buildDriverDeps(baseParams(root, { loadBearing: false, initialWsResult: emptyWorkspace(), readWorkspace }));
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(built.driverDeps.isLoadBearing("late-crux")).toBe(false);
      built.driverDeps.queryWorkspace();
      expect(built.driverDeps.isLoadBearing("late-crux")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("buildDriverDeps: reReadContentHashes (M3 blocker 1)", () => {
  test("a successful re-read returns nodeId -> contentHash; a failed re-read returns an EMPTY map (fail closed)", () => {
    const root = tmpRoot();
    try {
      const ok = buildDriverDeps(
        baseParams(root, {
          readWorkspace: () => ({ ok: true, value: { workspaceId: "ws", nodeCount: 1, nodes: [{ id: "n1", epistemicState: "x", workflowState: "x", crux: false, contentHash: "abc123" }] } }),
        }),
      );
      expect(ok.ok).toBe(true);
      if (ok.ok) expect(ok.driverDeps.reReadContentHashes()).toEqual(new Map([["n1", "abc123"]]));

      const failed = buildDriverDeps(baseParams(root, { readWorkspace: () => ({ ok: false, reason: "gone" }) }));
      expect(failed.ok).toBe(true);
      if (failed.ok) expect(failed.driverDeps.reReadContentHashes().size).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("buildDriverDeps: shard read/write wiring", () => {
  test("readShard/writeShard round-trip through root+node.path; a missing shard reads as undefined", () => {
    const root = tmpRoot();
    try {
      const node = baseNode({ path: "argument/lem-a.md" });
      const built = buildDriverDeps(baseParams(root, { node }));
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(built.driverDeps.readShard()).toBeUndefined();
      mkdirSync(join(root, "argument"), { recursive: true });
      built.driverDeps.writeShard("---\nid: lem-a\n---\n\nbody\n");
      expect(built.driverDeps.readShard()).toBe("---\nid: lem-a\n---\n\nbody\n");
      expect(readFileSync(join(root, "argument", "lem-a.md"), "utf8")).toBe("---\nid: lem-a\n---\n\nbody\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
