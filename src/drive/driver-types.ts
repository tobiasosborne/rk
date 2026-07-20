// PURITY: type/const surface only — no fs/network/clock (L3). The shared contract types for the
// M3.6 hard-tier driver, split out of src/drive/driver-run.ts so the loop, the per-node machinery
// (driver-verify-node.ts, driver-prove-node.ts), and the balloon path (driver-balloon-run.ts) each
// import `DriverDeps`/`DriverRunResult`/`DispatchedTurn` from ONE place without a runtime import
// cycle back through the loop. driver-run.ts re-exports these so pre-existing importers keep their
// `from "./driver-run"` paths. DriverDeps is a shared contract (L6): every field's doc comment is
// the injected edge's obligation, not incidental prose.

import type { VerifierIdentity } from "./identity";
import type { BudgetConfig, DriverStopReason } from "./driver-guardrails";
import type { BalloonEvent } from "./driver-balloon";
import type { AfNodeView } from "./driver-plan";
import type { AfWorkspaceView, ApplyReport, FilledVerdictFile, VerdictItemOutcome, AfParseResult } from "./driver-af";
import type { ProofContent, RecordProofResult } from "./driver-prove-node";
import type { BalloonClassification } from "../graph/types";
import type { Role } from "./vocab";
import type { WorkerUsage } from "./worker-result";
import type { ParseFailureClass } from "./parse-diag";

import { DEFAULT_BALLOON_NODE_CAP } from "./driver-balloon";
import { DEFAULT_MAX_STUCK_ROUNDS, DEFAULT_NODE_RETRY_CAP, DEFAULT_NODE_CHURN_CAP, DEFAULT_MAX_CHURN_ROUNDS } from "./driver-guardrails";

export interface DriverConfig {
  balloonCap: number;
  maxStuckRounds: number;
  nodeRetryCap: number;
  maxRounds: number;
  /** rk-cpk (review 2026-07-20 FU2): per-node proof records tolerated since the last epistemic
   * advancement before the churn cap aborts the run on that node (spend protection, not validity). */
  nodeChurnCap: number;
  /** rk-cpk: rounds of tree growth since the last epistemic advancement before the churn cap aborts.
   * Catches a prove/challenge chain extending fresh leaves that the stuck guard's per-write reset
   * blinds it to. */
  maxChurnRounds: number;
}

export const DEFAULT_DRIVER_CONFIG: DriverConfig = {
  balloonCap: DEFAULT_BALLOON_NODE_CAP,
  maxStuckRounds: DEFAULT_MAX_STUCK_ROUNDS,
  nodeRetryCap: DEFAULT_NODE_RETRY_CAP,
  maxRounds: 50,
  nodeChurnCap: DEFAULT_NODE_CHURN_CAP,
  maxChurnRounds: DEFAULT_MAX_CHURN_ROUNDS,
};

/** One dispatched worker turn's already-parsed result (the injected dispatcher owns the spawn +
 * JSON parse). `raw` is shape (a) worker output; `role` and `exit` mirror the worker contract.
 * `usage` (M3.9, additive/optional so every pre-existing test harness still type-checks) is the
 * turn's token accounting, if the dispatcher captured it — logged verbatim to `.rk/driver-log.jsonl`
 * as a `"usage"` record (src/drive/report.ts's data source) regardless of the turn's eventual
 * outcome: tokens are spent whether or not the verdict/proof that came back was ever used. */
export interface DispatchedTurn {
  raw: unknown;
  role: Role;
  exit: number;
  usage?: WorkerUsage;
  /** GAP 7(b): the backend's raw output text, carried ONLY on an exit-12 parse/extraction failure
   * (src/drive/driver-live.ts's `toDispatchedTurn`), so the driver edge can persist a bounded
   * snippet as a `parse-failed` evidence record instead of throwing the model output away (the
   * STOP-REPORT-6 gap: an exit-12 previously surfaced as the bare string "worker exit 12", raw
   * output unrecoverable). Undefined on success and on every non-parse failure. */
  rawText?: string;
  /** rk-d1n (M3.5 live debug): the `JSON.parse` error message from the failed extraction (e.g.
   * "Unterminated string in JSON at position N"), carried alongside `rawText` on an exit-12
   * parse/extraction failure. DIAGNOSTIC ONLY — recorded in the `parse-failed` evidence record so an
   * unterminated string (model stopped mid-object) is distinguishable from trailing content; never
   * read by any acceptance/verdict logic. Undefined except on a parse failure. */
  parseError?: string;
  /** rk-d1n: the DIAGNOSTIC failure-mode class of the extraction failure
   * (src/drive/parse-diag.ts's `classifyExtractionFailure`) — "unterminated" | "trailing-content" |
   * "no-object" | "multiple-objects" | "other". Recorded in the `parse-failed` evidence record only;
   * acceptance semantics never read it. Undefined except on a parse failure. */
  parseClass?: ParseFailureClass;
}

export interface DriverDeps {
  contractId: string;
  claimId: string;
  identity: VerifierIdentity;
  /** Query af for the workspace's current node state (af's state machine is truth). */
  queryWorkspace(): AfParseResult<AfWorkspaceView>;
  /** Dispatch a verifier turn over one ready node. `undefined` = no worker available (skipped).
   * MAY return a Promise (M3.5-prep, src/drive/driver-live.ts's real backend calls — see the file
   * header's flagged injection-point note); every existing synchronous fake still type-checks.
   * GAP 10 (RUN-REPORT-9): `allNodes` is the current round's full export node set — the live edge
   * (src/drive/driver-live.ts's `verifierItemFor`) resolves `node`'s declared `dependencies` to their
   * statements from it so the verifier is given the CONTENT it judges the node's step against, not
   * just dependency ids (which it correctly refused to certify against, stalling forever). A fake that
   * ignores the second argument still type-checks (fewer-param functions are assignable). */
  dispatchVerify(node: AfNodeView, allNodes: readonly AfNodeView[]): DispatchedTurn | undefined | Promise<DispatchedTurn | undefined>;
  /** rk-gn4: dispatch a PROVER turn over one prover-ready node — the missing half of the M3.6
   * driver. Returns the prover's already-parsed decomposition body (role MUST be "prover"), or
   * `undefined` when no prover worker is available (skipped). MAY return a Promise (same live-edge
   * note as `dispatchVerify`). The result NEVER flows to an af verdict apply — it is recorded via
   * `recordProof` below; a prover turn cannot mint an acceptance (driver-prove-node.ts). */
  dispatchProve(node: AfNodeView): DispatchedTurn | undefined | Promise<DispatchedTurn | undefined>;
  /** rk-gn4: record a prover turn's produced decomposition into af (the live edge drives `af claim
   * --role prover` + `af refine --children`), after which af re-classifies the node (its children
   * become the new frontier and the verifier path takes over). Fail-closed: a non-ok result is
   * logged as a node skip, never a partial write. MAY return a Promise at the live edge.
   * GAP 8: `knownIds` is the current export's node-id set (the caller's fresh per-round `byId`
   * keys), needed to translate a prover's `depends` into af's `#N` in-batch namespace deterministically
   * — an existing id passes through, a not-yet-created same-batch sibling id becomes `#N`
   * (src/drive/driver-af.ts's `buildRecordProofChildren`). */
  recordProof(node: AfNodeView, proof: ProofContent, knownIds: ReadonlySet<string>): RecordProofResult | Promise<RecordProofResult>;
  /** Dispatch the balloon-classification turn (verifier role, cheap tier) over the offending
   * subtree; returns the already-parsed worker output. MAY return a Promise (same note as
   * `dispatchVerify` above) — typed `unknown` already, so no signature change is needed here. */
  dispatchClassification(subtree: string[]): unknown;
  applyVerdicts(file: FilledVerdictFile): ApplyReport;
  /** M3.8 (PRD C9 cross-vendor rule, apply-time half): true iff `nodeId` is load-bearing — on the
   * path to the north-star contract (PRD C2's critical-path query, `src/graph/query-path.ts`'s
   * `computeCriticalPath`, computed by the CLI wiring over the loaded GraphDocument + configured
   * north star). REQUIRED, not optional with a silent default: a caller with no graph/north-star
   * available must decide explicitly — the strict, validity-preserving choice is `() => true`
   * (treat every node as load-bearing, requiring cross-vendor, when critical-path membership is
   * unknown); `() => false` is available for a repo that has deliberately opted out (constitution-
   * configurable per PRD C9, "default on"). Never silently guessed inside the loop. */
  isLoadBearing(nodeId: string): boolean;
  /** M3 blocker 1: re-read the authoritative af node content hashes (nodeId -> content_hash) as of
   * NOW, called immediately before an apply. REQUIRED, never optional with a trust-the-query
   * default: binding a verdict to the pre-dispatch hash and applying without re-confirming lets an
   * edit during the model turn (or a stale caller) validate unreviewed bytes. The live edge
   * re-runs `af export` here (src/cli/verify-live.ts); a node missing from the returned map is
   * treated as a mismatch and its verdict discarded (fail closed). */
  reReadContentHashes(): Map<string, string>;
  /** Registry shard bytes for `contractId`, or undefined if not found (mandatory-review then logs a
   * loud skip instead of marking). */
  readShard(): string | undefined;
  writeShard(content: string): void;
  /** File a bd task; returns false when bd is absent (skip loudly, never silently). */
  createBdTask(task: { title: string; description: string }): boolean;
  appendLog(line: string): void;
  /** rk-d1n (M3.5 live debug): persist the FULL raw model output of a parse/extraction failure to a
   * file under the workspace `.rk/` (the live edge writes `.rk/parse-failures/<node>-<n>.txt`,
   * append-index, edge IO), returning the workspace-relative path recorded in the `parse-failed`
   * evidence record. The bounded snippet in the log is capped; this is the un-truncated bytes so the
   * exact failure (an unterminated verbose `reason` string, in the attempt-11 incident) is fully
   * inspectable without a re-run. OPTIONAL: a synthetic/dry harness may omit it, in which case only
   * the bounded snippet + classification are recorded (no `rawFailurePath`). Never throws at the
   * edge (a write failure returns undefined). */
  writeParseFailure?(node: string, rawText: string): string | undefined;
  /** ISO timestamp — the edge owns the clock (L3). */
  now(): string;
  priorBalloonCount: number;
  priorClassifications: BalloonClassification[];
  /** Offending subtree for a balloon (default: all node ids). */
  offendingSubtree?: string[];
  config?: Partial<DriverConfig>;
  /** rk-s9t (M3 milestone review verdict (c)): the campaign-level token spend guard. OPTIONAL in
   * this pure type so every synthetic/dry test harness runs with no cap (and every pre-existing
   * caller still type-checks), but REQUIRED-FOR-LIVE at the edge — src/cli/verify-live.ts refuses
   * to start a `--live` run without `--max-campaign-tokens`, the exact hole the review named (a
   * real-token run with no ceiling). When set, the loop tracks total tokens spent across EVERY
   * dispatched turn (input+output+cache, applied OR discarded — mirroring l5-dispatch's blocker-8
   * "a rejected turn still spent real tokens" rule), including PROVER turns, and, before EACH real
   * dispatch, refuses a call it cannot afford, aborting with stopReason "budget-exhausted" rather
   * than truncating mid-call. Plain arithmetic over injected `DispatchedTurn.usage` values (pure). */
  budget?: BudgetConfig;
}

export interface DriverRunResult {
  status: "converged" | "aborted";
  stopReason?: DriverStopReason;
  message: string;
  appliedNodeIds: string[];
  outcomes: VerdictItemOutcome[];
  balloon?: BalloonEvent;
  rounds: number;
}
