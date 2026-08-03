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

  // rk-7hi (M3.5 STOP-2 blocker): a per-assignment `model` field, so the TJO worker-model pin
  // ("claude side = claude-opus-4-8, codex side = its default") becomes expressible.
  test("a well-formed 'model' field is accepted and threaded through", () => {
    const r = validateWorkersConfig({
      assignments: { prover: { hard: { backend: "claude", model: "claude-opus-4-8", fallbacks: [] } } },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.config.assignments.prover?.hard).toEqual({ backend: "claude", fallbacks: [], model: "claude-opus-4-8" });
  });

  test("'model' is optional -- an entry with none is unaffected", () => {
    const r = validateWorkersConfig({ assignments: { verifier: { hard: { backend: "codex", fallbacks: [] } } } });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.config.assignments.verifier?.hard).toEqual({ backend: "codex", fallbacks: [] });
    expect(r.config.assignments.verifier?.hard).not.toHaveProperty("model");
  });

  test("an empty assignments object is legal (nothing configured yet)", () => {
    const r = validateWorkersConfig({ assignments: {} });
    expect(r.ok).toBe(true);
  });

  // rk-k0m1 (P2, RUN-REPORT-12): the per-assignment turn/session timeout overrides. Same optional-
  // but-strict discipline as `model`: absent is legal, present-and-well-formed is threaded through.
  test("well-formed per-assignment turnTimeoutMs/sessionTimeoutMs are accepted and threaded through", () => {
    const r = validateWorkersConfig({
      assignments: { prover: { hard: { backend: "codex", fallbacks: [], turnTimeoutMs: 600_000, sessionTimeoutMs: 300_000 } } },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.config.assignments.prover?.hard).toEqual({ backend: "codex", fallbacks: [], turnTimeoutMs: 600_000, sessionTimeoutMs: 300_000 });
  });

  test("well-formed workers-LEVEL turnTimeoutMs/sessionTimeoutMs are accepted (campaign-wide defaults)", () => {
    const r = validateWorkersConfig({ assignments: {}, turnTimeoutMs: 240_000, sessionTimeoutMs: 180_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.config.turnTimeoutMs).toBe(240_000);
    expect(r.config.sessionTimeoutMs).toBe(180_000);
  });

  test("the timeout fields stay optional -- an entry/config with neither carries neither key", () => {
    const r = validateWorkersConfig({ assignments: { verifier: { hard: { backend: "codex" } } } });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.config).not.toHaveProperty("turnTimeoutMs");
    expect(r.config).not.toHaveProperty("sessionTimeoutMs");
    expect(r.config.assignments.verifier?.hard).not.toHaveProperty("turnTimeoutMs");
    expect(r.config.assignments.verifier?.hard).not.toHaveProperty("sessionTimeoutMs");
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

  // rk-7hi red cases: 'model' present but malformed must be rejected loudly, never coerced or
  // silently dropped -- same discipline as 'backend' above.
  test("an EMPTY-STRING 'model' is rejected", () => {
    const r = validateWorkersConfig({ assignments: { prover: { hard: { backend: "claude", model: "" } } } });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected rejection");
    expect(r.issues.some((i) => i.path.endsWith(".model") && i.message.includes("non-blank string"))).toBe(true);
  });

  test("a NON-STRING 'model' (number) is rejected", () => {
    const r = validateWorkersConfig({ assignments: { prover: { hard: { backend: "claude", model: 123 } } } });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected rejection");
    expect(r.issues.some((i) => i.path.endsWith(".model"))).toBe(true);
  });

  test("an unrelated unknown key ('foo') alongside a valid model is STILL rejected -- 'model' being accepted does not loosen other unknown-key checking", () => {
    const r = validateWorkersConfig({ assignments: { prover: { hard: { backend: "claude", model: "claude-opus-4-8", foo: 1 } } } });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected rejection");
    expect(r.issues.some((i) => i.message.includes("foo"))).toBe(true);
  });

  // rk-k0m1 red cases: a PRESENT-but-invalid timeout is a loading-edge ERROR, exactly like a blank
  // `model` -- never a silent fallback to DEFAULT_TURN_TIMEOUT_MS (a zero/negative/NaN ceiling would
  // otherwise make every turn time out instantly, or silently keep the 120s ceiling the operator
  // believed they had raised).
  test("a ZERO turnTimeoutMs is rejected", () => {
    const r = validateWorkersConfig({ assignments: { prover: { hard: { backend: "codex", turnTimeoutMs: 0 } } } });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected rejection");
    expect(r.issues.some((i) => i.path.endsWith(".turnTimeoutMs") && i.message.includes("positive"))).toBe(true);
  });

  test("a NEGATIVE, NON-INTEGER, NON-FINITE, STRING, or null timeout value is rejected at either level", () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "600000", null, true]) {
      const perAssignment = validateWorkersConfig({ assignments: { prover: { hard: { backend: "codex", turnTimeoutMs: bad } } } });
      expect(perAssignment.ok).toBe(false);
      const perAssignmentSession = validateWorkersConfig({ assignments: { prover: { hard: { backend: "codex", sessionTimeoutMs: bad } } } });
      expect(perAssignmentSession.ok).toBe(false);
      const topLevel = validateWorkersConfig({ assignments: {}, turnTimeoutMs: bad });
      expect(topLevel.ok).toBe(false);
      const topLevelSession = validateWorkersConfig({ assignments: {}, sessionTimeoutMs: bad });
      expect(topLevelSession.ok).toBe(false);
    }
  });

  test("an invalid workers-LEVEL timeout names its own path, not an assignment's", () => {
    const r = validateWorkersConfig({ assignments: {}, sessionTimeoutMs: -5 });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected rejection");
    expect(r.issues.some((i) => i.path === "workers.sessionTimeoutMs")).toBe(true);
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

  // rk-7hi: modelFor is the read side of the per-assignment model pin.
  test("modelFor returns the assignment's explicit model when the config entry carries one", () => {
    const withModel: WorkersConfig = { assignments: { prover: { hard: { backend: "claude", model: "claude-opus-4-8", fallbacks: [] } } } };
    const registry = new BackendRegistry(withModel, []);
    expect(registry.modelFor("prover", "hard")).toBe("claude-opus-4-8");
  });

  test("modelFor returns undefined when the assignment carries no model field", () => {
    const registry = new BackendRegistry(config(), []);
    expect(registry.modelFor("prover", "l5")).toBeUndefined();
  });

  test("modelFor returns undefined for an unconfigured (role, tier) pair", () => {
    const registry = new BackendRegistry(config(), []);
    expect(registry.modelFor("reviewer", "hard")).toBeUndefined();
  });

  // rk-k0m1: timeoutsFor is the read side of the timeout overrides. Precedence, most specific
  // first: per-assignment > workers-level > (absent -- driver-live.ts's DEFAULT_* then applies).
  const timeoutConfig = (): WorkersConfig => ({
    turnTimeoutMs: 240_000,
    sessionTimeoutMs: 180_000,
    assignments: {
      prover: { hard: { backend: "codex", fallbacks: [], turnTimeoutMs: 600_000 } },
      verifier: { hard: { backend: "claude", fallbacks: [] } },
    },
  });

  test("timeoutsFor: the per-assignment value WINS over the workers-level default", () => {
    const registry = new BackendRegistry(timeoutConfig(), []);
    expect(registry.timeoutsFor("prover", "hard").turnTimeoutMs).toBe(600_000);
  });

  test("timeoutsFor: the workers-level default applies per-FIELD -- the same assignment's un-overridden sessionTimeoutMs still inherits it", () => {
    const registry = new BackendRegistry(timeoutConfig(), []);
    expect(registry.timeoutsFor("prover", "hard").sessionTimeoutMs).toBe(180_000);
  });

  test("timeoutsFor: a role with no override of its own inherits the workers-level defaults, and one role's override never leaks into another", () => {
    const registry = new BackendRegistry(timeoutConfig(), []);
    expect(registry.timeoutsFor("verifier", "hard")).toEqual({ turnTimeoutMs: 240_000, sessionTimeoutMs: 180_000 });
  });

  test("timeoutsFor: nothing configured anywhere yields an EMPTY object -- never a fabricated number (driver-live.ts's DEFAULT_* stays the one fallback)", () => {
    const registry = new BackendRegistry(config(), []);
    expect(registry.timeoutsFor("prover", "l5")).toEqual({});
    expect(registry.timeoutsFor("reviewer", "hard")).toEqual({});
  });
});
