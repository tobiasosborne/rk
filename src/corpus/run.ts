// EDGE — fs (transitively, via loadSnapshot/loadGateConfig). The ONE implementation of "run a
// single corpus fixture through its gate and check the result against expected.json" per
// corpus/README.md's `expected.json` convention. Shared by test/corpus.test.ts (which wraps each
// fixture in its own `test()`/`expect()` for readable red output), `bun run selftest` (which
// aggregates per-gate pass counts), and `rk check --selftest` (src/cli/check.ts) — one runner, so
// all three can never silently disagree on what "passing the corpus" means. Fixes the
// guard-the-guards gap named in the 2026-07-18 M0.3 milestone review (finding 6): corpus/
// README.md:13 always claimed selftest RUNS the corpus; before this file existed, `scripts/
// selftest.ts` only counted fixture directories.
//
// Lives under src/corpus/ (not src/gates/): this is an fs-touching harness module, not a gate.
// src/gates/ is PURE per CLAUDE.md §5 / IMPLEMENTATION_PLAN.md §0; placing an fs-using file there
// is silently exempt from the marker-based purity grep instead of visibly out of place — the
// 2026-07-18 M0.3 re-review (finding 6) called that an architecture-law regression. src/corpus/
// is edge territory the same way src/drive, src/refs, and src/cli already are.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GATES } from "../gates/index";
import { loadSnapshot } from "../gates/load";
import { mergeGateConfig } from "../gates/config";
import type { GateConfig } from "../gates/config";
import { loadGateConfig } from "../gates/config-load";
import { unmatchedExpectations } from "../gates/subset-match";
import type { ExpectedFinding } from "../gates/subset-match";
import type { CoverageLine } from "../gates/framework";
import { GATE_DIRS, discoverAllFixtures } from "./discovery";
import type { GateDir } from "./discovery";

export { GATE_DIRS };
export type { GateDir };

/** rk-6vw (review finding 6): an OPTIONAL coverage expectation. When present, the harness
 * asserts `checked`/`total` exactly against the gate's own (single) CoverageLine, and — since a
 * fixture's actual "point" is often a sub-count buried in the free-form `unit` string rather
 * than the checked/total pair itself (e.g. provenance-13's "0 tab:status rows", defs-14's "0/1
 * cited shards hash-verified") — every string in `unit_patterns` must appear as a case-sensitive
 * substring of that `unit` text, same substring convention as `findings[].message_pattern`. */
export interface ExpectedCoverage {
  checked: number;
  total: number;
  unit_patterns?: string[];
}

export interface ExpectedJson {
  gate: string;
  verdict: "pass" | "fail";
  findings: ExpectedFinding[];
  exit_code: number;
  coverage?: ExpectedCoverage;
  /** rk-6vw (review finding 10): declares the exact `.rk/config.json` override this fixture's
   * `repo/` carries — required whenever `repo/.rk/config.json` exists, and forbidden (must be
   * absent) otherwise. An undeclared override would let a fixture's own config file silently
   * weaken what a golden fixture proves about the DEFAULT_GATE_CONFIG boundary (review finding
   * 10's exact concern) without any visible trace in the fixture's own expectation file. */
  config_override?: Partial<GateConfig>;
}

/** rk-6vw (review finding 6) + M0.3 round-3 follow-up 1 (run.ts:134): pure, directly-testable
 * assertion over a gate's emitted `CoverageLine[]` (no fs, no fixture directory — just data),
 * used by `runFixture` below. The shape/name checks are UNCONDITIONAL — every non-stub fixture
 * asserts them, whether or not `expected` (the fixture's optional `ExpectedCoverage`) is present
 * — so a gate that stops emitting a coverage line, or emits one under the wrong gate name, fails
 * loudly even for the 78 of 86 fixtures that carry no `coverage` field in expected.json (all 24
 * linker fixtures included). Exact numeric/unit checks stay conditional on `expected`, unchanged
 * from before this fix. */
export function assertCoverageLine(gate: GateDir, coverage: CoverageLine[], expected: ExpectedCoverage | undefined): string[] {
  const errors: string[] = [];
  if (coverage.length !== 1) {
    errors.push(
      `coverage shape mismatch: gate emitted ${coverage.length} CoverageLine entries, expected ` +
        `exactly 1 (docs/gate-contracts.md's Coverage line convention: "every gate emits exactly ` +
        `one final line") — this assertion is unconditional, not opt-in`,
    );
    return errors;
  }

  const cov = coverage[0]!;
  if (cov.gate !== gate) {
    errors.push(`coverage gate-name mismatch: gate emitted a CoverageLine named '${cov.gate}', expected '${gate}'`);
  }

  if (expected) {
    if (cov.checked !== expected.checked || cov.total !== expected.total) {
      errors.push(
        `coverage mismatch: gate emitted checked=${cov.checked}/${cov.total}, expected.json says ` +
          `checked=${expected.checked}/${expected.total}`,
      );
    }
    for (const pat of expected.unit_patterns ?? []) {
      if (!cov.unit.includes(pat)) {
        errors.push(`coverage unit_pattern mismatch: '${pat}' not found in emitted unit text '${cov.unit}'`);
      }
    }
  }

  return errors;
}

export interface FixtureRunResult {
  gate: GateDir;
  fixtureId: string;
  /** True for a gate that has not been implemented yet (GateResult.notImplemented) — carried
   * over from the M0.3 skeleton state so a not-yet-implemented gate's fixtures can still be
   * reported/skipped distinctly rather than asserted against. */
  notImplemented: boolean;
  /** Empty iff every assertion below passed. Each entry is one human-readable failure, so both
   * callers (bun:test's `expect(...).toEqual([])`, and `bun run selftest`'s console output) can
   * surface exactly what broke without re-deriving it. */
  errors: string[];
}

/** Runs exactly one `corpus/<gate>/<fixtureId>/` fixture through the gate it targets and checks
 * every assertion `expected.json` licenses (findings subset match, verdict/exit_code, the
 * optional coverage expectation, and the config-override declaration) — never throws; every
 * failure (including an unexpected exception anywhere in this body — bad JSON, an unreadable
 * fixture tree, a gate that itself throws) is appended to the returned `errors` list instead.
 * rk-bdd (2026-07-18 M0.3 re-review finding 8): JSON parsing, snapshot/config loading, and
 * `gateImpl.run` used to sit outside any exception boundary, so one crashing fixture aborted
 * `runAllFixtures`'s entire sweep — silently NOT running every fixture after it, contradicting
 * this function's own "never throws" contract. The try/catch below is that boundary. */
export async function runFixture(corpusRoot: string, gate: GateDir, fixtureId: string): Promise<FixtureRunResult> {
  const fixtureDir = join(corpusRoot, gate, fixtureId);
  const gateImpl = GATES.find((g) => g.name === gate);
  if (!gateImpl) {
    return { gate, fixtureId, notImplemented: false, errors: [`no registered gate named '${gate}' (src/gates/index.ts)`] };
  }

  try {
    const errors: string[] = [];
    const expected: ExpectedJson = JSON.parse(readFileSync(join(fixtureDir, "expected.json"), "utf8"));
    const repoDir = join(fixtureDir, "repo");
    const snapshot = loadSnapshot(repoDir);
    const config = await loadGateConfig(repoDir);

    // rk-6vw (review finding 10): the resolved config must equal EXACTLY what expected.json
    // declares — mergeGateConfig(undefined) (the plain defaults) when config_override is absent,
    // or mergeGateConfig(expected.config_override) when it is present. This single comparison
    // catches BOTH directions of drift: an undeclared `.rk/config.json` in the fixture's repo/
    // (config != defaults, but config_override is absent so wantConfig == defaults), and a
    // declared config_override that doesn't match what the fixture's real config file actually
    // resolves to (a stale or wrong declaration).
    const wantConfig = mergeGateConfig(expected.config_override);
    const configKeys = Object.keys(wantConfig) as Array<keyof GateConfig>;
    const configMismatch = configKeys.some((k) => config[k] !== wantConfig[k]);
    if (configMismatch) {
      errors.push(
        `config mismatch: fixture repo/.rk/config.json (or its absence) resolves to ` +
          `${JSON.stringify(config)}; expected.json's config_override ` +
          `(${expected.config_override ? JSON.stringify(expected.config_override) : "absent — must run exact DEFAULT_GATE_CONFIG"}) ` +
          `resolves to ${JSON.stringify(wantConfig)}. An undeclared or misdeclared per-fixture config ` +
          `override can silently weaken what a golden fixture proves (review finding 10) — either ` +
          `remove the fixture's .rk/config.json or declare it via expected.json's "config_override".`,
      );
    }

    const result = gateImpl.run(snapshot, config);
    if (result.notImplemented) {
      return { gate, fixtureId, notImplemented: true, errors };
    }

    const missing = unmatchedExpectations(result.findings, expected.findings);
    if (missing.length > 0) {
      errors.push(`missing expected finding(s): ${JSON.stringify(missing)}`);
    }

    const hasError = result.findings.some((f) => f.severity === "ERROR");
    if (hasError !== (expected.verdict === "fail")) {
      errors.push(`verdict mismatch: gate produced hasError=${hasError}, expected.json says verdict='${expected.verdict}'`);
    }
    const expectedExitFromError = hasError ? 1 : 0;
    if (expectedExitFromError !== expected.exit_code) {
      errors.push(`exit_code mismatch: gate implies ${expectedExitFromError}, expected.json says exit_code=${expected.exit_code}`);
    }

    // M0.3 round-3 follow-up 1 (run.ts:134): the universal shape/name assertion plus the opt-in
    // exact-numeric assertion, both in `assertCoverageLine` above — pulled out to a pure function
    // so the "gate silently stops emitting a coverage line" / "wrong gate name" failure modes are
    // directly unit-testable without needing a fixture directory or a faked GATES registry.
    errors.push(...assertCoverageLine(gate, result.coverage, expected.coverage));

    return { gate, fixtureId, notImplemented: false, errors };
  } catch (e) {
    const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return {
      gate,
      fixtureId,
      notImplemented: false,
      errors: [`fixture CRASHED (unexpected exception, never a valid result — rk-bdd finding 8): ${message}`],
    };
  }
}

/** Runs every discovered fixture across all six gates. Order matches `GATE_DIRS` /
 * `discoverAllFixtures`'s own (alphabetical-within-gate) ordering, so output is stable. Because
 * `runFixture` never throws (see its own doc comment), one crashing fixture can no longer abort
 * this sweep — every other fixture, in this gate and every later gate, still runs. */
export async function runAllFixtures(corpusRoot: string): Promise<FixtureRunResult[]> {
  const all = discoverAllFixtures(corpusRoot);
  const out: FixtureRunResult[] = [];
  for (const gate of GATE_DIRS) {
    for (const fixtureId of all[gate]!) {
      out.push(await runFixture(corpusRoot, gate, fixtureId));
    }
  }
  return out;
}
