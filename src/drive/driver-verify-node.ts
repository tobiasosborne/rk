// EDGE-composed, pure logic — the per-node VERIFIER machinery split out of src/drive/driver-run.ts
// (the loop grew past the ~280-line shard cap once prover dispatch landed; this is the natural cut
// named in the split bead: per-node verify machinery vs the loop vs prover dispatch). One
// `verifyOneNode` call dispatches a verifier turn, binds the returned verdict against the node's
// content hash, and returns the af item to apply — or a named skip. This module owns the
// validity-critical apply-eligibility rules (M3 repair wave): verifier-only role guard (blocker 3),
// hash-bound verdict (blocker 1, the caller re-confirms the hash before apply), and the apply-time
// cross-vendor gate on an ACCEPT (M3.8 / PRD C9). It composes the pure cores; it writes nothing.

import { bindVerdicts, type DispatchState } from "./bind-verdicts";
import { crossVendorRejectionMessage, decideCrossVendor } from "./cross-vendor";
import { detectProverOverreach, usageTokens } from "./driver-guardrails";
import { isProoflessNode, type AfNodeView } from "./driver-plan";
import { afItemFromVerdictDocument, type AfApplyItem } from "./driver-verdict-map";
import type { DriverDeps } from "./driver-types";

/** children-before-parent ordering for a per-file `items` array: deeper hierarchical ids
 * ("1.2.3") sort before their ancestors ("1.2"), so an accept's children always appear earlier
 * (../vibefeld/docs/verdicts-apply.md order-dependence). Ties broken lexicographically. */
export function childrenFirst(a: AfApplyItem, b: AfApplyItem): number {
  const da = a.node.split(".").length;
  const db = b.node.split(".").length;
  if (da !== db) return db - da;
  return a.node < b.node ? -1 : a.node > b.node ? 1 : 0;
}

/** rk-qxp: a BOUNDED, JSON-safe rendering of the raw model output for the 'bind-failed' evidence
 * record. Serialize the (already-parsed) raw output back to JSON and cap it at 500 chars so a
 * runaway body can never bloat the append-only log; the whole snippet is then embedded as a JSON
 * string value by the caller's `JSON.stringify`, which escapes it — so the log line stays valid
 * JSON regardless of the snippet's content. Never throws (a value that cannot be stringified — e.g.
 * a BigInt — falls back to `String(raw)`). */
const RAW_SNIPPET_CAP = 500;
export function boundedRawSnippet(raw: unknown): string {
  let s: string;
  try {
    s = typeof raw === "string" ? raw : JSON.stringify(raw);
  } catch {
    s = String(raw);
  }
  if (s === undefined) s = String(raw); // JSON.stringify(undefined) === undefined
  return s.length > RAW_SNIPPET_CAP ? s.slice(0, RAW_SNIPPET_CAP) : s;
}

/** The outcome of one `verifyOneNode` call. `spentTokens` (rk-s9t) is the turn's all-in token cost
 * (0 when no worker was available or the dispatcher reported no usage) — reported on BOTH the apply
 * and the skip branch so the caller adds it to the running campaign total regardless of whether the
 * verdict was ever applied (a rejected/discarded turn spent real tokens too). */
export type VerifyNodeOutcome = { spentTokens: number } & ({ item: AfApplyItem; contentHash: string } | { skip: string; vacuousNode?: string });

/** Dispatches + binds a single node's verdict, applying the prover-overreach guard. Returns the af
 * item to apply (with the content hash the verdict was bound against, so the caller can re-confirm
 * the authoritative bytes immediately before apply — M3 blocker 1), or a reason it was skipped
 * (never applied); either way carries the turn's `spentTokens` for the campaign budget. */
export async function verifyOneNode(deps: DriverDeps, node: AfNodeView, verifiedBySeam: string, knownNodeIds: ReadonlySet<string>): Promise<VerifyNodeOutcome> {
  const turn = await deps.dispatchVerify(node);
  if (turn === undefined) return { spentTokens: 0, skip: "no worker available" };
  const spentTokens = turn.usage !== undefined ? usageTokens(turn.usage) : 0;
  // M3.9: log the turn's usage BEFORE any discard check below — tokens are spent on dispatch,
  // independent of whether the resulting verdict is ever applied (src/drive/report.ts reads this
  // "usage" kind; every other kind this loop appends is untouched by this addition).
  if (turn.usage !== undefined) {
    deps.appendLog(JSON.stringify({ kind: "usage", at: deps.now(), contractId: deps.contractId, claimId: deps.claimId, nodeId: node.id, role: turn.role, sessionId: deps.identity.sessionId, usage: turn.usage }));
  }
  const overreach = detectProverOverreach(turn.role, turn.raw);
  if (overreach.discard) {
    deps.appendLog(JSON.stringify({ kind: "prover-overreach", at: deps.now(), node: node.id, reason: overreach.reason }));
    return { spentTokens, skip: `prover overreach: ${overreach.reason}` };
  }
  // M3 blocker 3: this apply path records af ACCEPTANCES, and only a verifier may author one
  // (PRD C9 — provers prove, reviewers review). The overreach guard above deliberately EXEMPTS the
  // reviewer role (a reviewer legitimately emits verdicts in other pipelines), so a reviewer turn
  // would otherwise sail through and mint an af acceptance here. Require the exact `verifier` role;
  // any other role's turn is discarded (logged as a node-skipped by the caller, never applied).
  if (turn.role !== "verifier") {
    return { spentTokens, skip: `role '${turn.role}' cannot mint an af verdict — only 'verifier' authors af acceptances (PRD C9)` };
  }
  if (turn.exit !== 0) {
    // GAP 7(b): an exit-12 parse/extraction failure carries the model's raw output (driver-live.ts's
    // `toDispatchedTurn`) — persist a bounded snippet as evidence so the stop is self-diagnosing,
    // instead of the raw string being unrecoverable behind "worker exit 12" (STOP-REPORT-6).
    if (turn.rawText !== undefined) {
      deps.appendLog(JSON.stringify({ kind: "parse-failed", at: deps.now(), node: node.id, role: turn.role, rawSnippet: boundedRawSnippet(turn.rawText) }));
    }
    return { spentTokens, skip: `worker exit ${turn.exit}` };
  }
  if (node.author !== undefined && node.author === verifiedBySeam) return { spentTokens, skip: "reviewer==author (would be rejected by af)" };
  const state: DispatchState = { itemId: node.id, contentHash: node.contentHash, tier: "hard", claimId: deps.claimId, verifier: deps.identity };
  const bound = bindVerdicts(state, turn.raw);
  if (!bound.ok) {
    // rk-qxp: diagnosis-quality skip reason — carry each issue's PATH, not just its bare message (a
    // "must be a non-blank string" with no path forced diagnosis by guessing which field was at
    // fault). AND persist the evidence: a 'bind-failed' driver-log record with the node, the issues
    // (paths included), and a BOUNDED snippet of the raw model output (previously discarded on bind
    // failure), so the next live stop is self-diagnosing rather than requiring a re-run.
    const detail = bound.issues.map((i) => `${i.path}: ${i.message}`).join("; ");
    deps.appendLog(JSON.stringify({ kind: "bind-failed", at: deps.now(), node: node.id, issues: bound.issues.map((i) => ({ path: i.path, message: i.message })), rawSnippet: boundedRawSnippet(turn.raw) }));
    return { spentTokens, skip: `verdict bind failed: ${detail}` };
  }
  const mapped = afItemFromVerdictDocument(node.id, bound.document, knownNodeIds);
  if (!mapped.ok) return { spentTokens, skip: `verdict map failed: ${mapped.reason}` };
  // M3.8: the cross-vendor rule only gates PROMOTION — a challenge never accepts the node this
  // turn regardless (driver-verdict-map.ts's own invariant), so there is nothing to promote and
  // nothing to gate. Checked here, per-item, BEFORE `mapped.item` is ever returned into the
  // caller's `items[]` array — i.e. strictly before a verdict file naming this item is composed
  // or written (runVerifyDriver's `applyVerdicts` call sees only items that already cleared this).
  if (mapped.item.verdict === "accept") {
    // rk-jit (STOP-4): NEW fail-closed validity backstop. An `accept` on a node with no recorded
    // proof body (isProoflessNode: statement present, but no children and no dependencies) has
    // verified NOTHING — the bare statement's own truth is not a proof. Discard it HERE, BEFORE the
    // cross-vendor gate and REGARDLESS of that gate's outcome, so a vacuous bootstrap accept can
    // never be applied (STOP-4's deadlock: af marks a bare root verifier-ready, a real verifier
    // accepts it, and nothing ever flips it prover-ready → stuck-no-progress). Strictly ADDITIVE: it
    // only ever discards MORE, never accepts more, so it weakens no existing guard — the
    // role/hash/exit/bind/map checks above already ran in their unchanged order, and cross-vendor
    // still runs (below) for every contentful accept. `vacuousNode` lets the loop (driver-run.ts)
    // name the real abort cause instead of an opaque stuck-no-progress.
    if (isProoflessNode(node)) {
      deps.appendLog(JSON.stringify({ kind: "vacuous-accept-discarded", at: deps.now(), node: node.id, reason: "accept on a node with no recorded proof body (no children, no dependencies) — nothing to verify; a prover pass must run first" }));
      return { spentTokens, skip: `vacuous accept discarded: node '${node.id}' has no recorded proof body (no children, no dependencies) — an accept verifies nothing; a prover must produce proof content first`, vacuousNode: node.id };
    }
    const decision = decideCrossVendor(node.author, verifiedBySeam, deps.isLoadBearing(node.id));
    if (!decision.satisfied) {
      const reason = crossVendorRejectionMessage(node.id, decision);
      deps.appendLog(JSON.stringify({ kind: "cross-vendor-rejected", at: deps.now(), node: node.id, reason: decision.reason }));
      return { spentTokens, skip: reason };
    }
  }
  return { spentTokens, item: mapped.item, contentHash: node.contentHash };
}
