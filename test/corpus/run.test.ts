// rk-bdd (2026-07-18 M0.3 re-review, finding 8): `runFixture`/`runAllFixtures` (src/corpus/
// run.ts) claim "never throws", but before this WP's fix JSON parsing, snapshot/config loading,
// and `gateImpl.run` sat outside any exception boundary, and `runAllFixtures` is a plain
// sequential loop with no try/catch of its own — so one crashing fixture silently aborted the
// entire sweep (every fixture after it in `GATE_DIRS` order never ran, with no error reported
// for them at all). These tests build tiny throwaway corpus trees (not corpus/ itself) to force
// exactly that: a fixture whose `expected.json` is unparseable JSON, which throws inside
// `JSON.parse`.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFixture, runAllFixtures } from "../../src/corpus/run";

// Uses the 'refs' gate (not 'defs'): test/cli-check.test.ts's per-gate-exception-boundary test
// permanently swaps 'defs' out for an always-throwing fake via `mock.module`, file-wide, with no
// restore (its own comment explains why it must run LAST in that file) — since bun:test shares a
// module cache across files in one run, picking a gate that test never touches keeps this file's
// "good" fixtures correct regardless of cross-file test execution order.
const GOOD_EXPECTED = JSON.stringify({ gate: "refs", verdict: "pass", findings: [], exit_code: 0 });

function makeCorpusRoot(fixtures: Record<string, { gate: string; expectedJson: string }>): string {
  const root = mkdtempSync(join(tmpdir(), "rk-corpus-run-test-"));
  for (const [fixtureId, { gate, expectedJson }] of Object.entries(fixtures)) {
    const dir = join(root, gate, fixtureId);
    mkdirSync(join(dir, "repo"), { recursive: true });
    writeFileSync(join(dir, "expected.json"), expectedJson);
  }
  return root;
}

describe("runFixture / runAllFixtures crash boundary (rk-bdd finding 8)", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test("a fixture with unparseable expected.json is recorded as a failed FixtureRunResult, not thrown", async () => {
    const root = makeCorpusRoot({ "crash-01": { gate: "refs", expectedJson: "{ not valid json" } });
    dirs.push(root);

    // Before the fix this `await` itself throws (SyntaxError from JSON.parse propagating out of
    // runFixture) instead of resolving to a FixtureRunResult — the whole point of the boundary.
    const outcome = await runFixture(root, "refs", "crash-01");

    expect(outcome.notImplemented).toBe(false);
    expect(outcome.errors.length).toBeGreaterThan(0);
    expect(outcome.errors[0]).toContain("CRASHED");
  });

  test("runAllFixtures continues past a crashing fixture: every OTHER fixture (before and after it, alphabetically) still runs", async () => {
    const root = makeCorpusRoot({
      // Alphabetical order within 'refs' (discoverFixtures sorts): "a-good" < "m-crash" < "z-good".
      "a-good": { gate: "refs", expectedJson: GOOD_EXPECTED },
      "m-crash": { gate: "refs", expectedJson: "{ this is not json at all" },
      "z-good": { gate: "refs", expectedJson: GOOD_EXPECTED },
    });
    dirs.push(root);

    const results = await runAllFixtures(root);
    const ids = results.map((r) => r.fixtureId).sort();

    // All three fixtures produced a result — the crash did not abort the sweep before "z-good".
    expect(ids).toEqual(["a-good", "m-crash", "z-good"]);

    const crashResult = results.find((r) => r.fixtureId === "m-crash")!;
    expect(crashResult.errors.length).toBeGreaterThan(0);
    expect(crashResult.errors[0]).toContain("CRASHED");

    // The two golden fixtures either side of the crash ran cleanly through their real gate.
    for (const id of ["a-good", "z-good"]) {
      const r = results.find((res) => res.fixtureId === id)!;
      expect(r.errors).toEqual([]);
    }
  });
});
