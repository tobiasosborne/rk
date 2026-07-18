import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_GATE_CONFIG, mergeGateConfig } from "../../src/gates/config";
import { loadGateConfig } from "../../src/store/config-load";

describe("mergeGateConfig (pure)", () => {
  test("undefined/null overrides yield an untouched copy of the defaults", () => {
    expect(mergeGateConfig(undefined)).toEqual(DEFAULT_GATE_CONFIG);
    expect(mergeGateConfig(null)).toEqual(DEFAULT_GATE_CONFIG);
    // a copy, not the same object reference (callers must not mutate the shared default)
    expect(mergeGateConfig(undefined)).not.toBe(DEFAULT_GATE_CONFIG);
  });

  test("a partial override replaces only the named keys", () => {
    const merged = mergeGateConfig({ linkerBrittlenessSoftCap: 40 });
    expect(merged.linkerBrittlenessSoftCap).toBe(40);
    expect(merged.shardsMaxLines).toBe(DEFAULT_GATE_CONFIG.shardsMaxLines);
  });
});

describe("phase (M1.3) defaulting — CLAUDE.md L2: a fresh clone must never silently run loose", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test("mergeGateConfig(undefined) resolves phase to consolidation, the strictest default", () => {
    expect(mergeGateConfig(undefined).phase).toBe("consolidation");
  });

  test("an explicit phase override is honored", () => {
    expect(mergeGateConfig({ phase: "exploration" }).phase).toBe("exploration");
  });

  test("loadGateConfig: absent .rk/config.json resolves phase to consolidation", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-config-test-"));
    dirs.push(root);
    const cfg = await loadGateConfig(root);
    expect(cfg.phase).toBe("consolidation");
  });

  test("loadGateConfig: a present .rk/config.json with phase:exploration is honored", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-config-test-"));
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "config.json"), JSON.stringify({ phase: "exploration" }));
    const cfg = await loadGateConfig(root);
    expect(cfg.phase).toBe("exploration");
  });
});

describe("loadGateConfig (edge: reads .rk/config.json)", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test("defaults, untouched, when .rk/config.json is absent", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-config-test-"));
    dirs.push(root);
    const cfg = await loadGateConfig(root);
    expect(cfg).toEqual(DEFAULT_GATE_CONFIG);
  });

  test("merges a present .rk/config.json over the defaults", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-config-test-"));
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "config.json"), JSON.stringify({ shardsMaxLines: 350 }));
    const cfg = await loadGateConfig(root);
    expect(cfg.shardsMaxLines).toBe(350);
    expect(cfg.linkerBrittlenessSoftCap).toBe(DEFAULT_GATE_CONFIG.linkerBrittlenessSoftCap);
  });

  test("falls back to defaults on unparseable JSON, never throws", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-config-test-"));
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "config.json"), "{ not json");
    const cfg = await loadGateConfig(root);
    expect(cfg).toEqual(DEFAULT_GATE_CONFIG);
  });
});
