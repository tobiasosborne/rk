// EDGE — fs + subprocess (af export, via src/store/build-graph.ts and src/drive/driver-af.ts). The
// `rk verify --af <id>` command: the M3.6 hard-tier driver's terminal front end. Two modes:
//
//   --dry-run (the cost-free, always-available path, and the DEFAULT whenever `--live` is absent):
//     query af READ-ONLY, project the ready set / dispatch plan / balloon tripwire status, and print
//     them — NEVER dispatching a worker or writing a byte. This is the testable-without-cost path.
//
//   --live (M3.5-prep, src/cli/verify-live.ts): drives the workspace to convergence with REAL
//     backend calls (src/drive/driver-live.ts's glue over the M3.2 claude/codex adapters). A real
//     spend must always be an EXPLICIT flag, never a default (task requirement) — omitting both
//     `--dry-run` and `--live` still means dry-run, exactly as before this WP. `--max-turns`/
//     `--max-nodes` are the safety valves (defaults src/cli/verify-live.ts names); `--model`
//     overrides the interim per-backend default model (see that file's scope note 3).
//
// `<id>` names a REGISTRY node (its `workspace:` field locates the af proof dir, its `balloons`
// counter carries prior-balloon state, its `contract` is the claim). Read-only projection first, so
// a structurally incomplete graph refuses to report (M2 boundary discipline), same as `rk graph`.
//
// `rk verify --report [--baseline <memo.json>]` (M3.9): the accounting REPORT, independent of --af
// — src/cli/verify-report.ts owns the printing logic (split out this WP so verify-live.ts can print
// the SAME report at the end of a live run without a circular import back into this file).

import { buildGraphDocument } from "../store/build-graph";
import { structuralLossLines } from "../render/diagnostics-view";
import type { GraphDocument, RegistryNode } from "../graph/types";
import { readAfWorkspace, type AfParseResult, type AfWorkspaceView } from "../drive/driver-af";
import { DEFAULT_BALLOON_NODE_CAP, detectBalloon } from "../drive/driver-balloon";
import { planDispatch, planSummaryLines, selectReadyNodes } from "../drive/driver-plan";
import { reportCommand, driverLogPath } from "./verify-report";
import { runLiveVerify, DEFAULT_MAX_NODES, DEFAULT_MAX_TURNS } from "./verify-live";
import type { Out } from "./args";
import { extractFlag, extractRoot } from "./args";
import { join } from "node:path";

export { reportCommand, driverLogPath };

export interface VerifyCommandDeps {
  afCommand?: readonly string[];
  frCommand?: readonly string[];
  /** Injectable af workspace reader (defaults to the real `af export` spawn) — the same
   * injectable-edge pattern src/cli/graph.ts uses for its af/fr binaries, so a dry-run is testable
   * without a real af install. */
  readWorkspace?: (absWorkspace: string, workspaceId: string) => AfParseResult<AfWorkspaceView>;
  /** M3.5-prep (src/cli/verify-live.ts's `--live` path): injectable `.rk/config.json` workers
   * reader, defaulting to the real `loadGateConfig` fs read — same injectable-edge pattern as
   * `readWorkspace` above, so a live-dispatch test never needs a real config file on disk. */
  loadWorkersConfig?: (root: string) => Promise<import("../drive/backend-registry").WorkersConfig | undefined>;
  /** M3.5-prep: injectable `WorkerBackend` set for the `--live` path's registry, defaulting to the
   * real `[ClaudeBackend, CodexBackend]` pair — same injectable-edge discipline as every other
   * field here, so a live-dispatch test drives a FAKE backend end-to-end and never a real
   * subprocess/LLM call (CLAUDE.md L1/L2's red-corpus-first, applied to this seam). */
  backends?: import("../drive/backend-types").WorkerBackend[];
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
  out.log("  next: configure workers in .rk/config and run 'rk verify --af <id> --live' to dispatch — see docs/worker-contract.md.");
  return 0;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function verifyCommand(args: string[], out: Out, deps: VerifyCommandDeps = {}): Promise<number> {
  const { rest, root } = extractRoot(args);
  const { rest: r0, value: baselinePath } = extractFlag(rest, "--baseline");
  const { rest: r1, value: afId } = extractFlag(r0, "--af");
  const { rest: r2 } = extractFlag(r1, "--north-star");
  const { rest: r3, value: maxTurnsRaw } = extractFlag(r2, "--max-turns");
  const { rest: r4, value: maxNodesRaw } = extractFlag(r3, "--max-nodes");
  const { rest: r5, value: model } = extractFlag(r4, "--model");
  // rk-s9t: the campaign-level token cap -- REQUIRED for a --live run (validated in verify-live.ts,
  // which refuses to start without it). Parsed here, validated at the edge so the refusal message
  // can be loud and self-teaching.
  const { rest: r6, value: maxCampaignTokensRaw } = extractFlag(r5, "--max-campaign-tokens");
  // A real spend must always be an EXPLICIT flag: `--live` opts in; `--dry-run` (or the absence of
  // BOTH flags) always means dry-run, even if `--live` is also present -- explicit safety wins.
  const live = r6.includes("--live");
  const dryRun = r6.includes("--dry-run") || !live;

  if (r6.includes("--report")) return reportCommand(root, out, baselinePath);

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

  return runLiveVerify(root, node, out, deps, {
    maxTurns: parsePositiveInt(maxTurnsRaw, DEFAULT_MAX_TURNS),
    maxNodes: parsePositiveInt(maxNodesRaw, DEFAULT_MAX_NODES),
    maxCampaignTokensRaw,
    model,
  });
}
