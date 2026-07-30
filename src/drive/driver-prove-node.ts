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
import { boundedRawSnippet, PARSE_RAW_SNIPPET_CAP } from "./driver-verify-node";
import { validateRawProverOutput, type RawProverOutput } from "./prover-raw";
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
 * a usable decomposition. rk-xfzg: SINGLE SOURCE OF TRUTH — accepts `raw` iff
 * `validateRawProverOutput(raw)` (./prover-raw.ts) reports ZERO issues, then builds `ProofContent`
 * from the now-known-clean body. This closes the two silent-drop paths the pre-rk-xfzg version had
 * (an unknown key, top-level or per child, was dropped rather than rejected; a non-string `depends`
 * entry was filtered out rather than refused) — a body with ANY such defect is now rejected outright,
 * never partially accepted. Pure: never a verdict path — a body carrying a verdict fails validation
 * (an unrecognized top-level key) AND is caught structurally by detectProverOverreach in
 * `proveOneNode`. */
export function extractProofContent(raw: unknown): ProofContent | undefined {
  if (validateRawProverOutput(raw).length > 0) return undefined;
  const body = raw as RawProverOutput;
  const children: ProofChild[] = body.children.map((k) => {
    const child: ProofChild = { statement: k.statement };
    if (k.justification !== undefined) child.justification = k.justification;
    if (k.depends !== undefined) child.depends = k.depends;
    return child;
  });
  return { children };
}

/** The outcome of one `proveOneNode` call. `spentTokens` (rk-s9t) is the turn's all-in token cost
 * (0 when no prover worker was available), reported on BOTH the recorded and the skip branch so the
 * caller accrues it to the campaign total regardless — a discarded prover turn spent real tokens. */
export type ProveNodeOutcome = { spentTokens: number } & ({ recorded: true; nodeId: string } | { skip: string });

/** Dispatches ONE prover turn over `node` and records the produced decomposition into af. Returns
 * `recorded` on success (the node now carries children and af re-classifies it — the verifier path
 * takes over), or a named `skip` (never applied); either way carries the turn's `spentTokens`. */
export async function proveOneNode(deps: DriverDeps, node: AfNodeView, knownIds: ReadonlySet<string>): Promise<ProveNodeOutcome> {
  const turn = await deps.dispatchProve(node);
  if (turn === undefined) return { spentTokens: 0, skip: "no prover worker available" };
  // rk-i19: the ONE bounded schema-repair reprompt (src/drive/verdict-repair.ts, dispatched at most
  // once by src/drive/driver-live.ts's `repairProverTurnOnce`) is a SECOND REAL BACKEND TURN. Its
  // tokens are spent whether or not the repair worked, so they accrue to the same campaign total the
  // caller guards against — a repair the budget could not see would be an unbounded hole in the exact
  // guard rk-s9t exists to provide. Exactly the accounting driver-verify-node.ts does for the verifier.
  const spentTokens = (turn.usage !== undefined ? usageTokens(turn.usage) : 0) + (turn.repair?.usage !== undefined ? usageTokens(turn.repair.usage) : 0);
  // Log usage BEFORE any discard — tokens are spent on dispatch regardless of outcome (src/drive/
  // report.ts reads this "usage" kind; it already parses `role`, so prover turns report the same way).
  if (turn.usage !== undefined) {
    deps.appendLog(JSON.stringify({ kind: "usage", at: deps.now(), contractId: deps.contractId, claimId: deps.claimId, nodeId: node.id, role: turn.role, sessionId: deps.identity.sessionId, usage: turn.usage }));
  }
  if (turn.repair !== undefined) {
    // ONE honest `usage` record per REAL backend turn (never a merged total, which would understate
    // the turn count and distort the report's cache-fraction arithmetic), flagged `repair: true` so a
    // reader can attribute it. A repair that reported NO usage gets NO record — a dispatcher that
    // reports nothing is never silently credited with a zero-cost turn.
    if (turn.repair.usage !== undefined) {
      deps.appendLog(JSON.stringify({ kind: "usage", at: deps.now(), contractId: deps.contractId, claimId: deps.claimId, nodeId: node.id, role: turn.role, sessionId: deps.identity.sessionId, usage: turn.repair.usage, repair: true }));
    }
    // The countable EVENT, in the SAME 'verdict-repair' shape the verifier path writes
    // (src/drive/report-parse.ts's `VerdictRepairLogRecord`, whose `role` field already admits every
    // role in the vocabulary): what was wrong, whether the correction landed, and — only on a failure
    // — why the repair reply was itself refused. The kind name is the SCHEMA-REPAIR event, not a claim
    // that a prover produced a verdict; `role` is what distinguishes the two, and a new kind would be
    // an unrecognized record to every existing reader (a compat event for no gain).
    deps.appendLog(JSON.stringify({
      kind: "verdict-repair", at: deps.now(), node: node.id, role: turn.role,
      outcome: turn.repair.ok ? "repaired" : "failed",
      issues: turn.repair.issues.map((i) => ({ path: i.path, message: i.message })),
      ...(turn.repair.repairIssues !== undefined ? { repairIssues: turn.repair.repairIssues.map((i) => ({ path: i.path, message: i.message })) } : {}),
    }));
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
      // rk-d1n: same diagnosability upgrade as the verifier path — 2000-char snippet, parse-error
      // message, failure-mode class, and the full raw text persisted to `.rk/parse-failures/`.
      const rawFailurePath = deps.writeParseFailure?.(node.id, turn.rawText);
      deps.appendLog(JSON.stringify({
        kind: "parse-failed", at: deps.now(), node: node.id, role: turn.role,
        rawSnippet: boundedRawSnippet(turn.rawText, PARSE_RAW_SNIPPET_CAP),
        ...(turn.parseError !== undefined ? { parseError: turn.parseError } : {}),
        ...(turn.parseClass !== undefined ? { classification: turn.parseClass } : {}),
        ...(rawFailurePath !== undefined ? { rawFailurePath } : {}),
      }));
    }
    return { spentTokens, skip: `prover worker exit ${turn.exit}` };
  }
  const proof = extractProofContent(turn.raw);
  if (proof === undefined) {
    // rk-xfzg: extraction failure is now ALWAYS a validateRawProverOutput rejection (extractProofContent
    // defers to it) — recompute the issues here so the loss is NAMED, never a silent/unnamed skip. A
    // bounded summary (first 3 issue paths+messages) goes in both the skip reason and a structured
    // 'prover-body-invalid' log record so a live stop is self-diagnosing without a re-run.
    const issues = validateRawProverOutput(turn.raw);
    const summary = issues.slice(0, 3).map((i) => `${i.path}: ${i.message}`).join(" | ");
    deps.appendLog(JSON.stringify({ kind: "prover-body-invalid", at: deps.now(), node: node.id, issues: issues.map((i) => ({ path: i.path, message: i.message })), rawSnippet: boundedRawSnippet(turn.raw) }));
    return { spentTokens, skip: `prover produced no usable proof content (need a non-empty children[] decomposition): ${summary}` };
  }
  const rec = await deps.recordProof(node, proof, knownIds);
  if (!rec.ok) {
    // GAP 8 observability (STOP-REPORT-7, same evidence family as rk-2cm's bind/parse-failed): an af
    // record-proof exit-1 (e.g. a bad `depends` entry) previously banked ONLY af's error string — the
    // raw prover decomposition was unrecoverable. Persist a bounded snippet of the children JSON
    // alongside the reason so the mis-wired proof DAG is inspectable without a re-run.
    deps.appendLog(JSON.stringify({ kind: "record-proof-failed", at: deps.now(), node: node.id, reason: rec.reason, rawSnippet: boundedRawSnippet(JSON.stringify(proof.children)) }));
    return { spentTokens, skip: `af recordProof failed: ${rec.reason}` };
  }
  deps.appendLog(JSON.stringify({ kind: "proof-recorded", at: deps.now(), node: node.id, children: proof.children.length }));
  return { spentTokens, recorded: true, nodeId: node.id };
}
