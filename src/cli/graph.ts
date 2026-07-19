// EDGE — fs (via src/store/build-graph.ts's registry/af/fr/bd readers) + optional subprocess
// (af/fr binaries, injected through buildGraphDocument's afCommand/frCommand). `rk graph`: the
// M2.5 terminal views over a real repo's projected GraphDocument — --focus <id>, --critical-path,
// --blocks, --taint [id]. Pure query cores live in src/graph/query-*.ts; this file is the ONLY
// place that calls buildGraphDocument and formats terminal output — no view logic lives here.

import { requiredIds } from "../graph/query-shared";
import { computeCriticalPath } from "../graph/query-path";
import { computeWhatBlocks, type BlockerEntry } from "../graph/query-blocks";
import { computeFocusView } from "../graph/query-focus";
import { computeTaintTrace, taintedNodes, type TaintEntry } from "../graph/query-taint";
import type { GraphDocument } from "../graph/types";
import { sourceStatusLines, structuralLossLines } from "../render/diagnostics-view";
import { buildGraphDocument } from "../store/build-graph";
import { loadGateConfig } from "../store/config-load";
import type { Out } from "./args";
import { extractFlag, extractRoot } from "./args";

async function resolveNorthStar(root: string, explicit: string | undefined, out: Out): Promise<string | undefined> {
  if (explicit) return explicit;
  const config = await loadGateConfig(root);
  if (config.northStarId) return config.northStarId;
  out.log(
    "rk graph: no north star configured -- set \"northStarId\" in .rk/config.json or pass " +
      "--north-star <id>.",
  );
  return undefined;
}

function runFocus(doc: GraphDocument, id: string, out: Out): number {
  const view = computeFocusView(doc, id);
  if (!view.found) {
    out.log(`rk graph --focus: no node '${id}' in the projected graph.`);
    out.log("  next: 'rk graph --focus <id>' with a real registry id (see argument/**/*.md).");
    return 1;
  }
  const n = view.node!;
  out.log(`focus: ${id} (${n.kind}, status=${n.status ?? "unset"}, af=${n.af})`);
  out.log(`  contract: ${n.contract}`);
  out.log(`  available (monotone-trust): ${view.available}; own requirements met: ${view.requirementsMet}`);
  const depsLine = view.deps.length === 0
    ? "none"
    : view.deps.map((d) => `${d.id}${d.unresolved ? " [unresolved]" : d.available ? " [available]" : " [not available]"}`).join(", ");
  out.log(`  deps (${view.deps.length}): ${depsLine}`);
  if (view.routes.length === 0) {
    out.log("  routes: none (deps-only shard)");
  } else {
    view.routes.forEach((r, i) => {
      out.log(`  route ${i + 1}/${view.routes.length} (${r.satisfied ? "satisfied" : "not satisfied"}): ${r.members.map((m) => m.id).join(", ")}`);
    });
  }
  out.log(`  dependents (${view.dependents.length}): ${view.dependents.length === 0 ? "none" : view.dependents.join(", ")}`);
  const af = view.afEdge;
  const afLine = !af
    ? "none"
    : af.workspaceResolved
      ? `resolved (workspace=${af.workspace}, epistemic=${af.epistemicState}, taint=${af.taintState}, contractMatch=${af.contractMatch})`
      : `unresolved (workspace=${af.workspace})`;
  out.log(`  af edge: ${afLine}`);
  const bd = view.bdEdge;
  out.log(`  bd edge: ${bd ? `issueId=${bd.issueId ?? "none"}, status=${bd.status ?? "unset"}, resolved=${bd.resolved}` : "none"}`);
  out.log(`  fr edges: ${view.frEdges.length === 0 ? "none" : view.frEdges.map((e) => `cycle ${e.cycle} (${e.resolutionMethod})`).join(", ")}`);
  out.log(`  report edges: ${view.reportEdges.length === 0 ? "none" : view.reportEdges.map((e) => e.anchor).join(", ")}`);
  out.log(`  conflicts: ${view.conflicts.length === 0 ? "none" : view.conflicts.map((c) => c.kind).join(", ")}`);
  out.log("  next: 'rk graph --critical-path --north-star <id>' to see whether this node gates the north star.");
  return 0;
}

function runCriticalPath(doc: GraphDocument, northStarId: string, out: Out): number {
  const result = computeCriticalPath(doc, northStarId);
  if (!result.found) {
    out.log(`rk graph --critical-path: north star '${northStarId}' names no node in the projected graph.`);
    return 1;
  }
  out.log(
    `critical path to north star ${northStarId}: ${result.nodeIds.length} node(s) (over-inclusive -- ` +
      "every AND-dep and every OR-route member, transitively; see src/graph/query-path.ts's module doc).",
  );
  for (const id of result.nodeIds) out.log(`  ${id}`);
  out.log("  next: 'rk graph --blocks --north-star <id>' to see what on this path still gates it.");
  return 0;
}

function formatBlocker(e: BlockerEntry): string {
  return `${e.id} (status=${e.status ?? "unset"}, af=${e.af}) -- ${e.reasons.join("; ")}`;
}

function runBlocks(doc: GraphDocument, northStarId: string, out: Out): number {
  const result = computeWhatBlocks(doc, northStarId);
  if (!result.found) {
    out.log(`rk graph --blocks: north star '${northStarId}' names no node in the projected graph.`);
    return 1;
  }
  out.log(`what blocks north star ${northStarId}: ${result.satisfiedCount}/${result.pathSize} critical-path node(s) already available.`);
  out.log(`  frontier (actionable now, ${result.frontier.length}):`);
  if (result.frontier.length === 0) out.log("    none");
  else for (const e of result.frontier) out.log(`    ${formatBlocker(e)}`);
  out.log(`  blocked (not yet actionable, ${result.blocked.length}):`);
  if (result.blocked.length === 0) out.log("    none");
  else for (const e of result.blocked) out.log(`    ${formatBlocker(e)}`);
  out.log("  next: work the frontier entries -- their own prerequisites are already satisfied.");
  return 0;
}

function formatTaint(e: TaintEntry): string {
  return `${e.id}: ${e.taint}${e.isSource ? " (source)" : ""} -- ${e.reason}`;
}

function runTaint(doc: GraphDocument, id: string | undefined, out: Out): number {
  const trace = computeTaintTrace(doc);
  if (id) {
    const entry = trace.get(id);
    if (!entry) {
      out.log(`rk graph --taint: no node '${id}' in the projected graph.`);
      return 1;
    }
    out.log(`taint trace for ${formatTaint(entry)}`);
    if (entry.taint !== "clean") {
      const node = doc.nodes.find((n) => n.id === id);
      const nonClean = node
        ? requiredIds(node).map((r) => trace.get(r)).filter((e): e is TaintEntry => !!e && e.taint !== "clean")
        : [];
      out.log(
        `  direct requirement(s) contributing: ${
          nonClean.length === 0 ? "none (this node is its own source)" : nonClean.map((s) => `${s.id} (${s.taint})`).join(", ")
        }`,
      );
      out.log("  next: 'rk graph --taint <requirement-id>' to keep tracing a contributing requirement upstream.");
    }
    return 0;
  }

  const tainted = taintedNodes(trace);
  out.log(`campaign-wide taint: ${tainted.length}/${doc.nodes.length} node(s) not clean.`);
  if (tainted.length === 0) out.log("  (all nodes clean)");
  else for (const e of tainted) out.log(`  ${formatTaint(e)}`);
  out.log("  next: 'rk graph --taint <id>' for a specific node's upstream contributing requirements.");
  return 0;
}

export interface GraphCommandDeps {
  /** injectable for tests (same pattern as src/store/build-graph.ts's `BuildGraphOptions`) — point
   * at a guaranteed-absent binary so a test exercises the fallback paths deterministically,
   * without depending on a real af/fr install on $PATH. */
  afCommand?: readonly string[];
  frCommand?: readonly string[];
}

export async function graphCommand(args: string[], out: Out, deps: GraphCommandDeps = {}): Promise<number> {
  const { rest, root } = extractRoot(args);
  const { rest: r1, value: focusId } = extractFlag(rest, "--focus");
  const { rest: r2, value: northStarFlag } = extractFlag(r1, "--north-star");
  const criticalPath = r2.includes("--critical-path");
  const blocks = r2.includes("--blocks");
  const taintIdx = r2.indexOf("--taint");
  const wantsTaint = taintIdx !== -1;
  const taintArg = wantsTaint ? r2[taintIdx + 1] : undefined;
  const taintId = taintArg !== undefined && !taintArg.startsWith("--") ? taintArg : undefined;

  if (!focusId && !criticalPath && !blocks && !wantsTaint) {
    out.log("rk graph: no view selected -- pass one of --focus <id>, --critical-path, --blocks, --taint [id].");
    return 2;
  }

  const { doc, diagnostics } = buildGraphDocument(root, { afCommand: deps.afCommand, frCommand: deps.frCommand });

  // M2 boundary review, landing-blocker #2 (consumer side): a structurally incomplete projection
  // must never render as a complete report, no matter how small the view command asked for.
  if (!diagnostics.isStructurallyComplete) {
    out.log(
      "rk graph: refusing to report -- the projection is structurally incomplete " +
        "(never a smaller-but-complete-looking view):",
    );
    for (const line of structuralLossLines(diagnostics.structuralLoss)) out.log(`  ${line}`);
    out.log("  next: fix the structural issue(s) above (or remove the offending input) and re-run 'rk graph'.");
    return 1;
  }
  for (const line of sourceStatusLines(diagnostics.sources)) out.log(line);

  if (focusId) return runFocus(doc, focusId, out);
  if (criticalPath) {
    const northStar = await resolveNorthStar(root, northStarFlag, out);
    return northStar ? runCriticalPath(doc, northStar, out) : 2;
  }
  if (blocks) {
    const northStar = await resolveNorthStar(root, northStarFlag, out);
    return northStar ? runBlocks(doc, northStar, out) : 2;
  }
  return runTaint(doc, taintId, out);
}
