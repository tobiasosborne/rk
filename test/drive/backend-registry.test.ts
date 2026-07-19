// 1:1 test file for src/drive/backend-registry.ts (M3.2) — `validateWorkersConfig` (the untrusted
// `.rk/config.json` `workers` field's shape check, rk-xbm discipline: unknown keys rejected at
// every level, ANY malformation drops the whole field) and `BackendRegistry` (the per-(role,tier)
// assignment + ordered-fallback lookup a driver uses).

import { describe, expect, test } from "bun:test";
import { BackendRegistry, validateWorkersConfig, type WorkersConfig } from "../../src/drive/backend-registry";

describe("validateWorkersConfig — valid shapes", () => {
  test("a full, well-formed config passes through unchanged", () => {
    const raw = {
      assignments: {
        prover: { l5: { backend: "claude", fallbacks: ["codex"] }, hard: { backend: "claude", fallbacks: [] } },
        verifier: { l5: { backend: "codex", fallbacks: ["claude"] } },
      },
    };
    const r = validateWorkersConfig(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.config.assignments.prover?.l5).toEqual({ backend: "claude", fallbacks: ["codex"] });
    expect(r.config.assignments.verifier?.l5).toEqual({ backend: "codex", fallbacks: ["claude"] });
  });

  test("fallbacks is optional and defaults to an empty array", () => {
    const r = validateWorkersConfig({ assignments: { reviewer: { hard: { backend: "claude" } } } });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.config.assignments.reviewer?.hard).toEqual({ backend: "claude", fallbacks: [] });
  });

  test("an empty assignments object is legal (nothing configured yet)", () => {
    const r = validateWorkersConfig({ assignments: {} });
    expect(r.ok).toBe(true);
  });
});

describe("validateWorkersConfig — malformed shapes are rejected, never partially applied", () => {
  test("a non-object raw value is rejected", () => {
    for (const bad of [null, "x", 5, [], undefined]) {
      const r = validateWorkersConfig(bad);
      expect(r.ok).toBe(false);
    }
  });

  test("missing 'assignments' is rejected", () => {
    const r = validateWorkersConfig({});
    expect(r.ok).toBe(false);
  });

  test("an unknown top-level key is rejected", () => {
    const r = validateWorkersConfig({ assignments: {}, bogus: 1 });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected rejection");
    expect(r.issues.some((i) => i.message.includes("bogus"))).toBe(true);
  });

  test("an unknown role key is rejected", () => {
    const r = validateWorkersConfig({ assignments: { wizard: { l5: { backend: "claude" } } } });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected rejection");
    expect(r.issues.some((i) => i.message.includes("wizard"))).toBe(true);
  });

  test("an unknown tier key is rejected", () => {
    const r = validateWorkersConfig({ assignments: { prover: { medium: { backend: "claude" } } } });
    expect(r.ok).toBe(false);
  });

  test("a non-object entry is rejected", () => {
    const r = validateWorkersConfig({ assignments: { prover: { l5: "claude" } } });
    expect(r.ok).toBe(false);
  });

  test("a missing/blank backend is rejected", () => {
    for (const bad of [{}, { backend: "" }, { backend: 7 }]) {
      const r = validateWorkersConfig({ assignments: { prover: { l5: bad } } });
      expect(r.ok).toBe(false);
    }
  });

  test("an unknown key inside an entry is rejected", () => {
    const r = validateWorkersConfig({ assignments: { prover: { l5: { backend: "claude", extra: true } } } });
    expect(r.ok).toBe(false);
  });

  test("fallbacks must be an array of non-blank strings", () => {
    for (const bad of ["not-array", ["", "ok"], [7], null]) {
      const r = validateWorkersConfig({ assignments: { prover: { l5: { backend: "claude", fallbacks: bad } } } });
      expect(r.ok).toBe(false);
    }
  });

  test("multiple simultaneous problems are all collected, never short-circuited after the first", () => {
    const r = validateWorkersConfig({
      assignments: { prover: { l5: { backend: "" }, badtier: { backend: "claude" } }, wizard: { l5: { backend: "claude" } } },
      bogus: 1,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected rejection");
    expect(r.issues.length).toBeGreaterThanOrEqual(3);
  });
});

describe("BackendRegistry", () => {
  function config(): WorkersConfig {
    return {
      assignments: {
        prover: { l5: { backend: "claude", fallbacks: ["codex"] } },
        verifier: { l5: { backend: "human", fallbacks: ["codex", "claude"] } },
      },
    };
  }

  test("chainFor returns [] for an unconfigured (role, tier) pair", () => {
    const registry = new BackendRegistry(config(), []);
    expect(registry.chainFor("reviewer", "hard")).toEqual([]);
  });

  test("chainFor returns [primary, ...fallbacks] in order", () => {
    const registry = new BackendRegistry(config(), []);
    expect(registry.chainFor("verifier", "l5")).toEqual(["human", "codex", "claude"]);
  });

  test("resolve returns the primary backend when it is registered", () => {
    const claude = { name: "claude" };
    const registry = new BackendRegistry(config(), [claude]);
    expect(registry.resolve("prover", "l5")).toBe(claude);
  });

  test("resolve skips an unregistered primary and falls through to the first registered fallback", () => {
    const codex = { name: "codex" };
    const registry = new BackendRegistry(config(), [codex]); // "human" (the primary) is never registered
    expect(registry.resolve("verifier", "l5")).toBe(codex);
  });

  test("resolve returns undefined when every configured name (primary + fallbacks) is unregistered", () => {
    const registry = new BackendRegistry(config(), []);
    expect(registry.resolve("verifier", "l5")).toBeUndefined();
  });

  test("resolve returns undefined for an unconfigured (role, tier) pair even with backends registered", () => {
    const claude = { name: "claude" };
    const registry = new BackendRegistry(config(), [claude]);
    expect(registry.resolve("reviewer", "hard")).toBeUndefined();
  });

  test("get returns a registered backend by name, undefined otherwise", () => {
    const claude = { name: "claude" };
    const registry = new BackendRegistry(config(), [claude]);
    expect(registry.get("claude")).toBe(claude);
    expect(registry.get("nonexistent")).toBeUndefined();
  });
});
