// Unit tests for src/gates/config.ts's `validateConfigOverrides` + `configGate` (rk-xbm, M1
// review B1, docs/reviews/2026-07-18-m1-milestone-review-codex.md L1). Pure: no fs, no fixture
// directory -- just data, mirroring test/gates/phase.test.ts's style for the sibling pure module.
// The end-to-end `.rk/config.json` path is covered by test/store/config-load.test.ts; this file
// isolates `validateConfigOverrides` (the actual per-field logic) and `configGate` (the pipeline
// that surfaces its findings through `rk check`'s ordinary per-gate output).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_GATE_CONFIG, configGate, mergeGateConfig, validateConfigOverrides } from "../../src/gates/config";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { loadGateConfig } from "../../src/store/config-load";
import { unmatchedExpectations } from "../../src/gates/subset-match";
import type { ExpectedFinding } from "../../src/gates/subset-match";

describe("validateConfigOverrides — phase", () => {
  test("valid enum values pass through, zero findings", () => {
    for (const v of ["exploration", "consolidation"]) {
      const r = validateConfigOverrides({ phase: v });
      expect(r.findings).toEqual([]);
      expect(r.overrides.phase).toBe(v as "exploration" | "consolidation");
      expect(r.checked).toBe(1);
      expect(r.total).toBe(1);
    }
  });

  test("a typo'd value is rejected: absent from overrides (merge falls back to the default), one ERROR", () => {
    const r = validateConfigOverrides({ phase: "typo" });
    expect(r.overrides.phase).toBeUndefined();
    expect(r.checked).toBe(0);
    expect(r.total).toBe(1);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ severity: "ERROR", path: ".rk/config.json", structural: true });
    expect(r.findings[0]!.message).toContain("typo");
    // The rejected field must not leak through -- merging the sanitized overrides must resolve
    // to the strict default, never the malformed value (this IS the rk-xbm fix).
    expect(mergeGateConfig(r.overrides).phase).toBe("consolidation");
  });

  test("a non-string phase (e.g. a number) is rejected the same way", () => {
    const r = validateConfigOverrides({ phase: 5 });
    expect(r.overrides.phase).toBeUndefined();
    expect(r.findings).toHaveLength(1);
  });
});

describe("validateConfigOverrides — shardsMaxLines (rk-xbm's other named consequence)", () => {
  test("a valid positive number passes through", () => {
    const r = validateConfigOverrides({ shardsMaxLines: 350 });
    expect(r.overrides.shardsMaxLines).toBe(350);
    expect(r.findings).toEqual([]);
  });

  test("a string value is rejected: falls back to the default via merge, one ERROR", () => {
    const r = validateConfigOverrides({ shardsMaxLines: "garbage" });
    expect(r.overrides.shardsMaxLines).toBeUndefined();
    expect(r.findings).toHaveLength(1);
    expect(mergeGateConfig(r.overrides).shardsMaxLines).toBe(DEFAULT_GATE_CONFIG.shardsMaxLines);
  });

  // Mutation proof (this WP): temporarily replacing `isPositiveFiniteNumber(v)` in
  // src/gates/config.ts's shardsMaxLines branch with the bare `typeof v === "number"` (dropping
  // the finite+positive checks) lets `NaN`/`0`/`-5` all pass -- confirmed RED (this test's
  // `toHaveLength(1)` assertions failed with an empty findings array for those inputs) then
  // reverted.
  for (const bad of [0, -1, NaN, Infinity]) {
    test(`non-positive/non-finite value ${bad} is rejected`, () => {
      const r = validateConfigOverrides({ shardsMaxLines: bad });
      expect(r.overrides.shardsMaxLines).toBeUndefined();
      expect(r.findings).toHaveLength(1);
    });
  }
});

describe("validateConfigOverrides — the other four fields + unknown keys", () => {
  test("linkerBrittlenessSoftCap: malformed value rejected", () => {
    const r = validateConfigOverrides({ linkerBrittlenessSoftCap: "40" });
    expect(r.overrides.linkerBrittlenessSoftCap).toBeUndefined();
    expect(r.findings).toHaveLength(1);
  });

  test("provenanceStatusTableFile: empty string rejected (must be non-empty)", () => {
    const r = validateConfigOverrides({ provenanceStatusTableFile: "" });
    expect(r.overrides.provenanceStatusTableFile).toBeUndefined();
    expect(r.findings).toHaveLength(1);
  });

  test("refsMinRunReportingLength: malformed value rejected", () => {
    const r = validateConfigOverrides({ refsMinRunReportingLength: null });
    expect(r.overrides.refsMinRunReportingLength).toBeUndefined();
    expect(r.findings).toHaveLength(1);
  });

  test("shardsPrefix: malformed (non-string) value rejected -- treated as unconfigured, not a sentinel", () => {
    const r = validateConfigOverrides({ shardsPrefix: 7 });
    expect(r.overrides.shardsPrefix).toBeUndefined();
    expect(r.findings).toHaveLength(1);
  });

  test("shardsPrefix: absent is legal (R12's own no-default contract), zero findings", () => {
    const r = validateConfigOverrides({});
    expect(r.findings).toEqual([]);
    expect(r.checked).toBe(0);
    expect(r.total).toBe(0);
  });

  test("an unrecognized key is dropped and reported, never silently applied", () => {
    const r = validateConfigOverrides({ shardsMxLines: 999 });
    expect((r.overrides as Record<string, unknown>).shardsMxLines).toBeUndefined();
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.message).toContain("unknown config key");
    expect(r.findings[0]!.message).toContain("shardsMxLines");
  });

  test("multiple simultaneous problems all get reported (never short-circuits after the first)", () => {
    const r = validateConfigOverrides({ phase: "typo", shardsMaxLines: "x", bogusKey: 1 });
    expect(r.findings).toHaveLength(3);
    expect(r.total).toBe(3);
    expect(r.checked).toBe(0);
  });
});

describe("configGate — surfaces _configValidation through the ordinary Gate pipeline", () => {
  test("no _configValidation attached: clean pass, zero/zero coverage", () => {
    const result = configGate.run(snapshotFromFiles({}), DEFAULT_GATE_CONFIG);
    expect(result.findings).toEqual([]);
    expect(result.coverage).toEqual([
      { gate: "config", unit: expect.stringContaining("config field(s)"), checked: 0, total: 0 },
    ]);
  });

  test("an attached validation summary is passed straight through, findings and coverage both", () => {
    const config = mergeGateConfig({});
    config._configValidation = {
      findings: [{ severity: "ERROR", path: ".rk/config.json", line: 1, message: "phase: invalid", structural: true }],
      checked: 2,
      total: 3,
    };
    const result = configGate.run(snapshotFromFiles({}), config);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toBe("phase: invalid");
    expect(result.coverage[0]).toMatchObject({ gate: "config", checked: 2, total: 3 });
  });

  test("snapshot content is irrelevant -- config validity never depends on repo files", () => {
    const config = mergeGateConfig({});
    config._configValidation = { findings: [], checked: 0, total: 0 };
    const a = configGate.run(snapshotFromFiles({}), config);
    const b = configGate.run(snapshotFromFiles({ "foo.md": "bar" }), config);
    expect(a).toEqual(b);
  });
});

// corpus/config/config-01 and config-02 (rk-xbm): red fixtures for the two consequences named in
// the finding, following the same repo/ + expected.json shape every other corpus/<gate>/<id>/
// directory uses (corpus/README.md's "Fixture directory layout"). NOT auto-discovered by
// src/corpus/{discovery,run}.ts -- `GATE_DIRS` there is a fixed 6-entry tuple (defs, linker, refs,
// provenance, runs, shards) that does not include "config", and EXPECTED_FIXTURE_COUNT lives in
// that same out-of-scope file (see this WP's file-scope boundary). This describe block loads each
// fixture's repo/.rk/config.json directly through `loadGateConfig` + `configGate` -- the same two
// calls `src/cli/check.ts` makes -- and asserts its `expected.json` subset-matches, exactly the
// check src/corpus/run.ts's `runFixture` would perform once a follow-up WP wires `GATE_DIRS` up
// (adding "config" there plus bumping EXPECTED_FIXTURE_COUNT by 2 is the ONLY wiring needed).
describe("corpus/config/* fixtures (rk-xbm) -- proven directly, pending GATE_DIRS wiring", () => {
  interface ExpectedJson {
    verdict: "pass" | "fail";
    findings: ExpectedFinding[];
    exit_code: number;
    coverage?: { checked: number; total: number };
  }

  async function runConfigFixture(id: string) {
    const fixtureDir = join(import.meta.dir, "..", "..", "corpus", "config", id);
    const expected: ExpectedJson = JSON.parse(readFileSync(join(fixtureDir, "expected.json"), "utf8"));
    const config = await loadGateConfig(join(fixtureDir, "repo"));
    const result = configGate.run(snapshotFromFiles({}), config);
    return { expected, result };
  }

  test("config-01 (phase: typo): subset-matches its expected.json, verdict fail, exit 1", async () => {
    const { expected, result } = await runConfigFixture("config-01");
    expect(unmatchedExpectations(result.findings, expected.findings)).toEqual([]);
    const hasError = result.findings.some((f) => f.severity === "ERROR");
    expect(hasError).toBe(expected.verdict === "fail");
    expect(hasError ? 1 : 0).toBe(expected.exit_code);
    expect(result.coverage[0]!.checked).toBe(expected.coverage!.checked);
    expect(result.coverage[0]!.total).toBe(expected.coverage!.total);
  });

  test("config-02 (shardsMaxLines: 'garbage'): subset-matches its expected.json, verdict fail, exit 1", async () => {
    const { expected, result } = await runConfigFixture("config-02");
    expect(unmatchedExpectations(result.findings, expected.findings)).toEqual([]);
    const hasError = result.findings.some((f) => f.severity === "ERROR");
    expect(hasError).toBe(expected.verdict === "fail");
    expect(hasError ? 1 : 0).toBe(expected.exit_code);
    expect(result.coverage[0]!.checked).toBe(expected.coverage!.checked);
    expect(result.coverage[0]!.total).toBe(expected.coverage!.total);
  });
});
