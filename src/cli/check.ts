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

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSnapshot } from "../store/snapshot-load";
import { loadGateConfig } from "../store/config-load";
import { buildGraphDocument } from "../store/build-graph";
import { renderSite } from "../render/site";
import { GATES } from "../gates/index";
import { formatFinding } from "../gates/framework";
import type { Gate, GateResult } from "../gates/framework";
import type { RepoSnapshot } from "../gates/snapshot";
import type { GateConfig } from "../gates/config";
import { applyPhase } from "../gates/phase";
import {
  declaredGeneratorPaths,
  RENDER_SITE_GENERATOR,
  runFreshnessGate,
  type ExternalRegenResult,
} from "../gates/freshness";
import { runAllFixtures } from "../corpus/run";
import { formatCorpusRunReport } from "../corpus/report";
import { discoverAllFixtures, EXPECTED_FIXTURE_COUNT, GATE_DIRS } from "../corpus/discovery";
import type { Out } from "./args";
import { extractRoot } from "./args";

/** Injectable af/fr command overrides for `rk check`'s render-site-v1 edge-regeneration path
 * (`prepareRenderSiteExternalRegen` below) — same seam `src/cli/render.ts`'s `RenderCommandDeps`
 * already uses, so a test can force the af/fr-absent fallback deterministically without touching
 * `$PATH`. */
export interface CheckCommandDeps {
  afCommand?: readonly string[];
  frCommand?: readonly string[];
}

/** M2 boundary review blocker #3: Gate 7's `render-site-v1` generator is recognized but stays
 * unverifiable by the PURE gate itself (src/gates/freshness.ts's header explains why) — this is
 * the edge that actually regenerates the site and hands the gate the resulting bytes, or a loud,
 * structured failure reason, via `runFreshnessGate`'s `externalRegen` parameter. Never throws:
 * every failure mode (a structurally incomplete build, an unexpected exception from
 * `buildGraphDocument`/`renderSite`) becomes an `ExternalRegenResult` of `{ok: false, reason}` for
 * every affected path — `runFreshnessGate` then turns that into a loud per-path ERROR, never a
 * silent pass or skip. Only invoked when the manifest actually declares at least one
 * `render-site-v1` path (`paths.length === 0` short-circuits before touching af/fr/fs at all). */
function prepareRenderSiteExternalRegen(
  root: string,
  paths: readonly string[],
  config: GateConfig,
  deps: CheckCommandDeps,
): ReadonlyMap<string, ExternalRegenResult> {
  const map = new Map<string, ExternalRegenResult>();
  if (paths.length === 0) return map;

  const fail = (reason: string): ReadonlyMap<string, ExternalRegenResult> => {
    for (const p of paths) map.set(p, { ok: false, reason });
    return map;
  };

  try {
    const buildResult = buildGraphDocument(root, { afCommand: deps.afCommand, frCommand: deps.frCommand });

    if (buildResult.report.registrySkipped.length > 0) {
      return fail(
        `the GraphDocument build reported ${buildResult.report.registrySkipped.length} structurally-skipped ` +
          `registry shard(s) (src/graph/from-registry.ts's RegistrySkip) -- a build this incomplete must never ` +
          `be used as the "expected" side of a freshness diff`,
      );
    }
    // Consumed tolerantly (M2 boundary review landing-blocker #2, concurrently landing in the
    // join lane / src/store/build-graph.ts): any OTHER structural-diagnostics surface this build
    // result carries, under any plausible shape -- this file must not hard-depend on a
    // not-yet-landed field's exact type or location.
    const anyResult = buildResult as unknown as { diagnostics?: unknown[]; report?: { diagnostics?: unknown[] } };
    const extraDiagnostics = anyResult.diagnostics ?? anyResult.report?.diagnostics;
    if (Array.isArray(extraDiagnostics) && extraDiagnostics.length > 0) {
      return fail(`the GraphDocument build reported ${extraDiagnostics.length} structural diagnostic(s)`);
    }

    // Same northStarId source rk render itself uses when no explicit `--north-star` overrides it
    // (src/cli/render.ts's resolveNorthStar) -- `rk check` has no CLI equivalent of `rk render`'s
    // own `--title`/`--north-star` flags, so a render invoked with either flag explicitly set will
    // legitimately diff against this config-only regeneration (a known, documented limitation --
    // docs/gate-contracts.md's Gate 7 section).
    const site = renderSite(buildResult.doc, { northStarId: config.northStarId });
    const indexFile = site.files.find((f) => f.path === "index.html");
    if (!indexFile) {
      return fail(
        `renderSite's pure API did not produce an "index.html" file (produced: ` +
          `${site.files.map((f) => f.path).join(", ") || "none"})`,
      );
    }
    for (const p of paths) map.set(p, { ok: true, bytes: indexFile.contents });
    return map;
  } catch (e) {
    const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return fail(`building the GraphDocument / rendering the site threw: ${message}`);
  }
}

/** `src/store/snapshot-load.ts`'s `RepoSnapshot` text map is deliberately bounded to the six
 * gates' declared Inputs (definitions/, argument/, proofs/, refs/, runs/, report/, .rk/ —
 * "explicit include globs from the contract, no kitchen-sink") — it does NOT include `rk
 * render`'s own output directory (`build/site/` by default), which is not any pre-M2.6 gate's
 * Input. Gate 7 still needs the ACTUAL on-disk bytes of a declared `render-site-v1` path to diff
 * against (the "have" side — `runFreshnessGate`'s ordinary declared-but-missing/STALE logic).
 * Rather than widen `src/store/snapshot-load.ts`'s include rules (join-lane territory this WP
 * does not touch — src/store/** is out of scope), this reads the handful of declared
 * render-site-v1 paths directly, at the edge, and hands freshness's own gate invocation an
 * augmented snapshot carrying just those extra entries — every OTHER gate keeps seeing the
 * original, untouched snapshot. A path genuinely absent from disk is left unaugmented; Gate 7's
 * own declared-but-missing check reports that, unchanged. */
function augmentSnapshotForRenderSite(
  snapshot: RepoSnapshot,
  root: string,
  paths: readonly string[],
): RepoSnapshot {
  let extra: Map<string, string> | undefined;
  for (const p of paths) {
    if (snapshot.has(p)) continue; // already visible under an existing include rule
    let text: string;
    try {
      text = readFileSync(join(root, ...p.split("/")), "utf8");
    } catch {
      continue; // genuinely absent from disk -- Gate 7's own declared-but-missing ERROR handles this
    }
    if (!extra) extra = new Map<string, string>();
    extra.set(p, text);
  }
  if (!extra) return snapshot;
  const merged = new Map<string, string>(snapshot);
  for (const [k, v] of extra) merged.set(k, v);
  return Object.assign(merged, {
    sha256: snapshot.sha256,
    tracked: snapshot.tracked,
    dirs: snapshot.dirs,
  }) as RepoSnapshot;
}

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
          // structural (M1.3 phase matrix): a gate crash is a defense-in-depth boundary firing,
          // never a normal finding — it must never silently soften to advisory in exploration.
          structural: true,
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
  buildDeps: CheckCommandDeps = {},
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

  // M2 boundary review blocker #3: render-site-v1 regeneration happens HERE, at the edge --
  // src/gates/freshness.ts's Gate 7 stays pure and only diffs the bytes prepared below.
  const renderSitePaths = declaredGeneratorPaths(snapshot, RENDER_SITE_GENERATOR);
  const renderSiteExternalRegen = prepareRenderSiteExternalRegen(root, renderSitePaths, config, buildDeps);
  // See augmentSnapshotForRenderSite's own doc comment: `build/site/index.html` (rk render's
  // default output) lives outside every pre-M2.6 include rule, so freshness's own snapshot is
  // augmented with just the declared render-site-v1 paths that exist on disk -- every OTHER gate
  // still sees the original, unaugmented `snapshot`.
  const freshnessSnapshot = augmentSnapshotForRenderSite(snapshot, root, renderSitePaths);

  let anyError = false;
  for (const gate of GATES) {
    const effectiveGate: Gate =
      gate.name === "freshness"
        ? {
            name: "freshness",
            run: (_snap: RepoSnapshot, cfg: GateConfig) => runFreshnessGate(freshnessSnapshot, cfg, renderSiteExternalRegen),
          }
        : gate;
    const result = runGateSafely(effectiveGate, snapshot, config);

    if (result.notImplemented) {
      out.log(`gate ${gate.name}: NOT IMPLEMENTED`);
      continue;
    }

    // M1.3 (`rk phase exploration|consolidation`): the ONE composition-layer point that applies
    // the fixed phase matrix (src/gates/phase.ts). A no-op in consolidation (the default) — every
    // pre-M1.3 fixture/test stays byte-identical. Coverage (`result.coverage`) is untouched by
    // construction: it comes from the gate's own checked/total bookkeeping, never from `findings`.
    const findings = applyPhase(result.findings, config.phase);
    for (const f of findings) out.log(formatFinding(f));

    const errors = findings.filter((f) => f.severity === "ERROR").length;
    const warnings = findings.filter((f) => f.severity === "WARN").length;
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
