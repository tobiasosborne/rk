// ROLE: the CONVENTION PROFILE — `.rk/conventions/<name>.v<n>.json`, schema
// schemas/convention-profile.v1.json. Contract: docs/gate-contracts.md "Convention profile".
// Validated by the config gate (src/gates/config.ts); consumed by Gate 9 (src/gates/notation.ts).
// PURITY: pure — no fs/network/clock (L3). Profile bytes arrive via RepoSnapshot.
//
// WHY IT LIVES OUTSIDE THE REGISTER (LB5, docs/reviews/2026-08-20-qpcp-plan-tierA-codex.md): the
// notation register cannot be allowed to declare which symbol classes are tracked, because then
// deleting a class from the register silently shrinks Gate 9's coverage and every remaining symbol
// still reports green. The profile is a separate, versioned, committed artifact; a class can leave
// it only by a `version` bump, which is a compat event with its own fixture (`config-07`).
//
// UNTRUSTED, HAND-EDITABLE JSON — same edge-trust posture as `.rk/config.json` (rk-xbm) and
// `.rk/generated.json` (Gate 7): a malformation is never a crash and never a silent no-op. Every
// malformation produces one loud finding and the WHOLE profile is dropped (never a partially
// applied profile — a half-read tracked-class list is a silently shrunk one, the exact failure this
// module exists to prevent). A dropped profile is NOT "no profile configured": Gate 9 reports the
// configured-but-unusable state distinctly, and the config gate's ERROR already blocks the run.

import type { Finding } from "./framework";
import { listFilesRecursive, type RepoSnapshot } from "./snapshot";

export const CONVENTIONS_DIR = ".rk/conventions";
export const PROFILE_SCHEMA_VERSION = "1";

/** `<name>.v<n>` — the reference key `.rk/config.json`'s `conventionProfile` carries. The filename
 * stem, never a path: a key containing `/` or `..` must never resolve to a file outside
 * `.rk/conventions/`. */
const REF_RE = /^([a-z0-9][a-z0-9-]*)\.v([1-9]\d*)$/;
const CLASS_RE = /^[a-z0-9][a-z0-9-]*$/;
/** A raw LaTeX macro token, backslash included: `\epsilon`, `\Delta`. Explicit tokens only — the
 * schema deliberately admits no patterns (see schemas/convention-profile.v1.json). */
const SYMBOL_RE = /^\\[A-Za-z]+$/;

const TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  "schema_version",
  "name",
  "version",
  "tracked_classes",
  "lattices",
  "choices",
  "enums",
]);
const CLASS_KEYS: ReadonlySet<string> = new Set(["class", "description", "symbols", "symbols_must_be_registered"]);
const CHOICE_KEYS: ReadonlySet<string> = new Set(["canonical", "allowed_translations"]);

export interface TrackedClass {
  class: string;
  description: string;
  symbols: string[];
  symbols_must_be_registered: true;
}

export interface ConventionProfile {
  schema_version: string;
  name: string;
  version: number;
  tracked_classes: TrackedClass[];
  lattices: Record<string, string[]>;
  choices: Record<string, { canonical: string; allowed_translations: string[] }>;
  enums: Record<string, string[]>;
}

export interface ProfileValidation {
  findings: Finding[];
  /** Profile-level units that validated cleanly. */
  checked: number;
  /** Profile-level units attempted (0 when nothing is configured — the cold-start state). */
  total: number;
  /** Present only when the profile parsed and validated COMPLETELY. A malformed profile yields
   * `undefined` here plus at least one ERROR — never a partially applied profile. */
  profile?: ConventionProfile;
}

/** `<name>.v<n>` -> `.rk/conventions/<name>.v<n>.json`. Callers must have validated `ref` against
 * `REF_RE` first (`validateConventionProfile` does); this function performs no escaping of its own
 * because there is nothing legitimate to escape. */
export function profileFilePath(ref: string): string {
  return `${CONVENTIONS_DIR}/${ref}.json`;
}

/** Every tracked symbol -> the class that lists it. The lookup Gate 9 scans with. */
export function trackedSymbolIndex(profile: ConventionProfile): Map<string, string> {
  const index = new Map<string, string>();
  for (const tc of profile.tracked_classes) {
    for (const sym of tc.symbols) index.set(sym, tc.class);
  }
  return index;
}

function profileError(path: string, message: string): Finding {
  // structural: a profile fault is a fault in the CHECKING APPARATUS (same class as an
  // unparseable `.rk/config.json`, src/gates/config.ts's `configError`), not a completeness
  // finding about repo content. src/gates/phase.ts must never demote it: a silently unusable
  // profile turns Gate 9 into a no-op, which is the LB5 failure mode itself.
  return { severity: "ERROR", path, line: 1, message, structural: true };
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string" && x.length > 0);
}

interface ParseResult {
  profile?: ConventionProfile;
  errors: string[];
}

/** Parses + fully validates one profile file's text against schemas/convention-profile.v1.json.
 * Returns EITHER a complete profile or a non-empty error list — never both, never a partial. */
export function parseConventionProfile(text: string, expectedName: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { errors: [`not valid JSON (${e instanceof Error ? e.message : String(e)})`] };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { errors: ['expected a JSON object (schemas/convention-profile.v1.json)'] };
  }
  const obj = parsed as Record<string, unknown>;
  const errors: string[] = [];

  const extra = Object.keys(obj).filter((k) => !TOP_LEVEL_KEYS.has(k));
  if (extra.length > 0) {
    errors.push(
      `unrecognized top-level propert${extra.length === 1 ? "y" : "ies"} ${extra.map((k) => `"${k}"`).join(", ")} ` +
        `— schemas/convention-profile.v1.json requires additionalProperties:false`,
    );
  }
  if (obj.schema_version !== PROFILE_SCHEMA_VERSION) {
    errors.push(
      `"schema_version" is ${JSON.stringify(obj.schema_version)}, expected exactly ` +
        `"${PROFILE_SCHEMA_VERSION}" — an incompatible profile must never silently run under v1 semantics`,
    );
  }
  if (typeof obj.name !== "string" || obj.name !== expectedName) {
    errors.push(
      `"name" is ${JSON.stringify(obj.name)} but the file is ${expectedName}.v<n>.json — a profile whose ` +
        `declared name disagrees with its own path cannot be referenced unambiguously`,
    );
  }
  if (typeof obj.version !== "number" || !Number.isInteger(obj.version) || obj.version < 1) {
    errors.push(`"version" is ${JSON.stringify(obj.version)}, expected a positive integer (the rule-10 compat counter)`);
  }

  const classes: TrackedClass[] = [];
  if (!Array.isArray(obj.tracked_classes) || obj.tracked_classes.length === 0) {
    errors.push('"tracked_classes" must be a non-empty array — a profile that tracks nothing checks nothing');
  } else {
    const seenClass = new Set<string>();
    const symbolOwner = new Map<string, string>();
    obj.tracked_classes.forEach((raw, i) => {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        errors.push(`tracked_classes[${i}] must be an object`);
        return;
      }
      const tc = raw as Record<string, unknown>;
      const extraKeys = Object.keys(tc).filter((k) => !CLASS_KEYS.has(k));
      if (extraKeys.length > 0) {
        errors.push(`tracked_classes[${i}] has unrecognized propert${extraKeys.length === 1 ? "y" : "ies"} ${extraKeys.map((k) => `"${k}"`).join(", ")}`);
      }
      if (typeof tc.class !== "string" || !CLASS_RE.test(tc.class)) {
        errors.push(`tracked_classes[${i}].class is ${JSON.stringify(tc.class)}, expected a lowercase id`);
        return;
      }
      if (seenClass.has(tc.class)) errors.push(`tracked_classes: duplicate class id "${tc.class}"`);
      seenClass.add(tc.class);
      if (typeof tc.description !== "string" || tc.description.length === 0) {
        errors.push(`tracked_classes[${i}] ("${tc.class}") needs a non-empty "description"`);
      }
      if (tc.symbols_must_be_registered !== true) {
        errors.push(
          `tracked_classes[${i}] ("${tc.class}").symbols_must_be_registered is ` +
            `${JSON.stringify(tc.symbols_must_be_registered)}, expected exactly true — v1 admits no advisory ` +
            `class, so any other value is a malformed profile, never a quiet Gate 9 opt-out`,
        );
      }
      if (!Array.isArray(tc.symbols) || tc.symbols.length === 0 || !tc.symbols.every((s) => typeof s === "string" && SYMBOL_RE.test(s))) {
        errors.push(
          `tracked_classes[${i}] ("${tc.class}").symbols must be a non-empty array of raw LaTeX macro tokens ` +
            `including the leading backslash (e.g. "\\\\epsilon"); patterns are deliberately not admitted`,
        );
        return;
      }
      const symbols = tc.symbols as string[];
      for (const sym of symbols) {
        const owner = symbolOwner.get(sym);
        if (owner !== undefined && owner !== tc.class) {
          errors.push(`symbol ${sym} is claimed by two tracked classes ("${owner}" and "${tc.class}") — a symbol has exactly one class`);
        }
        symbolOwner.set(sym, tc.class as string);
      }
      classes.push({
        class: tc.class,
        description: typeof tc.description === "string" ? tc.description : "",
        symbols: [...symbols],
        symbols_must_be_registered: true,
      });
    });
  }

  const lattices: Record<string, string[]> = {};
  if (typeof obj.lattices !== "object" || obj.lattices === null || Array.isArray(obj.lattices)) {
    errors.push('"lattices" must be an object (an empty one is legitimate)');
  } else {
    for (const [key, value] of Object.entries(obj.lattices as Record<string, unknown>)) {
      if (!isStringArray(value) || value.length < 2 || new Set(value).size !== value.length) {
        errors.push(`lattices["${key}"] must be an array of >= 2 distinct non-empty strings, ordered weakest first`);
        continue;
      }
      lattices[key] = [...value];
    }
  }

  const choices: Record<string, { canonical: string; allowed_translations: string[] }> = {};
  if (typeof obj.choices !== "object" || obj.choices === null || Array.isArray(obj.choices)) {
    errors.push('"choices" must be an object (an empty one is legitimate)');
  } else {
    for (const [key, value] of Object.entries(obj.choices as Record<string, unknown>)) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        errors.push(`choices["${key}"] must be an object {canonical, allowed_translations}`);
        continue;
      }
      const c = value as Record<string, unknown>;
      const extraChoice = Object.keys(c).filter((k) => !CHOICE_KEYS.has(k));
      if (extraChoice.length > 0) errors.push(`choices["${key}"] has unrecognized propert${extraChoice.length === 1 ? "y" : "ies"} ${extraChoice.map((k) => `"${k}"`).join(", ")}`);
      if (typeof c.canonical !== "string" || c.canonical.length === 0) {
        errors.push(`choices["${key}"].canonical must be a non-empty string — the campaign's canonical convention`);
        continue;
      }
      if (!Array.isArray(c.allowed_translations) || !c.allowed_translations.every((x) => typeof x === "string" && x.length > 0)) {
        errors.push(`choices["${key}"].allowed_translations must be an array of non-empty strings`);
        continue;
      }
      choices[key] = { canonical: c.canonical, allowed_translations: [...(c.allowed_translations as string[])] };
    }
  }

  const enums: Record<string, string[]> = {};
  if (typeof obj.enums !== "object" || obj.enums === null || Array.isArray(obj.enums)) {
    errors.push('"enums" must be an object (an empty one is legitimate)');
  } else {
    for (const [key, value] of Object.entries(obj.enums as Record<string, unknown>)) {
      if (!isStringArray(value) || value.length === 0 || new Set(value).size !== value.length) {
        errors.push(`enums["${key}"] must be a non-empty array of distinct non-empty strings`);
        continue;
      }
      enums[key] = [...value];
    }
  }

  if (errors.length > 0) return { errors };
  return {
    profile: {
      schema_version: PROFILE_SCHEMA_VERSION,
      name: obj.name as string,
      version: obj.version as number,
      tracked_classes: classes,
      lattices,
      choices,
      enums,
    },
    errors: [],
  };
}

/** The coverage-shrink guard (CLAUDE.md rule 10). Compares the configured `<name>.v<n>.json`
 * against `<name>.v<n-1>.json` when that predecessor is present in the same directory: a tracked
 * class the predecessor declared and this one drops is permitted ONLY when this profile's `version`
 * FIELD is strictly greater than the predecessor's. Copying a profile to a new filename, deleting a
 * class, and leaving `version` untouched is the silent coverage shrink LB5 names — the rule catches
 * exactly that. An unparseable predecessor is a WARN, never a silent "nothing was removed": the
 * comparison genuinely could not run, and a skip must be visible (L2). */
function checkCoverageShrink(
  snapshot: RepoSnapshot,
  name: string,
  n: number,
  current: ConventionProfile,
  path: string,
): Finding[] {
  if (n < 2) return [];
  const prevRef = `${name}.v${n - 1}`;
  const prevPath = profileFilePath(prevRef);
  const prevText = snapshot.get(prevPath);
  if (prevText === undefined) return [];
  const prev = parseConventionProfile(prevText, name);
  if (!prev.profile) {
    return [
      {
        severity: "WARN",
        path,
        line: 1,
        message:
          `predecessor profile ${prevPath} is present but unusable (${prev.errors[0]}) — the ` +
          `class-removed-without-bump comparison could not run; this is a skipped check, not a clean bill`,
      },
    ];
  }
  const currentClasses = new Set(current.tracked_classes.map((c) => c.class));
  const removed = prev.profile.tracked_classes.map((c) => c.class).filter((c) => !currentClasses.has(c));
  if (removed.length === 0) return [];
  if (current.version > prev.profile.version) return [];
  return [
    profileError(
      path,
      `class-removed-without-bump: tracked class${removed.length === 1 ? "" : "es"} ` +
        `${removed.map((c) => `"${c}"`).join(", ")} present in ${prevPath} ${removed.length === 1 ? "is" : "are"} ` +
        `absent here, but "version" is ${current.version} and ${prevPath}'s is ${prev.profile.version}. ` +
        `Shrinking Gate 9's tracked coverage is a compat event (CLAUDE.md rule 10): bump "version" ` +
        `deliberately, or restore the class`,
    ),
  ];
}

/** Resolves + validates the profile named by `.rk/config.json`'s `conventionProfile`.
 * `ref === undefined` (nothing configured) is the legitimate cold-start state: no findings, 0/0.
 * Every other outcome is counted — an unknown reference, a malformed key, a malformed profile, and
 * the coverage-shrink rule. */
export function validateConventionProfile(snapshot: RepoSnapshot, ref: string | undefined): ProfileValidation {
  if (ref === undefined) return { findings: [], checked: 0, total: 0 };

  const m = REF_RE.exec(ref);
  if (!m) {
    return {
      findings: [
        profileError(
          ".rk/config.json",
          `conventionProfile ${JSON.stringify(ref)} is not a valid profile reference — it must be ` +
            `<name>.v<n> (lowercase name, positive integer n, no path separators, no ".json" suffix), ` +
            `naming ${CONVENTIONS_DIR}/<name>.v<n>.json`,
        ),
      ],
      checked: 0,
      total: 1,
    };
  }
  const name = m[1]!;
  const n = Number(m[2]!);
  const path = profileFilePath(ref);
  const text = snapshot.get(path);
  if (text === undefined) {
    const present = listFilesRecursive(snapshot, CONVENTIONS_DIR, ".json");
    return {
      findings: [
        profileError(
          ".rk/config.json",
          `conventionProfile "${ref}" names ${path}, which is not present` +
            `${present.length > 0 ? ` (present: ${present.join(", ")})` : ` (${CONVENTIONS_DIR}/ holds no profile at all)`}` +
            ` — an unknown profile is never treated as "no profile configured"`,
        ),
      ],
      checked: 0,
      total: 1,
    };
  }

  const parsed = parseConventionProfile(text, name);
  if (!parsed.profile) {
    return {
      findings: parsed.errors.map((e) => profileError(path, `malformed ${path}: ${e}`)),
      checked: 0,
      total: 1,
    };
  }
  const shrink = checkCoverageShrink(snapshot, name, n, parsed.profile, path);
  const blocked = shrink.some((f) => f.severity === "ERROR");
  return {
    findings: shrink,
    checked: blocked ? 0 : 1,
    total: 1,
    profile: parsed.profile,
  };
}
