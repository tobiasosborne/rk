// EDGE — fs (via src/store/build-graph.ts, src/store/snapshot-load.ts and
// src/store/reward-ledger.ts) + optional subprocess (af/fr binaries, injected). `rk reward sync`
// (S0 finding S0-2, rk-ptx0): the SHADOW EMITTER — it reconciles the registry's own ground truth
// into the append-only reward ledger by appending the PRIMITIVE events that are missing, and
// nothing else. Payouts stay DERIVED (src/reward/engine.ts folds the log; balances are never
// stored), so this command can only ever change what the fold has to work with, never a balance.
//
// THE TIER COMES FROM THE MAPPING, NEVER FROM THE SHARD. `supportedCloseTier`
// (src/reward/tier.ts) is the ONE registry-state -> bankable-tier function, shared with Gate 8
// check 4; it is not re-derived here. A shard whose author wrote `status: proved` with `af: none`
// is a CLAIM: it supports no tier, so this emitter writes no close for it at all. That is the
// S0-1 laundering class, closed by construction rather than by a later audit.
//
// THE EMITTER AND GATE 8 AGREE BY CONSTRUCTION — every event written here is one
// src/gates/reward.ts would pass:
//   - citations are filtered to ids that actually resolve (definitions/ for `citedDefs`, the
//     registry for `citedLemmas`), so check 3 can never fire on a line this command wrote;
//   - a PRUNE is WITHHELD when the ledger holds no `predict` for that node, because the engine
//     scores a prune as 0.3 x H_pred and raises `prune-unpredicted` without one — a check-2
//     ERROR. Sync never invents the missing prediction: a prediction is a pre-registered,
//     before-the-first-attempt statement by an estimator, and manufacturing one after the fact
//     would be exactly the laundering this command exists to prevent. It says so, loudly, and
//     leaves the ledger alone.
//
// spentTokens COMES FROM ATTRIBUTION RULE v1 (rk-0ree, settled 2026-08-11 — dated append to
// docs/memos/2026-08-08-prereg-autonomy-v1.md; the rule itself lives in
// src/reward/attribution.ts, pure, with its clause-by-clause doc). This edge's obligations:
//   - it reads `.rk/driver-log.jsonl` ONCE per run and FAILS CLOSED on any line that cannot be
//     read as a record (bad JSON, blank, malformed known kind): an unreadable line may hide
//     spend, the banked figure must be a deterministic function of a fully-read log, and the
//     ledger is APPEND-ONLY so a wrong number written here can never be corrected. The ONE
//     exception: an `unrecognized 'kind'` issue cannot conceal a usage record (a line with
//     kind:"usage" is validated as one), so it is warned loudly and does not block — a log
//     written by a newer rk must not brick sync for no validity reason.
//   - the figure is AT-SYNC-TIME: the log's attribution total when the close is banked. Later
//     spend on an already-closed node is never retroactive — a close banks once.
//   - a node with no attributable records banks spentTokens=0 with a per-event note (the
//     pre-S0-2 floor semantics, now the exception instead of the rule); L5 session-open cost
//     with no dispatched member to share it is reported and attributed to no node.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadDefIds } from "../gates/linker-defs";
import { parseRegistry } from "../gates/linker-parse";
import { L5_SESSION_OPEN_NODE_ID, parseDriverLog, type UsageLogRecord } from "../drive/report-parse";
import { attributeSpentTokens } from "../reward/attribution";
import type { RegistryNode } from "../graph/types";
import { structuralLossLines } from "../render/diagnostics-view";
import { supportedCloseTier } from "../reward/tier";
import { pmaBacked } from "../reward/pma-backing";
import type { RewardEvent } from "../reward/types";
import { buildGraphDocument } from "../store/build-graph";
import { appendRewardEvents, loadRewardLedger, REWARD_LEDGER_RELPATH } from "../store/reward-ledger";
import { loadSnapshot } from "../store/snapshot-load";
import type { Out } from "./args";
import { extractRoot } from "./args";
import type { GraphCommandDeps } from "./graph";

/** Registry statuses that record a REFUTATION — the two `RIGOUR_STATUSES` members that mean the
 * node died rather than closed (src/graph/types.ts). A refuted node's death certificate is its own
 * shard, so `certRef` is the shard path. */
const PRUNABLE_STATUSES = new Set(["disproved", "obstruction"]);

export interface RewardSyncPlan {
  /** The events to append, in append order. Empty means the ledger is already in sync. */
  events: RewardEvent[];
  /** Human-readable lines: one per planned event, plus every WITHHELD candidate and every dropped
   * citation, interleaved in the order they were decided. Nothing is decided silently. */
  lines: string[];
  /** Count of candidates the plan deliberately did not emit (a prune with no prediction). */
  withheld: number;
}

function fmtList(ids: readonly string[]): string {
  return ids.length === 0 ? "[]" : `[${ids.join(",")}]`;
}

/** PURE. The whole reconciliation decision, over the registry spine and the events already on the
 * log — separately exported so the emission rules are unit-testable without a repo tree. */
export function planRewardSync(
  nodes: readonly RegistryNode[],
  existing: readonly RewardEvent[],
  defIds: ReadonlySet<string>,
  withRound: boolean,
  unbackedPmaIds: ReadonlySet<string> = new Set(),
  /** Per-node spentTokens from attribution rule v1 (src/reward/attribution.ts) over the driver
   * log as read by the edge below. Absent id -> 0 (the pre-S0-2 floor), noted per event. */
  spentByNode: ReadonlyMap<string, number> = new Map(),
): RewardSyncPlan {
  const closed = new Set(existing.filter((e) => e.type === "close").map((e) => e.nodeId));
  const pruned = new Set(existing.filter((e) => e.type === "prune").map((e) => e.nodeId));
  const predicted = new Set(existing.filter((e) => e.type === "predict").map((e) => e.obligation));
  const registryIds = new Set(nodes.map((n) => n.id));

  const events: RewardEvent[] = [];
  const lines: string[] = [];
  let withheld = 0;

  for (const node of [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const tier = supportedCloseTier(node);
    if (tier === "proved-mod-audit" && unbackedPmaIds.has(node.id) && !closed.has(node.id)) {
      withheld += 1;
      lines.push(
        `  - close ${node.id} WITHHELD: status proved-mod-audit is backed by neither a fresh VALID ` +
          `L5 verdict nor a provenance declaration (Gate 8 Check 4b would ERROR reward-tier-unbacked). ` +
          `Record the backing, then re-run.`,
      );
    } else if (tier !== undefined && node.id === L5_SESSION_OPEN_NODE_ID && !closed.has(node.id)) {
      // rk-0ree review P2: no gate enforces an id grammar that excludes the L5 session-open
      // sentinel, so a registry node with the reserved id CAN exist — but its driver-log records
      // are indistinguishable from session overhead, so any figure banked for it is untrustworthy.
      withheld += 1;
      lines.push(
        `  - close ${node.id} WITHHELD: '${L5_SESSION_OPEN_NODE_ID}' is the reserved L5 session-open ` +
          `sentinel id — spend attribution cannot distinguish this node's turns from session ` +
          `overhead. Rename the shard, then re-run.`,
      );
    } else if (tier !== undefined && !closed.has(node.id)) {
      const citedDefs = node.defs.filter((d) => defIds.has(d));
      const citedLemmas = node.deps.filter((d) => registryIds.has(d));
      const spentTokens = spentByNode.get(node.id) ?? 0;
      events.push({ type: "close", nodeId: node.id, tier, spentTokens, citedDefs, citedLemmas });
      lines.push(
        `  + close ${node.id} tier=${tier} (from the registry mapping: status=${node.status ?? "unset"}, ` +
          `af=${node.af} — never the shard's self-report) spentTokens=${spentTokens} ` +
          `citedDefs=${fmtList(citedDefs)} citedLemmas=${fmtList(citedLemmas)}`,
      );
      lines.push(
        spentTokens > 0
          ? `      note: spentTokens from attribution rule v1 over .rk/driver-log.jsonl at sync time (hard-tier contract turns + L5 item turns + fair-share of L5 session-open).`
          : `      note: no driver-log usage attributes to this node -> spentTokens=0; this close pays zero.`,
      );
      const droppedDefs = node.defs.filter((d) => !defIds.has(d));
      const droppedLemmas = node.deps.filter((d) => !registryIds.has(d));
      if (droppedDefs.length > 0) {
        lines.push(`      note: dropped ${fmtList(droppedDefs)} from citedDefs — no such definitions/ shard id.`);
      }
      if (droppedLemmas.length > 0) {
        lines.push(`      note: dropped ${fmtList(droppedLemmas)} from citedLemmas — no such argument/ shard id.`);
      }
    }

    if (PRUNABLE_STATUSES.has(node.status ?? "") && !pruned.has(node.id)) {
      if (predicted.has(node.id)) {
        events.push({ type: "prune", nodeId: node.id, certRef: node.path });
        lines.push(`  + prune ${node.id} (status=${node.status}) certRef=${node.path}`);
      } else {
        withheld += 1;
        lines.push(
          `  - prune ${node.id} WITHHELD: the ledger holds no predict event for it, so the engine ` +
            `would raise prune-unpredicted (a Gate 8 ERROR). A prediction is made BEFORE the first ` +
            `attempt, by an estimator — sync will not manufacture one. Append the predict, then re-run.`,
        );
      }
    }
  }

  if (withRound) {
    const ns = existing.filter((e) => e.type === "round").map((e) => e.n);
    const n = ns.length === 0 ? 1 : Math.max(...ns) + 1;
    events.push({ type: "round", n });
    lines.push(`  + round ${n} (marker appended LAST — the events above were banked in the round it closes)`);
  }

  return { events, lines, withheld };
}

const DRIVER_LOG_RELPATH = ".rk/driver-log.jsonl";
/** An `unrecognized 'kind'` line cannot conceal a usage record — any line with kind:"usage" is
 * validated as one by parseDriverLogLine — so it warns instead of blocking (file header). Every
 * OTHER issue (bad JSON, blank line, malformed known kind) may hide spend and fails closed. */
const NONBLOCKING_ISSUE = /^unrecognized 'kind'/;

interface DriverLogRead {
  usageRecords: UsageLogRecord[];
  /** Issues that refuse the sync (printed, nothing written) — empty when the read is clean. */
  blocking: { line: number; message: string }[];
  /** Issues printed as warnings only. */
  warnings: { line: number; message: string }[];
  exists: boolean;
}

function readDriverLogForSync(root: string): DriverLogRead {
  const path = join(root, ".rk", "driver-log.jsonl");
  if (!existsSync(path)) return { usageRecords: [], blocking: [], warnings: [], exists: false };
  const { records, issues } = parseDriverLog(readFileSync(path, "utf8"));
  return {
    usageRecords: records.filter((r): r is UsageLogRecord => r.kind === "usage"),
    blocking: issues.filter((i) => !NONBLOCKING_ISSUE.test(i.message)),
    warnings: issues.filter((i) => NONBLOCKING_ISSUE.test(i.message)),
    exists: true,
  };
}

export async function rewardSyncCommand(args: string[], out: Out, deps: GraphCommandDeps = {}): Promise<number> {
  const { rest, root } = extractRoot(args);
  const dryRun = rest.includes("--dry-run");
  const withRound = rest.includes("--round");

  const { doc, diagnostics } = buildGraphDocument(root, { afCommand: deps.afCommand, frCommand: deps.frCommand });
  if (!diagnostics.isStructurallyComplete) {
    out.log(
      "rk reward sync: refusing to append -- the projection is structurally incomplete " +
        "(a partial registry would bank a partial, permanent ledger):",
    );
    for (const line of structuralLossLines(diagnostics.structuralLoss)) out.log(`  ${line}`);
    out.log("  next: fix the structural issue(s) above and re-run 'rk reward sync --dry-run'. NOTHING was written.");
    return 1;
  }

  // Fail closed on an unreadable log: "which ids are already banked" is read FROM the log, so a
  // line the loader could not parse could be hiding exactly the close this run is about to
  // duplicate — and a duplicate close is a permanent, append-only Gate 8 ERROR.
  const load = loadRewardLedger(root);
  if (load.malformed.length > 0) {
    out.log(`rk reward sync: refusing to append -- ${load.malformed.length} unreadable line(s) in ${REWARD_LEDGER_RELPATH}:`);
    for (const m of load.malformed) out.log(`  line ${m.line}: ${m.error} | raw: ${m.raw}`);
    out.log("  a line that cannot be read may already bank an event this run would duplicate. NOTHING was written.");
    return 1;
  }

  // rk-0ree: read the driver log ONCE and fail closed on unreadable lines — an unreadable line may
  // hide spend, and the figure banked below is permanent (file header). Unrecognized kinds warn.
  const driverLog = readDriverLogForSync(root);
  if (driverLog.blocking.length > 0) {
    out.log(`rk reward sync: refusing to append -- ${driverLog.blocking.length} unreadable line(s) in ${DRIVER_LOG_RELPATH}:`);
    for (const i of driverLog.blocking) out.log(`  line ${i.line}: ${i.message}`);
    out.log("  an unreadable line may hide token spend, and a banked spentTokens figure is permanent (append-only");
    out.log("  ledger). Repair the driver log (or move it aside deliberately), then re-run. NOTHING was written.");
    return 1;
  }
  const attribution = attributeSpentTokens(driverLog.usageRecords);

  const snap = loadSnapshot(root);
  const unbackedPmaIds = new Set(
    parseRegistry(snap).lemmas
      .filter((l, _i, all) => l.status === "proved-mod-audit" && l.af !== "validated" && !pmaBacked(snap, l, all))
      .map((l) => l.id),
  );
  const plan = planRewardSync(doc.nodes, load.events, loadDefIds(snap), withRound, unbackedPmaIds, attribution.spentByNode);
  out.log(
    "rk reward sync (SHADOW — appends primitive events only; payouts stay derived, never stored):",
  );
  if (!driverLog.exists) {
    out.log(`  note: no ${DRIVER_LOG_RELPATH} -- every close below carries spentTokens=0.`);
  }
  for (const w of driverLog.warnings) {
    out.log(`  warning: driver-log line ${w.line}: ${w.message} -- cannot be a usage record; ignored for attribution.`);
  }
  for (const u of attribution.unattributedSessionOpen) {
    out.log(`  note: ${u.tokens} token(s) of L5 session-open cost in session '${u.sessionId}' had no dispatched member to share them -- attributed to no node.`);
  }
  for (const line of plan.lines) out.log(line);

  if (plan.events.length === 0) {
    const tail = plan.withheld > 0 ? ` (${plan.withheld} candidate event(s) withheld — see above)` : "";
    out.log(`  ledger already in sync -- 0 event(s) to append${tail}.`);
    return 0;
  }
  if (dryRun) {
    out.log(`  --dry-run: ${plan.events.length} event(s) would be appended. NOTHING was written.`);
    return 0;
  }
  appendRewardEvents(root, plan.events);
  out.log(`  ${plan.events.length} event(s) appended to ${REWARD_LEDGER_RELPATH}.`);
  out.log("  next: 'rk reward report' to see the fold, or 'rk check' to gate the ledger (Gate 8).");
  return 0;
}
