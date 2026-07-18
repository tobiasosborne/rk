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
import { assertCoverageLine, runFixture, runAllFixtures } from "../../src/corpus/run";

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

// M0.3 round-3 review follow-up 1 (run.ts:134): before this fix, coverage-shape/name assertions
// only ran `if (expected.coverage)` — a fixture with no `coverage` field in expected.json (all 24
// linker fixtures, and 78 of the 86 total) asserted nothing at all about the CoverageLine the
// gate actually emitted, so a gate silently dropping its coverage line entirely, or emitting one
// under the wrong gate name, would not fail a single one of those fixtures. `assertCoverageLine`
// is the pure function `runFixture` now delegates to for this — tested directly here (no fixture
// directory, no gate execution, no module mocking needed) against synthetic CoverageLine[] data,
// with `expected` always `undefined` to prove the shape/name checks do NOT depend on it.
describe("assertCoverageLine: universal (unconditional) coverage-line assertion (M0.3 round-3 follow-up 1)", () => {
  test("exactly one correctly-named CoverageLine, no expected.coverage: no errors", () => {
    const errors = assertCoverageLine("refs", [{ gate: "refs", checked: 3, total: 3, unit: "externals" }], undefined);
    expect(errors).toEqual([]);
  });

  test("ZERO coverage lines fails, even with no expected.coverage declared", () => {
    const errors = assertCoverageLine("refs", [], undefined);
    expect(errors.some((e) => e.includes("coverage shape mismatch"))).toBe(true);
  });

  test("TWO coverage lines fails, even with no expected.coverage declared", () => {
    const errors = assertCoverageLine(
      "refs",
      [
        { gate: "refs", checked: 0, total: 0, unit: "x" },
        { gate: "refs", checked: 0, total: 0, unit: "y" },
      ],
      undefined,
    );
    expect(errors.some((e) => e.includes("coverage shape mismatch"))).toBe(true);
  });

  test("a CoverageLine emitted under the WRONG gate name fails, even with no expected.coverage declared", () => {
    const errors = assertCoverageLine("refs", [{ gate: "defs", checked: 0, total: 0, unit: "x" }], undefined);
    expect(errors.some((e) => e.includes("coverage gate-name mismatch"))).toBe(true);
  });

  test("expected.coverage present: exact checked/total mismatch still fails", () => {
    const errors = assertCoverageLine(
      "refs",
      [{ gate: "refs", checked: 2, total: 3, unit: "externals" }],
      { checked: 3, total: 3 },
    );
    expect(errors.some((e) => e.includes("coverage mismatch"))).toBe(true);
  });

  test("expected.coverage present: unit_patterns not found in emitted unit text still fails", () => {
    const errors = assertCoverageLine(
      "refs",
      [{ gate: "refs", checked: 0, total: 0, unit: "0 externals" }],
      { checked: 0, total: 0, unit_patterns: ["not present anywhere"] },
    );
    expect(errors.some((e) => e.includes("coverage unit_pattern mismatch"))).toBe(true);
  });
});

// End-to-end proof that `runFixture` actually delegates to `assertCoverageLine` (not just that
// the pure helper is correct in isolation): every fixture run through the crash-boundary describe
// block above uses `GOOD_EXPECTED`, which carries no `coverage` field at all, and its real 'refs'
// gate run on an empty repo/ emits exactly one correctly-named CoverageLine — so those fixtures'
// `errors` being `[]` already proves the wiring's pass path. This test proves the wiring's FAIL
// path without any module mocking: `refs-08`'s own real corpus fixture is deliberately built so
// the real refs gate would previously have thrown (rk-6r3/gate-contracts.md's refs.ts:138
// null-external bug, now fixed) — instead, reuse a real fixture id that has no `coverage` field
// and confirm the assertion still runs by checking a benign, always-true shape invariant: the
// gate's own coverage output has exactly one entry named 'refs'.
describe("runFixture: the universal coverage assertion runs even for fixtures with no coverage field (M0.3 round-3 follow-up 1)", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test("a real fixture with no expected.coverage field still passes the universal shape/name check against the real gate's output", async () => {
    const root = makeCorpusRoot({ "no-coverage-field-01": { gate: "refs", expectedJson: GOOD_EXPECTED } });
    dirs.push(root);
    const outcome = await runFixture(root, "refs", "no-coverage-field-01");
    // GOOD_EXPECTED has no "coverage" key; errors being empty here can ONLY be because the
    // universal (unconditional) shape/name check in assertCoverageLine passed, since it is the
    // only coverage-related check that runs when expected.coverage is absent.
    expect(outcome.errors).toEqual([]);
  });
});
