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
    // rk-xbm: loadGateConfig now always attaches `_configValidation` (the config-error side
    // channel `configGate` reads, src/gates/config.ts) -- nothing to validate here (no file at
    // all), so it's the empty summary. Compared field-by-field (not a bare toEqual against
    // DEFAULT_GATE_CONFIG) so this test states what changed, rather than silently widening.
    const { _configValidation, ...rest } = cfg;
    expect(rest).toEqual(DEFAULT_GATE_CONFIG);
    expect(_configValidation).toEqual({ findings: [], checked: 0, total: 0, overriddenKeys: [] });
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

  test("falls back to defaults on unparseable JSON, never throws, but is no longer silent", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-config-test-"));
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "config.json"), "{ not json");
    const cfg = await loadGateConfig(root);
    // rk-45m: the gate config VALUES still degrade to strict defaults (never throw, never a
    // partial/garbled merge) -- but this is no longer a SILENT degrade. The `phase` field
    // (per L2) sets in DEFAULT_GATE_CONFIG, but a loud, structural, non-demotable ERROR finding
    // now names the file and the parser's own complaint.
    const { _configValidation, ...rest } = cfg;
    expect(rest).toEqual(DEFAULT_GATE_CONFIG);
    expect(_configValidation!.findings).toHaveLength(1);
    expect(_configValidation!.checked).toBe(0);
    expect(_configValidation!.total).toBe(1);
    const finding = _configValidation!.findings[0]!;
    expect(finding.severity).toBe("ERROR");
    expect(finding.structural).toBe(true);
    expect(finding.path).toBe(".rk/config.json");
    // "which file, what the parser objected to" (rk-45m bar): message must name the file and
    // carry the underlying JSON.parse SyntaxError text, not a generic "invalid config" blurb.
    expect(finding.message).toContain(".rk/config.json");
    expect(finding.message).toMatch(/not valid JSON/i);
  });

  test("a single trailing comma (the exact incident named in rk-45m) is a loud finding, not a silent green run", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-config-test-"));
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "config.json"), '{ "phase": "consolidation", }');
    const cfg = await loadGateConfig(root);
    expect(cfg._configValidation!.findings).toHaveLength(1);
    expect(cfg._configValidation!.findings[0]!.structural).toBe(true);
  });

  test("valid JSON but wrong top-level shape (an array) is also a loud finding, never silently defaulted", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-config-test-"));
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "config.json"), "[1, 2, 3]");
    const cfg = await loadGateConfig(root);
    const { _configValidation, ...rest } = cfg;
    expect(rest).toEqual(DEFAULT_GATE_CONFIG);
    expect(_configValidation!.findings).toHaveLength(1);
    expect(_configValidation!.checked).toBe(0);
    expect(_configValidation!.total).toBe(1);
    expect(_configValidation!.findings[0]!.structural).toBe(true);
    expect(_configValidation!.findings[0]!.message).toMatch(/JSON object/i);
  });

  test("valid JSON but top-level null is also a loud finding (typeof null === 'object' trap)", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-config-test-"));
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "config.json"), "null");
    const cfg = await loadGateConfig(root);
    expect(cfg._configValidation!.findings).toHaveLength(1);
    expect(cfg._configValidation!.findings[0]!.structural).toBe(true);
  });

  // Mutation proof (rk-45m): temporarily reverting the JSON.parse catch block in
  // src/store/config-load.ts to `return mergeGateConfig(undefined)` with `noValidation()` (the
  // pre-fix behavior) makes the first and second tests above fail RED (`findings` empty instead
  // of length 1) -- confirmed by hand during implementation, then restored. Same for the
  // top-level-shape branch: reverting it to the old silent `noValidation()` return makes the
  // array/null tests above fail RED for the identical reason.
});

// rk-xbm (M1 review B1): config-load.ts:39's old `parsed as Partial<GateConfig>` cast let ANY
// JSON value through unvalidated. These tests reproduce the two concrete consequences named in
// the finding (a typo'd `phase`, a malformed `shardsMaxLines`) plus the general unknown-key case,
// through `loadGateConfig` end-to-end (the real edge a `.rk/config.json` typo actually hits).
describe("loadGateConfig — rk-xbm: every field runtime-validated, never silently accepted", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  async function withConfig(json: unknown): Promise<Awaited<ReturnType<typeof loadGateConfig>>> {
    const root = mkdtempSync(join(tmpdir(), "rk-config-test-"));
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "config.json"), JSON.stringify(json));
    return loadGateConfig(root);
  }

  test("phase: typo -- falls back to consolidation (never silently exploration), one loud ERROR", async () => {
    const cfg = await withConfig({ phase: "typo" });
    expect(cfg.phase).toBe("consolidation");
    const findings = cfg._configValidation!.findings;
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("ERROR");
    expect(findings[0]!.structural).toBe(true);
    expect(findings[0]!.path).toBe(".rk/config.json");
    expect(findings[0]!.message).toContain("phase");
    expect(findings[0]!.message).toContain("typo");
  });

  test("shardsMaxLines: 'garbage' -- falls back to the numeric default, one loud ERROR", async () => {
    const cfg = await withConfig({ shardsMaxLines: "garbage" });
    expect(cfg.shardsMaxLines).toBe(DEFAULT_GATE_CONFIG.shardsMaxLines);
    const findings = cfg._configValidation!.findings;
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("ERROR");
    expect(findings[0]!.message).toContain("shardsMaxLines");
    expect(findings[0]!.message).toContain("garbage");
  });

  test("shardsMaxLines: 0 and negative are rejected too (positive-number range check)", async () => {
    for (const bad of [0, -5, NaN]) {
      const cfg = await withConfig({ shardsMaxLines: bad });
      expect(cfg.shardsMaxLines).toBe(DEFAULT_GATE_CONFIG.shardsMaxLines);
      expect(cfg._configValidation!.findings).toHaveLength(1);
    }
  });

  test("unknown key -- dropped, one loud ERROR, never silently applied", async () => {
    const cfg = await withConfig({ shardsMxLines: 999 });
    expect((cfg as unknown as Record<string, unknown>).shardsMxLines).toBeUndefined();
    expect(cfg.shardsMaxLines).toBe(DEFAULT_GATE_CONFIG.shardsMaxLines);
    const findings = cfg._configValidation!.findings;
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("unknown config key");
    expect(findings[0]!.message).toContain("shardsMxLines");
  });

  test("a fully valid config produces zero validation findings and a checked==total coverage pair", async () => {
    const cfg = await withConfig({ phase: "exploration", shardsMaxLines: 350, shardsPrefix: "MC" });
    // LB6: `overriddenKeys` names exactly the known fields this config actually applied — the fact
    // a pure gate needs to tell an explicit override from a default it happens to equal.
    expect(cfg._configValidation).toEqual({
      findings: [], checked: 3, total: 3, overriddenKeys: ["phase", "shardsPrefix", "shardsMaxLines"],
    });
  });

  // Mutation proof: temporarily changing `if (v === "exploration" || v === "consolidation")` in
  // src/gates/config.ts's phase branch to just `if (true)` makes the first test above pass
  // `cfg.phase === "typo"` straight through -- confirmed RED by hand during implementation
  // (assertion `cfg.phase === "consolidation"` fails, receiving "typo" instead), then reverted.
});
