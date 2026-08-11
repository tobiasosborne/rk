// EDGE — orchestrates a `WorkerBackend` (subprocess-backed, src/drive/backend-{claude,codex}.ts)
// and fs (via src/drive/l5-store-io.ts). M3.7's fourth deliverable: batch dispatch of L5 reviews
// through the worker contract, end to end — src/drive/l5-dispatch-plan.ts's plan, one session per
// batch (docs/worker-contract.md section (a): a session is created per (role, tier, claim), never
// per item), one turn per member, `resolveTurn`/`bindVerdicts` (already landed, M3.1) to accept or
// reject each turn, then an append through src/drive/l5-store-io.ts's writer — never a direct
// `fs` call in this module beyond that one delegated writer.
//
// rk-74o (M3 review follow-up 3, "actual-member provenance"): the two pre-dispatch discard stages
// (no content supplied, content-hash mismatch) run as a PRE-FLIGHT before the session is created,
// and the batch id stamped on every verdict is re-derived over the members that actually entered
// that session. The recorded id is what `af unvalidate --batch <id>` revokes, so it must name the
// correlated-risk set — the items that shared one verifier session — not the planned set.
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
import { deriveBatchId } from "./batch-composer";
import { sha256Bytes } from "../refs/hash";
import { appendL5Verdicts, type AppendL5Result } from "./l5-store-io";
import { screenVerifierFences } from "./verifier-fence-dispatch";
import { renderConfirmedVerifierFences, type AssumedVerified, type ConfirmedVerifierFence, type VerifierFenceCoverage } from "./verifier-fence";
import { resolveTurn, type TurnFailureIssue, type TurnFailureStage, type WorkerResult } from "./worker-result";
import type { VerdictDocument } from "./verdict-schema";
import type { WorkerBackend, SessionSpec, TurnItem } from "./backend-types";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4_000;

// The "(session-open)" sentinel this module stamps on a session-opening usage record moved to
// src/drive/report-parse.ts (the pure wire-shape home) so pure readers can name it without
// importing this edge (rk-0ree); re-exported here so existing importers keep their path.
// report.ts's per-session cache_creation pooling (attributeTokens) treats every "usage" record in
// a session uniformly, so the sentinel correctly shares in the fair-share pool its own
// cache_creation contributes — the input/output tokens of OPENING the session stay attributed to
// the sentinel in the SC4 report, never smeared over a real node's cost there. (The reward-side
// spentTokens rule, src/reward/attribution.ts, deliberately differs: it splits the open cost
// across the session's members — see attribution rule v1 in the prereg memo.)
export { L5_SESSION_OPEN_NODE_ID } from "./report-parse";
import { L5_SESSION_OPEN_NODE_ID } from "./report-parse";

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
  /** Structured fences keyed by the item whose verifier brief would honor them. Each claim named
   * here must also have current raw bytes in `content`, so the edge can derive its hash. */
  assumedVerified?: ReadonlyMap<string, readonly AssumedVerified[]>;
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
  stage: TurnFailureStage | "no-content-supplied" | "content-hash-mismatch" | "verifier-fence-refused" | "reserved-item-id";
  issues: TurnFailureIssue[];
}

export interface L5DispatchOutcome {
  /** The id the plan proposed for this batch. Bookkeeping only — never stamped on a verdict. */
  plannedBatchId: string;
  /** rk-74o (M3 review follow-up 3, "actual-member provenance"): the id ACTUALLY stamped on every
   * verdict this batch produced, derived from the members that actually entered the shared verifier
   * session. `undefined` iff no member survived pre-dispatch screening, in which case no session was
   * opened and nothing was recorded — there is no dispatched set to name, and inventing one would be
   * the same lie in the other direction. */
  batchId?: string;
  /** The session's isolation-tuple claim id, following `batchId`. `undefined` when no session was
   * opened. */
  claimId?: string;
  applied: AppendL5Result["appended"];
  rejected: L5DispatchRejection[];
  /** Loud per-entry accounting for the structured validity fence: always checked N/N. */
  fenceCoverage: VerifierFenceCoverage;
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

    const fenceScreen = screenVerifierFences(root, batch.members, deps.content, deps.assumedVerified);
    for (const item of fenceScreen.refusals) {
      rejected.push({
        itemId: item.itemId,
        stage: "verifier-fence-refused",
        issues: item.refusals.map((r, i) => ({
          path: `$.assumedVerified[${i}]`,
          message: `${r.claimId}: ${r.reason} (${r.verdictRef || "blank verdictRef"})`,
        })),
      });
    }
    deps.appendLog?.(JSON.stringify({
      kind: "verifier-fence",
      at: nowIso(),
      plannedBatchId: batch.batchId,
      ...fenceScreen.coverage,
      refusals: fenceScreen.refusals.flatMap((item) =>
        item.refusals.map((r) => ({ itemId: item.itemId, claimId: r.claimId, verdictRef: r.verdictRef, reason: r.reason }))),
    }));

    // rk-74o PRE-FLIGHT (was inside the dispatch loop below). Both discard stages here — no content
    // supplied, and M3 blocker 1's hash binding — are knowable BEFORE a session exists and spend no
    // tokens. Running them first is what lets the batch id name the set that actually shared the
    // session: a member discarded here never entered it, so including it in the recorded id would
    // make `af unvalidate --batch <id>` claim a coverage the session never had. A turn that fails
    // AFTER dispatch is a different case and stays a member — it shared the session and could have
    // biased the others, so bulk revocation must still cover it.
    //
    // M3 blocker 1, restated: `member.contentHash` is the plan's declared l5ContentHash-domain hash
    // (src/drive/l5-dispatch-plan.ts, raw shard-file SHA-256, no normalization); the bytes about to
    // be sent are `deps.content`. If they disagree, the plan is stale or the wrong bytes were
    // supplied — dispatching them would judge one payload while recording another's hash. The hash
    // recorded downstream is the one PROVED from the dispatched bytes, never the caller's claim.
    const dispatchable: { itemId: string; content: string; dispatchedHash: string; confirmedFences: ConfirmedVerifierFence[] }[] = [];
    for (const { member, confirmedFences } of fenceScreen.admitted) {
      // rk-0ree review P2: "(session-open)" is THIS module's sentinel for a session's opening-cost
      // usage record. A member so named would log member turns indistinguishable from session
      // overhead, and downstream spend attribution (src/reward/attribution.ts) would misassign its
      // tokens — no gate enforces an id grammar that excludes it, so the writer refuses it here,
      // before any session exists. Rename the shard; the id is reserved.
      if (member.itemId === L5_SESSION_OPEN_NODE_ID) {
        rejected.push({ itemId: member.itemId, stage: "reserved-item-id", issues: [{ path: "$.itemId", message: `'${L5_SESSION_OPEN_NODE_ID}' is the reserved session-open sentinel nodeId — a member so named would corrupt per-node spend attribution; rename the shard` }] });
        continue;
      }
      const content = deps.content.get(member.itemId);
      if (content === undefined) {
        rejected.push({ itemId: member.itemId, stage: "no-content-supplied", issues: [{ path: "$.content", message: `no shard content supplied for '${member.itemId}'` }] });
        continue;
      }
      const dispatchedHash = sha256Bytes(new TextEncoder().encode(content));
      if (dispatchedHash !== member.contentHash) {
        rejected.push({ itemId: member.itemId, stage: "content-hash-mismatch", issues: [{ path: "$.content", message: `dispatched content hashes to ${dispatchedHash} but the plan recorded ${member.contentHash} — stale plan or wrong bytes; discarded before dispatch` }] });
        continue;
      }
      dispatchable.push({ itemId: member.itemId, content, dispatchedHash, confirmedFences });
    }

    if (dispatchable.length === 0) {
      // Nothing to verify: no session is opened (no tokens spent) and no batch id is minted, because
      // there is no dispatched set for one to describe.
      outcomes.push({ plannedBatchId: batch.batchId, applied: [], rejected, fenceCoverage: fenceScreen.coverage });
      continue;
    }

    // The id every verdict below carries, derived through the ONE formula (src/drive/
    // batch-composer.ts's `deriveBatchId`) over the members actually dispatched. Identical to
    // `batch.batchId` whenever nothing was discarded.
    const batchId = deriveBatchId(plan.northStarId, dispatchable.map((m) => m.itemId));
    const claimId = `l5:${batchId}`;

    const sessionSpec: SessionSpec = {
      role: "verifier",
      tier: "l5",
      claimId,
      model: deps.model,
      sharedContext: deps.sharedContext,
      timeoutMs,
    };
    const { sessionId, usage: sessionUsage } = await deps.backend.createSession(sessionSpec);
    if (sessionUsage !== undefined) logUsage(claimId, L5_SESSION_OPEN_NODE_ID, sessionId, sessionUsage);

    for (const member of dispatchable) {
      const turnItem: TurnItem = {
        itemId: member.itemId,
        turnId: `${claimId}:${member.itemId}`,
        content: member.confirmedFences.length === 0
          ? member.content
          : `${member.content}\n\n${renderConfirmedVerifierFences(member.confirmedFences)}`,
        assumedVerified: member.confirmedFences,
        outputSchemaRef: "verdict-raw-l5",
        timeoutMs,
        maxOutputTokens,
      };
      const result = await deps.backend.runTurn(sessionId, turnItem);
      // Logged BEFORE checking `resolveTurn`'s outcome, same as driver-run.ts's own "log usage
      // before any discard check" rule: real tokens are spent whether the turn is later applied or
      // rejected (nonzero exit, unparseable body, binding failure) — a rejected turn's cost must
      // not vanish from the report.
      logUsage(claimId, member.itemId, sessionId, result.usage);
      const dispatchState: DispatchState = {
        itemId: member.itemId,
        contentHash: member.dispatchedHash,
        tier: "l5",
        claimId,
        batchId,
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
    outcomes.push({ plannedBatchId: batch.batchId, batchId, claimId, applied: appendResult.appended, rejected, fenceCoverage: fenceScreen.coverage });
  }

  return outcomes;
}
