// 1:1 test file for src/drive/driver-live-model.ts. Existing coverage of `resolveModel`/
// `familyForBackend`'s PRECEDENCE lives in test/drive/driver-live.test.ts (Lane-1 territory, out of
// this WP's file scope, deliberately untouched) via driver-live.ts's re-export -- this file adds the
// dedicated coverage for rk-le9's fix (the codex account-default sentinel) plus a lock-in regression
// for the "family is derived from backend name only, never from any model string" invariant, tested
// directly against the module that actually owns both functions.

import { describe, expect, test } from "bun:test";
import { BackendRegistry, type WorkersConfig } from "../../src/drive/backend-registry";
import type { WorkerBackend } from "../../src/drive/backend-types";
import { CODEX_ACCOUNT_DEFAULT_MODEL, DEFAULT_MODEL_BY_BACKEND, familyForBackend, resolveModel } from "../../src/drive/driver-live-model";

function registryWith(config: WorkersConfig, names: string[]): BackendRegistry<WorkerBackend> {
  return new BackendRegistry<WorkerBackend>(config, names.map((name) => ({ name }) as WorkerBackend));
}

// rk-le9: no model id may be hard-coded in a way the user cannot override, and the codex default
// specifically must never be a real model id a ChatGPT-account codex login could 400-reject.
describe("rk-le9 — DEFAULT_MODEL_BY_BACKEND.codex is a sentinel, never a hard-coded real model id", () => {
  test("resolveModel falls back to CODEX_ACCOUNT_DEFAULT_MODEL for codex when nothing is configured", () => {
    const registry = registryWith({ assignments: { verifier: { hard: { backend: "codex", fallbacks: [] } } } }, ["codex"]);
    expect(resolveModel(registry, "verifier", "hard", undefined)).toBe(CODEX_ACCOUNT_DEFAULT_MODEL);
    expect(resolveModel(registry, "verifier", "hard", undefined)).toBe(DEFAULT_MODEL_BY_BACKEND.codex);
  });

  test("the sentinel is a non-blank string (must still round-trip through identity.ts's encodeVerifierSeam)", () => {
    expect(CODEX_ACCOUNT_DEFAULT_MODEL.trim().length).toBeGreaterThan(0);
    expect(CODEX_ACCOUNT_DEFAULT_MODEL).not.toBe("");
    expect(CODEX_ACCOUNT_DEFAULT_MODEL.includes("|")).toBe(false); // the seam delimiter
  });

  test("the sentinel is NOT a real, dispatchable-looking codex model id (the exact old bug: gpt-5.1-codex)", () => {
    expect(CODEX_ACCOUNT_DEFAULT_MODEL).not.toBe("gpt-5.1-codex");
    expect(CODEX_ACCOUNT_DEFAULT_MODEL.startsWith("gpt-")).toBe(false);
  });

  test("an explicit per-assignment model for codex still wins over the sentinel (user override always available)", () => {
    const registry = registryWith(
      { assignments: { verifier: { hard: { backend: "codex", model: "gpt-5.6-sol", fallbacks: [] } } } },
      ["codex"],
    );
    expect(resolveModel(registry, "verifier", "hard", undefined)).toBe("gpt-5.6-sol");
  });

  test("an explicit global --model flag still wins over the sentinel when no per-assignment model is set", () => {
    const registry = registryWith({ assignments: { verifier: { hard: { backend: "codex", fallbacks: [] } } } }, ["codex"]);
    expect(resolveModel(registry, "verifier", "hard", "gpt-5.6-sol-explicit")).toBe("gpt-5.6-sol-explicit");
  });

  test("claude's default is unaffected -- still a real, `--model`-flag-mandatory model id (claude has no account-implicit-default concept)", () => {
    const registry = registryWith({ assignments: { verifier: { hard: { backend: "claude", fallbacks: [] } } } }, ["claude"]);
    expect(resolveModel(registry, "verifier", "hard", undefined)).toBe(DEFAULT_MODEL_BY_BACKEND.claude);
    expect(DEFAULT_MODEL_BY_BACKEND.claude).not.toBe(CODEX_ACCOUNT_DEFAULT_MODEL);
  });
});

// rk-le9 (cross-vendor family-check review requirement): confirm familyForBackend is completely
// independent of any model string, so an arbitrary/user-supplied model id (including the new
// sentinel) can never perturb which family a session's identity records.
describe("familyForBackend — model-independence lock-in (rk-le9 review requirement)", () => {
  test("codex is always family 'gpt', regardless of which model resolveModel picked for it", () => {
    const registry = registryWith({ assignments: { verifier: { hard: { backend: "codex", model: "some-arbitrary-user-model-string", fallbacks: [] } } } }, ["codex"]);
    const resolvedModel = resolveModel(registry, "verifier", "hard", undefined);
    expect(resolvedModel).toBe("some-arbitrary-user-model-string");
    expect(familyForBackend("codex")).toBe("gpt"); // unaffected by resolvedModel entirely
  });

  test("the account-default sentinel itself cannot perturb family either", () => {
    const registry = registryWith({ assignments: { verifier: { hard: { backend: "codex", fallbacks: [] } } } }, ["codex"]);
    const resolvedModel = resolveModel(registry, "verifier", "hard", undefined);
    expect(resolvedModel).toBe(CODEX_ACCOUNT_DEFAULT_MODEL);
    expect(familyForBackend("codex")).toBe("gpt");
  });

  test("claude is always family 'claude'", () => {
    expect(familyForBackend("claude")).toBe("claude");
  });
});
