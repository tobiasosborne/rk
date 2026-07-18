// EDGE — fs (via src/store/snapshot-load.ts + src/store/config-load.ts, and — for `--selftest` —
// src/corpus/{discovery,run,report}.ts). `rk check`: runs all six M0 gates in one invocation. Ground
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
import { loadSnapshot } from "../store/snapshot-load";
import { loadGateConfig } from "../store/config-load";
import { GATES } from "../gates/index";
import { formatFinding } from "../gates/framework";
import type { Gate, GateResult } from "../gates/framework";
import type { RepoSnapshot } from "../gates/snapshot";
import type { GateConfig } from "../gates/config";
import { runAllFixtures } from "../corpus/run";
import { formatCorpusRunReport } from "../corpus/report";
import { discoverAllFixtures, EXPECTED_FIXTURE_COUNT, GATE_DIRS } from "../corpus/discovery";
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
 * corpus were merely empty.
 *
 * M0.3 round-3 review follow-up 2 (check.ts:89): an existing-but-empty (or partially-deleted)
 * corpus/ used to pass silently — a missing gate subdirectory becomes an empty fixture list
 * (src/corpus/discovery.ts's `discoverFixtures` swallows ENOENT), so `formatCorpusRunReport`
 * reported a pass-shaped `0/0 fixtures passed` for that gate with zero errors. Two checks below
 * close that hole before any fixture runs: every one of the six gate corpus directories must
 * discover at least one fixture, and the grand total must equal `EXPECTED_FIXTURE_COUNT`
 * (src/corpus/discovery.ts — the SAME constant `bun run selftest`, scripts/selftest.ts, enforces,
 * so the two entry points can never silently drift apart on what "the corpus" is expected to
 * contain). */
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

  const perGate = discoverAllFixtures(corpusRoot);
  const emptyGates = GATE_DIRS.filter((g) => perGate[g]!.length === 0);
  if (emptyGates.length > 0) {
    out.log(
      `rk check --selftest: ERROR corpus/ exists at ${corpusRoot} but the following gate ` +
        `director${emptyGates.length === 1 ? "y is" : "ies are"} absent or empty: ` +
        `${emptyGates.map((g) => `corpus/${g}`).join(", ")}. An existing-but-incomplete corpus ` +
        `must fail loudly, never report a pass-shaped 0/0 for a missing gate (CLAUDE.md L2).`,
    );
    return 1;
  }

  const fixtureTotal = GATE_DIRS.reduce((sum, g) => sum + perGate[g]!.length, 0);
  if (fixtureTotal !== EXPECTED_FIXTURE_COUNT) {
    out.log(
      `rk check --selftest: ERROR discovered ${fixtureTotal} fixtures under ${corpusRoot}, ` +
        `expected ${EXPECTED_FIXTURE_COUNT} per corpus/README.md's ledger total (the same count ` +
        `'bun run selftest' enforces) — the corpus and its own ledger have drifted.`,
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

/** round-3 landing-blocker 3: `loadSnapshot` runs BEFORE the per-gate exception boundary
 * (`runGateSafely`), so an uncaught throw here — a symlink/fs edge case the loader's own
 * containment misses — would kill the entire composed check and take all six coverage lines with
 * it, violating unconditional composition (gate-contracts.md Shared conventions, "Composition":
 * every gate runs and every coverage line prints regardless of earlier failures). Snapshot loading
 * is a precondition of ALL gates, so its failure cannot be attributed to any one of them; it
 * becomes a single loud ERROR under the `<snapshot-load>` sentinel path (the same angle-bracket,
 * never-a-real-path convention as `<gate:NAME>`), plus a crash-marked coverage line for every
 * registered gate, plus exit 1 — never a silent pass-shaped `0/0` and never an uncaught process
 * exit. The lstat-based symlink policy (src/store/snapshot-load.ts) makes the loader effectively total, so
 * this is defense-in-depth (like `runGateSafely`), not a license for the loader to throw. */
function emitSnapshotLoadFailure(root: string, e: unknown, out: Out): number {
  const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  out.log(
    `ERROR <snapshot-load>:1 rk check could not load the repo snapshot from '${root}' — snapshot ` +
      `loading is a precondition of every gate, so this is a COMPOSED failure (loud ERROR + all ` +
      `coverage lines + exit 1), never an uncaught process exit that would drop the other coverage ` +
      `lines (gate-contracts.md Shared conventions, "Composition"): ${message}`,
  );
  for (const gate of GATES) {
    out.log(
      `checked ${gate.name}: 0/0 SNAPSHOT LOAD FAILED — see the <snapshot-load> ERROR above ` +
        `(0 errors, 0 warnings)`,
    );
  }
  out.log("");
  out.log("rk check: FAILED (snapshot load error — see the <snapshot-load> ERROR above).");
  return 1;
}

export async function checkCommand(
  args: string[],
  out: Out,
  load: (root: string) => RepoSnapshot = loadSnapshot,
): Promise<number> {
  const { rest, root } = extractRoot(args);
  if (rest.includes("--selftest")) {
    return runSelftest(root, out);
  }

  let snapshot: RepoSnapshot;
  try {
    snapshot = load(root);
  } catch (e) {
    return emitSnapshotLoadFailure(root, e, out); // loud composed failure, never an uncaught exit
  }
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
