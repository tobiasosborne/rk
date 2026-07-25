// PURITY: pure — no fs/network/clock (L3). rk-tbg (cycle removal, Tier A review 2026-07-25): the
// ROLE-NEUTRAL third of src/drive/driver-prompts.ts's original prompt assembly — pieces that belong
// to NEITHER the verifier module (driver-prompts-verifier.ts) nor the prover module
// (driver-prompts.ts itself) because both roles depend on them. Extracted so neither role module
// imports the other: before this split, driver-prompts.ts re-exported from driver-prompts-verifier.ts
// while ALSO being imported BACK by it (for `renderRepairPrompt`) — a real ESM circular import that
// happened to be safe only because every cross-reference stayed inside a function body, never at
// module-evaluation time. That safety was an accident of call timing, not a structural guarantee, so
// a Tier A review (validity-adjacent: prompt bytes are what the overreach guard and the prover word
// ban police) flagged it. This module has NO import from either role file, so the cycle is now
// impossible by construction: driver-prompts.ts and driver-prompts-verifier.ts both import FROM here,
// and neither imports the other.
//
// `buildSharedContext`: boring and cache-stable BY CONSTRUCTION, not by discipline — its signature
// takes only claim-level inputs (conjecture, definitions, contract guidance) and has NO parameter
// that could vary per item, so it is IMPOSSIBLE for two turns of the same claim to compute a
// different shared block. The M3.0 caching spike's whole dispatch model (docs/worker-contract.md
// section (d)) only pays off if the exact same bytes precede every turn of a session; this is the
// mechanical guarantee of that.
//
// `renderRepairPrompt`: the role-neutral repair-prompt BODY both `buildRepairTurnPrompt` (verifier)
// and `buildProverRepairTurnPrompt` (prover) wrap with their own tier/role-specific output
// instructions. It carries no verdict vocabulary of its own and no role identity — genuinely neutral.

import type { Tier } from "./vocab";
import type { RawIssue } from "./verdict-raw";

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

/** The role-neutral repair-prompt body. `keepNoun` names what the worker must NOT change (the whole
 * point: a repair turn is a SHAPE correction, never a second opinion) and `recordNoun` names what is
 * lost if the second reply is also malformed. Everything else — the three load-bearing properties
 * documented above `buildRepairTurnPrompt` (driver-prompts-verifier.ts) and `buildProverRepairTurnPrompt`
 * (driver-prompts.ts) — is identical for every role, so it lives here once. */
export function renderRepairPrompt(issues: readonly RawIssue[], outputInstructions: string, keepNoun: string, recordNoun: string): string {
  const lines: string[] = [];
  lines.push("## Your previous reply was REJECTED — it did not match the required output shape");
  lines.push("");
  lines.push(`This is a MECHANICAL schema rejection, not a disagreement with your ${keepNoun}.`);
  lines.push(`Problem${issues.length === 1 ? "" : "s"} found (${issues.length}):`);
  for (const issue of issues) lines.push(`  - ${issue.path}: ${issue.message}`);
  lines.push("");
  lines.push("Reply NOW with the CORRECTED JSON object and nothing else — no commentary, no apology,");
  lines.push(`no restatement of your analysis, no code fences. Keep your ${keepNoun} exactly as it was:`);
  lines.push("fix ONLY the shape. Every required key below must be present, spelled exactly as shown.");
  lines.push("");
  lines.push(outputInstructions);
  lines.push("");
  lines.push("This is the ONLY correction you will be asked for. A second malformed reply ends this");
  lines.push(`item with no ${recordNoun} recorded.`);
  return lines.join("\n");
}
