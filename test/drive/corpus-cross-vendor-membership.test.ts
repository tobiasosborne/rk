// Harness for corpus/drive/cross-vendor-offpath-single-vendor/ (beads rk-bun + rk-id1). Same shape
// as test/graph/corpus-*.test.ts: a static fixture repo under corpus/, copied to a temp dir per run
// (a live run writes `.rk/driver-log.jsonl` and a scratch verdict file, so the fixture itself must
// never be the working tree), driven through the REAL `rk verify --af <id> --live` entry point.
//
// What is injected, and why that is the minimum: the af node VIEW (`readWorkspace`) and the af
// capability preflight, because there is no real af binary in the test environment; and the
// `WorkerBackend` instances, because no test in this repo may spawn a real model call. Everything
// else — `.rk/config.json`'s `northStarId` AND its worker roster, the projection, the north-star
// resolution, the critical-path query, the cross-vendor gate, the driver log, the report — is the
// production path. In particular `loadNorthStarId` is NOT injected here: the fixture proves the real
// `loadGateConfig` read is what feeds `resolveLoadBearing`.

import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyCommand } from "../../src/cli/verify";
import type { AfParseResult, AfWorkspaceView } from "../../src/drive/driver-af";
import type { SessionSpec, TurnItem, WorkerBackend } from "../../src/drive/backend-types";

const FIXTURE = join(import.meta.dir, "..", "..", "corpus", "drive", "cross-vendor-offpath-single-vendor");

/** The prover-of-record seam recorded on both af nodes: family `claude`, so a claude-family verifier
 * lands on PRD C9's `same-family` branch — a DECODED comparison, never `identity-unparseable`. */
const CLAUDE_PROVER_SEAM = "claude|corpus-prover-cli|corpus-model|corpus-prover-session";

function workspaceView(): (a: string, id: string) => AfParseResult<AfWorkspaceView> {
  return (_a, id) => ({
    ok: true,
    value: {
      workspaceId: id, rootStatement: "lem-a holds.", nodeCount: 2,
      nodes: [
        { id: "1.1", epistemicState: "pending", workflowState: "available", crux: false, contentHash: "b".repeat(64), verifierReady: true, author: CLAUDE_PROVER_SEAM, deps: ["1.2"] },
        { id: "1.2", epistemicState: "pending", workflowState: "available", crux: false, contentHash: "b".repeat(64), verifierReady: true, author: CLAUDE_PROVER_SEAM, deps: ["1.1"] },
      ],
    },
  });
}

/** The single-vendor roster the fixture's `.rk/config.json` names by backend name. Always accepts,
 * so every turn produces an accept for the cross-vendor gate to rule on. */
function corpusBackend(): WorkerBackend {
  return {
    name: "corpus-fake", modelFamily: "claude", capabilities: { sessionResume: true },
    async createSession(_spec: SessionSpec) { return { sessionId: "corpus-session" }; },
    async runTurn(_sessionId: string, _item: TurnItem) {
      return { exit: 0, usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 }, rawText: JSON.stringify({ verdict: { outcome: "accept" }, justification: "ok" }) };
    },
  };
}

describe("corpus/drive/cross-vendor-offpath-single-vendor — real critical-path membership drives the apply-time cross-vendor rule", () => {
  const dirs: string[] = [];
  afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  async function run(extraArgs: string[] = []) {
    const root = mkdtempSync(join(tmpdir(), "rk-corpus-crossvendor-"));
    dirs.push(root);
    cpSync(join(FIXTURE, "repo"), root, { recursive: true });
    const lines: string[] = [];
    const code = await verifyCommand(
      ["--af", "lem-a", "--root", root, "--live", "--max-turns", "2", "--max-campaign-tokens", "1000000", ...extraArgs],
      { log: (s: string) => lines.push(s) },
      {
        afCommand: [join(FIXTURE, "fake-af")],
        frCommand: ["definitely-not-a-real-binary-xyz"],
        readWorkspace: workspaceView(),
        backends: [corpusBackend()],
        preflightAf: () => ({ ok: true }),
      },
    );
    return { code, text: lines.join("\n") };
  }

  test("DETERMINED off-path: the north star from .rk/config.json resolves, lem-a is on no path to it, and same-family accepts are permitted (PRD C9's non-critical-path branch)", async () => {
    const { text } = await run();
    expect(text).toContain("critical-path membership: off the critical path");
    expect(text).toContain("'lem-a' is on no dep/route path from north star 'star'");
    // rk-id1: the single-vendor roster is named, with the off-path caveat and the af-crux carve-out.
    expect(text).toContain("single-vendor roster");
    expect(text).toContain("Any af-crux node inside this claim is still treated as load-bearing");
    // THE assertion: the gate refused nothing. Under the hard-coded `isLoadBearing: () => true` this
    // read `cross-vendor-rejected=2`.
    expect(text).toContain("discards: cross-vendor-rejected=0");
  });

  test("INDETERMINATE: a --north-star naming no registry node fails CLOSED — every accept refused, and the preflight says the answer is unknown", async () => {
    const { text } = await run(["--north-star", "nope"]);
    expect(text).toContain("critical-path membership: INDETERMINATE (north-star-unresolved)");
    expect(text).toContain("every node is treated as load-bearing");
    // rk-id1: with membership unknown, the single-vendor consequence is the STRICT one.
    expect(text).toContain("SINGLE-VENDOR ROSTER");
    expect(text).toContain("NO node in this claim can be promoted to proved");
    expect(text).toContain("discards: cross-vendor-rejected=2");
    // an unknown is never dressed up as the determined off-path answer
    expect(text).not.toContain("off the critical path");
  });
});
