// PURITY: pure — no fs/network/clock (L3). M3.2's backend registry: resolves the per-(role,tier)
// backend assignment + ordered fallbacks a driver reads from `.rk/config.json`'s new `workers`
// field (src/gates/config.ts's `validateConfigOverrides` extension imports `validateWorkersConfig`
// from here). Deliberately does NOT import backend-claude.ts/backend-codex.ts — those are IMPURE
// edges (subprocess-spawning); the actual `WorkerBackend` instances are constructed by the
// driver's own edge code and handed to `BackendRegistry`'s constructor already built. This keeps
// the registry's own lookup/validation logic importable from the pure `src/gates/config.ts`
// without dragging subprocess code into the gates layer.
//
// Validation mirrors src/gates/config.ts's rk-xbm precedent exactly: unknown keys rejected at
// every level, and ANY malformation drops the WHOLE `workers` field (never a partial or
// silently-guessed assignment) — one loud ERROR, never a quiet fallback to a specific backend
// name a general tool has no business guessing (same "no default" stance as `shardsPrefix`/
// `northStarId`).

import { ROLES, TIERS, isNonBlankString, type Role, type Tier } from "./vocab";

export interface RoleTierAssignment {
  backend: string;
  fallbacks: string[];
  /** rk-7hi (M3.5 STOP-2 blocker): optional per-assignment model override. When present, it wins
   * over the CLI's global `--model` flag and `DEFAULT_MODEL_BY_BACKEND` (src/drive/driver-live.ts's
   * `resolveModel` — the ONLY way two backends in the same run carry two different explicit models,
   * e.g. prover=claude pinned to `claude-opus-4-8` while verifier=codex stays on its own default).
   * Family identity (src/drive/identity.ts) is derived from the BACKEND name, never this string —
   * an arbitrary model id here cannot perturb the cross-vendor gate. */
  model?: string;
}

export type WorkersAssignments = Partial<Record<Role, Partial<Record<Tier, RoleTierAssignment>>>>;

export interface WorkersConfig {
  assignments: WorkersAssignments;
}

export interface WorkersConfigIssue {
  path: string;
  message: string;
}

export type WorkersConfigResult = { ok: true; config: WorkersConfig } | { ok: false; issues: WorkersConfigIssue[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateAssignmentEntry(entry: unknown, path: string, issues: WorkersConfigIssue[]): RoleTierAssignment | undefined {
  if (!isPlainObject(entry)) {
    issues.push({ path, message: "must be an object { backend, fallbacks? }" });
    return undefined;
  }
  for (const key of Object.keys(entry)) {
    if (key !== "backend" && key !== "fallbacks" && key !== "model") issues.push({ path: `${path}.${key}`, message: `unknown key '${key}'` });
  }
  if (!isNonBlankString(entry.backend)) {
    issues.push({ path: `${path}.backend`, message: "must be a non-blank string" });
    return undefined;
  }
  let fallbacks: string[] = [];
  if ("fallbacks" in entry) {
    const raw = entry.fallbacks;
    if (!Array.isArray(raw) || !raw.every((f) => isNonBlankString(f))) {
      issues.push({ path: `${path}.fallbacks`, message: "must be an array of non-blank strings" });
      return undefined;
    }
    fallbacks = raw as string[];
  }
  // rk-7hi: `model` is optional, but when PRESENT it must be a non-blank string -- same discipline
  // as `backend` above (a present-but-malformed field is rejected, never silently coerced/ignored).
  let model: string | undefined;
  if ("model" in entry) {
    if (!isNonBlankString(entry.model)) {
      issues.push({ path: `${path}.model`, message: "must be a non-blank string" });
      return undefined;
    }
    model = entry.model;
  }
  return model === undefined ? { backend: entry.backend, fallbacks } : { backend: entry.backend, fallbacks, model };
}

/** Validates an untrusted `.rk/config.json`-shaped `workers` value. Returns `{ok:false, issues}`
 * on ANY malformation anywhere in the structure — the caller (src/gates/config.ts) drops the whole
 * field on failure, never applies a partial result. */
export function validateWorkersConfig(raw: unknown): WorkersConfigResult {
  const issues: WorkersConfigIssue[] = [];
  if (!isPlainObject(raw)) return { ok: false, issues: [{ path: "workers", message: "must be an object" }] };

  for (const key of Object.keys(raw)) {
    if (key !== "assignments") issues.push({ path: `workers.${key}`, message: `unknown key '${key}' -- only 'assignments' is recognized` });
  }
  if (!("assignments" in raw)) {
    issues.push({ path: "workers.assignments", message: "missing required property 'assignments'" });
    return { ok: false, issues };
  }
  if (!isPlainObject(raw.assignments)) {
    issues.push({ path: "workers.assignments", message: "must be an object keyed by role" });
    return { ok: false, issues };
  }

  const assignments: WorkersAssignments = {};
  for (const roleKey of Object.keys(raw.assignments)) {
    if (!ROLES.has(roleKey as Role)) {
      issues.push({ path: `workers.assignments.${roleKey}`, message: `unknown role '${roleKey}' -- must be one of ${[...ROLES].join(", ")}` });
      continue;
    }
    const tierMap = raw.assignments[roleKey];
    if (!isPlainObject(tierMap)) {
      issues.push({ path: `workers.assignments.${roleKey}`, message: "must be an object keyed by tier" });
      continue;
    }
    const roleEntry: Partial<Record<Tier, RoleTierAssignment>> = {};
    for (const tierKey of Object.keys(tierMap)) {
      const entryPath = `workers.assignments.${roleKey}.${tierKey}`;
      if (!TIERS.has(tierKey as Tier)) {
        issues.push({ path: entryPath, message: `unknown tier '${tierKey}' -- must be one of ${[...TIERS].join(", ")}` });
        continue;
      }
      const validated = validateAssignmentEntry(tierMap[tierKey], entryPath, issues);
      if (validated) roleEntry[tierKey as Tier] = validated;
    }
    assignments[roleKey as Role] = roleEntry;
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, config: { assignments } };
}

/** Minimal shape every registered backend must supply for lookup purposes — deliberately NOT
 * `WorkerBackend` itself (src/drive/backend-types.ts), so this pure module never needs to import
 * that file's `WorkerResult`/subprocess-adjacent types just to key a map by `name`. A real driver
 * hands `BackendRegistry` actual `WorkerBackend` instances, which satisfy this shape trivially. */
export interface NamedBackend {
  name: string;
}

/** Driver-side lookup: registered backends keyed by name, plus the ordered (primary, fallback...)
 * chain for a given (role, tier) per `WorkersConfig`. */
export class BackendRegistry<B extends NamedBackend = NamedBackend> {
  private readonly backends = new Map<string, B>();

  constructor(
    private readonly config: WorkersConfig,
    backends: B[],
  ) {
    for (const b of backends) this.backends.set(b.name, b);
  }

  get(name: string): B | undefined {
    return this.backends.get(name);
  }

  /** The ordered chain of backend NAMES to try for (role, tier): the assigned primary, then its
   * fallbacks, in order. Empty when nothing is configured for this pair — a caller must treat that
   * as "no backend configured," never guess one (R12/`northStarId`'s "no default" discipline). */
  chainFor(role: Role, tier: Tier): string[] {
    const entry = this.config.assignments[role]?.[tier];
    if (!entry) return [];
    return [entry.backend, ...entry.fallbacks];
  }

  /** rk-7hi: the (role, tier) assignment's own explicit `model`, if `.rk/config.json` set one —
   * `undefined` when nothing was configured for this pair OR the entry carries no `model` field.
   * Deliberately independent of `resolve()`: the pin is per-ASSIGNMENT (the role×tier entry), not
   * per resolved backend, so it applies whichever backend in the fallback chain actually resolves. */
  modelFor(role: Role, tier: Tier): string | undefined {
    return this.config.assignments[role]?.[tier]?.model;
  }

  /** The first backend in `chainFor(role, tier)` that is actually REGISTERED — a name present in
   * config but never registered is skipped, never a thrown surprise deep in a driver loop.
   * `undefined` means every configured backend (primary + all fallbacks) is unavailable, or
   * nothing was configured at all for this (role, tier) pair. */
  resolve(role: Role, tier: Tier): B | undefined {
    for (const name of this.chainFor(role, tier)) {
      const backend = this.backends.get(name);
      if (backend) return backend;
    }
    return undefined;
  }
}
