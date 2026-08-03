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
  /** rk-k0m1 (P2, RUN-REPORT-12): optional per-assignment PER-TURN wall-clock ceiling, in
   * milliseconds. Overrides the `workers`-level `turnTimeoutMs` below, which in turn overrides
   * src/drive/driver-live.ts's `DEFAULT_TURN_TIMEOUT_MS` (120_000). Per-ASSIGNMENT because the
   * live-fire datum is per-assignment: codex's full-decomposition prover turn on a hard lemma hit
   * the 120s ceiling twice (exit 10, a correct loud skip) while claude-opus decomposed the same
   * lemma in one turn — raising the prover's ceiling must not also stretch the verifier's. */
  turnTimeoutMs?: number;
  /** rk-k0m1: optional per-assignment SESSION-CREATION ceiling, in milliseconds (the turn-1
   * `createSession` call that ships the shared context). Same precedence chain as `turnTimeoutMs`;
   * kept a separate knob because session creation and a working turn fail for different reasons. */
  sessionTimeoutMs?: number;
}

export type WorkersAssignments = Partial<Record<Role, Partial<Record<Tier, RoleTierAssignment>>>>;

export interface WorkersConfig {
  assignments: WorkersAssignments;
  /** rk-k0m1: campaign-wide per-turn ceiling in milliseconds — the default every assignment
   * inherits unless it names its own `turnTimeoutMs`. Optional: absent means "nothing configured",
   * and src/drive/driver-live.ts's `DEFAULT_TURN_TIMEOUT_MS` remains the single fallback (a repo
   * with no `.rk/config.json` timeouts behaves byte-identically to before this field existed). */
  turnTimeoutMs?: number;
  /** rk-k0m1: campaign-wide session-creation ceiling in milliseconds, the `sessionTimeoutMs`
   * counterpart of the field above (fallback: `DEFAULT_SESSION_TIMEOUT_MS`). */
  sessionTimeoutMs?: number;
}

/** rk-k0m1: the resolved (per-assignment > workers-level) timeout pair for one (role, tier). A
 * field is ABSENT when nothing configured it at either level — never zero, never a fabricated
 * default: `createLiveDispatcher`'s own `?? DEFAULT_*` stays the one place a default is applied. */
export interface ResolvedTimeouts {
  turnTimeoutMs?: number;
  sessionTimeoutMs?: number;
}

export interface WorkersConfigIssue {
  path: string;
  message: string;
}

export type WorkersConfigResult = { ok: true; config: WorkersConfig } | { ok: false; issues: WorkersConfigIssue[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** rk-k0m1: the two optional timeout fields, recognized at BOTH nesting levels (`workers` itself
 * and each `workers.assignments.<role>.<tier>` entry). Listed once so the unknown-key checks and
 * the readers below can never drift apart on what is legal where. */
const TIMEOUT_KEYS = ["turnTimeoutMs", "sessionTimeoutMs"] as const;
type TimeoutKey = (typeof TIMEOUT_KEYS)[number];

/** Milliseconds must be a positive, finite INTEGER: `0`/negatives would make every turn time out
 * instantly, and a fractional/NaN/Infinity ceiling is not a duration anyone typed on purpose. */
function isPositiveIntegerMs(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

/** Reads the optional timeout fields off an already-established plain object, at either nesting
 * level. A PRESENT-but-invalid value is an issue (rk-xbm discipline, same as a blank `model`) and
 * returns `undefined` so the caller drops its whole enclosing structure — never a silent fallback
 * to `DEFAULT_TURN_TIMEOUT_MS`, which is precisely the "I raised the ceiling and nothing changed"
 * failure this bead exists to prevent. Absent fields yield an empty result, the legal default. */
function readTimeouts(source: Record<string, unknown>, path: string, issues: WorkersConfigIssue[]): ResolvedTimeouts | undefined {
  const timeouts: ResolvedTimeouts = {};
  let ok = true;
  for (const key of TIMEOUT_KEYS) {
    if (!(key in source)) continue;
    const value = source[key];
    if (!isPositiveIntegerMs(value)) {
      issues.push({ path: `${path}.${key}`, message: "must be a positive integer number of milliseconds" });
      ok = false;
      continue;
    }
    timeouts[key as TimeoutKey] = value;
  }
  return ok ? timeouts : undefined;
}

function validateAssignmentEntry(entry: unknown, path: string, issues: WorkersConfigIssue[]): RoleTierAssignment | undefined {
  if (!isPlainObject(entry)) {
    issues.push({ path, message: "must be an object { backend, fallbacks? }" });
    return undefined;
  }
  for (const key of Object.keys(entry)) {
    if (key !== "backend" && key !== "fallbacks" && key !== "model" && !(TIMEOUT_KEYS as readonly string[]).includes(key)) {
      issues.push({ path: `${path}.${key}`, message: `unknown key '${key}'` });
    }
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
  // rk-k0m1: same optional-but-strict discipline for the two timeout overrides.
  const timeouts = readTimeouts(entry, path, issues);
  if (!timeouts) return undefined;
  const assignment: RoleTierAssignment = { backend: entry.backend, fallbacks, ...timeouts };
  if (model !== undefined) assignment.model = model;
  return assignment;
}

/** Validates an untrusted `.rk/config.json`-shaped `workers` value. Returns `{ok:false, issues}`
 * on ANY malformation anywhere in the structure — the caller (src/gates/config.ts) drops the whole
 * field on failure, never applies a partial result. */
export function validateWorkersConfig(raw: unknown): WorkersConfigResult {
  const issues: WorkersConfigIssue[] = [];
  if (!isPlainObject(raw)) return { ok: false, issues: [{ path: "workers", message: "must be an object" }] };

  for (const key of Object.keys(raw)) {
    if (key !== "assignments" && !(TIMEOUT_KEYS as readonly string[]).includes(key)) {
      issues.push({ path: `workers.${key}`, message: `unknown key '${key}' -- only 'assignments', ${TIMEOUT_KEYS.join(", ")} are recognized` });
    }
  }
  // rk-k0m1: the campaign-wide timeout defaults. Read BEFORE the `assignments` shape checks so a
  // malformed top-level timeout is reported alongside, not instead of, any assignment issues.
  const topLevelTimeouts = readTimeouts(raw, "workers", issues);
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
  return { ok: true, config: { assignments, ...(topLevelTimeouts ?? {}) } };
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

  /** rk-k0m1: the timeout pair to dispatch (role, tier) with. Resolution order, most specific
   * first and INDEPENDENTLY per field: (1) the assignment's own `turnTimeoutMs`/`sessionTimeoutMs`,
   * (2) the campaign-wide `workers`-level value, (3) absent — leaving
   * `createLiveDispatcher`'s `?? DEFAULT_TURN_TIMEOUT_MS`/`DEFAULT_SESSION_TIMEOUT_MS` as the only
   * place a number is invented. Per-assignment like `modelFor`, so raising the prover's ceiling
   * never stretches the verifier's. */
  timeoutsFor(role: Role, tier: Tier): ResolvedTimeouts {
    const entry = this.config.assignments[role]?.[tier];
    const resolved: ResolvedTimeouts = {};
    for (const key of TIMEOUT_KEYS) {
      const value = entry?.[key] ?? this.config[key];
      if (value !== undefined) resolved[key] = value;
    }
    return resolved;
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
