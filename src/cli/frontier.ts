// EDGE — fs (via src/store/build-graph.ts) + optional subprocess (af/fr binaries, injected).
// `rk frontier <goal-id>` (rk-ptx0 / S0): the terminal view over src/graph/query-frontier.ts's GOAL
// frontier — what open work the goal actually needs, and where the admission boundary runs.
// The query core is pure; this file only loads the projection (the SAME buildGraphDocument path
// `rk graph` uses — one loader, not two) and formats.
//
// Three facts this view exists to state plainly:
//   - OBLIGATIONS: reachable, unsettled, live work. `actionable` is the allocator's wavefront (own
//     prerequisites met); `deadEnd` means every declared route contains a pruned member, so the
//     node needs a PRUNE or a fresh decomposition rather than more prover effort.
//   - UNATTACHED ids: document nodes the goal does not reach. Prospecting-pool material, NEVER
//     obligations — printed by id because "2 unattached" tells an operator nothing actionable.
//   - SATISFIED (implied): attached minus obligations. Settled proofs (and pruned dead branches)
//     that are part of the goal's record but not open work; the label says implied because this
//     view derives it by subtraction rather than re-walking.
//
// Structural-completeness refusal is inherited from the same rule `rk graph` follows (M2 boundary
// review, landing-blocker #2): an incomplete projection never renders as a smaller-but-complete
// looking report.

import { computeGoalFrontier, type GoalFrontierResult } from "../graph/query-frontier";
import { sourceStatusLines, structuralLossLines } from "../render/diagnostics-view";
import { buildGraphDocument } from "../store/build-graph";
import type { Out } from "./args";
import { extractRoot } from "./args";
import type { GraphCommandDeps } from "./graph";

/** The whole report as lines. Side-effect-free and separately exported so the shape of the output
 * is unit-testable without a repo tree on disk. */
export function formatFrontierReport(result: GoalFrontierResult): string[] {
  if (!result.found) {
    return [
      `rk frontier: goal '${result.rootId}' names no node in the projected graph.`,
      "  next: 'rk frontier <goal-id>' with a real registry id (see argument/**/*.md).",
    ];
  }

  const lines: string[] = [];
  lines.push(`goal frontier for ${result.rootId}: ${result.obligations.length} obligation(s)`);
  if (result.obligations.length === 0) lines.push("  none — every attached route is settled or dead");
  else {
    for (const o of result.obligations) {
      const flags = [o.actionable ? "actionable" : "not actionable"];
      if (o.deadEnd) flags.push("dead-end (every declared route contains a pruned member)");
      lines.push(`  ${o.id} (status=${o.status ?? "unset"}, kind=${o.kind}) — ${flags.join(", ")}`);
    }
  }

  const satisfied = result.attachedIds.length - result.obligations.length;
  lines.push(
    `counts: attached=${result.attachedIds.length}, unattached=${result.unattachedIds.length}, ` +
      `satisfied=${satisfied} (implied: attached minus obligations — settled proofs and pruned branches)`,
  );

  lines.push(`unattached (${result.unattachedIds.length}) — prospecting pool, never obligations:`);
  if (result.unattachedIds.length === 0) lines.push("  none");
  else for (const id of result.unattachedIds) lines.push(`  ${id}`);

  lines.push("  next: work the actionable obligations; PRUNE or re-decompose the dead-ends.");
  return lines;
}

export async function frontierCommand(args: string[], out: Out, deps: GraphCommandDeps = {}): Promise<number> {
  const { rest, root } = extractRoot(args);
  const rootId = rest.find((a) => !a.startsWith("--"));
  if (!rootId) {
    out.log("rk frontier: no goal id given -- usage: rk frontier <goal-id> [--root <dir>].");
    return 2;
  }

  const { doc, diagnostics } = buildGraphDocument(root, { afCommand: deps.afCommand, frCommand: deps.frCommand });
  if (!diagnostics.isStructurallyComplete) {
    out.log(
      "rk frontier: refusing to report -- the projection is structurally incomplete " +
        "(never a smaller-but-complete-looking frontier):",
    );
    for (const line of structuralLossLines(diagnostics.structuralLoss)) out.log(`  ${line}`);
    out.log("  next: fix the structural issue(s) above (or remove the offending input) and re-run 'rk frontier'.");
    return 1;
  }
  for (const line of sourceStatusLines(diagnostics.sources)) out.log(line);

  const result = computeGoalFrontier(doc, rootId);
  for (const line of formatFrontierReport(result)) out.log(line);
  return result.found ? 0 : 1;
}
