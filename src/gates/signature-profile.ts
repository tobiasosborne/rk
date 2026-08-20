// PURITY: pure — no fs/network/clock (L3). The CONVENTION PROFILE accessor: the closed
// vocabulary a signature's predicate keys and values are drawn from. Ground truth:
// docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md sections 5 and 6, docs/gate-contracts.md
// Gate 2 Check 17(c).
//
// SCOPE BOUNDARY (deliberate, recorded): the profile's own SCHEMA (`schemas/convention-profile
// .v1.json`) and its campaign content (`.rk/conventions/qpcp.v1.json` — gap normalisation,
// term conventions, NLTS phrasing, tracked symbol classes) belong to the notation/profile work
// item (memo section 5, bead rk-5lzf), NOT to this one. This module therefore reads the profile
// through the SMALLEST shape Check 17 actually needs — `lattices` and `enums` — and IGNORES every
// other top-level key, so the richer profile that lane lands validates here unchanged. What it
// does NOT do is guess: a profile with no usable `lattices`/`enums` map is refused outright
// (fail closed), never silently treated as an empty vocabulary that would make every key
// "unknown" or, worse, every key acceptable.
//
// LATTICE DIRECTION, stated once because everything downstream depends on it: each lattice is an
// array ordered WEAKEST -> STRONGEST, where "stronger" means "supplies more". A requirement
// `key: r` is entailed by a context value `c` iff `rank(c) >= rank(r)`. For `gap:
// ["inv-poly","inv-log","const"]` that reads the obvious way (a constant gap covers an
// inverse-polynomial requirement). For `d: ["const","poly"]` it reads as the memo's own worked
// example: a result that NEEDS poly-dimensional qudits is unavailable in a constant-dimension
// context, because const sits below poly.

/** The subset of the convention profile Check 17 consumes. Extra keys in the on-disk profile are
 * ignored by construction (see the header's scope boundary). */
export interface ConventionProfile {
  /** The profile's name as configured, e.g. "qpcp.v1" — carried so a finding can name it. */
  name: string;
  /** key -> values ordered WEAKEST -> STRONGEST. */
  lattices: Record<string, readonly string[]>;
  /** key -> unordered closed value set (entailment is equality). */
  enums: Record<string, readonly string[]>;
}

export type ProfileParse = { ok: true; profile: ConventionProfile } | { ok: false; why: string };

/** `.rk/conventions/<name>.json`. The `.v<n>` suffix lives INSIDE `name` (the configured value is
 * e.g. "qpcp.v1"), so a profile version bump is a different file, never an in-place edit. */
export function conventionProfilePath(name: string): string {
  return `.rk/conventions/${name}.json`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readValueMap(
  raw: unknown,
  field: string,
  requireNonEmpty: boolean,
): { ok: true; value: Record<string, readonly string[]> } | { ok: false; why: string } {
  if (raw === undefined) return { ok: true, value: {} };
  if (!isPlainObject(raw)) return { ok: false, why: `"${field}" must be an object mapping key -> value list` };
  const out: Record<string, readonly string[]> = {};
  for (const [key, values] of Object.entries(raw)) {
    if (!Array.isArray(values) || values.some((v) => typeof v !== "string" || v.length === 0)) {
      return { ok: false, why: `"${field}.${key}" must be an array of non-empty strings` };
    }
    if (requireNonEmpty && values.length === 0) {
      return { ok: false, why: `"${field}.${key}" is empty — a key with no admissible value can never be entailed` };
    }
    if (new Set(values).size !== values.length) {
      return { ok: false, why: `"${field}.${key}" repeats a value — the order would then be ambiguous` };
    }
    out[key] = values as string[];
  }
  return { ok: true, value: out };
}

/** Parses profile TEXT into the accessor shape. Fails closed: an unparseable, non-object, or
 * structurally unusable profile yields `ok: false` and NO partial vocabulary — a half-read
 * profile is how "unknown key" silently becomes "no key is known" (CLAUDE.md L2). */
export function parseConventionProfile(name: string, text: string): ProfileParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, why: `not parseable JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!isPlainObject(raw)) return { ok: false, why: "the profile must be a JSON object" };
  const lattices = readValueMap(raw.lattices, "lattices", true);
  if (!lattices.ok) return lattices;
  const enums = readValueMap(raw.enums, "enums", true);
  if (!enums.ok) return enums;
  const both = Object.keys(lattices.value).filter((k) => k in enums.value);
  if (both.length > 0) {
    return { ok: false, why: `key(s) declared as BOTH a lattice and an enum: ${both.sort().join(", ")} — the comparison rule would be ambiguous` };
  }
  if (Object.keys(lattices.value).length === 0 && Object.keys(enums.value).length === 0) {
    return { ok: false, why: `neither "lattices" nor "enums" declares a single key — there is no vocabulary to check against` };
  }
  return { ok: true, profile: { name, lattices: lattices.value, enums: enums.value } };
}

export type KeyKind = "lattice" | "enum";

/** Which comparison rule `key` obeys, or `undefined` when the profile declares it nowhere
 * (⇒ `unknown-key`). */
export function keyKind(profile: ConventionProfile, key: string): KeyKind | undefined {
  if (key in profile.lattices) return "lattice";
  if (key in profile.enums) return "enum";
  return undefined;
}

/** The declared values for `key`, in profile order (weakest -> strongest for a lattice). */
export function keyValues(profile: ConventionProfile, key: string): readonly string[] | undefined {
  return profile.lattices[key] ?? profile.enums[key];
}

/** `value`'s position in `key`'s lattice, or `undefined` when the key is not a lattice or the
 * value is not declared. */
export function valueRank(profile: ConventionProfile, key: string, value: string): number | undefined {
  const lattice = profile.lattices[key];
  if (!lattice) return undefined;
  const i = lattice.indexOf(value);
  return i === -1 ? undefined : i;
}

/** True iff SOME value the context holds for `key` meets the `required` value: for a lattice, a
 * value at or above `required`'s rank; for an enum, exact equality. An unknown key or unknown
 * value never entails — vocabulary errors are reported separately (Check 17(c)) and must not also
 * read as satisfaction. */
export function keyEntailed(
  profile: ConventionProfile,
  key: string,
  available: Iterable<string>,
  required: string,
): boolean {
  const kind = keyKind(profile, key);
  if (kind === undefined) return false;
  if (kind === "enum") {
    if (!(profile.enums[key] ?? []).includes(required)) return false;
    for (const v of available) if (v === required) return true;
    return false;
  }
  const need = valueRank(profile, key, required);
  if (need === undefined) return false;
  for (const v of available) {
    const have = valueRank(profile, key, v);
    if (have !== undefined && have >= need) return true;
  }
  return false;
}
