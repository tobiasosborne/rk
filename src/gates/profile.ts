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
const CLASS_RE = /^[a-z0-9][a-z0-9_-]*$/;
/** A tracked token, verbatim as the literature writes it: `\epsilon`, `\lambda_{\min}`, `c`,
 * `QMA`. One lexical unit — whitespace is the only thing forbidden. The schema deliberately admits
 * no patterns (see schemas/convention-profile.v1.json): a pattern silently widens or narrows what
 * is tracked as the register grows. */
const SYMBOL_RE = /^\S+$/;
/** A PLAIN LaTeX macro token — the subset of tracked tokens Gate 9 can scan for reliably, and the
 * required shape of a class's `blessed` macro. */
export const MACRO_TOKEN_RE = /^\\[A-Za-z]+$/;

const TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  "schema_version",
  "name",
  "version",
  "tracked_classes",
  "lattices",
  "choices",
  "enums",
]);
const CLASS_KEYS: ReadonlySet<string> = new Set([
  "class",
  "description",
  "symbols",
  "blessed",
  "symbols_must_be_registered",
]);
const CHOICE_KEYS: ReadonlySet<string> = new Set(["canonical", "allowed_translations", "notes"]);
const CHAIN_KEYS: ReadonlySet<string> = new Set(["kind", "values"]);
const POSET_KEYS: ReadonlySet<string> = new Set(["kind", "values", "edges"]);

/** A total order, written weakest first. */
export interface ChainLattice {
  kind: "chain";
  values: string[];
}

/** A partial order given by explicit covering edges `[weaker, stronger]`. For a key whose middle
 * is genuinely incomparable — `quasi-poly` and `quantum-poly` among reduction classes are not
 * ordered, and linearising them silently ACCEPTS pairs a real order would reject. */
export interface PosetLattice {
  kind: "poset";
  values: string[];
  edges: [string, string][];
}

export type Lattice = ChainLattice | PosetLattice;

export interface TrackedClass {
  class: string;
  description: string;
  /** Raw tokens as the literature writes them — NOT all of them macro-shaped. */
  symbols: string[];
  /** The campaign's single blessed macro for the class; always a plain macro token. */
  blessed: string;
}

export interface ConventionProfile {
  schema_version: string;
  name: string;
  version: number;
  tracked_classes: TrackedClass[];
  lattices: Record<string, Lattice>;
  choices: Record<string, { canonical: string; allowed_translations: string[]; notes?: string }>;
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

/** Every tracked token -> the classes that claim it, INCLUDING each class's `blessed` macro (which
 * is tracked whether or not it also appears in `symbols`). Classes are sorted and deduplicated.
 *
 * A token maps to a LIST, not a single class, and that is the point of the register: the same raw
 * token genuinely denotes different objects in different papers — `\Delta` is a promise gap in one
 * source and a spectral gap in another, `d` is a code distance and a qudit dimension. Forbidding
 * that overlap would forbid the literature. What the register then owes is a shard SAYING which one
 * a given campaign symbol is; Gate 9 enforces that a tracked token is registered by some notation
 * shard in one of its claiming classes. `blessed` macros are the half that IS unique across classes
 * — two classes cannot bless the same macro, or the campaign has no canonical form for either. */
export function trackedSymbolIndex(profile: ConventionProfile): Map<string, string[]> {
  const index = new Map<string, Set<string>>();
  for (const tc of profile.tracked_classes) {
    for (const sym of [...tc.symbols, tc.blessed]) {
      let set = index.get(sym);
      if (set === undefined) {
        set = new Set();
        index.set(sym, set);
      }
      set.add(tc.class);
    }
  }
  return new Map([...index].map(([sym, set]) => [sym, [...set].sort()]));
}

/** The subset of `trackedSymbolIndex` Gate 9 can enforce LEXICALLY: plain macro tokens `\name`.
 * A tracked token outside that shape (a bare identifier like `c`, a brace/subscript form like
 * `\lambda_{\min}`) cannot be scanned for reliably — Gate 9 counts those per class in its coverage
 * line instead of pretending to check them (L2: a skip is always visible with a count). */
export function enforceableSymbolIndex(profile: ConventionProfile): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const [sym, classes] of trackedSymbolIndex(profile)) {
    if (MACRO_TOKEN_RE.test(sym)) index.set(sym, classes);
  }
  return index;
}

/** Tracked tokens that are NOT lexically enforceable — the honest denominator half. */
export function unenforceableSymbols(profile: ConventionProfile): string[] {
  return [...trackedSymbolIndex(profile).keys()].filter((s) => !MACRO_TOKEN_RE.test(s)).sort();
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

/** Validates a poset lattice's `edges`: every pair well-shaped, both endpoints DECLARED in
 * `values`, and the whole relation acyclic. A cycle would make two distinct values mutually
 * entailing, which is not an order at all — and, on the entailment side, would let any value in
 * the cycle discharge a requirement for any other. Returns `undefined` (with errors recorded) when
 * the lattice must be dropped. */
function readPosetEdges(
  key: string,
  values: readonly string[],
  raw: unknown,
  errors: string[],
): [string, string][] | undefined {
  if (!Array.isArray(raw)) {
    errors.push(`lattices["${key}"].edges must be an array of [weaker, stronger] pairs`);
    return undefined;
  }
  const declared = new Set(values);
  const edges: [string, string][] = [];
  let bad = false;
  raw.forEach((e, i) => {
    if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== "string" || typeof e[1] !== "string") {
      errors.push(`lattices["${key}"].edges[${i}] must be a [weaker, stronger] pair of strings`);
      bad = true;
      return;
    }
    const [from, to] = e as [string, string];
    for (const endpoint of [from, to]) {
      if (!declared.has(endpoint)) {
        errors.push(`lattices["${key}"].edges[${i}] names "${endpoint}", which is not in this lattice's values`);
        bad = true;
      }
    }
    edges.push([from, to]);
  });
  if (bad) return undefined;

  // Cycle detection over the covering relation (a self-loop is the length-1 case and is caught by
  // the same walk).
  const adj = new Map<string, string[]>();
  for (const [from, to] of edges) {
    const list = adj.get(from);
    if (list) list.push(to);
    else adj.set(from, [to]);
  }
  const state = new Map<string, 0 | 1 | 2>(); // 0 unseen, 1 on stack, 2 done
  const stack: string[] = [];
  let cycle: string[] | undefined;
  const visit = (at: string): boolean => {
    if (state.get(at) === 1) {
      cycle = [...stack.slice(stack.indexOf(at)), at];
      return true;
    }
    if (state.get(at) === 2) return false;
    state.set(at, 1);
    stack.push(at);
    for (const next of adj.get(at) ?? []) {
      if (visit(next)) return true;
    }
    stack.pop();
    state.set(at, 2);
    return false;
  };
  for (const v of values) {
    if (visit(v)) break;
  }
  if (cycle) {
    errors.push(
      `lattices["${key}"].edges contain a cycle (${cycle.join(" -> ")}) — a partial order cannot make two ` +
        `distinct values mutually entailing`,
    );
    return undefined;
  }
  return edges;
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
      if ("symbols_must_be_registered" in tc && tc.symbols_must_be_registered !== true) {
        errors.push(
          `tracked_classes[${i}] ("${tc.class}").symbols_must_be_registered is ` +
            `${JSON.stringify(tc.symbols_must_be_registered)}, expected exactly true — v1 admits no advisory ` +
            `class, so any other value is a malformed profile, never a quiet Gate 9 opt-out`,
        );
      }
      if (typeof tc.blessed !== "string" || !MACRO_TOKEN_RE.test(tc.blessed)) {
        errors.push(
          `tracked_classes[${i}] ("${tc.class}").blessed is ${JSON.stringify(tc.blessed)}, expected the ` +
            `campaign's single blessed macro for this class as a plain macro token (e.g. "\\\\gapfrac")`,
        );
        return;
      }
      if (!Array.isArray(tc.symbols) || tc.symbols.length === 0 || !tc.symbols.every((s) => typeof s === "string" && SYMBOL_RE.test(s))) {
        errors.push(
          `tracked_classes[${i}] ("${tc.class}").symbols must be a non-empty array of raw tokens, verbatim as ` +
            `the literature writes them (e.g. "\\\\epsilon", "\\\\lambda_{\\\\min}", "c"); whitespace is forbidden ` +
            `— a token is one lexical unit`,
        );
        return;
      }
      const symbols = tc.symbols as string[];
      if (new Set(symbols).size !== symbols.length) {
        errors.push(`tracked_classes[${i}] ("${tc.class}").symbols has duplicate entries`);
      }
      // Only BLESSED macros are unique across classes. A raw `symbols` token deliberately may be
      // claimed by several classes — that overlap IS the ambiguity the register exists to resolve
      // (`\Delta` is a promise gap in one source and a spectral gap in another), and forbidding it
      // would forbid the literature.
      const blessedOwner = symbolOwner.get(tc.blessed);
      if (blessedOwner !== undefined && blessedOwner !== tc.class) {
        errors.push(
          `blessed macro ${tc.blessed} is claimed by two tracked classes ("${blessedOwner}" and ` +
            `"${tc.class}") — each class has exactly one canonical form, and one macro cannot be it twice`,
        );
      }
      symbolOwner.set(tc.blessed, tc.class as string);
      classes.push({
        class: tc.class,
        description: typeof tc.description === "string" ? tc.description : "",
        symbols: [...symbols],
        blessed: tc.blessed,
      });
    });
  }

  const lattices: Record<string, Lattice> = {};
  if (typeof obj.lattices !== "object" || obj.lattices === null || Array.isArray(obj.lattices)) {
    errors.push('"lattices" must be an object (an empty one is legitimate)');
  } else {
    for (const [key, value] of Object.entries(obj.lattices as Record<string, unknown>)) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        errors.push(
          `lattices["${key}"] must be a tagged object — {kind: "chain", values} or {kind: "poset", ` +
            `values, edges} — never a bare array: an untagged list cannot say whether its middle is ` +
            `honestly comparable, and linearising an incomparable middle silently over-accepts`,
        );
        continue;
      }
      const lat = value as Record<string, unknown>;
      if (lat.kind !== "chain" && lat.kind !== "poset") {
        errors.push(
          `lattices["${key}"].kind is ${JSON.stringify(lat.kind)}, expected "chain" (a total order, ` +
            `weakest first) or "poset" (a partial order given by explicit edges) — an untagged list ` +
            `cannot say whether its middle is honestly comparable`,
        );
        continue;
      }
      const allowed = lat.kind === "chain" ? CHAIN_KEYS : POSET_KEYS;
      const extraLat = Object.keys(lat).filter((k) => !allowed.has(k));
      if (extraLat.length > 0) {
        errors.push(`lattices["${key}"] (${lat.kind}) has unrecognized propert${extraLat.length === 1 ? "y" : "ies"} ${extraLat.map((k) => `"${k}"`).join(", ")}`);
      }
      if (!isStringArray(lat.values) || lat.values.length < 2 || new Set(lat.values).size !== lat.values.length) {
        errors.push(`lattices["${key}"].values must be an array of >= 2 distinct non-empty strings`);
        continue;
      }
      const values = [...lat.values];
      if (lat.kind === "chain") {
        lattices[key] = { kind: "chain", values };
        continue;
      }
      const edges = readPosetEdges(key, values, lat.edges, errors);
      if (edges === undefined) continue;
      lattices[key] = { kind: "poset", values, edges };
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
      if ("notes" in c && typeof c.notes !== "string") {
        errors.push(`choices["${key}"].notes must be a string when present`);
        continue;
      }
      choices[key] = {
        canonical: c.canonical,
        allowed_translations: [...(c.allowed_translations as string[])],
        ...(typeof c.notes === "string" ? { notes: c.notes } : {}),
      };
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
