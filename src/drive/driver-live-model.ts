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

/** Interim per-backend model default — never used when a `--model` flag OR a per-assignment
 * config `model` (see `resolveModel` below) supplies one explicitly. */
export const DEFAULT_MODEL_BY_BACKEND: Record<string, string> = {
  claude: "claude-sonnet-4-5",
  codex: "gpt-5.1-codex",
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
 * (src/drive/identity.ts's `decodeVerifierSeam`, UNCHANGED by this WP) that compares them. */
export function familyForBackend(backendName: string): ModelFamily {
  return backendName === "codex" ? "gpt" : "claude";
}
