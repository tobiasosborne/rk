// PURITY: pure — no fs/network/clock (L3). rk-i19: shape (a) for the PROVER role — what a prover
// worker actually returns for one turn. The structural mirror of src/drive/verdict-raw.ts (which
// owns the VERIFIER's raw shape), and it exists for the same reason: `liveDispatchProve` had the
// identical exit-12 death mode GAP 11 fixed for the verifier, but no `RawIssue[]`-producing
// validator for `{children:[...]}`, so a bounded repair reprompt had nothing CONCRETE to echo back
// (a vague "that was wrong" reprompt is what the GAP 11 incident analysis rejected outright).
//
// THE SCHEMA IS DERIVED, NEVER INVENTED. Every rule below is already required by code that consumes
// a prover body; this module only states those requirements as issues a worker can act on:
//   - top level `{children: [...]}`, non-empty  — src/drive/driver-prove-node.ts's
//     `extractProofContent` returns `undefined` for a missing/non-array/empty `children`, and
//     src/drive/driver-prompts.ts's `PROVER_OUTPUT_INSTRUCTIONS` asks for exactly this object and
//     says "Provide at least one child".
//   - `child.statement`, non-blank string       — `extractProofContent` rejects a non-string or
//     whitespace-only statement; af's own `childSpec.statement` (../vibefeld/cmd/af/refine.go) is
//     the field it becomes.
//   - `child.justification`, optional string    — `extractProofContent` accepts it only when a
//     non-blank string is present; src/drive/driver-af.ts's `buildRecordProofChildren` maps it to
//     af's `inference`.
//   - `child.depends`, optional string[]        — `extractProofContent` accepts only well-typed
//     string entries; `buildRecordProofChildren` translates each into af's namespace (`#N` in-batch
//     sibling or an absolute existing id) and FAILS LOUDLY on anything else.
//
// rk-xfzg (2026-07-30): `extractProofContent` now DEFERS TO THIS VALIDATOR — it calls
// `validateRawProverOutput` itself and returns `undefined` for ANY non-empty issue list, then builds
// `ProofContent` from the now-known-clean body. Before rk-xfzg, `extractProofContent` ran its own,
// laxer copy of these rules and had TWO silent-drop paths this validator already refused: an unknown
// key (top level or per child — including af's own `inference` spelling instead of the prompt's
// `justification`) was dropped rather than rejected, and a non-string `depends` entry was `.filter`ed
// out rather than refused. Both meant the content vanished, the turn still counted as usable, and the
// worker was never told. There is now exactly ONE place this schema is stated: this file. A body
// this validator refuses is refused by `extractProofContent` too, by construction — there is nothing
// left to drift.
//
// EVERY MESSAGE HERE IS PROVER-PROMPT BYTES. The repair reprompt echoes them verbatim, so they are
// (a) self-teaching — they say what to write, not merely which key was wrong — and (b) free of
// verdict vocabulary, because src/drive/driver-guardrails.ts's `detectProverOverreach` depends on a
// prover never being ASKED to judge anything. test/drive/prover-raw.test.ts enforces both.

import { isNonBlankString } from "./vocab";
import type { RawIssue } from "./verdict-raw";

/** One child sub-step, as a prover is asked to write it (the wire form of
 * src/drive/driver-prove-node.ts's `ProofChild`). */
export interface RawProverChild {
  statement: string;
  justification?: string;
  depends?: string[];
}

/** A prover turn's raw body: a decomposition and nothing else. There is no field here for a
 * driver-owned value, exactly as `verdict-raw.ts`'s shape (a) has none. */
export interface RawProverOutput {
  children: RawProverChild[];
}

const TOP_LEVEL_KEYS = ["children"] as const;
const CHILD_KEYS = ["statement", "justification", "depends"] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkNoExtraKeys(obj: Record<string, unknown>, allowed: readonly string[], path: string, issues: RawIssue[], teaching: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key)) issues.push({ path: `${path}.${key}`, message: `unknown property '${key}' — ${teaching}` });
  }
}

const EXTRA_TOP_TEACHING =
  "a prover reply carries ONLY the top-level 'children' array and no other key; driver-owned fields (itemId, contentHash, tier, batchId, identity) are never read from worker output, so their presence is refused outright rather than ignored";
const EXTRA_CHILD_TEACHING =
  "a child carries ONLY 'statement', 'justification' and 'depends'; any other spelling (including af's own internal field names) is refused here because its content would otherwise be silently dropped from the recorded proof";

const DEPENDS_ENTRY_MESSAGE =
  'must be a non-blank JSON string — reference an ALREADY-EXISTING step by its absolute id in quotes (e.g. "1.3"), or an EARLIER SIBLING in this same children array as "#N", a 0-based index into the array you are writing right now ("#0" is its first element). Never a bare number, never null';

function validateChild(v: unknown, path: string, issues: RawIssue[]): void {
  if (!isPlainObject(v)) {
    issues.push({ path, message: 'each child must be a JSON object, e.g. {"statement": "<the sub-step>", "justification": "<derivation label>", "depends": ["#0"]}' });
    return;
  }
  checkNoExtraKeys(v, CHILD_KEYS, path, issues, EXTRA_CHILD_TEACHING);
  if (!("statement" in v)) {
    issues.push({ path: `${path}.statement`, message: "missing required property 'statement' — every child MUST carry its own sub-claim as a non-blank string" });
  } else if (!isNonBlankString(v.statement)) {
    issues.push({ path: `${path}.statement`, message: "must be a non-blank string — every child MUST carry its own sub-claim as text, never a number, an object, or whitespace" });
  }
  if ("justification" in v && !isNonBlankString(v.justification)) {
    issues.push({
      path: `${path}.justification`,
      message:
        "must be a non-blank string when present — it is a SHORT free-text derivation label naming how this step is established (e.g. modus_ponens, by_definition, monotonicity, algebraic_manipulation); omit the key entirely rather than sending a blank one",
    });
  }
  if ("depends" in v) {
    if (!Array.isArray(v.depends)) {
      issues.push({ path: `${path}.depends`, message: `must be a JSON array of reference strings when present — ${DEPENDS_ENTRY_MESSAGE.replace(/^must be a /, "each entry is a ")}` });
    } else {
      v.depends.forEach((entry, i) => {
        if (!isNonBlankString(entry)) issues.push({ path: `${path}.depends[${i}]`, message: DEPENDS_ENTRY_MESSAGE });
      });
    }
  }
}

/** Validates an untrusted prover body against the shape above. Returns `[]` iff `raw` is a usable
 * decomposition. Never throws, and never MUTATES `raw` (unlike `verdict-raw.ts`'s deliberate
 * integer-target coercion, there is no unambiguous coercion to make here: a mis-typed reference or a
 * mis-spelled key is content the worker must restate, not something the driver may guess at). */
export function validateRawProverOutput(raw: unknown): RawIssue[] {
  const issues: RawIssue[] = [];
  if (!isPlainObject(raw)) {
    issues.push({ path: "$", message: 'prover output must be a single JSON object of the form {"children": [...]} — not an array, not a string, not any other JSON value' });
    return issues;
  }
  checkNoExtraKeys(raw, TOP_LEVEL_KEYS, "$", issues, EXTRA_TOP_TEACHING);
  if (!("children" in raw)) {
    issues.push({ path: "$.children", message: 'missing required property \'children\' — the decomposition MUST be a top-level \'children\' array, e.g. {"children": [{"statement": "<the sub-step>"}]}' });
    return issues;
  }
  if (!Array.isArray(raw.children)) {
    issues.push({ path: "$.children", message: "must be a JSON array of child objects, one per sub-step of the proof" });
    return issues;
  }
  if (raw.children.length === 0) {
    issues.push({ path: "$.children", message: "must contain AT LEAST ONE child — an empty decomposition records nothing at all; write the next proof step (or steps) as one child each" });
    return issues;
  }
  raw.children.forEach((child, i) => validateChild(child, `$.children[${i}]`, issues));
  return issues;
}
