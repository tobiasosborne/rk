// PURITY: pure — no fs/network/clock (L3). rk-7hi (M3.5 STOP-2 blocker): the model/family
// resolution the M3.5-prep live dispatch glue (src/drive/driver-live.ts) needs, split into its own
// small module so driver-live.ts stays under CLAUDE.md's 280-line hard cap. Split out because this
// is genuinely a separate job from that file's session/dispatch wiring: "what model and what family
// does (role, tier) get" is a pure lookup over a `BackendRegistry`, with no session/subprocess
// concerns at all. src/drive/driver-live.ts re-exports both functions unchanged, so no import site
// (src/cli/verify-live.ts, every test) needed to change.

import { BackendRegistry } from "./backend-registry";
import type { WorkerBackend } from "./backend-types";
import type { ModelFamily, Role, Tier } from "./vocab";

/** rk-le9 (M3.5 STOP-3): the OLD codex default here was a real, hard-coded model id
 * (`gpt-5.1-codex`) that a ChatGPT-account codex login 400-rejects outright — only that account's
 * own configured default model runs, and rk had no way to reach it, so `rk verify --live` was
 * unusable for anyone whose codex auth mode differed from the machine that string was picked on.
 * `CODEX_ACCOUNT_DEFAULT_MODEL` replaces it: a sentinel meaning "no explicit model was configured
 * for this backend — do not guess a real id, let the CLI apply its own auth-mode-appropriate
 * default." `src/drive/backend-codex.ts`'s `runTurn` recognizes this exact value and OMITS the
 * `-m` flag entirely (rather than passing the sentinel string itself as a model id) — see that
 * file for the argv-construction side of this fix. Deliberately a non-blank, self-explanatory
 * string, never `""`/`undefined`: (1) `src/drive/identity.ts`'s `encodeVerifierSeam` requires every
 * identity field non-blank, so a blank model would make the verifier/prover identity unencodable
 * the moment a codex backend used its account default; (2) it is what gets printed verbatim at
 * `rk verify --live`'s preflight (`src/cli/verify-live.ts`'s "backend resolved: ... (model '...')"
 * line) — the documented-default half of the bar ("no silent guess that fails deep inside a paid
 * dispatch"), satisfied by construction since the string itself states what happens. A user who
 * wants an EXPLICIT codex model still sets `.rk/config.json`'s
 * `workers.assignments.<role>.<tier>.model` (or the global `--model` flag) — both outrank this
 * default in `resolveModel`'s precedence below, unchanged by this fix. */
export const CODEX_ACCOUNT_DEFAULT_MODEL = "(codex account default — no -m flag passed)";

/** Interim per-backend model default — never used when a `--model` flag OR a per-assignment
 * config `model` (see `resolveModel` below) supplies one explicitly. `claude` stays a real model id
 * because `claude -p` REQUIRES an explicit `--model` value on every invocation (no account-implicit
 * default to fall back to, unlike codex) — see `src/drive/backend-claude.ts`. */
export const DEFAULT_MODEL_BY_BACKEND: Record<string, string> = {
  claude: "claude-sonnet-4-5",
  codex: CODEX_ACCOUNT_DEFAULT_MODEL,
};

/** rk-7hi (M3.5 STOP-2 blocker): resolves the model to actually dispatch with for (role, tier).
 * Resolution order, most-specific wins: (1) the `.rk/config.json` assignment's own `model` field
 * (`BackendRegistry.modelFor`) — the ONLY way a cross-vendor run can carry two DIFFERENT explicit
 * models (e.g. prover=claude pinned to `claude-opus-4-8` while verifier=codex stays on its own
 * default), since the CLI's `--model` flag is a single global value applied to both roles; (2) that
 * global `--model` flag (`globalModel`); (3) `DEFAULT_MODEL_BY_BACKEND[backend]` for whichever
 * backend `resolve(role, tier)` actually picks, or the backend's own name if undeclared there.
 * Family identity (src/drive/identity.ts) is derived from the BACKEND name, never from this
 * string, so the cross-vendor gate is completely unaffected by which model wins here. */
export function resolveModel(registry: BackendRegistry<WorkerBackend>, role: Role, tier: Tier, globalModel: string | undefined): string {
  const perAssignment = registry.modelFor(role, tier);
  if (perAssignment) return perAssignment;
  if (globalModel) return globalModel;
  const backend = registry.resolve(role, tier);
  return backend ? DEFAULT_MODEL_BY_BACKEND[backend.name] ?? backend.name : "unknown";
}

/** rk-7hi: family identity is ALWAYS derived from the resolved BACKEND name, never from the model
 * string `resolveModel` above picks — the two are deliberately independent axes (src/drive/
 * vocab.ts's header: "a backend ... is a DIFFERENT axis from family"). Pulled out of
 * src/cli/verify-live.ts's two inline call sites (prover identity, verifier identity) into one
 * named function so both stay in lockstep and this invariant is directly unit-testable: an
 * arbitrary per-assignment `model` override (rk-7hi) can never perturb which of the two closed
 * families a session's identity records, and so can never perturb the cross-vendor gate
 * (src/drive/identity.ts's `decodeVerifierSeam`, UNCHANGED by this WP) that compares them.
 * `test/drive/driver-live-model.test.ts` locks this model-independence property in directly, per
 * rk-le9's review requirement that no user-supplied model string can weaken the cross-vendor check.
 *
 * rk-le9 TRIAGE NOTE (found, NOT fixed here — see that bead's fix report for the reasoning): this
 * ternary silently maps ANY backend name other than "codex" to "claude" — correct for the two real
 * adapters that exist today (`ClaudeBackend`/`CodexBackend`, `src/drive/backend-{claude,codex}.ts`,
 * whose `name` fields are exactly "claude"/"codex" and are the ONLY names the production registry
 * in `src/cli/verify-live.ts` ever constructs), so this is NOT reachable through any real,
 * non-test-injected `rk verify --live` run today — but it is a dormant fail-OPEN hazard for a
 * future third backend: adding one without updating this function would silently misfile its
 * family as "claude" rather than failing loudly. The stricter fix (fail closed on an unrecognized
 * name, or better, read the ALREADY-correct `WorkerBackend.modelFamily` field off the resolved
 * backend instance instead of re-deriving from its bare name string) needs `src/cli/verify-live.ts`
 * call-site changes outside this WP's file scope, and would break `test/cli-verify.test.ts`'s
 * `name: "fake"` backend fixtures (outside this WP's scope to update) if done as a hard throw. Left
 * unchanged; flagged for the next milestone review / a follow-up bead. */
export function familyForBackend(backendName: string): ModelFamily {
  return backendName === "codex" ? "gpt" : "claude";
}
