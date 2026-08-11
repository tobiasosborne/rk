// PURITY: pure — no fs/network/clock (L3). rk-0ree: ATTRIBUTION RULE v1 — the ONE rule composing
// `.rk/driver-log.jsonl`'s two usage-record conventions into a per-registry-node spentTokens
// figure for `close` events (H_real = log2(1 + spent/T0), src/reward/engine.ts). Tier A payout
// math: the figure this computes is written into the APPEND-ONLY reward ledger and can never be
// corrected, so the rule is deterministic over a fully-read log and every clause is stated here.
// Settled 2026-08-11 (dated append to docs/memos/2026-08-08-prereg-autonomy-v1.md — the S0-2
// re-registration point); the two conventions it composes are:
//
//   HARD TIER (src/drive/driver-{prove,verify}-node.ts): contractId = the registry shard id being
//   driven, nodeId = an af workspace-INTERNAL node id ("1.2.3", unique only within one claim's
//   workspace), claimId = "claim-<registry id>[-prover]".
//   L5 BATCH (src/drive/l5-dispatch.ts): contractId = claimId = "l5:<batchId>", nodeId = the
//   registry item id, or the "(session-open)" sentinel for the session-opening call's own cost.
//
// The rule, clause by clause (tokens(u) = input + output + cache_read + cache_creation — the SAME
// all-in definition the campaign budget guard uses, src/drive/driver-guardrails.ts's usageTokens;
// one token definition everywhere, never a second one here):
//   1. A hard-tier record (claimId does NOT start with "l5:") attributes tokens(u) in FULL to
//      `contractId`. One af workspace exists to close one contract, so every turn in it — prover,
//      verifier, repair, applied OR discarded (tokens are spent regardless of outcome, the rk-s9t
//      budget stance) — is spend toward that registry node. The af-internal `nodeId` is NEVER read
//      as a registry id (it is not one).
//   2. An L5 record (claimId starts with "l5:" — the id shape only l5-dispatch writes; hard-tier
//      claim ids are "claim-..." and can never match) attributes a member turn's tokens(u) in FULL
//      to `nodeId`. "(session-open)" sentinel records pool PER SESSION and split integer-fair
//      (src/drive/accounting.ts's fairShares: floor + remainder to earliest, members in
//      first-appearance log order) across the DISTINCT member ids that dispatched in that session
//      — the shared-context cost is genuinely part of verifying those members, and the split
//      conserves the total exactly. A session-open with NO member turns (the session died before
//      its first turn) is unattributable overhead: reported, never smeared onto a node.
//   3. Conservation: sum(spentByNode) + sum(unattributedSessionOpen) === sum over all records of
//      tokens(u) — the property test.
// The CALLER (src/cli/reward-sync.ts) owns the fail-closed reading of the log (an unreadable line
// may hide spend, so it refuses to bank) and the at-sync-time stance (the figure is the log's
// total when the close is banked; later spend on an already-closed node is never retroactive —
// the ledger is append-only and a close banks once).

import { fairShares } from "../drive/accounting";
import { usageTokens } from "../drive/driver-guardrails";
import { L5_SESSION_OPEN_NODE_ID, type UsageLogRecord } from "../drive/report-parse";

/** The claim-id prefix that marks the L5 batch convention (src/drive/l5-dispatch-plan.ts derives
 * `l5:<batchId>`; the hard tier's claim ids are `claim-...` and can never start with this). */
const L5_CLAIM_PREFIX = "l5:";

export interface AttributionResult {
  /** Registry node id -> total attributed tokens (all-in usageTokens domain). Nodes with no
   * matching records are simply absent — the caller's floor for them is 0. */
  spentByNode: ReadonlyMap<string, number>;
  /** L5 session-open cost with no member turn in the same session to share it — reported so the
   * caller can surface it loudly; deliberately attributed to no node. Log order. */
  unattributedSessionOpen: { sessionId: string; tokens: number }[];
}

/** Applies attribution rule v1 (file header) to already-parsed, well-formed usage records. Pure
 * and deterministic: output depends only on `records` and their order. */
export function attributeSpentTokens(records: readonly UsageLogRecord[]): AttributionResult {
  const spent = new Map<string, number>();
  const add = (id: string, tokens: number) => spent.set(id, (spent.get(id) ?? 0) + tokens);
  /** Per L5 session: pooled session-open tokens + distinct member ids in first-appearance order. */
  const sessions = new Map<string, { openTokens: number; members: string[] }>();

  for (const r of records) {
    const tokens = usageTokens(r.usage);
    if (!r.claimId.startsWith(L5_CLAIM_PREFIX)) {
      add(r.contractId, tokens); // clause 1: hard tier — the workspace's contract owns every turn
      continue;
    }
    const session = sessions.get(r.sessionId) ?? { openTokens: 0, members: [] };
    sessions.set(r.sessionId, session);
    if (r.nodeId === L5_SESSION_OPEN_NODE_ID) {
      session.openTokens += tokens;
    } else {
      add(r.nodeId, tokens); // clause 2: L5 member turn — the registry item owns its own turn
      if (!session.members.includes(r.nodeId)) session.members.push(r.nodeId);
    }
  }

  const unattributedSessionOpen: { sessionId: string; tokens: number }[] = [];
  for (const [sessionId, s] of sessions) {
    if (s.openTokens === 0) continue;
    if (s.members.length === 0) {
      unattributedSessionOpen.push({ sessionId, tokens: s.openTokens }); // clause 2: dead session
      continue;
    }
    const shares = fairShares(s.openTokens, s.members.length);
    s.members.forEach((m, i) => add(m, shares[i]!));
  }

  return { spentByNode: spent, unattributedSessionOpen };
}
