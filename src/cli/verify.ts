// EDGE — fs + subprocess (af export, via src/store/build-graph.ts and src/drive/driver-af.ts). The
// `rk verify --af <id>` command: the M3.6 hard-tier driver's terminal front end. Two modes:
//
//   --dry-run (the cost-free, always-available path, and the default for the synthetic acceptance):
//     query af READ-ONLY, project the ready set / dispatch plan / balloon tripwire status, and print
//     them — NEVER dispatching a worker or writing a byte. This is the testable-without-cost path.
//
//   live run (no --dry-run): drives the workspace to convergence via src/drive/driver-run.ts. Pass 1
//     wires the loop, guardrails, verdict pipeline, af apply seam, and the full balloon feedback loop
//     — all unit-tested with injected workers — but the LIVE async worker-dispatch adapter (real
//     `claude -p`/`codex exec` turns with prompt assembly + token accounting) is deferred to M3.5's
//     instrumented baseline session (see the WP report). Without it, the live path reports honestly
//     and points at --dry-run rather than pretending to dispatch.
//
// `<id>` names a REGISTRY node (its `workspace:` field locates the af proof dir, its `balloons`
// counter carries prior-balloon state, its `contract` is the claim). Read-only projection first, so
// a structurally incomplete graph refuses to report (M2 boundary discipline), same as `rk graph`.

import { buildGraphDocument } from "../store/build-graph";
import { structuralLossLines } from "../render/diagnostics-view";
import type { GraphDocument, RegistryNode } from "../graph/types";
import { readAfWorkspace, type AfParseResult, type AfWorkspaceView } from "../drive/driver-af";
import { DEFAULT_BALLOON_NODE_CAP, detectBalloon } from "../drive/driver-balloon";
import { planDispatch, planSummaryLines, selectReadyNodes } from "../drive/driver-plan";
import type { Out } from "./args";
import { extractFlag, extractRoot } from "./args";
import { join } from "node:path";

export interface VerifyCommandDeps {
  afCommand?: readonly string[];
  frCommand?: readonly string[];
  /** Injectable af workspace reader (defaults to the real `af export` spawn) — the same
   * injectable-edge pattern src/cli/graph.ts uses for its af/fr binaries, so a dry-run is testable
   * without a real af install. */
  readWorkspace?: (absWorkspace: string, workspaceId: string) => AfParseResult<AfWorkspaceView>;
}

function findNode(doc: GraphDocument, id: string): RegistryNode | undefined {
  return doc.nodes.find((n) => n.id === id);
}

function reportDryRun(root: string, node: RegistryNode, out: Out, deps: VerifyCommandDeps): number {
  if (!node.workspace) {
    out.log(`rk verify --af: node '${node.id}' declares no 'workspace:' — nothing to verify (af=${node.af}).`);
    out.log("  next: add a 'workspace:' field to the shard, or seed an af workspace for this contract.");
    return 1;
  }
  const abs = join(root, ...node.workspace.split("/"));
  const read = deps.readWorkspace ?? ((a, id) => readAfWorkspace(a, id, deps.afCommand));
  const ws = read(abs, node.workspace);
  if (!ws.ok) {
    out.log(`rk verify --af: could not read af workspace '${node.workspace}': ${ws.reason}`);
    out.log("  next: check the af binary is on $PATH and the workspace exists, then re-run.");
    return 1;
  }
  const view = ws.value;
  const cruxIds = view.nodes.filter((n) => n.crux).map((n) => n.id).sort();
  const readyIds = selectReadyNodes(view.nodes);
  const plan = planDispatch({ readyNodeIds: readyIds, cruxIds });
  const balloon = detectBalloon(view.nodeCount, DEFAULT_BALLOON_NODE_CAP);

  out.log(`rk verify --af ${node.id} (DRY RUN — no workers dispatched, nothing written)`);
  out.log(`  workspace: ${node.workspace} (${view.nodeCount} node(s))`);
  out.log(`  contract: ${node.contract}`);
  out.log(`  prior balloons on this contract: ${node.balloons.count}${node.balloons.classifications.length > 0 ? ` (${node.balloons.classifications.join(", ")})` : ""}`);
  out.log(
    balloon.ballooned
      ? `  BALLOON TRIPWIRE: ${view.nodeCount} > cap ${balloon.cap} — a live run would classify the offending subtree and route (bd task / mandatory review), then ABORT.`
      : `  balloon tripwire: ${view.nodeCount} <= cap ${balloon.cap} — clear.`,
  );
  out.log(`  verification-ready now (${readyIds.length}): ${readyIds.length === 0 ? "none" : readyIds.join(", ")}`);
  out.log(`  crux (per-node cross-vendor, never batched): ${cruxIds.length === 0 ? "none" : cruxIds.join(", ")}`);
  for (const line of planSummaryLines(plan, cruxIds)) out.log(`  ${line}`);
  out.log("  token usage: 0 (dry run dispatched no worker).");
  out.log("  next: configure workers in .rk/config and run 'rk verify --af <id>' (live) to dispatch — see docs/worker-contract.md.");
  return 0;
}

export async function verifyCommand(args: string[], out: Out, deps: VerifyCommandDeps = {}): Promise<number> {
  const { rest, root } = extractRoot(args);
  const { rest: r1, value: afId } = extractFlag(rest, "--af");
  const { rest: r2 } = extractFlag(r1, "--north-star");
  const dryRun = r2.includes("--dry-run");

  if (!afId) {
    out.log("rk verify: no target selected -- pass --af <registry-id> (hard tier).");
    out.log("  next: 'rk verify --af <id> --dry-run' to plan a workspace's verification without cost.");
    return 2;
  }

  const { doc, diagnostics } = buildGraphDocument(root, { afCommand: deps.afCommand, frCommand: deps.frCommand });
  if (!diagnostics.isStructurallyComplete) {
    out.log("rk verify: refusing to report -- the projection is structurally incomplete:");
    for (const line of structuralLossLines(diagnostics.structuralLoss)) out.log(`  ${line}`);
    out.log("  next: fix the structural issue(s) above and re-run 'rk verify'.");
    return 1;
  }

  const node = findNode(doc, afId);
  if (!node) {
    out.log(`rk verify --af: no node '${afId}' in the projected graph.`);
    out.log("  next: 'rk verify --af <id>' with a real registry id (see argument/**/*.md).");
    return 1;
  }

  if (dryRun) return reportDryRun(root, node, out, deps);

  // Live run: pass-1 gate (see the file header). The driver loop is complete and tested with
  // injected workers; the LIVE async worker adapter is M3.5's instrumented-session deliverable.
  out.log(`rk verify --af ${node.id}: live dispatch is not wired in this build.`);
  out.log("  The driver loop, guardrails, verdict pipeline, af apply seam, and balloon feedback loop");
  out.log("  are complete and unit-tested with injected workers (see test/drive/driver-*.test.ts).");
  out.log("  The live worker-dispatch adapter (real claude/codex turns + token accounting) lands with");
  out.log("  M3.5's instrumented baseline session.");
  out.log("  next: 'rk verify --af <id> --dry-run' to plan the workspace's verification without cost.");
  return 3;
}
