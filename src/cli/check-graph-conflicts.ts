// EDGE — fs + subprocess through src/store/build-graph.ts. Obligatory `rk check` surfacing for
// graph-layer contract conflicts (rk-45dj): the graph's pure conflict computation remains the ONE
// predicate; this module only builds the same GraphDocument `rk graph` uses, maps its already-
// computed contract-mismatch records to ordinary check findings, and prints honest join coverage.

import type { Finding } from "../gates/framework";
import { formatFinding } from "../gates/framework";
import type { Phase } from "../gates/phase";
import { applyPhase } from "../gates/phase";
import { buildGraphDocument } from "../store/build-graph";
import type { Out } from "./args";
import type { CheckCommandDeps } from "./check-regen";

const PASS_NAME = "graph-conflicts";

function crashMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** Runs the graph's existing byte-exact contract-conflict pass and emits it in the same
 * finding/coverage shape as every registered gate. Returns true iff a consolidation-blocking
 * ERROR was emitted. Exploration demotion uses the one fixed phase policy (`applyPhase`). */
export function emitGraphContractConflicts(
  root: string,
  out: Out,
  phase: Phase,
  deps: CheckCommandDeps,
): boolean {
  let built: ReturnType<typeof buildGraphDocument>;
  try {
    built = buildGraphDocument(root, { afCommand: deps.afCommand, frCommand: deps.frCommand });
  } catch (error) {
    out.log(
      `ERROR <graph-conflicts>:1 graph contract joins could not be built — this obligatory ` +
        `validity pass has no verdict and fails closed: ${crashMessage(error)}`,
    );
    out.log(`checked ${PASS_NAME}: 0/0 GRAPH BUILD FAILED — no contract-join verdict (1 errors, 0 warnings)`);
    return true;
  }

  const nodeById = new Map(built.doc.nodes.map((candidate) => [candidate.id, candidate] as const));
  const edgeById = new Map(built.doc.edges.af.map((edge) => [edge.nodeId, edge] as const));
  const findings: Finding[] = built.doc.conflicts
    .filter((conflict) => conflict.edge === "af" && conflict.kind === "contract-mismatch")
    .map((conflict) => {
      const id = conflict.nodeId ?? "(unknown)";
      const owner = conflict.nodeId === undefined ? undefined : nodeById.get(conflict.nodeId);
      const edge = conflict.nodeId === undefined ? undefined : edgeById.get(conflict.nodeId);
      return {
        severity: "ERROR",
        path: owner?.path ?? "<graph-conflicts>",
        message:
          `graph contract mismatch: '${id}' has contractMatch=false` +
          `${edge ? ` for af workspace '${edge.workspace}'` : ""} — the registry contract must ` +
          `byte-match the af root statement; update one side so the join agrees`,
      };
    });

  const effective = applyPhase(findings, phase);
  for (const finding of effective) out.log(formatFinding(finding));
  const errors = effective.filter((finding) => finding.severity === "ERROR").length;
  const warnings = effective.length - errors;
  const checked = built.doc.edges.af.filter((edge) => edge.workspaceResolved).length;
  out.log(
    `checked ${PASS_NAME}: ${checked}/${built.doc.edges.af.length} contract joins ` +
      `(${errors} errors, ${warnings} warnings)`,
  );
  return errors > 0;
}
