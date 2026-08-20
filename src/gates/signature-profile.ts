// PURITY: pure — no fs/network/clock (L3). The CONVENTION PROFILE accessor: the closed
// vocabulary a signature's predicate keys and values are drawn from, and the POLARITY that fixes
// each key's comparison direction. Ground truth:
// docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md sections 5 and 6, the campaign profile draft
// `../rk-campaign-E/docs/conventions-qpcp-v1-draft.md` sections 9.1-9.3 + decision D4, and
// docs/gate-contracts.md Gate 2 Check 17(c).
//
// SCOPE BOUNDARY (deliberate, recorded): the profile's own SCHEMA
// (`schemas/convention-profile.v1.json`) and its campaign content (gap normalisation, term
// conventions, NLTS phrasing, tracked symbol classes) belong to the notation/profile work item
// (memo section 5, bead rk-5lzf), NOT to this one. This module therefore reads the profile through
// the SMALLEST shape Check 17 actually needs — `lattices`, `enums`, and each key's polarity — and
// IGNORES every other top-level key, so the richer profile that lane lands validates here
// unchanged. What it does NOT do is guess: a profile with no usable vocabulary, or with a key
// whose polarity is undeclared, is refused outright (fail closed), never silently treated as an
// empty vocabulary (which would make every key "unknown") or a default polarity (which would
// silently pick a comparison direction on a validity surface).
//
// POLARITY — the whole reason this module is not just a map of arrays. The memo declared ONE rule
// ("context value at or above the required value") over lattices like `d: const < poly`. The
// profile lane showed that rule is unsound for CAPPED constraints: read literally, a context of
// `qdim: poly` would satisfy a requirement of `qdim: const`, i.e. "this result holds only when the
// dimension is constant" would be discharged by a polynomial-dimension ambient. Two readings are
// genuinely needed by the corpus (amplification needs dimension ROOM; the north star CAPS
// dimension), so each key declares which it is:
//
//   - `afforded`  — "at least this much of the parameter is available".
//                   Entailed iff rank(context) >= rank(required).
//   - `capped`    — "the parameter is guaranteed to be at most this".
//                   Entailed iff rank(context) <= rank(required)  (a tighter guarantee is stronger).
//   - `equality`  — an unordered enum; entailed iff the values are equal. Putting a false order on
//                   these (pretending `energy-density-qudit` is "above" `relative`) is exactly the
//                   quiet coercion the profile exists to forbid.
//
// ORDER DIRECTION, stated once and binding on every profile: `values` is ALWAYS ordered by the
// underlying PARAMETER, smallest/weakest -> largest/strongest, WHATEVER the polarity. Polarity
// picks the comparison; it never re-reads the array backwards. The draft's alternative convention
// (write a `_cap` lattice reversed and keep one comparison) is REJECTED here because combined with
// a polarity field it double-flips — and silently, since both spellings parse. `parseConventionProfile`
// therefore REFUSES a profile in which `<key>_cap` is the reverse of its base `<key>`, naming the
// trap, rather than accepting an ordering whose meaning depends on which convention the author had
// in mind. The memo's own red pair is unaffected: it is a clash on the AFFORDED key (a result
// needing poly-dimension room, consumed in a constant-dimension context), not on a capped key.

/** Which comparison rule a key obeys. */
export const POLARITIES = ["afforded", "capped", "equality"] as const;
export type Polarity = (typeof POLARITIES)[number];
export type OrderedPolarity = "afforded" | "capped";

export interface LatticeEntry {
  /** Ordered by the underlying parameter, weakest -> strongest, whatever the polarity. */
  values: readonly string[];
  polarity: OrderedPolarity;
}

/** The subset of the convention profile Check 17 consumes. Extra keys in the on-disk profile are
 * ignored by construction (see the header's scope boundary). */
export interface ConventionProfile {
  /** The profile's name as configured, e.g. "qpcp.v1" — carried so a finding can name it. */
  name: string;
  lattices: Record<string, LatticeEntry>;
  /** key -> unordered closed value set; polarity `equality`. */
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

interface RawEntry {
  values: string[];
  /** Polarity declared INLINE on the entry, when the `{values, polarity}` spelling is used. */
  inline?: Polarity;
}

function readValues(raw: unknown, field: string, key: string): { ok: true; entry: RawEntry } | { ok: false; why: string } {
  let values: unknown = raw;
  let inline: Polarity | undefined;
  if (isPlainObject(raw)) {
    values = raw.values;
    const p = raw.polarity;
    if (p !== undefined) {
      if (typeof p !== "string" || !(POLARITIES as readonly string[]).includes(p)) {
        return { ok: false, why: `"${field}.${key}.polarity" must be one of ${POLARITIES.join(", ")}` };
      }
      inline = p as Polarity;
    }
  }
  if (!Array.isArray(values) || values.some((v) => typeof v !== "string" || v.length === 0)) {
    return { ok: false, why: `"${field}.${key}" must be an array of non-empty strings (or {values, polarity})` };
  }
  if (values.length === 0) {
    return { ok: false, why: `"${field}.${key}" is empty — a key with no admissible value can never be entailed` };
  }
  if (new Set(values as string[]).size !== values.length) {
    return { ok: false, why: `"${field}.${key}" repeats a value — the order would then be ambiguous` };
  }
  return { ok: true, entry: { values: values as string[], inline } };
}

function readMap(
  raw: unknown,
  field: string,
): { ok: true; value: Record<string, RawEntry> } | { ok: false; why: string } {
  if (raw === undefined) return { ok: true, value: {} };
  if (!isPlainObject(raw)) return { ok: false, why: `"${field}" must be an object mapping key -> value list` };
  const out: Record<string, RawEntry> = {};
  for (const [key, values] of Object.entries(raw)) {
    const entry = readValues(values, field, key);
    if (!entry.ok) return entry;
    out[key] = entry.entry;
  }
  return { ok: true, value: out };
}

function readPolarityMap(raw: unknown): { ok: true; value: Record<string, Polarity> } | { ok: false; why: string } {
  if (raw === undefined) return { ok: true, value: {} };
  if (!isPlainObject(raw)) return { ok: false, why: `"key_polarity" must be an object mapping key -> polarity` };
  const out: Record<string, Polarity> = {};
  for (const [key, p] of Object.entries(raw)) {
    if (typeof p !== "string" || !(POLARITIES as readonly string[]).includes(p)) {
      return { ok: false, why: `"key_polarity.${key}" must be one of ${POLARITIES.join(", ")}` };
    }
    out[key] = p as Polarity;
  }
  return { ok: true, value: out };
}

/** Resolves one key's polarity from the two accepted spellings, refusing a contradiction. */
function resolvePolarity(
  key: string,
  entry: RawEntry,
  declared: Record<string, Polarity>,
): { ok: true; polarity: Polarity } | { ok: false; why: string } {
  const fromMap = declared[key];
  if (entry.inline !== undefined && fromMap !== undefined && entry.inline !== fromMap) {
    return { ok: false, why: `key '${key}' declares polarity '${entry.inline}' inline and '${fromMap}' in "key_polarity" — they must agree` };
  }
  const polarity = entry.inline ?? fromMap;
  if (polarity === undefined) {
    return {
      ok: false,
      why:
        `key '${key}' declares no polarity — every key must state 'afforded', 'capped', or ` +
        `'equality' (profile draft section 9.1 / D4). There is no default: guessing a comparison ` +
        `direction on a validity surface is how a capped constraint silently reads as an afforded one`,
    };
  }
  return { ok: true, polarity };
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
  const rawLattices = readMap(raw.lattices, "lattices");
  if (!rawLattices.ok) return rawLattices;
  const rawEnums = readMap(raw.enums, "enums");
  if (!rawEnums.ok) return rawEnums;
  const declared = readPolarityMap(raw.key_polarity);
  if (!declared.ok) return declared;

  const both = Object.keys(rawLattices.value).filter((k) => k in rawEnums.value);
  if (both.length > 0) {
    return { ok: false, why: `key(s) declared as BOTH a lattice and an enum: ${both.sort().join(", ")} — the comparison rule would be ambiguous` };
  }
  if (Object.keys(rawLattices.value).length === 0 && Object.keys(rawEnums.value).length === 0) {
    return { ok: false, why: `neither "lattices" nor "enums" declares a single key — there is no vocabulary to check against` };
  }

  const lattices: Record<string, LatticeEntry> = {};
  for (const [key, entry] of Object.entries(rawLattices.value)) {
    const p = resolvePolarity(key, entry, declared.value);
    if (!p.ok) return p;
    if (p.polarity === "equality") {
      return { ok: false, why: `key '${key}' is declared under "lattices" but with polarity 'equality' — an unordered key belongs under "enums"` };
    }
    lattices[key] = { values: entry.values, polarity: p.polarity };
  }
  const enums: Record<string, readonly string[]> = {};
  for (const [key, entry] of Object.entries(rawEnums.value)) {
    const p = resolvePolarity(key, entry, declared.value);
    if (!p.ok) return p;
    if (p.polarity !== "equality") {
      return { ok: false, why: `key '${key}' is declared under "enums" but with polarity '${p.polarity}' — an ordered key belongs under "lattices"` };
    }
    enums[key] = entry.values;
  }

  // The double-flip trap (see the header): a `_cap` key written as the REVERSE of its base key
  // means the author used the "reversed array + one comparison" convention, which combined with a
  // polarity field compares backwards — silently, since both spellings parse.
  for (const key of Object.keys(lattices)) {
    if (!key.endsWith("_cap")) continue;
    const base = lattices[key.slice(0, -"_cap".length)];
    if (!base) continue;
    const capValues = lattices[key]!.values;
    if (capValues.length === base.values.length && capValues.every((v, i) => v === base.values[base.values.length - 1 - i])) {
      return {
        ok: false,
        why:
          `'${key}' is written as the REVERSE of '${key.slice(0, -"_cap".length)}'. Every lattice — ` +
          `capped ones included — is ordered by the underlying parameter, weakest -> strongest; ` +
          `polarity 'capped' flips the COMPARISON, so a reversed array flips it twice and the key ` +
          `silently compares backwards`,
      };
    }
  }

  return { ok: true, profile: { name, lattices, enums } };
}

/** Which comparison rule `key` obeys, or `undefined` when the profile declares it nowhere
 * (⇒ `unknown-key`). */
export function keyPolarity(profile: ConventionProfile, key: string): Polarity | undefined {
  if (key in profile.lattices) return profile.lattices[key]!.polarity;
  if (key in profile.enums) return "equality";
  return undefined;
}

/** The declared values for `key`, in profile order (weakest -> strongest for a lattice). */
export function keyValues(profile: ConventionProfile, key: string): readonly string[] | undefined {
  return profile.lattices[key]?.values ?? profile.enums[key];
}

/** `value`'s position in `key`'s lattice, or `undefined` when the key is not a lattice or the
 * value is not declared. */
export function valueRank(profile: ConventionProfile, key: string, value: string): number | undefined {
  const lattice = profile.lattices[key];
  if (!lattice) return undefined;
  const i = lattice.values.indexOf(value);
  return i === -1 ? undefined : i;
}

/** True iff SOME value the context holds for `key` meets the `required` value, under `key`'s
 * declared POLARITY (see this file's header). An unknown key or unknown value never entails —
 * vocabulary errors are reported separately (Check 17(c)) and must not also read as satisfaction.
 * A context holding NOTHING for the key never entails either, in either polarity: an undeclared
 * cap is not a guarantee. */
export function keyEntailed(
  profile: ConventionProfile,
  key: string,
  available: Iterable<string>,
  required: string,
): boolean {
  const polarity = keyPolarity(profile, key);
  if (polarity === undefined) return false;
  if (polarity === "equality") {
    if (!(profile.enums[key] ?? []).includes(required)) return false;
    for (const v of available) if (v === required) return true;
    return false;
  }
  const need = valueRank(profile, key, required);
  if (need === undefined) return false;
  for (const v of available) {
    const have = valueRank(profile, key, v);
    if (have === undefined) continue;
    if (polarity === "afforded" ? have >= need : have <= need) return true;
  }
  return false;
}
