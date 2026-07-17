// EDGE — fs (via src/gates/load.ts + src/gates/config-load.ts). `rk check`: runs all six M0
// gates in one invocation. Ground truth: docs/gate-contracts.md's Shared conventions,
// "Composition (`rk check`)" — all six gates run unconditionally (no short-circuit, a deviation
// from AISM's own check-all.sh, which `fail()`s at the first broken script), every coverage line
// prints regardless of earlier failures, exit 1 iff at least one gate reported >=1 ERROR.
//
// M0.3 skeleton state: every gate is currently a stub (GateResult.notImplemented === true, zero
// findings, zero coverage lines). Per this WP's brief, a notImplemented gate prints a loud
// "gate <name>: NOT IMPLEMENTED" line instead of findings/coverage, and never contributes to the
// composed exit code — only a real (implemented) gate's ERRORs can fail `rk check`.

import { loadSnapshot } from "../gates/load";
import { loadGateConfig } from "../gates/config-load";
import { GATES } from "../gates/index";
import { formatFinding } from "../gates/framework";
import type { Out } from "./args";
import { extractRoot } from "./args";

export async function checkCommand(args: string[], out: Out): Promise<number> {
  const { root } = extractRoot(args);
  const snapshot = loadSnapshot(root);
  const config = await loadGateConfig(root);

  let anyError = false;
  for (const gate of GATES) {
    const result = gate.run(snapshot, config);

    if (result.notImplemented) {
      out.log(`gate ${gate.name}: NOT IMPLEMENTED`);
      continue;
    }

    for (const f of result.findings) out.log(formatFinding(f));

    const errors = result.findings.filter((f) => f.severity === "ERROR").length;
    const warnings = result.findings.filter((f) => f.severity === "WARN").length;
    for (const c of result.coverage) {
      out.log(`checked ${c.gate}: ${c.checked}/${c.total} ${c.unit} (${errors} errors, ${warnings} warnings)`);
    }
    if (errors > 0) anyError = true;
  }

  out.log("");
  if (anyError) {
    out.log("rk check: FAILED (>=1 ERROR above).");
    out.log("  next: fix the ERROR findings above; WARNs are advisory (docs/gate-contracts.md).");
  } else {
    out.log("rk check: OK (0 ERRORs across all implemented gates).");
  }
  return anyError ? 1 : 0;
}
