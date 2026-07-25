// PURITY: pure — no fs/network/clock (L3). rk-tbg (shard-cap split, 370 -> three files): the
// VERIFIER role's half of src/drive/driver-prompts.ts's original prompt assembly — the two-tier
// (hard/l5) verdict-instruction blocks, the per-item turn builder, and that role's schema-repair
// reprompt. src/drive/driver-prompts.ts re-exports every name below unchanged, so
// src/drive/driver-live.ts and every existing test needed zero edits — but this module does NOT
// import anything from driver-prompts.ts (a prior version did, for `renderRepairPrompt`, which made
// driver-prompts.ts <-> driver-prompts-verifier.ts a real ESM circular import; a Tier A review
// flagged it as validity-adjacent since prompt bytes are what the overreach guard and the prover
// word ban police). The role-neutral `renderRepairPrompt` (and `buildSharedContext`/
// `OUTPUT_SCHEMA_REF`) now live in driver-prompts-shared.ts, which BOTH this file and
// driver-prompts.ts import from — so the three-file graph is acyclic by construction: this file and
// driver-prompts.ts each depend on driver-prompts-shared.ts, and neither depends on the other.
//
// Same cache-stability contract as before the split (docs/worker-contract.md section (d)):
// `buildVerifierTurnPrompt` builds ONLY the per-item content sent on turn 2..N — it never re-embeds
// driver-prompts-shared.ts's shared block (contract rule 6: never build a turn as
// shared_prefix+item concatenated, even inside one resumed turn).

import type { Tier } from "./vocab";
import type { RawIssue } from "./verdict-raw";
import { renderRepairPrompt } from "./driver-prompts-shared";

// --- Verifier turn prompt (item 2..N content only) ------------------------------------------------

/** GAP 10 (RUN-REPORT-9): one declared dependency, RESOLVED to its content. Before this, the verifier
 * was shown only a dependency's id and — correctly fail-closed — refused to certify an inference from
 * content it was never given ("the contents of dependencies 1.4, 1.5, 1.6 are not provided, so it is
 * impossible to verify..."), stalling the dependency-using node forever. The resolution happens at the
 * edge (src/drive/driver-live-dispatch.ts's `verifierItemFor`), so this pure builder just renders it. */
export interface VerifierDep {
  /** The dependency's absolute node id (from af's `dependencies[]`, rk B2). */
  id: string;
  /** The dependency node's own statement — the CONTENT the verifier judges THIS node's step against. */
  statement: string;
  /** af epistemic state of the dependency (`validated` | `pending` | ...) — rendered as an
   * already-established-or-not flag so the verifier sees whether the depended-on claim is settled. */
  epistemicState: string;
}

export interface VerifierItemInput {
  nodeId: string;
  statement: string;
  /** This node's declared dependencies (rk B2's `dependencies[]`), each RESOLVED to its statement and
   * epistemic state at the edge (src/drive/driver-live-dispatch.ts's `verifierItemFor`). GAP 10:
   * rendered as a dependency-content section so a node leaning on a validated sibling can actually be
   * verified. Empty for a node with no recorded dependencies. */
  deps: readonly VerifierDep[];
  tier: Tier;
  /** rk-jit (STOP-4): true iff this node has a statement but NO recorded proof body (no children,
   * no dependencies) — src/drive/driver-plan.ts's `isProoflessNode`, computed at the edge
   * (src/drive/driver-live-dispatch.ts's `verifierItemFor`). When set, the prompt HARD-FORBIDS an
   * accept: nothing has been derived, so there is nothing to verify and an accept would be vacuous.
   * Optional and defaulting to `false` (a contentful node) so existing callers stay
   * source-compatible. */
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

// rk-xxp (GAP 11, attempt-11 incident): the hard-tier verifier emitted a semantically COMPLETE
// challenge — correct outcome, correct target, a long well-argued `verdict.reason` — and simply
// omitted the SIBLING top-level `justification`, six times across two lemmas, costing 96,066 tokens
// and applying zero nodes. Root cause was output variance, not a parser bug: the same verifier got
// it right on lem-weighted-min. The mitigation is to make the required shape UNMISSABLE rather than
// inferable from a one-line grammar — a literal skeleton the worker copies, with `justification`
// rendered on its own indented line as a visible sibling of `verdict`, plus an explicit statement
// that `verdict.reason` is not a substitute. Vendor-neutral: no backend/model is named, and nothing
// here depends on a particular CLI's behavior. The schema is NOT loosened to accommodate the failure
// (mandatory per-item justification is PRD C3's no-blanket-accepts guarantee).
const HARD_OUTPUT_SKELETON = [
  "REQUIRED OUTPUT SHAPE — copy one of these two skeletons exactly and fill in the values:",
  "",
  "  {",
  '    "verdict": {"outcome": "accept"},',
  '    "justification": "<why you reached this verdict, 1-3 sentences>"',
  "  }",
  "",
  "  {",
  '    "verdict": {"outcome": "challenge", "target": "<node id, quoted>", "severity": "critical", "category": "missing", "reason": "<what is wrong with the target, 1-3 sentences>"},',
  '    "justification": "<why you reached this verdict, 1-3 sentences>"',
  "  }",
  "",
  '"justification" is a REQUIRED TOP-LEVEL key and a SIBLING of "verdict" — never nested inside it.',
  'It is mandatory on EVERY reply, an accept and a challenge alike. A reply with no top-level',
  '"justification" is REJECTED outright, however complete its reasoning is.',
  '"verdict.reason" does NOT substitute for "justification": "reason" states what is wrong with the',
  'target; "justification" states why you reached this verdict. On a challenge you must write BOTH.',
].join("\n");

const HARD_VERDICT_INSTRUCTIONS = [
  "Respond with EXACTLY one bare JSON object and NOTHING else — no markdown code fences (no ```),",
  "no surrounding prose or commentary, just the raw JSON object. It must match:",
  '{"verdict": {"outcome": "accept"} | {"outcome": "challenge", "target": <node id as a JSON string>, "severity": "critical" | "major" | "minor" | "note", "reason": <string>, "category"?: "gap" | "missing" | "dependency" | "incorrect" | "unclear" | "other"}, "justification": <string>}',
  "",
  HARD_OUTPUT_SKELETON,
  "",
  '"accept" means this node\'s claim is validly established given its dependencies below.',
  '"challenge" means it is not; it MUST name a "target" (the node or dependency at fault), a "severity", and a non-blank "reason". There is no third outcome.',
  // rk-qxp: node ids look numeric, so a model tends to emit "target": 1 (a bare number). It MUST be a
  // JSON STRING IN QUOTES — e.g. "target": "1" — never a bare number, and a dotted id MUST be quoted
  // (e.g. "target": "1.10"; the number 1.10 parses to 1.1 and would name the wrong node).
  'The "target" MUST be a JSON string in quotes, e.g. "target": "1" or "target": "1.10" — never a bare number.',
  // rk-d1n (M3.5 live debug): verbose "reason"/"justification" strings correlate with the exit-12
  // parse deaths (a long free-text field ran past the model's output budget and cut off mid-string,
  // yielding unterminated JSON). Cap them HARD and say so — a terse field is cheaper AND does not
  // truncate. This is a generation-side mitigation; the extractor still fails an unterminated object.
  'Keep the "reason" and "justification" strings CONCISE: at most 3 sentences (~400 characters each). State only the essential finding — do NOT restate the node, re-derive the proof, or enumerate every detail. A long explanation risks being truncated mid-string, which produces invalid JSON and FAILS.',
].join("\n");

/** rk-xxp (GAP 11): the l5 half of the same hardening. The l5 shape has no `verdict.reason` sibling
 * to confuse with `justification`, but the mandatory-per-item-justification rule is identical (PRD
 * C3), so the same literal-skeleton treatment applies. */
const L5_OUTPUT_SKELETON = [
  "REQUIRED OUTPUT SHAPE — copy this skeleton exactly and fill in the values:",
  "",
  "  {",
  '    "verdict": "VALID",',
  '    "justification": "<why you reached this verdict, 1-3 sentences>"',
  "  }",
  "",
  '"justification" is a REQUIRED TOP-LEVEL key and a SIBLING of "verdict" — never nested inside it.',
  "It is mandatory on EVERY verdict, positive or negative. A reply with no top-level",
  '"justification" is REJECTED outright, however complete its reasoning is.',
].join("\n");

const L5_VERDICT_INSTRUCTIONS = [
  "Respond with EXACTLY one bare JSON object and NOTHING else — no markdown code fences (no ```),",
  "no surrounding prose or commentary, just the raw JSON object. It must match:",
  '{"verdict": "VALID" | "VALID-WITH-CORRECTION" | "INVALID", "justification": <string>, "correction"?: {"description": <string>, "correctedContentHash": <64-hex-char lowercase SHA-256>}}',
  "",
  L5_OUTPUT_SKELETON,
  "",
  '"correction" is required on, and only on, a "VALID-WITH-CORRECTION" verdict.',
  // rk-d1n (M3.5 live debug): same conciseness cap as the hard tier — a runaway "justification" is the
  // failure mode behind the exit-12 parse deaths (truncated mid-string → unterminated JSON).
  'Keep the "justification" (and any correction "description") string CONCISE: at most 3 sentences (~400 characters). State only the essential finding. A long explanation risks being truncated mid-string, which produces invalid JSON and FAILS.',
].join("\n");

/** GAP 10: renders the "Dependencies (already established)" section — each declared dependency's id,
 * validated-or-not flag, and STATEMENT (the content the verifier judges the node's step against). The
 * verifier uses these as given; the scope line below forbids re-deriving them. A node with no recorded
 * dependencies renders an honest "(none)", never a blank section. */
function renderVerifierDeps(deps: readonly VerifierDep[]): string {
  const lines: string[] = [];
  lines.push(`Dependencies (already established) (${deps.length}):`);
  if (deps.length === 0) {
    lines.push("(none)");
    return lines.join("\n");
  }
  for (const d of deps) {
    const flag = d.epistemicState === "validated" ? "validated" : `not yet validated — state: ${d.epistemicState}`;
    lines.push(`### ${d.id} [${flag}]`);
    lines.push(d.statement.trim());
  }
  return lines.join("\n");
}

/** Builds the verifier's per-turn content (never the shared context — see driver-prompts.ts's file
 * header). Includes the node statement, its dependencies' CONTENT (GAP 10), the verification SCOPE
 * (what to judge, and — just as important — what NOT to re-derive), and the tier-appropriate
 * verdict-JSON output instructions matching src/drive/verdict-raw.ts's two raw shapes exactly. */
export function buildVerifierTurnPrompt(item: VerifierItemInput): string {
  const lines: string[] = [];
  lines.push(`## Verify node ${item.nodeId}`);
  lines.push("");
  lines.push("Statement:");
  lines.push(item.statement.trim());
  lines.push("");
  lines.push(renderVerifierDeps(item.deps));
  lines.push("");
  if (item.proofless === true) {
    // rk-jit (STOP-4): a proofless node gets the HARD RULE in place of the normal verification
    // scope — there is no inference to judge, only a missing proof to demand.
    lines.push(prooflessVerdictRule(item.tier));
  } else {
    lines.push(
      "Scope: judge whether this node's OWN inference is validly established GIVEN the dependencies " +
        "listed above (with their statements) as already correct — do not re-derive, re-prove, or " +
        "re-verify the dependencies themselves, only this node's step from them.",
    );
  }
  lines.push("");
  lines.push(item.tier === "hard" ? HARD_VERDICT_INSTRUCTIONS : L5_VERDICT_INSTRUCTIONS);
  return lines.join("\n");
}

// --- Schema-repair turn prompt (rk-xxp / GAP 11) --------------------------------------------------

/** Builds the ONE bounded schema-repair reprompt sent on the SAME session when a verifier turn's
 * output failed raw-shape validation or single-object extraction (src/drive/verdict-repair.ts's
 * `diagnoseRepairableTurn` decides; src/drive/driver-live-dispatch.ts dispatches it exactly once).
 *
 * Three properties this prompt must have, all of them load-bearing:
 * 1. It echoes the CONCRETE issues (`verdict-raw.ts`'s own `RawIssue[]` path+message list), never a
 *    generic "that was invalid" — the attempt-11 worker believed it HAD justified its verdict, so a
 *    vague retry would very likely have reproduced the same object.
 * 2. It asks for the corrected object ONLY, with the assessment unchanged. A repair turn is a
 *    SHAPE correction, not a second opinion: inviting re-analysis would let a rejected challenge
 *    quietly become an accept, which is a validity change smuggled in through an encoding fix.
 * 3. It says this is the only correction. There is exactly one repair attempt per dispatch by
 *    construction (driver-live-dispatch.ts never recurses), and telling the worker so removes any
 *    incentive to hedge or ask a clarifying question instead of answering.
 *
 * The repaired reply gets NO extra trust: it re-enters the identical pipeline (raw-shape validation,
 * `bindVerdicts`, hash re-confirmation, cross-vendor gate). Nothing here relaxes any of that. */
export function buildRepairTurnPrompt(tier: Tier, issues: readonly RawIssue[]): string {
  return renderRepairPrompt(issues, tier === "hard" ? HARD_VERDICT_INSTRUCTIONS : L5_VERDICT_INSTRUCTIONS, "assessment", "verdict");
}
