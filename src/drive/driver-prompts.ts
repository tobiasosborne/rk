// PURITY: pure — no fs/network/clock (L3). M3.5-prep: prompt assembly for the two live-dispatch
// roles src/drive/driver-live.ts drives — verifier and prover. Boring and cache-stable BY
// CONSTRUCTION, not by discipline: `buildSharedContext`'s signature takes only claim-level inputs
// (conjecture, definitions, contract guidance) and has NO parameter that could vary per item, so it
// is IMPOSSIBLE for two turns of the same claim to compute a different shared block — the M3.0
// caching spike's whole dispatch model (docs/worker-contract.md section (d)) only pays off if the
// exact same bytes precede every turn of a session, and this is the mechanical guarantee of that,
// not a promise a caller could violate. `buildVerifierTurnPrompt`/`buildProverTurnPrompt` build the
// PER-ITEM content sent on turn 2..N (docs/worker-contract.md section (a): "each subsequent item...
// is sent as ONLY its own content") — neither ever re-embeds the shared block (contract rule 6:
// never build a turn as shared_prefix+item concatenated, even inside one resumed turn).
//
// Prover-overreach guard (src/drive/driver-guardrails.ts's `detectProverOverreach`): a prover's own
// prompt therefore NEVER uses verdict vocabulary ("verdict"/"accept"/"challenge"/"VALID"/
// "INVALID"/"INVALID"/"outcome") anywhere in its instructions — the guard depends on provers never
// even being ASKED for one; `PROVER_FORBIDDEN_WORDS` in the test suite is the mechanical check.
//
// Deliberately NOT built here: a balloon-classification prompt. That is a THIRD, narrower shape
// (`{classification, rationale}`, src/drive/driver-balloon.ts's `parseClassificationReview`) the
// task brief for this WP does not name alongside verifier/prover; src/drive/driver-live.ts builds
// that one ad hoc, inline, and says so.
//
// rk-tbg (shard-cap split, 370 -> three files, cycle removed 2026-07-25 per Tier A review): this
// file is the STABLE PUBLIC re-export hub plus the PROVER role's own prompt assembly. The
// ROLE-NEUTRAL pieces (`buildSharedContext`, `OUTPUT_SCHEMA_REF`, `renderRepairPrompt`) live in
// driver-prompts-shared.ts — belonging to NEITHER role's module, exactly because both need them.
// The VERIFIER role's two-tier verdict instructions, per-item turn builder, and repair-prompt
// wrapper live in driver-prompts-verifier.ts. This file imports FROM both and re-exports their
// public names unchanged, so every existing import site needed zero edits — but it does NOT import
// anything back FROM driver-prompts-verifier.ts's own internals, and driver-prompts-verifier.ts
// does not import from this file either: both import driver-prompts-shared.ts instead. That is what
// makes the three-file graph acyclic BY CONSTRUCTION rather than merely "safe today because nothing
// happens to hoist a call to module-evaluation time" (the prior two-file cycle's actual guarantee).

import type { RawIssue } from "./verdict-raw";
// rk-tbg: the ROLE-NEUTRAL pieces now live in their own module (280-line shard cap, and the thing
// that breaks the driver-prompts.ts <-> driver-prompts-verifier.ts cycle) — re-exported here
// unchanged so every existing import site (src/cli/verify-live.ts, verify-live-io.ts,
// src/drive/driver-live.ts, tests) is unaffected.
export { OUTPUT_SCHEMA_REF, buildSharedContext, type DefinitionText, type SharedContextInput } from "./driver-prompts-shared";
import { renderRepairPrompt } from "./driver-prompts-shared";
// rk-tbg: the VERIFIER role's prompt assembly lives in its own module (280-line shard cap) —
// re-exported here unchanged so every existing import site (src/drive/driver-live-dispatch.ts,
// tests) is unaffected by the split. driver-prompts-verifier.ts does NOT import from this file (it
// imports driver-prompts-shared.ts instead), so this re-export is one-way: no cycle.
export { buildVerifierTurnPrompt, buildRepairTurnPrompt, type VerifierDep, type VerifierItemInput } from "./driver-prompts-verifier";

// --- Prover turn prompt (item 2..N content only) --------------------------------------------------

export interface ProverItemInput {
  nodeId: string;
  statement: string;
  deps: readonly string[];
}

const PROVER_OUTPUT_INSTRUCTIONS = [
  "Respond with EXACTLY one bare JSON object and NOTHING else — no markdown code fences (no ```),",
  "no surrounding prose or commentary. Match:",
  '{"children": [{"statement": <string>, "justification"?: <derivation label>, "depends"?: [<dep ref>, ...]}, ...]}',
  'Each element of "children" is one sub-step of the proof: its "statement" is the sub-claim, its',
  'optional "justification" is a SHORT free-text derivation label naming how the step is established',
  '— use a named logical rule where one genuinely applies (e.g. modus_ponens, by_definition,',
  'contradiction), or a domain-appropriate label for a mathematical step (e.g.',
  'multiplication_by_positive, monotonicity, algebraic_manipulation). Write the label that TRULY',
  'describes the inference; do not force a logical-rule name onto an arithmetic/algebraic step.',
  '',
  'DEPENDENCY CONVENTION for the optional "depends" array (two forms, do not mix them up):',
  '  - To depend on an ALREADY-EXISTING node (this node\'s own dependencies listed above, or any node',
  '    that already exists), use its absolute id as a string, e.g. "1.3".',
  '  - To depend on ANOTHER CHILD IN THIS SAME decomposition (a sibling you are creating right now in',
  '    this children array), use "#N" where N is that sibling\'s 0-based position in your children',
  '    array: "#0" is the FIRST child, "#1" the second, and so on. The children do NOT have absolute',
  '    ids yet — they are all created in one atomic batch — so you MUST NOT reference a sibling by an',
  '    anticipated absolute id (e.g. writing "1.1" for the first child is WRONG and will be rejected).',
  '    Only earlier siblings may be referenced: child at position N may only depend on "#0".."#(N-1)".',
  '  Example: to make your SECOND child depend on your FIRST child, write',
  '  {"children": [{"statement": "Step A"}, {"statement": "Uses Step A", "depends": ["#0"]}]}.',
  'Order the children so each one only relies on earlier siblings ("#N", N < its own position) or on',
  'the already-established dependencies above. Provide at least one child. Do NOT judge the statement',
  '— only decompose and justify it.',
].join("\n");

/** Builds the prover's per-turn content: a request for a `children[]` decomposition that
 * src/drive/driver-af.ts's `af refine` seam records verbatim. NO verdict vocabulary anywhere in this
 * function's output (see file header) — a prover PRODUCES the next proof step, never judges one. */
/** rk-i19: the prover's half of the ONE bounded schema-repair reprompt (src/drive/verdict-repair.ts's
 * `diagnoseRepairableProverTurn` decides; src/drive/driver-live.ts dispatches it exactly once). The
 * three properties `buildRepairTurnPrompt` documents hold here unchanged; ONE more is specific to
 * this role and is a validity precondition rather than a style rule:
 *
 * NO VERDICT VOCABULARY, ANYWHERE — not in this scaffold, not in the re-stated output instructions,
 * and not in the `RawIssue` messages it echoes. `detectProverOverreach`
 * (src/drive/driver-guardrails.ts) discards a prover body carrying a verdict/outcome field precisely
 * BECAUSE a prover is never asked for one; a repair prompt that used that vocabulary would be the
 * one prover-facing prompt that invited the overreach the guard exists to catch. The word ban is
 * enforced mechanically on this function's output AND on every message src/drive/prover-raw.ts can
 * produce (test/drive/driver-prompts.test.ts, test/drive/prover-raw.test.ts).
 *
 * The repaired decomposition gets NO extra trust: it re-enters the identical pipeline
 * (`extractProofContent`, the overreach guard, `buildRecordProofChildren`'s dependency translation,
 * and af's own `record-proof` role/hash CAS), with nothing relaxed. */
export function buildProverRepairTurnPrompt(issues: readonly RawIssue[]): string {
  return renderRepairPrompt(issues, PROVER_OUTPUT_INSTRUCTIONS, "reasoning", "proof step");
}

export function buildProverTurnPrompt(item: ProverItemInput): string {
  const lines: string[] = [];
  lines.push(`## Produce the proof step for node ${item.nodeId}`);
  lines.push("");
  lines.push("Statement:");
  lines.push(item.statement.trim());
  lines.push("");
  lines.push(`Dependencies you may assume already established (${item.deps.length}): ${item.deps.length === 0 ? "(none)" : item.deps.join(", ")}`);
  lines.push("");
  lines.push(PROVER_OUTPUT_INSTRUCTIONS);
  return lines.join("\n");
}
