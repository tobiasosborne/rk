// PURITY: pure — no fs/network/clock (L3). The CONVENTION PROFILE accessor: the closed vocabulary
// a signature's predicate keys and values are drawn from, the ORDER on each key, and the interval
// containment rule entailment is defined by. Ground truth:
// docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md sections 5-6, the campaign profile draft
// `../rk-campaign-E/docs/conventions-qpcp-v1-draft.md` section 9 AND the codex Tier A review of
// that draft (findings 10-13), and docs/gate-contracts.md Gate 2 Check 17(c).
//
// SCOPE BOUNDARY (deliberate, recorded): the profile's own SCHEMA
// (`schemas/convention-profile.v1.json`) and its campaign content (gap normalisation, term
// conventions, NLTS phrasing, tracked symbol classes) belong to the notation/profile work item
// (memo section 5, bead rk-5lzf), NOT to this one. This module reads the profile through the
// SMALLEST shape Check 17 needs — the per-key ORDER — and IGNORES every other top-level key, so the
// richer profile that lane lands validates here unchanged. What it does NOT do is guess: a profile
// with no usable vocabulary, an edge naming an undeclared value, or a cyclic order is refused
// outright (fail closed), never silently treated as an empty or partial vocabulary.
//
// TWO ORDER KINDS, because one of them was a lie:
//   - `chain`  — a total order, written weakest -> strongest: `gap: inv-poly < inv-log < const`.
//   - `poset`  — a PARTIAL order, declared by its cover edges `[a, b]` meaning `a <= b`. The
//                review's finding 12: `reduction` is genuinely not totally ordered (`quasi-poly`
//                is a time bound, `quantum-poly` a model widening; neither implies the other), and
//                linearising it ACCEPTS pairs a partial order rejects — quiet over-acceptance on a
//                validity surface. An unordered enum is the degenerate case: a poset with no
//                edges, on which entailment is equality.
//
// ONE ENTAILMENT RULE, because two were a lie too. Every predicate value is an INTERVAL over its
// key's order (see `PredicateValue`, src/gates/signature.ts). A CONTEXT interval C entails a
// REQUIREMENT interval R iff C is CONTAINED in R: `R.lo <= C.lo` and `C.hi <= R.hi`, with a `null`
// endpoint meaning unbounded on that side. This subsumes the afforded/capped/equality polarity an
// earlier draft carried as a per-key flag — "at least a constant gap" is the requirement
// `[inv-poly, const]`, "dimension at most constant" is `[null, const]`, and an enum requirement is
// a point interval — so the flag is GONE, and a profile still carrying `key_polarity` is refused
// rather than read under semantics its author did not intend.
//
// On a poset, containment uses the partial order and INCOMPARABLE means NOT ENTAILED — which is
// the whole point: a `quasi-poly` result does not discharge a `turing` requirement, nor the
// reverse.

import type { Bound, PredicateValue } from "./signature";

export type LatticeSpec =
  | { kind: "chain"; values: readonly string[] }
  | { kind: "poset"; values: readonly string[]; edges: readonly (readonly [string, string])[] };

/** The subset of the convention profile Check 17 consumes: one ORDER per predicate key. Extra
 * top-level keys in the on-disk profile are ignored by construction (see the header). */
export interface ConventionProfile {
  /** The profile's name as configured, e.g. "qpcp.v1" — carried so a finding can name it. */
  name: string;
  keys: Record<string, LatticeSpec>;
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

function readValues(raw: unknown, where: string): { ok: true; values: string[] } | { ok: false; why: string } {
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string" || v.length === 0)) {
    return { ok: false, why: `${where} must be an array of non-empty strings` };
  }
  const values = raw as string[];
  if (values.length === 0) {
    return { ok: false, why: `${where} is empty — a key with no admissible value can never be entailed` };
  }
  if (new Set(values).size !== values.length) {
    return { ok: false, why: `${where} repeats a value — the order would then be ambiguous` };
  }
  return { ok: true, values };
}

function readSpec(raw: unknown, key: string): { ok: true; spec: LatticeSpec } | { ok: false; why: string } {
  // Sugar: a bare array is a CHAIN, the spelling the memo and the campaign draft both use.
  if (Array.isArray(raw)) {
    const v = readValues(raw, `"lattices.${key}"`);
    return v.ok ? { ok: true, spec: { kind: "chain", values: v.values } } : v;
  }
  if (!isPlainObject(raw)) return { ok: false, why: `"lattices.${key}" must be an array (a chain) or {kind, values, edges}` };
  const kind = raw.kind ?? "chain";
  if (kind !== "chain" && kind !== "poset") {
    return { ok: false, why: `"lattices.${key}.kind" must be "chain" or "poset"` };
  }
  const v = readValues(raw.values, `"lattices.${key}.values"`);
  if (!v.ok) return v;
  if (kind === "chain") {
    if (raw.edges !== undefined) {
      return { ok: false, why: `"lattices.${key}" is a chain but declares "edges" — a chain's order IS its array order` };
    }
    return { ok: true, spec: { kind: "chain", values: v.values } };
  }
  const rawEdges = raw.edges;
  if (!Array.isArray(rawEdges)) return { ok: false, why: `"lattices.${key}.edges" must be an array of [a, b] pairs meaning a <= b` };
  const declared = new Set(v.values);
  const edges: [string, string][] = [];
  for (const [i, e] of rawEdges.entries()) {
    if (!Array.isArray(e) || e.length !== 2 || e.some((x) => typeof x !== "string")) {
      return { ok: false, why: `"lattices.${key}.edges"[${i}] must be a two-element [a, b] pair of strings` };
    }
    const [a, b] = e as [string, string];
    if (!declared.has(a) || !declared.has(b)) {
      return { ok: false, why: `"lattices.${key}.edges"[${i}] names a value not in "values": ${!declared.has(a) ? a : b}` };
    }
    if (a === b) return { ok: false, why: `"lattices.${key}.edges"[${i}] is the self-edge [${a}, ${a}] — reflexivity is implicit` };
    edges.push([a, b]);
  }
  const spec: LatticeSpec = { kind: "poset", values: v.values, edges };
  const cycle = findCycle(spec);
  if (cycle) {
    return { ok: false, why: `"lattices.${key}" has a cycle in its order (${cycle.join(" <= ")}) — distinct values that are mutually <= are one value, not an order` };
  }
  return { ok: true, spec };
}

function findCycle(spec: Extract<LatticeSpec, { kind: "poset" }>): string[] | undefined {
  for (const v of spec.values) {
    for (const w of reachable(spec, v)) {
      if (w !== v && reachable(spec, w).has(v)) return [v, w, v];
    }
  }
  return undefined;
}

function reachable(spec: Extract<LatticeSpec, { kind: "poset" }>, from: string): Set<string> {
  const seen = new Set<string>([from]);
  const stack = [from];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const [a, b] of spec.edges) {
      if (a === cur && !seen.has(b)) {
        seen.add(b);
        stack.push(b);
      }
    }
  }
  return seen;
}

/** Parses profile TEXT into the accessor shape. Fails closed: an unparseable, non-object, or
 * structurally unusable profile yields `ok: false` and NO partial vocabulary — a half-read profile
 * is how "unknown key" silently becomes "no key is known" (CLAUDE.md L2). */
export function parseConventionProfile(name: string, text: string): ProfileParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, why: `not parseable JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!isPlainObject(raw)) return { ok: false, why: "the profile must be a JSON object" };
  if (raw.key_polarity !== undefined) {
    return {
      ok: false,
      why:
        `the profile declares "key_polarity", which this version does not implement. Predicate ` +
        `values are INTERVALS and entailment is containment (codex Tier A review of the profile ` +
        `draft, findings 10-11), so a capped constraint is written as the requirement ` +
        `[null, <bound>] rather than as a second key with a polarity flag. Reading a polarised ` +
        `profile under interval semantics would silently apply an order the author did not intend`,
    };
  }

  const keys: Record<string, LatticeSpec> = {};
  const lattices = raw.lattices;
  if (lattices !== undefined) {
    if (!isPlainObject(lattices)) return { ok: false, why: `"lattices" must be an object mapping key -> order` };
    for (const [key, value] of Object.entries(lattices)) {
      const spec = readSpec(value, key);
      if (!spec.ok) return spec;
      keys[key] = spec.spec;
    }
  }
  const enums = raw.enums;
  if (enums !== undefined) {
    if (!isPlainObject(enums)) return { ok: false, why: `"enums" must be an object mapping key -> value list` };
    for (const [key, value] of Object.entries(enums)) {
      if (key in keys) return { ok: false, why: `key '${key}' is declared as BOTH a lattice and an enum — the order would be ambiguous` };
      const v = readValues(value, `"enums.${key}"`);
      if (!v.ok) return v;
      // An enum is the DEGENERATE poset: no edges, so entailment on it is equality. One
      // representation, one comparison function — never a second "unordered" code path.
      keys[key] = { kind: "poset", values: v.values, edges: [] };
    }
  }
  if (Object.keys(keys).length === 0) {
    return { ok: false, why: `neither "lattices" nor "enums" declares a single key — there is no vocabulary to check against` };
  }
  return { ok: true, profile: { name, keys } };
}

/** `key`'s declared order, or `undefined` when the profile declares it nowhere (⇒ `unknown-key`). */
export function keySpec(profile: ConventionProfile, key: string): LatticeSpec | undefined {
  return profile.keys[key];
}

/** The declared values for `key`, in profile order. */
export function keyValues(profile: ConventionProfile, key: string): readonly string[] | undefined {
  return profile.keys[key]?.values;
}

/** True iff `a <= b` in `key`'s order. Reflexive. On a chain, index comparison; on a poset,
 * reachability over the declared edges. Either value undeclared ⇒ false (an unknown value is
 * reported separately and must never also read as satisfaction). */
export function leq(profile: ConventionProfile, key: string, a: string, b: string): boolean {
  const spec = profile.keys[key];
  if (!spec) return false;
  if (!spec.values.includes(a) || !spec.values.includes(b)) return false;
  if (a === b) return true;
  if (spec.kind === "chain") return spec.values.indexOf(a) <= spec.values.indexOf(b);
  return reachable(spec, a).has(b);
}

export interface Interval {
  lo: Bound;
  hi: Bound;
}

/** A value as its interval. A bare string is the point interval. */
export function intervalOf(value: PredicateValue): Interval {
  return typeof value === "string" ? { lo: value, hi: value } : { lo: value[0], hi: value[1] };
}

/** True iff the interval is consistent in `key`'s order: an unbounded endpoint always is, and a
 * bounded pair must satisfy `lo <= hi`. On a poset, INCOMPARABLE endpoints are inconsistent — an
 * interval between two incomparable values names no set of values anyone can reason about. */
export function intervalConsistent(profile: ConventionProfile, key: string, iv: Interval): boolean {
  if (iv.lo === null || iv.hi === null) return true;
  return leq(profile, key, iv.lo, iv.hi);
}

/** ENTAILMENT: the context interval `ctx` entails the requirement interval `req` iff `ctx` is
 * CONTAINED in `req` — `req.lo <= ctx.lo` and `ctx.hi <= req.hi`, a `null` requirement endpoint
 * being unbounded (satisfied by anything) and a `null` CONTEXT endpoint being unbounded (satisfied
 * only by an equally unbounded requirement). On a poset, incomparable endpoints are NOT entailed. */
export function intervalEntails(profile: ConventionProfile, key: string, ctx: Interval, req: Interval): boolean {
  const loOk = req.lo === null || (ctx.lo !== null && leq(profile, key, req.lo, ctx.lo));
  const hiOk = req.hi === null || (ctx.hi !== null && leq(profile, key, ctx.hi, req.hi));
  return loOk && hiOk;
}

/** True iff SOME value the context holds for `key` entails `required`. A context holding nothing
 * for the key never entails (fail closed: an undeclared bound is not a guarantee), and an unknown
 * key or value never entails either — vocabulary errors are reported separately (Check 17(c)) and
 * must not also read as satisfaction. */
export function keyEntailed(
  profile: ConventionProfile,
  key: string,
  available: Iterable<PredicateValue>,
  required: PredicateValue,
): boolean {
  if (!profile.keys[key]) return false;
  const req = intervalOf(required);
  for (const v of available) {
    if (intervalEntails(profile, key, intervalOf(v), req)) return true;
  }
  return false;
}
