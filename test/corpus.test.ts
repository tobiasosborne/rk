// The corpus test harness (M0.3 deliverable 7): discovers corpus/<gate>/<fixture>/, loads
// expected.json + repo/ into a RepoSnapshot, runs the single named gate, subset-matches
// findings (src/gates/subset-match.ts), and asserts verdict/exit-code expectations
// (corpus/README.md's `expected.json` convention).
//
// M0.3 skeleton state: all six gates are stubs (GateResult.notImplemented === true) — every
// fixture below is registered as `test.skip`, with the gate's total pending-fixture count
// visible right in the skip name, so each wave implementer can see their target count at a
// glance in `bun test`'s output. A gate flips its fixtures from skip to a real assertion the
// moment its own `src/gates/<gate>.ts` stops returning `notImplemented: true` — no change to
// this harness is needed for that to happen.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GATES } from "../src/gates/index";
import { loadSnapshot } from "../src/gates/load";
import { DEFAULT_GATE_CONFIG } from "../src/gates/config";
import { loadGateConfig } from "../src/gates/config-load";
import { unmatchedExpectations } from "../src/gates/subset-match";
import type { ExpectedFinding } from "../src/gates/subset-match";
import { GATE_DIRS, discoverAllFixtures } from "../src/gates/corpus-discovery";

const CORPUS_ROOT = join(import.meta.dir, "..", "corpus");

interface ExpectedJson {
  gate: string;
  verdict: "pass" | "fail";
  findings: ExpectedFinding[];
  exit_code: number;
}

const ALL_FIXTURES = discoverAllFixtures(CORPUS_ROOT);

for (const gateDir of GATE_DIRS) {
  const gate = GATES.find((g) => g.name === gateDir);
  const fixtures = ALL_FIXTURES[gateDir];

  describe(`corpus / ${gateDir}`, () => {
    // A stub's notImplemented flag is static at M0.3 (never varies with input) — probe it once
    // against an empty snapshot rather than re-running the gate per fixture just to find out.
    const isStub = gate ? gate.run(new Map(), DEFAULT_GATE_CONFIG).notImplemented === true : true;

    for (const fixtureId of fixtures) {
      const fixtureDir = join(CORPUS_ROOT, gateDir, fixtureId);
      const label = isStub
        ? `${gateDir}/${fixtureId} (gate not implemented — ${fixtures.length} fixtures pending)`
        : `${gateDir}/${fixtureId}`;

      // Per-fixture config override (rk-r5t): a fixture's repo/ may carry its own
      // .rk/config.json, loaded via the same production edge (src/gates/config-load.ts)
      // real repos use — never an invented test-only convention. Absent file/dir degrades to
      // DEFAULT_GATE_CONFIG untouched, exactly as loadGateConfig already guarantees.
      const body = async () => {
        if (!gate) throw new Error(`no registered gate named '${gateDir}' (src/gates/index.ts)`);
        const expected: ExpectedJson = JSON.parse(readFileSync(join(fixtureDir, "expected.json"), "utf8"));
        const repoDir = join(fixtureDir, "repo");
        const snapshot = loadSnapshot(repoDir);
        const config = await loadGateConfig(repoDir);
        const result = gate.run(snapshot, config);

        const missing = unmatchedExpectations(result.findings, expected.findings);
        expect(missing).toEqual([]);

        const hasError = result.findings.some((f) => f.severity === "ERROR");
        expect(hasError).toBe(expected.verdict === "fail");
        expect(hasError ? 1 : 0).toBe(expected.exit_code);
      };

      if (isStub) {
        test.skip(label, body);
      } else {
        test(label, body);
      }
    }
  });
}

describe("corpus discovery", () => {
  test("every one of the six gate directories has at least one fixture", () => {
    for (const g of GATE_DIRS) {
      expect(ALL_FIXTURES[g]!.length).toBeGreaterThan(0);
    }
  });

  test("total fixture count matches corpus/README.md's ledger (84)", () => {
    const total = GATE_DIRS.reduce((sum, g) => sum + ALL_FIXTURES[g]!.length, 0);
    expect(total).toBe(84);
  });
});
