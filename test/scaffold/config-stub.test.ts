import { describe, expect, test } from "bun:test";
import { buildRkConfig, buildOraclesStub } from "../../src/scaffold/config-stub";
import { NORTH_STAR_SHARD_ID } from "../../src/scaffold/north-star";

describe("buildRkConfig (pure)", () => {
  test("carries exactly the four named GateConfig keys, nothing else", () => {
    const cfg = buildRkConfig({ phase: "exploration", shardsPrefix: "MC", brittlenessSoftCap: 26 });
    expect(Object.keys(cfg).sort()).toEqual(["linkerBrittlenessSoftCap", "northStarId", "phase", "shardsPrefix"]);
    expect(cfg).toEqual({
      phase: "exploration",
      shardsPrefix: "MC",
      linkerBrittlenessSoftCap: 26,
      northStarId: NORTH_STAR_SHARD_ID,
    });
  });

  test("honors an overridden brittleness cap and phase", () => {
    const cfg = buildRkConfig({ phase: "consolidation", shardsPrefix: "X", brittlenessSoftCap: 40 });
    expect(cfg.linkerBrittlenessSoftCap).toBe(40);
    expect(cfg.phase).toBe("consolidation");
  });

  // Finding M3: PRD C2's critical-path provenance check is the tool's central continuous validity
  // guarantee, and it is presence-conditional on `northStarId` — unset, it covers NOTHING while
  // the board reports it satisfied. The id must be bound to the shard `rk init` itself seeds,
  // never left for the user to discover in rk's own docs.
  test("northStarId is bound to the seeded north-star shard, never left unset", () => {
    const cfg = buildRkConfig({ phase: "exploration", shardsPrefix: "MC", brittlenessSoftCap: 26 });
    expect(cfg.northStarId).toBe(NORTH_STAR_SHARD_ID);
    expect(cfg.northStarId.length).toBeGreaterThan(0);
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
