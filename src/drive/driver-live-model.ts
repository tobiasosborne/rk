// PURITY: pure — no fs/network/clock (L3). rk-7hi (M3.5 STOP-2 blocker): the model/family
// resolution the M3.5-prep live dispatch glue (src/drive/driver-live.ts) needs, split into its own
// small module so driver-live.ts stays under CLAUDE.md's 280-line hard cap. Split out because this
// is genuinely a separate job from that file's session/dispatch wiring: "what model and what family
// does (role, tier) get" is a pure lookup over a `BackendRegistry`, with no session/subprocess
// concerns at all. src/drive/driver-live.ts re-exports both functions unchanged, so no import site
// (src/cli/verify-live.ts, every test) needed to change.

import { BackendRegistry } from "./backend-registry";
import type { WorkerBackend } from "./backend-types";
import { MODEL_FAMILIES, type ModelFamily, type Role, type Tier } from "./vocab";

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
 * Family identity (src/drive/identity.ts) is read off the resolved BACKEND's own declared
 * `modelFamily` (`familyForBackend` below, rk-9zd), never from this string, so the cross-vendor
 * gate is completely unaffected by which model wins here. */
export function resolveModel(registry: BackendRegistry<WorkerBackend>, role: Role, tier: Tier, globalModel: string | undefined): string {
  const perAssignment = registry.modelFor(role, tier);
  if (perAssignment) return perAssignment;
  if (globalModel) return globalModel;
  const backend = registry.resolve(role, tier);
  return backend ? DEFAULT_MODEL_BY_BACKEND[backend.name] ?? backend.name : "unknown";
}

/** The answer to "what model family does this backend belong to?" — a RESOLUTION, never a bare
 * `ModelFamily`, so an UNKNOWN is structurally distinguishable from a KNOWN at every call site. Same
 * discipline as src/drive/cross-vendor.ts's `identity-unparseable` vs `same-family` split: an answer
 * we could not establish must never be returned in the same shape as one we did. */
export type BackendFamilyResolution = { ok: true; family: ModelFamily } | { ok: false; reason: string };

/** rk-9zd (BUG, Tier A — this feeds the cross-vendor rule). WHAT THIS USED TO BE, and why it was
 * wrong: `backendName === "codex" ? "gpt" : "claude"` — a ternary that re-derived the family from
 * the backend's bare NAME STRING and mapped every name it did not recognize to `claude`. That is
 * fail-OPEN in an input to PRD C9's cross-vendor gate: a future third backend (PRD D8 explicitly
 * anticipates "any future CLI that satisfies the worker contract") would have been silently
 * misfiled as the claude family, and a claude-prover/third-backend-verifier pair would then have
 * read as SAME-family (blocking a legitimate promotion) or, worse, a gpt-prover/third-backend
 * verifier pair as CROSS-family on a family nobody established. Dormant — the production registry
 * in src/cli/verify-live.ts only ever constructs backends literally named `claude`/`codex` — but
 * dormancy is not a guard.
 *
 * THE FIX: stop re-deriving anything. `WorkerBackend.modelFamily` (src/drive/backend-types.ts) is
 * ALREADY the authoritative, driver-registry-set family for a backend — "set once, at construction,
 * from the backend/model pairing the registry knows about, NEVER read from anything the backend
 * process itself prints". This function's whole job is now to VALIDATE that declared value against
 * the closed `MODEL_FAMILIES` vocabulary (src/drive/vocab.ts, extensible only by a schema_version
 * bump) and hand back a resolution. `backendName` is carried for the REFUSAL MESSAGE only — it can
 * never decide the answer, which is precisely the fail-open path being removed.
 *
 * FAIL CLOSED: an absent, non-string, or out-of-vocabulary `modelFamily` yields `{ok:false}`. The
 * caller (src/cli/verify-live.ts) aborts the run before any backend call rather than proceeding
 * with a guessed family — a run that cannot establish both sides' families cannot honestly run the
 * cross-vendor check on any accept it would produce.
 *
 * MODEL-INDEPENDENCE (rk-le9's review requirement, strengthened rather than merely preserved): the
 * model string is no longer even a PARAMETER here. There is no expression in this function a
 * user-supplied `--model` flag or per-assignment `model` override can reach, so it is structurally
 * impossible for a model id to perturb the family the cross-vendor gate compares. */
export function familyForBackend(backendName: string, declaredFamily: unknown): BackendFamilyResolution {
  if (typeof declaredFamily === "string" && MODEL_FAMILIES.has(declaredFamily as ModelFamily)) {
    return { ok: true, family: declaredFamily as ModelFamily };
  }
  const shown = typeof declaredFamily === "string" ? `'${declaredFamily}'` : declaredFamily === undefined ? "nothing" : JSON.stringify(declaredFamily) ?? String(declaredFamily);
  return {
    ok: false,
    reason:
      `backend '${backendName}' declares ${shown} as its model family, which is not one of the closed set ` +
      `[${[...MODEL_FAMILIES].join(", ")}] (src/drive/vocab.ts). rk refuses to guess a family for it: the family is an ` +
      `INPUT to the cross-vendor rule (PRD C9), and an unknown family must never pass for a known one ` +
      `(src/drive/cross-vendor.ts's identity-unparseable vs same-family discipline). Set 'modelFamily' on the ` +
      `WorkerBackend implementation to a member of that set, or extend the set with a schema_version bump + fixture.`,
  };
}
