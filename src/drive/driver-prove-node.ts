// EDGE-composed, pure logic — the per-node PROVER machinery split out of src/drive/driver-run.ts
// (rk-gn4: the missing half of the M3.6 driver — prover dispatch that produces the proof content a
// verifier then judges). One `proveOneNode` call dispatches a prover turn over a prover-ready node
// and records the produced decomposition into af via the injected `recordProof` seam. It is the
// structural MIRROR of driver-verify-node.ts's `verifyOneNode`, with one absolute invariant:
//
//   A PROVER TURN NEVER MINTS A VERDICT. This module never imports bindVerdicts, afItemFromVerdict*,
//   or applyVerdicts — it CANNOT produce an af acceptance by construction. On top of that structural
//   guarantee, the role guard (turn.role must be exactly "prover") and detectProverOverreach (a
//   prover body carrying a verdict/outcome field is discarded + logged) make an overreaching prover
//   turn a loud, recorded no-op, mirroring the verifier-only apply guard (M3 blocker 3, driver-run's
//   `role !== "verifier"` reject). Convergence still requires a VALIDATED root (driver-run's
//   isRootValidated) — recording proof content alone never converges a claim.

import { detectProverOverreach, usageTokens } from "./driver-guardrails";
import { boundedRawSnippet } from "./driver-verify-node";
import type { AfNodeView } from "./driver-plan";
import type { DriverDeps } from "./driver-types";

/** One child sub-step of a prover's decomposition — the shape af's `af refine --children <json>`
 * seam records (../vibefeld/docs/cli-reference.md `refine`): a `statement`, an optional inference
 * rule `justification`, and optional `depends` node ids. Carries no verdict vocabulary. */
export interface ProofChild {
  statement: string;
  justification?: string;
  depends?: string[];
}

/** A prover turn's produced proof content: a non-empty decomposition of the node into children,
 * exactly what driver-prompts.ts's `buildProverTurnPrompt` asks the prover to return as
 * `{"children":[...]}`. Never a verdict. */
export interface ProofContent {
  children: ProofChild[];
}

/** Result of recording proof content into af (the injected `recordProof` seam drives `af claim
 * --role prover` + `af refine`). Fail-closed: a non-ok result is a skip, never a partial apply. */
export type RecordProofResult = { ok: true } | { ok: false; reason: string };

/** Parses a prover turn's already-JSON-parsed body into `ProofContent`, or `undefined` if it is not
 * a usable decomposition. Requires a non-empty `children` array whose every element has a non-blank
 * `statement`; optional `justification`/`depends` are passed through when well-typed. Pure: never a
 * verdict path — a body carrying a verdict is rejected here as "no children" AND caught structurally
 * by detectProverOverreach in `proveOneNode`. */
export function extractProofContent(raw: unknown): ProofContent | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const kids = (raw as Record<string, unknown>).children;
  if (!Array.isArray(kids) || kids.length === 0) return undefined;
  const children: ProofChild[] = [];
  for (const k of kids) {
    if (k === null || typeof k !== "object") return undefined;
    const obj = k as Record<string, unknown>;
    if (typeof obj.statement !== "string" || obj.statement.trim().length === 0) return undefined;
    const child: ProofChild = { statement: obj.statement };
    if (typeof obj.justification === "string" && obj.justification.length > 0) child.justification = obj.justification;
    if (Array.isArray(obj.depends)) child.depends = obj.depends.filter((d): d is string => typeof d === "string");
    children.push(child);
  }
  return { children };
}

/** The outcome of one `proveOneNode` call. `spentTokens` (rk-s9t) is the turn's all-in token cost
 * (0 when no prover worker was available), reported on BOTH the recorded and the skip branch so the
 * caller accrues it to the campaign total regardless — a discarded prover turn spent real tokens. */
export type ProveNodeOutcome = { spentTokens: number } & ({ recorded: true; nodeId: string } | { skip: string });

/** Dispatches ONE prover turn over `node` and records the produced decomposition into af. Returns
 * `recorded` on success (the node now carries children and af re-classifies it — the verifier path
 * takes over), or a named `skip` (never applied); either way carries the turn's `spentTokens`. */
export async function proveOneNode(deps: DriverDeps, node: AfNodeView): Promise<ProveNodeOutcome> {
  const turn = await deps.dispatchProve(node);
  if (turn === undefined) return { spentTokens: 0, skip: "no prover worker available" };
  const spentTokens = turn.usage !== undefined ? usageTokens(turn.usage) : 0;
  // Log usage BEFORE any discard — tokens are spent on dispatch regardless of outcome (src/drive/
  // report.ts reads this "usage" kind; it already parses `role`, so prover turns report the same way).
  if (turn.usage !== undefined) {
    deps.appendLog(JSON.stringify({ kind: "usage", at: deps.now(), contractId: deps.contractId, claimId: deps.claimId, nodeId: node.id, role: turn.role, sessionId: deps.identity.sessionId, usage: turn.usage }));
  }
  // Role guard: only a prover authors proof content here (mirror of the verifier-only apply guard).
  if (turn.role !== "prover") {
    return { spentTokens, skip: `role '${turn.role}' cannot author prover proof content — only 'prover' refines a node (PRD C9)` };
  }
  // Overreach guard: a prover body carrying a verdict/outcome is DISCARDED and logged. This path can
  // never mint a verdict anyway (it calls no apply/bind), so this makes the refusal explicit.
  const overreach = detectProverOverreach(turn.role, turn.raw);
  if (overreach.discard) {
    deps.appendLog(JSON.stringify({ kind: "prover-overreach", at: deps.now(), node: node.id, reason: overreach.reason }));
    return { spentTokens, skip: `prover overreach: ${overreach.reason}` };
  }
  if (turn.exit !== 0) {
    // GAP 7(b): persist the raw output on an exit-12 parse/extraction failure (same evidence trail
    // as the verifier path) rather than losing it behind "prover worker exit 12".
    if (turn.rawText !== undefined) {
      deps.appendLog(JSON.stringify({ kind: "parse-failed", at: deps.now(), node: node.id, role: turn.role, rawSnippet: boundedRawSnippet(turn.rawText) }));
    }
    return { spentTokens, skip: `prover worker exit ${turn.exit}` };
  }
  const proof = extractProofContent(turn.raw);
  if (proof === undefined) return { spentTokens, skip: "prover produced no usable proof content (need a non-empty children[] decomposition)" };
  const rec = await deps.recordProof(node, proof);
  if (!rec.ok) return { spentTokens, skip: `af recordProof failed: ${rec.reason}` };
  deps.appendLog(JSON.stringify({ kind: "proof-recorded", at: deps.now(), node: node.id, children: proof.children.length }));
  return { spentTokens, recorded: true, nodeId: node.id };
}
