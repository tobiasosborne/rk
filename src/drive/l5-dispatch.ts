// EDGE — orchestrates a `WorkerBackend` (subprocess-backed, src/drive/backend-{claude,codex}.ts)
// and fs (via src/drive/l5-store-io.ts). M3.7's fourth deliverable: batch dispatch of L5 reviews
// through the worker contract, end to end — src/drive/l5-dispatch-plan.ts's plan, one session per
// batch (docs/worker-contract.md section (a): a session is created per (role, tier, claim), never
// per item), one turn per member, `resolveTurn`/`bindVerdicts` (already landed, M3.1) to accept or
// reject each turn, then an append through src/drive/l5-store-io.ts's writer — never a direct
// `fs` call in this module beyond that one delegated writer.
//
// TESTED VIA INJECTED `WorkerBackend` ONLY (docs/worker-contract.md's own `backend-claude.test.ts`
// precedent) — no test here spawns a real subprocess or calls a real LLM; a fake `WorkerBackend`
// implementing `createSession`/`runTurn` in-memory stands in for `ClaudeBackend`/`CodexBackend`.
//
// DEFERRED, NOT BUILT HERE (see this WP's final report for the full list): scheduler-aware
// concurrency (src/drive/scheduler.ts's stagger/floor/burst rules are NOT wired in — batches and
// their turns dispatch strictly sequentially here, a correct but non-cache-optimized baseline);
// retry-on-timeout (Q3's shared retry component is explicitly a separate future driver piece, not
// this WP's); a CLI surface (`src/cli/l5.ts` does not exist yet — the other lane owns
// `src/cli/verify.ts` and this WP does not touch it).

import type { DispatchState } from "./bind-verdicts";
import type { L5DispatchPlan } from "./l5-dispatch-plan";
import { sha256Bytes } from "../refs/hash";
import { appendL5Verdicts, type AppendL5Result } from "./l5-store-io";
import { resolveTurn, type TurnFailureIssue, type TurnFailureStage, type WorkerResult } from "./worker-result";
import type { VerdictDocument } from "./verdict-schema";
import type { WorkerBackend, SessionSpec, TurnItem } from "./backend-types";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4_000;

/** Sentinel `nodeId` for a "usage" driver-log record (src/drive/report.ts) that attributes a
 * session's OPENING cost — e.g. `ClaudeBackend.createSession`'s real `claude -p sharedContext`
 * call — rather than any one member's turn. Never a real af/registry node id (parens are not a
 * legal id character in this codebase's id grammars), so it can never collide with, or be mistaken
 * for, an actual proof node in the report. report.ts's existing per-session cache_creation pooling
 * (attributeTokens) treats every "usage" record in a session uniformly, so this sentinel correctly
 * shares in the fair-share pool its own cache_creation contributes — the input/output tokens of
 * OPENING the session stay attributed here, in full, never smeared over a real node's cost. */
export const L5_SESSION_OPEN_NODE_ID = "(session-open)";

export interface L5DispatchDeps {
  backend: WorkerBackend;
  /** Model id to open every session with — a fixed campaign choice (docs/worker-contract.md
   * section (a): a resumed turn must reuse the session's own model, never a value re-derived per
   * turn), so this is one value for the whole dispatch call, not per-batch or per-item. */
  model: string;
  /** Shard content per `itemId`, already read by the caller (e.g. off a `RepoSnapshot`) — this
   * module never reads a shard file itself; that stays the caller's concern (mirrors
   * `l5-dispatch-plan.ts`'s own "current hashes are supplied, never recomputed here" stance). */
  content: ReadonlyMap<string, string>;
  /** Sent ONCE per batch, on the session's first turn — the tier's checklist/rubric text (PRD C9:
   * "batch dispatch of fresh hostile verifiers"). Never re-sent on a resume turn (contract (b)). */
  sharedContext: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  nowIso?: () => string;
  /** M3 repair-wave blocker 8: the driver-log append hook (mirrors src/drive/driver-run.ts's
   * `DriverDeps.appendLog`, same fire-and-forget one-JSONL-line-per-call contract). OPTIONAL — this
   * module has no CLI wiring yet (see file header's DEFERRED note), so every pre-existing caller/
   * test that omits it keeps working with zero accounting, exactly as before this WP. When
   * supplied, every REAL backend call this dispatch makes (session creation, when the backend
   * reports usage for it, and every dispatched turn — applied OR rejected, since a rejected turn
   * still spent real tokens) is recorded as a `{kind:"usage",...}` line BEFORE this function
   * returns. A member discarded before ever reaching the backend (no-content-supplied,
   * content-hash-mismatch) spends no tokens and gets no usage line — consistent with those stages'
   * existing "never dispatched" contract. */
  appendLog?: (line: string) => void;
}

export interface L5DispatchRejection {
  itemId: string;
  stage: TurnFailureStage | "no-content-supplied" | "content-hash-mismatch";
  issues: TurnFailureIssue[];
}

export interface L5DispatchOutcome {
  batchId: string;
  claimId: string;
  applied: AppendL5Result["appended"];
  rejected: L5DispatchRejection[];
}

/** Dispatches every batch in `plan`, appending every accepted verdict to the `root` campaign
 * repo's L5 ledger. Sequential across AND within batches (see file header's deferral note) — a
 * simple, correct baseline; nothing here silently drops a member: every member either ends up in
 * `applied` (via the store writer) or in `rejected` with the stage/issues that sank it. */
export async function dispatchL5Plan(root: string, plan: L5DispatchPlan, deps: L5DispatchDeps): Promise<L5DispatchOutcome[]> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputTokens = deps.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const outcomes: L5DispatchOutcome[] = [];

  // M3 blocker 8: a "usage" line (src/drive/report.ts's UsageLogRecord). L5 batches have no
  // separate registry contract identity of their own (only the `l5:<batchId>` claim id
  // src/drive/l5-dispatch-plan.ts derives) — `contractId` reuses `claimId` so the record still
  // validates and folds into the report's per-claim rows honestly, under its OWN l5-namespaced
  // claim, never colliding with a hard-tier claim's contractId.
  function logUsage(claimId: string, nodeId: string, sessionId: string, usage: WorkerResult["usage"]): void {
    deps.appendLog?.(JSON.stringify({ kind: "usage", at: nowIso(), contractId: claimId, claimId, nodeId, role: "verifier", sessionId, usage }));
  }

  for (const batch of plan.batches) {
    const rejected: L5DispatchRejection[] = [];
    const documents: VerdictDocument[] = [];

    const sessionSpec: SessionSpec = {
      role: "verifier",
      tier: "l5",
      claimId: batch.claimId,
      model: deps.model,
      sharedContext: deps.sharedContext,
      timeoutMs,
    };
    const { sessionId, usage: sessionUsage } = await deps.backend.createSession(sessionSpec);
    if (sessionUsage !== undefined) logUsage(batch.claimId, L5_SESSION_OPEN_NODE_ID, sessionId, sessionUsage);

    for (const member of batch.members) {
      const content = deps.content.get(member.itemId);
      if (content === undefined) {
        rejected.push({ itemId: member.itemId, stage: "no-content-supplied", issues: [{ path: "$.content", message: `no shard content supplied for '${member.itemId}'` }] });
        continue;
      }
      // M3 blocker 1: bind the recorded hash to the EXACT dispatched bytes. `member.contentHash` is
      // the plan's declared l5ContentHash-domain hash (src/drive/l5-dispatch-plan.ts, raw shard-file
      // SHA-256, no normalization); the bytes we are about to send are `deps.content`. If they
      // disagree, the plan is stale or the wrong bytes were supplied — dispatching them would judge
      // one payload while recording another's hash, validating content no one reviewed. Discard the
      // member BEFORE dispatch (no tokens spent, never recorded), and record the hash we PROVED from
      // the dispatched bytes, not the caller-supplied claim.
      const dispatchedHash = sha256Bytes(new TextEncoder().encode(content));
      if (dispatchedHash !== member.contentHash) {
        rejected.push({ itemId: member.itemId, stage: "content-hash-mismatch", issues: [{ path: "$.content", message: `dispatched content hashes to ${dispatchedHash} but the plan recorded ${member.contentHash} — stale plan or wrong bytes; discarded before dispatch` }] });
        continue;
      }
      const turnItem: TurnItem = {
        itemId: member.itemId,
        turnId: `${batch.claimId}:${member.itemId}`,
        content,
        outputSchemaRef: "verdict-raw-l5",
        timeoutMs,
        maxOutputTokens,
      };
      const result = await deps.backend.runTurn(sessionId, turnItem);
      // Logged BEFORE checking `resolveTurn`'s outcome, same as driver-run.ts's own "log usage
      // before any discard check" rule: real tokens are spent whether the turn is later applied or
      // rejected (nonzero exit, unparseable body, binding failure) — a rejected turn's cost must
      // not vanish from the report.
      logUsage(batch.claimId, member.itemId, sessionId, result.usage);
      const dispatchState: DispatchState = {
        itemId: member.itemId,
        contentHash: dispatchedHash,
        tier: "l5",
        claimId: batch.claimId,
        batchId: batch.batchId,
        verifier: { modelFamily: deps.backend.modelFamily, backend: deps.backend.name, model: deps.model, sessionId },
      };
      const turnOutcome = resolveTurn(dispatchState, result);
      if (turnOutcome.status === "applied") documents.push(turnOutcome.document);
      else rejected.push({ itemId: member.itemId, stage: turnOutcome.stage, issues: turnOutcome.issues });
    }

    const appendResult = appendL5Verdicts(root, documents, deps.nowIso);
    for (const r of appendResult.rejected) {
      rejected.push({ itemId: r.document.verdicts[0]?.itemId ?? "unknown", stage: "binding", issues: [{ path: "$", message: r.reason }] });
    }
    outcomes.push({ batchId: batch.batchId, claimId: batch.claimId, applied: appendResult.appended, rejected });
  }

  return outcomes;
}
