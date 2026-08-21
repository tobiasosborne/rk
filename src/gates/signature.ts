// PURITY: pure — no fs/network/clock (L3). The Layer 1 SIGNATURE block: extraction from a shard's
// BODY, shape validation, and the canonical form. Ground truth:
// docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md section 6 (repair of review LB2/LB6),
// schemas/signature.v1.json, docs/gate-contracts.md Gate 2 Check 17.
//
// WHY THE BODY AND NOT FRONTMATTER (decided here, recorded in schemas/signature.v1.json and
// docs/gate-contracts.md): `parseFrontmatter` (src/gates/snapshot.ts) is a FLAT `key: value`
// YAML subset — the only nesting it understands is a `- item` block list under an empty-valued
// key, which it flattens into a `;`-separated STRING. A signature is a list of maps
// (`{obj, key: value, ...}`), which that grammar cannot represent at all: written as frontmatter
// every `obj:`/`gap:` line would either be swallowed as a top-level field or reported as a
// malformed line. Widening the frontmatter grammar to real YAML would change the parse of every
// existing shard in every gate — a validity-semantics change far outside this bead. So the
// signature is a FENCED JSON block in the shard body, exactly as the memo's "encoded as a fenced
// JSON object (canonical: sorted keys, no floats, schema_version)" specifies.
//
// A malformed or unparseable block is NEVER reported as "absent" (memo section 6): the caller
// receives a `malformed` state carrying its own error code, so an authoring typo can never
// silently skip the entailment check.

import { validateSignatureShape } from "./signature-shape";

export { validateParsedSignature, validateSignatureShape } from "./signature-shape";

/** `schema_version` every signature block must carry, as a STRING (rule 10 — a version field a
 * consumer checks before parsing the rest). */
export const SIGNATURE_SCHEMA_VERSION = "1";

/** The fenced block's info string: ```` ```signature ````. */
export const SIGNATURE_FENCE_INFO = "signature";

/** One endpoint of a predicate interval. `null` means UNBOUNDED on that side. */
export type Bound = string | null;

/** A predicate VALUE is an INTERVAL `[lo, hi]` over its key's declared order (codex Tier A review
 * of the convention-profile draft, findings 10-11). A bare string `x` is the point interval
 * `[x, x]`, and is its canonical spelling. Entailment is CONTAINMENT: a context interval entails a
 * requirement interval iff the context is contained in it. That one rule covers both readings the
 * corpus needs — "at least this much is available" (`gap: [inv-poly, const]` as a requirement) and
 * "the parameter is at most this" (`qdim: [null, const]`) — which an earlier draft needed two keys
 * and a polarity flag to express. */
export type PredicateValue = string | [Bound, Bound];

/** One `pre`/`post` entry: a predicate on ONE Layer 0 object. `obj` is the object's
 * `definitions/*.md` id; `keys` are the profile-declared predicate keys and their interval values
 * (`{obj: def-promise-gap, gap: const}` parses to
 * `{obj: "def-promise-gap", keys: {gap: "const"}}`). */
export interface SignaturePredicate {
  obj: string;
  keys: Record<string, PredicateValue>;
}

/** The parsed signature. `regime` entries are OBJECT-FREE predicates on the ambient parameters —
 * they live in their own scope and never satisfy an object-scoped predicate (that conflation is
 * exactly the unsoundness review LB2 broke v1's atom-wise matcher with). */
export interface Signature {
  schema_version: string;
  profile: string;
  pre: SignaturePredicate[];
  post: SignaturePredicate[];
  regime: Record<string, PredicateValue>[];
  hardness?: string;
}

export type SignatureMalformedCode = "signature-malformed" | "signature-noncanonical";

export type SignatureBlock =
  | { state: "absent" }
  | { state: "malformed"; code: SignatureMalformedCode; message: string; line: number }
  | { state: "ok"; signature: Signature; line: number };

const FENCE = "```";


interface RawFence {
  /** 1-indexed line of the opening fence. */
  line: number;
  /** The block's inner text (between the fences), verbatim. */
  text: string;
  terminated: boolean;
}

/** Every ```` ```signature ```` fenced block in `content`, in document order. A fence opened and
 * never closed is returned with `terminated: false` (a malformed state, never a silent drop). */
function findFences(content: string): RawFence[] {
  const lines = content.split("\n");
  const out: RawFence[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (!trimmed.startsWith(FENCE)) continue;
    const info = trimmed.slice(FENCE.length).trim();
    if (info !== SIGNATURE_FENCE_INFO) continue;
    const body: string[] = [];
    let terminated = false;
    let j = i + 1;
    for (; j < lines.length; j++) {
      if (lines[j]!.trim() === FENCE) {
        terminated = true;
        break;
      }
      body.push(lines[j]!);
    }
    out.push({ line: i + 1, text: body.join("\n"), terminated });
    i = j;
  }
  return out;
}

/** The signature's canonical JSON VALUE. Predicate identity is per SCOPE and KEY, not per authored
 * object literal: values are collected and deduplicated for each `(scope,key)`, sorted by rendered
 * text, then emitted as rows. Row i carries every key having an ith value. Thus the normal case is
 * one predicate per scope; extra rows survive only for conflicting values of one key. */
function canonicalValue(sig: Signature): Record<string, unknown> {
  const value: Record<string, unknown> = {
    post: canonicalPredicates(sig.post),
    pre: canonicalPredicates(sig.pre),
    profile: sig.profile,
    regime: canonicalRows(sig.regime),
    schema_version: sig.schema_version,
  };
  if (sig.hardness !== undefined) value.hardness = sig.hardness;
  return sortKeys(value);
}

/** Collapses every point interval `[x, x]` to its canonical bare-string spelling. Applied before
 * sorting, so two signatures that differ only in which spelling they used canonicalise to the same
 * bytes — one value, one encoding. (`readPredicateValue` in signature-shape.ts refuses the verbose
 * spelling outright, so this is belt-and-braces for values constructed in memory.) */
function normaliseValues(keys: Record<string, PredicateValue>): Record<string, PredicateValue> {
  const out: Record<string, PredicateValue> = {};
  for (const [k, v] of Object.entries(keys)) {
    out[k] = Array.isArray(v) && v[0] !== null && v[0] === v[1] ? v[0] : v;
  }
  return out;
}

/** Canonical rows for one scope. Authored map boundaries carry no meaning: only the distinct
 * values attached to each key survive. */
function canonicalRows(maps: readonly Record<string, PredicateValue>[]): Record<string, PredicateValue>[] {
  const perKey = new Map<string, PredicateValue[]>();
  for (const map of maps) {
    for (const [key, value] of Object.entries(normaliseValues(map))) {
      const values = perKey.get(key) ?? [];
      const rendered = JSON.stringify(value);
      if (!values.some((v) => JSON.stringify(v) === rendered)) values.push(value);
      perKey.set(key, values);
    }
  }
  for (const values of perKey.values()) {
    values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  const rows = Math.max(0, ...[...perKey.values()].map((values) => values.length));
  const out: Record<string, PredicateValue>[] = [];
  for (let i = 0; i < rows; i++) {
    const row: Record<string, PredicateValue> = {};
    for (const key of [...perKey.keys()].sort()) {
      const value = perKey.get(key)![i];
      if (value !== undefined) row[key] = value;
    }
    out.push(row);
  }
  return out;
}

function canonicalPredicates(predicates: readonly SignaturePredicate[]): Record<string, unknown>[] {
  const byObject = new Map<string, Record<string, PredicateValue>[]>();
  for (const predicate of predicates) {
    const maps = byObject.get(predicate.obj) ?? [];
    maps.push(predicate.keys);
    byObject.set(predicate.obj, maps);
  }
  const out: Record<string, unknown>[] = [];
  for (const obj of [...byObject.keys()].sort()) {
    for (const row of canonicalRows(byObject.get(obj)!)) out.push(sortKeys({ obj, ...row }));
  }
  return sortByText(out);
}

function sortKeys<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o).sort()) out[k] = o[k];
  return out as T;
}

function sortByText<T>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = JSON.stringify(a);
    const tb = JSON.stringify(b);
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
}

/** The canonical BYTES a shard's ```signature block must carry verbatim: `JSON.stringify` with
 * recursively sorted keys, sorted arrays, and 2-space indentation. Indented rather than compact
 * so the authored artifact stays readable — the anti-drift property is that it is DETERMINED, not
 * that it is dense. */
export function canonicalSignatureText(sig: Signature): string {
  return JSON.stringify(canonicalValue(sig), null, 2);
}

/** The canonical in-memory form (sorted predicate keys, sorted arrays). Idempotent. */
export function canonicalSignature(sig: Signature): Signature {
  const parsed = validateSignatureShape(JSON.parse(canonicalSignatureText(sig)));
  if (!parsed.ok) throw new Error(`canonicalSignature: not a valid signature (${parsed.why})`);
  return parsed.value;
}

/** Extracts the ONE ```signature block from a shard's text. Absent ⇒ `{state:"absent"}` (a
 * legitimate state; whether it is REQUIRED is the caller's question, per `.rk/config.json`'s
 * `signatures` field). Present-but-broken ⇒ `{state:"malformed"}` with its own code — never
 * "absent" (memo section 6: "A malformed or unparseable signature is an ERROR, never 'no
 * signature'"). */
export function extractSignatureBlock(content: string): SignatureBlock {
  const fences = findFences(content);
  if (fences.length === 0) return { state: "absent" };
  const first = fences[0]!;
  if (fences.length > 1) {
    return {
      state: "malformed",
      code: "signature-malformed",
      line: first.line,
      message: `${fences.length} \`\`\`${SIGNATURE_FENCE_INFO} blocks in one shard (lines ${fences.map((f) => f.line).join(", ")}) — a shard states exactly one signature`,
    };
  }
  if (!first.terminated) {
    return { state: "malformed", code: "signature-malformed", line: first.line, message: "unterminated ```signature fence (no closing ```)" };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(first.text);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return { state: "malformed", code: "signature-malformed", line: first.line, message: `signature block is not parseable JSON: ${why}` };
  }
  const shape = validateSignatureShape(raw);
  if (!shape.ok) {
    return { state: "malformed", code: "signature-malformed", line: first.line, message: `signature block shape: ${shape.why}` };
  }
  const canonical = canonicalSignatureText(shape.value);
  if (first.text.trim() !== canonical) {
    return {
      state: "malformed",
      code: "signature-noncanonical",
      line: first.line,
      message:
        "signature block is not in canonical encoding (sorted keys, sorted entries, 2-space " +
        "indent) — canonical identity is what makes two signatures comparable at all (bite, " +
        "src/graph/bite.ts), so a non-canonical encoding is refused rather than normalised silently",
    };
  }
  return { state: "ok", signature: shape.value, line: first.line };
}
