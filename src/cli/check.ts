// EDGE — fs (via src/gates/load.ts + src/gates/config-load.ts, and — for `--selftest` — src/
// corpus/{discovery,run,report}.ts). `rk check`: runs all six M0 gates in one invocation. Ground
// truth: docs/gate-contracts.md's Shared conventions, "Composition (`rk check`)" — all six gates
// run unconditionally (no short-circuit, a deviation from AISM's own check-all.sh, which
// `fail()`s at the first broken script), every coverage line prints regardless of earlier
// failures, exit 1 iff at least one gate reported >=1 ERROR.
//
// M0.3 skeleton state: every gate is currently a stub (GateResult.notImplemented === true, zero
// findings, zero coverage lines). Per this WP's brief, a notImplemented gate prints a loud
// "gate <name>: NOT IMPLEMENTED" line instead of findings/coverage, and never contributes to the
// composed exit code — only a real (implemented) gate's ERRORs can fail `rk check`.
//
// `--selftest` (rk-bdd, 2026-07-18 M0.3 re-review finding 7): IMPLEMENTATION_PLAN.md:76 (M0.2
// acceptance) names `rk check --selftest` as the interface that runs the red corpus — only `bun
// run selftest` existed until this WP. Deliberately narrow scope: `--selftest` runs ONLY the
// corpus (via the same src/corpus/run.ts runner `bun run selftest` and test/corpus.test.ts use),
// not the purity grep — the plan's acceptance clause is about the corpus, and the purity grep is
// a repo-hygiene check over rk's OWN source tree, orthogonal to "does rk's gate logic pass its
// own red-test corpus" (the thing a consumer of the `rk` binary can actually run against their
// own checkout of rk, without rk's dev-only `scripts/` directory).

import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadSnapshot } from "../gates/load";
import { loadGateConfig } from "../gates/config-load";
import { GATES } from "../gates/index";
import { formatFinding } from "../gates/framework";
import type { Gate, GateResult } from "../gates/framework";
import type { RepoSnapshot } from "../gates/snapshot";
import type { GateConfig } from "../gates/config";
import { runAllFixtures } from "../corpus/run";
import { formatCorpusRunReport } from "../corpus/report";
import type { Out } from "./args";
import { extractRoot } from "./args";

/** rk-6r3 / M0.3 review finding 7: gate-contracts.md:85's "unconditional composition" promise
 * ("all six gates run unconditionally ... every coverage line prints regardless of earlier
 * failures") is only real if ONE gate's own bug can never take the rest of `rk check` down with
 * it. A gate is supposed to never throw (pure core, L3) — this boundary is defense-in-depth for
 * when that guarantee is violated anyway, not a license for gates to throw. An unexpected
 * exception becomes a loud synthetic ERROR finding + a coverage line that reads as a crash (never
 * a silent, pass-shaped "0/0"), and every remaining gate still runs.
 *
 * rk-bdd (2026-07-18 M0.3 re-review finding 9): `path` uses the sentinel `<gate:NAME>` — never a
 * bare gate name. framework.ts's Finding.path contract is "repo-relative" (a real path into the
 * checked repo); a crash is not attributable to any specific repo-relative file, so a bare name
 * like `defs` would either look like a truncated/malformed real path or — worse — coincidentally
 * collide with an actual repo path if the checked repo happened to have a file literally named
 * `defs` at its root. The angle-bracket sentinel can never be a valid repo-relative path, so a
 * reader (or a downstream tool grepping finding lines) can tell at a glance this is the
 * defense-in-depth boundary firing, not a real finding about repo content. See framework.ts's
 * Finding.path doc comment and docs/gate-contracts.md's Finding format section for the blessed
 * exception text. */
function runGateSafely(gate: Gate, snapshot: RepoSnapshot, config: GateConfig): GateResult {
  try {
    return gate.run(snapshot, config);
  } catch (e) {
    const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return {
      findings: [
        {
          severity: "ERROR",
          path: `<gate:${gate.name}>`,
          message: `gate '${gate.name}' CRASHED (unexpected exception, never a valid gate verdict): ${message}`,
        },
      ],
      coverage: [
        {
          gate: gate.name,
          checked: 0,
          total: 0,
          unit: "GATE CRASHED — see the ERROR finding above (defense-in-depth boundary, gate-contracts.md:85)",
        },
      ],
    };
  }
}

/** `rk check --selftest` (rk-bdd finding 7): runs the red corpus via the same runner `bun run
 * selftest` and test/corpus.test.ts use, printing the same per-gate + aggregate coverage-line
 * style (src/corpus/report.ts's `formatCorpusRunReport` — one formatter, so all three entry
 * points can never silently disagree about what "the corpus passes" means). The corpus dir
 * defaults to `<root>/corpus` (the rk repo layout: `--root` is the rk checkout, not an arbitrary
 * research repo, when running this flag) — an absent corpus directory is a loud ERROR, never a
 * silent pass (L2): running `--selftest` against a directory that isn't an rk checkout (or an rk
 * checkout with its corpus/ moved/deleted) must fail loudly, not report "0/0 passed" as if the
 * corpus were merely empty. */
async function runSelftest(root: string, out: Out): Promise<number> {
  const corpusRoot = join(root, "corpus");
  if (!existsSync(corpusRoot)) {
    out.log(
      `rk check --selftest: ERROR no corpus directory found at ${corpusRoot} (default '<root>/corpus'). ` +
        `--selftest runs rk's own red-fixture corpus and requires --root to point at an rk repo ` +
        `checkout that has one (docs/gate-contracts.md, corpus/README.md) — this is a loud failure, ` +
        `not a silent pass (CLAUDE.md L2).`,
    );
    return 1;
  }

  const results = await runAllFixtures(corpusRoot);
  const { lines, errorCount } = formatCorpusRunReport(results);
  for (const line of lines) out.log(line);

  out.log("");
  if (errorCount > 0) {
    out.log(`rk check --selftest: FAILED (${errorCount} fixture failure(s) above).`);
    return 1;
  }
  out.log("rk check --selftest: OK");
  return 0;
}

export async function checkCommand(args: string[], out: Out): Promise<number> {
  const { rest, root } = extractRoot(args);
  if (rest.includes("--selftest")) {
    return runSelftest(root, out);
  }

  const snapshot = loadSnapshot(root);
  const config = await loadGateConfig(root);

  let anyError = false;
  for (const gate of GATES) {
    const result = runGateSafely(gate, snapshot, config);

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
