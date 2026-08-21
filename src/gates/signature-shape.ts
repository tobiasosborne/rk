// PURITY: pure — no fs/network/clock (L3). SHAPE validation for the Layer 1 signature block:
// schemas/signature.v1.json's closed grammar, and the one conversion from the parsed form the
// graph document carries (schemas/graph.v1.json v3) back into that grammar. Split out of
// src/gates/signature.ts under CLAUDE.md rule 4's 280-line hard cap; the two files are one module
// in two shards — signature.ts owns the TYPES, the fence extraction, and the canonical form, this
// one owns "is this value a legal signature at all".
//
// The type import below is `import type` deliberately: it is erased at runtime, so the two shards
// reference each other in the type system without a runtime import cycle.

import type { PredicateValue, Signature, SignaturePredicate } from "./signature";
import { SIGNATURE_SCHEMA_VERSION } from "./signature";

const REQUIRED_KEYS = ["post", "pre", "profile", "regime", "schema_version"] as const;
const OPTIONAL_KEYS = ["hardness"] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** True iff `v` contains a numeric value anywhere. Signature values are STRINGS (or `null` as an
 * unbounded interval endpoint) — which is how the memo's "no floats" becomes mechanical rather
 * than a float/int judgement call at every nesting level. */
function containsNumber(v: unknown): boolean {
  if (typeof v === "number") return true;
  if (Array.isArray(v)) return v.some(containsNumber);
  if (isPlainObject(v)) return Object.values(v).some(containsNumber);
  return false;
}

/** A predicate VALUE is an INTERVAL over the key's declared order (codex Tier A review of the
 * profile draft, findings 10-11): `[lo, hi]`, where either endpoint may be `null` for unbounded.
 * A bare string `x` is SUGAR for the point interval `[x, x]` and is the canonical spelling of one
 * — so there is exactly one canonical encoding per value, and the readable spelling is the
 * canonical one. Intervals subsume the afforded/capped distinction an earlier draft needed two
 * keys and a polarity flag for: "at least a constant gap" is `[inv-poly, const]`, "the dimension
 * is at most constant" is `[null, const]`, and ONE containment rule covers both.
 * ORDER-DEPENDENT validity (lo above hi) is NOT checked here — it needs the profile, so it is
 * reported by the vocabulary stage (src/gates/signature-entail.ts) under the same
 * `signature-malformed` code. */
function readPredicateValue(v: unknown, where: string): { ok: true; value: PredicateValue } | { ok: false; why: string } {
  if (typeof v === "string") {
    if (v.length === 0) return { ok: false, why: `${where} must be a non-empty string` };
    return { ok: true, value: v };
  }
  if (Array.isArray(v)) {
    if (v.length !== 2) {
      return { ok: false, why: `${where} must be an interval [lo, hi] of exactly two endpoints (a bare string is the point interval)` };
    }
    for (const [j, end] of v.entries()) {
      if (end === null) continue;
      if (typeof end !== "string" || end.length === 0) {
        return { ok: false, why: `${where} endpoint ${j === 0 ? "lo" : "hi"} must be a non-empty string or null (unbounded)` };
      }
    }
    const [lo, hi] = v as [string | null, string | null];
    if (lo !== null && hi !== null && lo === hi) {
      return { ok: false, why: `${where} is the point interval ["${lo}", "${lo}"] — its canonical spelling is the bare string "${lo}"` };
    }
    return { ok: true, value: [lo, hi] };
  }
  return { ok: false, why: `${where} must be a string or an interval [lo, hi]` };
}

function parsePredicateList(raw: unknown, field: string): { ok: true; value: SignaturePredicate[] } | { ok: false; why: string } {
  if (!Array.isArray(raw)) return { ok: false, why: `"${field}" must be an array` };
  const out: SignaturePredicate[] = [];
  for (const [i, entry] of raw.entries()) {
    if (!isPlainObject(entry)) return { ok: false, why: `"${field}"[${i}] must be an object` };
    const obj = entry.obj;
    if (typeof obj !== "string" || obj.length === 0) {
      return { ok: false, why: `"${field}"[${i}] must carry a non-empty "obj" (the Layer 0 object id)` };
    }
    const keys: Record<string, PredicateValue> = {};
    for (const [k, v] of Object.entries(entry)) {
      if (k === "obj") continue;
      const value = readPredicateValue(v, `"${field}"[${i}]."${k}"`);
      if (!value.ok) return value;
      keys[k] = value.value;
    }
    if (Object.keys(keys).length === 0) {
      return { ok: false, why: `"${field}"[${i}] carries "obj" but no predicate key — an empty claim about an object` };
    }
    out.push({ obj, keys });
  }
  return { ok: true, value: out };
}

function parseRegimeList(raw: unknown): { ok: true; value: Record<string, PredicateValue>[] } | { ok: false; why: string } {
  if (!Array.isArray(raw)) return { ok: false, why: `"regime" must be an array` };
  const out: Record<string, PredicateValue>[] = [];
  for (const [i, entry] of raw.entries()) {
    if (!isPlainObject(entry)) return { ok: false, why: `"regime"[${i}] must be an object` };
    const keys: Record<string, PredicateValue> = {};
    for (const [k, v] of Object.entries(entry)) {
      if (k === "obj") {
        return {
          ok: false,
          why: `"regime"[${i}] carries "obj" — regime predicates are AMBIENT (object-free) by construction; an object-scoped claim belongs in pre/post`,
        };
      }
      const value = readPredicateValue(v, `"regime"[${i}]."${k}"`);
      if (!value.ok) return value;
      keys[k] = value.value;
    }
    if (Object.keys(keys).length === 0) return { ok: false, why: `"regime"[${i}] is empty` };
    out.push(keys);
  }
  return { ok: true, value: out };
}

/** Validates one already-JSON-parsed signature value against schemas/signature.v1.json's shape.
 * CLOSED: an unknown top-level key is a malformation, not tolerated forward compatibility — a
 * version field exists precisely so vocabulary growth is a bump, never a silent widening
 * (rule 10). */
export function validateSignatureShape(raw: unknown): { ok: true; value: Signature } | { ok: false; why: string } {
  if (!isPlainObject(raw)) return { ok: false, why: "the signature block must be a JSON object" };
  if (containsNumber(raw)) {
    return { ok: false, why: "numeric values are not permitted (every signature value is a string — the canonical form has no floats)" };
  }
  const known = new Set<string>([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);
  for (const k of Object.keys(raw)) {
    if (!known.has(k)) {
      return { ok: false, why: `unknown top-level key "${k}" (known: ${[...known].sort().join(", ")})` };
    }
  }
  for (const k of REQUIRED_KEYS) {
    if (!(k in raw)) return { ok: false, why: `missing required field "${k}"` };
  }
  if (raw.schema_version !== SIGNATURE_SCHEMA_VERSION) {
    return { ok: false, why: `"schema_version" is ${JSON.stringify(raw.schema_version)}, must be the string "${SIGNATURE_SCHEMA_VERSION}"` };
  }
  if (typeof raw.profile !== "string" || raw.profile.length === 0) {
    return { ok: false, why: `"profile" must be a non-empty string naming the convention profile` };
  }
  if ("hardness" in raw && (typeof raw.hardness !== "string" || raw.hardness.length === 0)) {
    return { ok: false, why: `"hardness" must be a non-empty string when present` };
  }
  const pre = parsePredicateList(raw.pre, "pre");
  if (!pre.ok) return pre;
  const post = parsePredicateList(raw.post, "post");
  if (!post.ok) return post;
  const regime = parseRegimeList(raw.regime);
  if (!regime.ok) return regime;

  const value: Signature = {
    schema_version: SIGNATURE_SCHEMA_VERSION,
    profile: raw.profile,
    pre: pre.value,
    post: post.value,
    regime: regime.value,
  };
  if (typeof raw.hardness === "string") value.hardness = raw.hardness;
  return { ok: true, value };
}

/** Validates a signature in its PARSED shape — the form `Signature` itself has (`pre`/`post`
 * entries as `{obj, keys: {...}}`), which is what the graph document carries on a node
 * (schemas/graph.v1.json v3). Delegates to `validateSignatureShape` after flattening each
 * predicate back to its authored `{obj, key: value}` form, so there is ONE set of shape rules and
 * one implementation of them — a second hand-written validator here would drift the day either
 * side gained a field. */
export function validateParsedSignature(raw: unknown): { ok: true; value: Signature } | { ok: false; why: string } {
  if (!isPlainObject(raw)) return { ok: false, why: "the signature must be a JSON object" };
  const flat: Record<string, unknown> = { ...raw };
  for (const field of ["pre", "post"] as const) {
    const list = raw[field];
    if (list === undefined) continue;
    if (!Array.isArray(list)) return { ok: false, why: `"${field}" must be an array` };
    const out: unknown[] = [];
    for (const [i, entry] of list.entries()) {
      if (!isPlainObject(entry)) return { ok: false, why: `"${field}"[${i}] must be an object` };
      const keys = entry.keys;
      if (!isPlainObject(keys)) {
        return { ok: false, why: `"${field}"[${i}] must carry a "keys" object (the parsed predicate form)` };
      }
      const extra = Object.keys(entry).filter((k) => k !== "obj" && k !== "keys");
      if (extra.length > 0) {
        return { ok: false, why: `"${field}"[${i}] carries unexpected propert${extra.length === 1 ? "y" : "ies"} ${extra.sort().join(", ")} (expected exactly obj + keys)` };
      }
      out.push({ obj: entry.obj, ...keys });
    }
    flat[field] = out;
  }
  return validateSignatureShape(flat);
}
