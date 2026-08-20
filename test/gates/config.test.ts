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

  test("northStarId (M2.5): a non-empty string passes through", () => {
    const r = validateConfigOverrides({ northStarId: "thm-north-star" });
    expect(r.overrides.northStarId).toBe("thm-north-star");
    expect(r.findings).toEqual([]);
  });

  test("northStarId: malformed (non-string / empty) value rejected -- treated as unconfigured", () => {
    for (const bad of [7, "", null]) {
      const r = validateConfigOverrides({ northStarId: bad });
      expect(r.overrides.northStarId).toBeUndefined();
      expect(r.findings).toHaveLength(1);
      expect(mergeGateConfig(r.overrides).northStarId).toBeUndefined();
    }
  });

  test("workers (M3.2): a well-formed value passes through", () => {
    const raw = { assignments: { prover: { l5: { backend: "claude", fallbacks: ["codex"] } } } };
    const r = validateConfigOverrides({ workers: raw });
    expect(r.overrides.workers).toEqual({ assignments: { prover: { l5: { backend: "claude", fallbacks: ["codex"] } } } });
    expect(r.findings).toEqual([]);
    expect(r.checked).toBe(1);
    expect(r.total).toBe(1);
  });

  test("workers: a malformed value drops the WHOLE field, one ERROR, merge falls back to undefined", () => {
    const r = validateConfigOverrides({ workers: { assignments: { wizard: { l5: { backend: "claude" } } } } });
    expect(r.overrides.workers).toBeUndefined();
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ severity: "ERROR", path: ".rk/config.json", structural: true });
    expect(r.findings[0]!.message).toContain("workers");
    expect(mergeGateConfig(r.overrides).workers).toBeUndefined();
  });

  test("workers: absent is legal (no campaign has configured a backend registry yet), zero findings", () => {
    const r = validateConfigOverrides({});
    expect(r.overrides.workers).toBeUndefined();
    expect(r.findings).toEqual([]);
  });

  // rk-wkzh (P2, Gate 3 quote-at-locus): the new tolerance field gets the SAME four-place wiring
  // every other per-repo parameter has — interface, DEFAULT_GATE_CONFIG, KNOWN_CONFIG_KEYS, and a
  // validation branch. A field wired in three of the four places would either be silently
  // unconfigurable or reported as an "unknown config key" to anyone who set it.
  test("refsLocusToleranceLines: default is 50 lines", () => {
    expect(DEFAULT_GATE_CONFIG.refsLocusToleranceLines).toBe(50);
  });

  test("refsLocusToleranceLines: a valid positive number passes through, and is a KNOWN key", () => {
    const r = validateConfigOverrides({ refsLocusToleranceLines: 120 });
    expect(r.overrides.refsLocusToleranceLines).toBe(120);
    expect(r.findings).toEqual([]);
    expect(r.checked).toBe(1);
    expect(r.total).toBe(1);
  });

  test("refsLocusToleranceLines: malformed values are rejected, merge falls back to the default", () => {
    for (const bad of [0, -1, NaN, Infinity, "50", null]) {
      const r = validateConfigOverrides({ refsLocusToleranceLines: bad });
      expect(r.overrides.refsLocusToleranceLines).toBeUndefined();
      expect(r.findings).toHaveLength(1);
      expect(r.findings[0]!.message).toContain("refsLocusToleranceLines");
      expect(mergeGateConfig(r.overrides).refsLocusToleranceLines).toBe(50);
    }
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

  test("snapshot content is irrelevant when no conventionProfile is configured", () => {
    const config = mergeGateConfig({});
    config._configValidation = { findings: [], checked: 0, total: 0 };
    const a = configGate.run(snapshotFromFiles({}), config);
    const b = configGate.run(snapshotFromFiles({ "foo.md": "bar" }), config);
    expect(a).toEqual(b);
  });
});

// rk-5lzf (Tier A, LB5): `conventionProfile` is the ONE config value whose validity depends on repo
// CONTENT, so it is checked inside the gate, against the snapshot — see src/gates/profile.ts for
// the profile schema's own unit tests (test/gates/profile.test.ts).
describe("configGate — convention profile (rk-5lzf)", () => {
  const PROFILE = {
    schema_version: "1",
    name: "qpcp",
    version: 1,
    tracked_classes: [
      { class: "promise-gap", description: "the promise gap", symbols: ["\\epsilon"], blessed: "\\gapfrac", symbols_must_be_registered: true },
    ],
    lattices: {},
    choices: {},
    enums: {},
  };

  test("unconfigured: the coverage line SAYS so rather than staying silent", () => {
    const result = configGate.run(snapshotFromFiles({}), mergeGateConfig({}));
    expect(result.coverage[0]!.unit).toContain("no convention profile configured");
    expect(result.findings).toEqual([]);
  });

  test("a valid profile adds one checked unit and names itself in the coverage line", () => {
    const snap = snapshotFromFiles({ ".rk/conventions/qpcp.v1.json": JSON.stringify(PROFILE) });
    const result = configGate.run(snap, mergeGateConfig({ conventionProfile: "qpcp.v1" }));
    expect(result.findings).toEqual([]);
    expect(result.coverage[0]).toMatchObject({ checked: 1, total: 1 });
    expect(result.coverage[0]!.unit).toContain('convention profile "qpcp.v1" 1/1 valid');
  });

  test("an UNKNOWN profile is a structural ERROR, never degraded to the unconfigured state", () => {
    const result = configGate.run(snapshotFromFiles({}), mergeGateConfig({ conventionProfile: "qpcp.v1" }));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.structural).toBe(true);
    expect(result.coverage[0]).toMatchObject({ checked: 0, total: 1 });
  });

  test("profile findings compose with the ordinary config-field findings, both counted", () => {
    const config = mergeGateConfig({ conventionProfile: "qpcp.v1" });
    config._configValidation = {
      findings: [{ severity: "ERROR", path: ".rk/config.json", line: 1, message: "phase: invalid", structural: true }],
      checked: 1,
      total: 2,
    };
    const result = configGate.run(snapshotFromFiles({}), config);
    expect(result.findings).toHaveLength(2);
    expect(result.coverage[0]).toMatchObject({ checked: 1, total: 3 });
  });
});

describe("validateConfigOverrides — conventionProfile", () => {
  test("a non-empty string passes through", () => {
    const r = validateConfigOverrides({ conventionProfile: "qpcp.v1" });
    expect(r.findings).toEqual([]);
    expect(r.overrides.conventionProfile).toBe("qpcp.v1");
    expect(r.checked).toBe(1);
  });

  test("an empty string / non-string is dropped with one loud ERROR, never a sentinel", () => {
    for (const v of ["", 3, null, {}]) {
      const r = validateConfigOverrides({ conventionProfile: v });
      expect(r.findings).toHaveLength(1);
      expect(r.findings[0]!.message).toContain("conventionProfile");
      expect("conventionProfile" in r.overrides).toBe(false);
      expect(r.checked).toBe(0);
      expect(r.total).toBe(1);
    }
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
