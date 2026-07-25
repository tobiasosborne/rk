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
import { MODEL_FAMILIES } from "../../src/drive/vocab";

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
    expect(familyForBackend("codex", "gpt")).toEqual({ ok: true, family: "gpt" }); // unaffected by resolvedModel entirely
  });

  test("the account-default sentinel itself cannot perturb family either", () => {
    const registry = registryWith({ assignments: { verifier: { hard: { backend: "codex", fallbacks: [] } } } }, ["codex"]);
    const resolvedModel = resolveModel(registry, "verifier", "hard", undefined);
    expect(resolvedModel).toBe(CODEX_ACCOUNT_DEFAULT_MODEL);
    expect(familyForBackend("codex", "gpt")).toEqual({ ok: true, family: "gpt" });
  });

  test("claude is always family 'claude'", () => {
    expect(familyForBackend("claude", "claude")).toEqual({ ok: true, family: "claude" });
  });

  // rk-9zd: the model string is not even a PARAMETER of this function any more — the family comes
  // from the backend's own registry-declared `modelFamily`. Structurally, no user-supplied model id
  // can reach it. This test states that property in the only way it can still be observed: the SAME
  // declared family survives every model resolveModel could possibly have picked.
  test("a user-supplied model id naming a DIFFERENT vendor cannot flip the declared family", () => {
    const registry = registryWith({ assignments: { verifier: { hard: { backend: "codex", model: "claude-opus-4-8", fallbacks: [] } } } }, ["codex"]);
    expect(resolveModel(registry, "verifier", "hard", undefined)).toBe("claude-opus-4-8");
    expect(familyForBackend("codex", "gpt")).toEqual({ ok: true, family: "gpt" });
    expect(familyForBackend("codex", "gpt")).not.toEqual({ ok: true, family: "claude" });
  });
});

// rk-9zd (BUG, Tier A — cross-vendor input): the OLD implementation was
// `backendName === "codex" ? "gpt" : "claude"`, so ANY unrecognized backend name silently claimed
// the `claude` family — fail-OPEN in a function feeding the cross-vendor rule, whose whole
// discipline in src/drive/cross-vendor.ts is to keep an UNKNOWN distinguishable from a KNOWN
// (`identity-unparseable` is never reported as `same-family`). PRD D8 anticipates "any future CLI
// that satisfies the worker contract", so a third backend WILL reach this.
describe("familyForBackend — rk-9zd: fails CLOSED on an undeclared/unrecognized family", () => {
  test("a backend that declares NO family is refused — and specifically does NOT become 'claude'", () => {
    const r = familyForBackend("mystery-cli", undefined);
    expect(r.ok).toBe(false);
    expect(r).not.toEqual({ ok: true, family: "claude" });
    if (!r.ok) expect(r.reason).toContain("mystery-cli");
  });

  test("a backend declaring a family OUTSIDE the closed MODEL_FAMILIES set is refused, never coerced", () => {
    const r = familyForBackend("mystery-cli", "openai");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("openai");
      expect(r.reason).toContain("claude, gpt, gemini");
    }
  });

  test("the backend NAME never decides the family: a backend NAMED 'claude' that declares 'gpt' is 'gpt'", () => {
    expect(familyForBackend("claude", "gpt")).toEqual({ ok: true, family: "gpt" });
  });

  test("the backend NAME never rescues a missing family either: a backend NAMED 'claude' with no declared family is refused", () => {
    expect(familyForBackend("claude", undefined).ok).toBe(false);
  });

  test("a non-string declared family (a hand-rolled/JSON-sourced backend record) is refused", () => {
    expect(familyForBackend("weird", 7).ok).toBe(false);
    expect(familyForBackend("weird", null).ok).toBe(false);
    expect(familyForBackend("weird", { family: "claude" }).ok).toBe(false);
  });

  test("every member of the closed MODEL_FAMILIES set resolves (coverage: checked 3/3, no silent skip)", () => {
    const families = [...MODEL_FAMILIES];
    expect(families.length).toBe(3);
    for (const f of families) expect(familyForBackend("any-backend", f)).toEqual({ ok: true, family: f });
  });
});
