import { describe, expect, test } from "bun:test";
import { buildRkConfig, buildOraclesStub } from "../../src/scaffold/config-stub";

describe("buildRkConfig (pure)", () => {
  test("carries exactly the three named GateConfig keys, nothing else", () => {
    const cfg = buildRkConfig({ phase: "exploration", shardsPrefix: "MC", brittlenessSoftCap: 26 });
    expect(Object.keys(cfg).sort()).toEqual(["linkerBrittlenessSoftCap", "phase", "shardsPrefix"]);
    expect(cfg).toEqual({ phase: "exploration", shardsPrefix: "MC", linkerBrittlenessSoftCap: 26 });
  });

  test("honors an overridden brittleness cap and phase", () => {
    const cfg = buildRkConfig({ phase: "consolidation", shardsPrefix: "X", brittlenessSoftCap: 40 });
    expect(cfg.linkerBrittlenessSoftCap).toBe(40);
    expect(cfg.phase).toBe("consolidation");
  });
});

describe("buildOraclesStub (pure)", () => {
  test("is empty but documented", () => {
    const stub = buildOraclesStub();
    expect(stub.oracles).toEqual([]);
    expect(stub.$schema_note.length).toBeGreaterThan(0);
    expect(stub.$schema_note).toContain("id");
    expect(stub.$schema_note).toContain("kind");
    expect(stub.$schema_note).toContain("backend");
    expect(stub.$schema_note).toContain("role");
  });
});
