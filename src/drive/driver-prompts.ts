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

import type { Tier } from "./vocab";

/** `outputSchemaRef` values (src/drive/backend-types.ts's `TurnItem`) — descriptive names a
 * backend MAY use to constrain generation; not a loaded/enforced schema file at this layer
 * (docs/worker-contract.md section (b): "a second JSON Schema is unnecessary while requests stay
 * internal"). One per tier, matching src/drive/verdict-raw.ts's two raw shapes exactly. */
export const OUTPUT_SCHEMA_REF: Record<Tier, string> = {
  l5: "rk.verdict-raw.l5.v1",
  hard: "rk.verdict-raw.hard.v1",
};

export interface DefinitionText {
  id: string;
  text: string;
}

export interface SharedContextInput {
  /** The claim's conjecture/root statement (AfWorkspaceView.rootStatement for the hard tier). */
  conjecture: string;
  /** Layer-0 definitions/*.md content this claim's nodes cite (RegistryNode.defs, already read
   * off disk by the edge — this module never touches fs itself). */
  definitions: readonly DefinitionText[];
  /** The tier's fixed checklist/rubric boilerplate (docs/worker-contract.md section (a): "the
   * tier's checklist/rubric, outputSchema" is part of what a session's shared context carries). */
  contractGuidance: string;
}

/** Assembles the ONE shared-context block sent exactly once, on turn 1 of a claim's session
 * (docs/worker-contract.md section (a)). Deterministic: same input, same bytes, always — sorted by
 * definition id so a caller supplying `definitions` in a different order (e.g. Set iteration
 * order, fs readdir order) never perturbs the cache key. */
export function buildSharedContext(input: SharedContextInput): string {
  const defs = [...input.definitions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const lines: string[] = [];
  lines.push("# Shared context (sent once per claim session; never repeated on a resumed turn)");
  lines.push("");
  lines.push("## Conjecture");
  lines.push(input.conjecture.trim());
  lines.push("");
  lines.push(`## Definitions (${defs.length})`);
  if (defs.length === 0) lines.push("(none cited)");
  else for (const d of defs) { lines.push(`### ${d.id}`); lines.push(d.text.trim()); }
  lines.push("");
  lines.push("## Guidance");
  lines.push(input.contractGuidance.trim());
  return lines.join("\n");
}

// --- Verifier turn prompt (item 2..N content only) ------------------------------------------------

export interface VerifierItemInput {
  nodeId: string;
  statement: string;
  /** This node's own child claims (af v1's export carries no separate `dependencies` array —
   * src/drive/driver-plan.ts's `AfNodeView.childIds` doc comment explains why this is the honest
   * available proxy for l5). Empty for a leaf. */
  deps: readonly string[];
  tier: Tier;
  /** rk-jit (STOP-4): true iff this node has a statement but NO recorded proof body (no children,
   * no dependencies) — src/drive/driver-plan.ts's `isProoflessNode`, computed at the edge
   * (src/drive/driver-live.ts's `verifierItemFor`). When set, the prompt HARD-FORBIDS an accept:
   * nothing has been derived, so there is nothing to verify and an accept would be vacuous. Optional
   * and defaulting to `false` (a contentful node) so existing callers stay source-compatible. */
  proofless?: boolean;
}

/** rk-jit (STOP-4): the non-negotiable instruction block emitted when the node under review has NO
 * proof body. A verifier cannot accept what does not exist; it MUST return the tier's NEGATIVE
 * verdict naming what is missing. This is the prompt-side half of the bootstrap-deadlock fix — the
 * structural backstop in src/drive/driver-verify-node.ts discards a vacuous accept even if a model
 * ignores this rule, so the two are belt-and-suspenders. Tier-appropriate: the hard tier challenges;
 * l5 returns INVALID. */
function prooflessVerdictRule(tier: Tier): string {
  const forbidden = tier === "hard" ? 'the "accept" outcome' : 'a "VALID" or "VALID-WITH-CORRECTION" verdict';
  const required =
    tier === "hard"
      ? 'a "challenge" outcome targeting this node (its "target" MUST be the node id as a quoted JSON string, e.g. "target": "1" — never a bare number), severity "critical" or "major", category "missing", whose "reason" states that NO proof or derivation has been recorded for this statement and one must be produced first'
      : 'an "INVALID" verdict whose "justification" states that NO proof or derivation has been recorded for this statement and one must be produced first';
  return [
    "HARD RULE — NOTHING TO VERIFY: this node carries a statement but NO recorded proof body (no",
    "sub-steps / children, and no cited dependencies). No reasoning has been written down, so there",
    "is nothing whose validity you could check. The statement's own apparent truth is NOT a proof.",
    `You therefore MUST NOT return ${forbidden}: it would certify a verification that did not happen,`,
    "and rk discards such a vacuous accept regardless of what you write.",
    `You MUST instead return ${required}. There is no other admissible response for a node in this state.`,
  ].join("\n");
}

const HARD_VERDICT_INSTRUCTIONS = [
  "Respond with EXACTLY one bare JSON object and NOTHING else — no markdown code fences (no ```),",
  "no surrounding prose or commentary, just the raw JSON object. It must match:",
  '{"verdict": {"outcome": "accept"} | {"outcome": "challenge", "target": <node id as a JSON string>, "severity": "critical" | "major" | "minor" | "note", "reason": <string>, "category"?: "gap" | "missing" | "dependency" | "incorrect" | "unclear" | "other"}, "justification": <string>}',
  '"accept" means this node\'s claim is validly established given its dependencies below.',
  '"challenge" means it is not; it MUST name a "target" (the node or dependency at fault), a "severity", and a non-blank "reason". There is no third outcome.',
  // rk-qxp: node ids look numeric, so a model tends to emit "target": 1 (a bare number). It MUST be a
  // JSON STRING IN QUOTES — e.g. "target": "1" — never a bare number, and a dotted id MUST be quoted
  // (e.g. "target": "1.10"; the number 1.10 parses to 1.1 and would name the wrong node).
  'The "target" MUST be a JSON string in quotes, e.g. "target": "1" or "target": "1.10" — never a bare number.',
].join("\n");

const L5_VERDICT_INSTRUCTIONS = [
  "Respond with EXACTLY one bare JSON object and NOTHING else — no markdown code fences (no ```),",
  "no surrounding prose or commentary, just the raw JSON object. It must match:",
  '{"verdict": "VALID" | "VALID-WITH-CORRECTION" | "INVALID", "justification": <string>, "correction"?: {"description": <string>, "correctedContentHash": <64-hex-char lowercase SHA-256>}}',
  '"correction" is required on, and only on, a "VALID-WITH-CORRECTION" verdict.',
].join("\n");

/** Builds the verifier's per-turn content (never the shared context — see file header). Includes
 * the node statement, its dependencies, the verification SCOPE (what to judge, and — just as
 * important — what NOT to re-derive), and the tier-appropriate verdict-JSON output instructions
 * matching src/drive/verdict-raw.ts's two raw shapes exactly. */
export function buildVerifierTurnPrompt(item: VerifierItemInput): string {
  const lines: string[] = [];
  lines.push(`## Verify node ${item.nodeId}`);
  lines.push("");
  lines.push("Statement:");
  lines.push(item.statement.trim());
  lines.push("");
  lines.push(`Dependencies (${item.deps.length}): ${item.deps.length === 0 ? "(none)" : item.deps.join(", ")}`);
  lines.push("");
  if (item.proofless === true) {
    // rk-jit (STOP-4): a proofless node gets the HARD RULE in place of the normal verification
    // scope — there is no inference to judge, only a missing proof to demand.
    lines.push(prooflessVerdictRule(item.tier));
  } else {
    lines.push(
      "Scope: judge whether this node's OWN inference is validly established GIVEN its dependencies " +
        "above as already correct — do not re-derive or re-verify the dependencies themselves, only " +
        "this node's step from them.",
    );
  }
  lines.push("");
  lines.push(item.tier === "hard" ? HARD_VERDICT_INSTRUCTIONS : L5_VERDICT_INSTRUCTIONS);
  return lines.join("\n");
}

// --- Prover turn prompt (item 2..N content only) --------------------------------------------------

export interface ProverItemInput {
  nodeId: string;
  statement: string;
  deps: readonly string[];
}

const PROVER_OUTPUT_INSTRUCTIONS = [
  "Respond with EXACTLY one bare JSON object and NOTHING else — no markdown code fences (no ```),",
  "no surrounding prose or commentary. Match:",
  '{"children": [{"statement": <string>, "justification"?: <derivation label>, "depends"?: [<node id>, ...]}, ...]}',
  'Each element of "children" is one sub-step of the proof: its "statement" is the sub-claim, its',
  'optional "justification" is a SHORT free-text derivation label naming how the step is established',
  '— use a named logical rule where one genuinely applies (e.g. modus_ponens, by_definition,',
  'contradiction), or a domain-appropriate label for a mathematical step (e.g.',
  'multiplication_by_positive, monotonicity, algebraic_manipulation). Write the label that TRULY',
  'describes the inference; do not force a logical-rule name onto an arithmetic/algebraic step. Its',
  'optional "depends" lists the node ids it relies on. Order the children so each one only relies on',
  'earlier children or the dependencies above. Provide at least one child. Do NOT judge the',
  'statement — only decompose and justify it.',
].join("\n");

/** Builds the prover's per-turn content: a request for a `children[]` decomposition that
 * src/drive/driver-af.ts's `af refine` seam records verbatim. NO verdict vocabulary anywhere in this
 * function's output (see file header) — a prover PRODUCES the next proof step, never judges one. */
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
