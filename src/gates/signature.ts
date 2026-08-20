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

/** `schema_version` every signature block must carry, as a STRING (rule 10 — a version field a
 * consumer checks before parsing the rest). */
export const SIGNATURE_SCHEMA_VERSION = "1";

/** The fenced block's info string: ```` ```signature ````. */
export const SIGNATURE_FENCE_INFO = "signature";

/** One `pre`/`post` entry: a predicate on ONE Layer 0 object. `obj` is the object's
 * `definitions/*.md` id; `keys` are the profile-declared predicate keys and their lattice/enum
 * values (`{obj: def-promise-gap, gap: const, norm: relative}` parses to
 * `{obj: "def-promise-gap", keys: {gap: "const", norm: "relative"}}`). */
export interface SignaturePredicate {
  obj: string;
  keys: Record<string, string>;
}

/** The parsed signature. `regime` entries are OBJECT-FREE predicates on the ambient parameters —
 * they live in their own scope and never satisfy an object-scoped predicate (that conflation is
 * exactly the unsoundness review LB2 broke v1's atom-wise matcher with). */
export interface Signature {
  schema_version: string;
  profile: string;
  pre: SignaturePredicate[];
  post: SignaturePredicate[];
  regime: Record<string, string>[];
  hardness?: string;
}

export type SignatureMalformedCode = "signature-malformed" | "signature-noncanonical";

export type SignatureBlock =
  | { state: "absent" }
  | { state: "malformed"; code: SignatureMalformedCode; message: string; line: number }
  | { state: "ok"; signature: Signature; line: number };

const FENCE = "```";
const REQUIRED_KEYS = ["post", "pre", "profile", "regime", "schema_version"] as const;
const OPTIONAL_KEYS = ["hardness"] as const;

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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** True iff `v` contains a numeric value anywhere. Signature values are STRINGS — which is how
 * the memo's "no floats" becomes mechanical rather than a float/int judgement call at every
 * nesting level. */
function containsNumber(v: unknown): boolean {
  if (typeof v === "number") return true;
  if (Array.isArray(v)) return v.some(containsNumber);
  if (isPlainObject(v)) return Object.values(v).some(containsNumber);
  return false;
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
    const keys: Record<string, string> = {};
    for (const [k, v] of Object.entries(entry)) {
      if (k === "obj") continue;
      if (typeof v !== "string" || v.length === 0) {
        return { ok: false, why: `"${field}"[${i}]."${k}" must be a non-empty string value` };
      }
      keys[k] = v;
    }
    if (Object.keys(keys).length === 0) {
      return { ok: false, why: `"${field}"[${i}] carries "obj" but no predicate key — an empty claim about an object` };
    }
    out.push({ obj, keys });
  }
  return { ok: true, value: out };
}

function parseRegimeList(raw: unknown): { ok: true; value: Record<string, string>[] } | { ok: false; why: string } {
  if (!Array.isArray(raw)) return { ok: false, why: `"regime" must be an array` };
  const out: Record<string, string>[] = [];
  for (const [i, entry] of raw.entries()) {
    if (!isPlainObject(entry)) return { ok: false, why: `"regime"[${i}] must be an object` };
    const keys: Record<string, string> = {};
    for (const [k, v] of Object.entries(entry)) {
      if (k === "obj") {
        return {
          ok: false,
          why: `"regime"[${i}] carries "obj" — regime predicates are AMBIENT (object-free) by construction; an object-scoped claim belongs in pre/post`,
        };
      }
      if (typeof v !== "string" || v.length === 0) {
        return { ok: false, why: `"regime"[${i}]."${k}" must be a non-empty string value` };
      }
      keys[k] = v;
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

/** The signature's canonical JSON VALUE: every object's keys sorted, every array's elements
 * sorted by their own canonical rendering. Two signatures making the same claim canonicalise to
 * byte-identical text — that is what makes bite's "same claim" test (src/graph/bite.ts) immune to
 * reordering and re-nesting. */
function canonicalValue(sig: Signature): Record<string, unknown> {
  const predicate = (p: SignaturePredicate): Record<string, string> => sortKeys({ obj: p.obj, ...p.keys });
  const value: Record<string, unknown> = {
    post: sortByText(sig.post.map(predicate)),
    pre: sortByText(sig.pre.map(predicate)),
    profile: sig.profile,
    regime: sortByText(sig.regime.map((r) => sortKeys(r))),
    schema_version: sig.schema_version,
  };
  if (sig.hardness !== undefined) value.hardness = sig.hardness;
  return sortKeys(value);
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
