// EDGE — fs (via src/store/reward-ledger.ts). `rk reward report` (rk-ptx0 / S0): the SHADOW payout
// surface — it reads `.rk/reward-ledger.jsonl`, folds it through the pure engine
// (src/reward/engine.ts) and PRINTS the result. It allocates nothing and writes nothing; per the
// prereg memo (docs/memos/2026-08-08-prereg-autonomy-v1.md §6) S0 runs payouts in shadow, computed
// and logged, never steering a worker.
//
// TWO THINGS THIS SURFACE MUST NEVER DO, both learned the hard way (CLAUDE.md L2, LB4):
//   - summarize a diagnostic away. Every RewardDiagnostic the engine raised is printed on its own
//     line with its log position, because a payout the engine refused to make is exactly the fact
//     an operator needs.
//   - hide a malformed ledger line. Lines the loader could not read get their own section, with
//     line number and raw bytes; a report over a partially-unreadable log says so.
// `--strict` turns either of those into exit 1, so a driver can gate on "the ledger is clean"
// without parsing this text.
//
// Balances are DERIVED, never stored (src/reward/types.ts) — this command recomputes them from the
// log on every run, so there is no cache here to go stale.

import { computePayouts } from "../reward/engine";
import { rewardGate } from "../gates/reward";
import { DEFAULT_GATE_CONFIG } from "../gates/config";
import { formatFinding } from "../gates/framework";
import { loadSnapshot } from "../store/snapshot-load";
import type { PayoutResult } from "../reward/types";
import { loadRewardLedger, type RewardLedgerLoad } from "../store/reward-ledger";
import type { Out } from "./args";
import { extractRoot } from "./args";
import { rewardSyncCommand } from "./reward-sync";

/** Fixed 6-decimal rendering: payouts are log2-scaled reals, and a rounded-to-2 balance hides the
 * difference between "earned nothing" and "earned a sliver of a reuse share". */
function amount(x: number): string {
  return x.toFixed(6);
}

/** The whole report as lines, from the loaded ledger and the engine's fold over it. Deliberately a
 * separate, side-effect-free function from the command: it is the unit the tests assert against,
 * and the same lines will be reusable by a future `rk audit` (N4.1) without going through argv. */
export function formatRewardReport(load: RewardLedgerLoad, result: PayoutResult): string[] {
  const lines: string[] = [];
  const balanceIds = Object.keys(result.balances);
  lines.push(
    `reward report (SHADOW — computed, never allocating): ${load.events.length} event(s), ` +
      `${load.malformed.length} malformed line(s)`,
  );

  lines.push(`balances (${balanceIds.length}) — derived from the log, never stored:`);
  if (balanceIds.length === 0) lines.push("  none");
  else for (const id of balanceIds) lines.push(`  ${id}  ${amount(result.balances[id]!)}`);

  lines.push(`escrows (${result.escrows.length}):`);
  if (result.escrows.length === 0) lines.push("  none");
  else {
    for (const e of result.escrows) {
      lines.push(
        `  ${e.obligation} (reduce@${e.grantSeq}): total ${amount(e.total)}, ` +
          `remaining ${amount(e.remaining)}, ${e.expired ? "EXPIRED" : "live"}`,
      );
    }
  }

  lines.push(`diagnostics (${result.diagnostics.length}) — every one, never summarized away:`);
  if (result.diagnostics.length === 0) lines.push("  none");
  else {
    for (const d of result.diagnostics) {
      const who = d.nodeId ? ` ${d.nodeId}` : "";
      lines.push(`  seq ${d.seq}: ${d.code}${who}${d.detail ? ` — ${d.detail}` : ""}`);
    }
  }

  const t = result.totals;
  lines.push(
    `totals: closes=${t.closes} demotions=${t.demotions} reduces=${t.reduces} prunes=${t.prunes} ` +
      `wildcardCloses=${t.wildcardCloses} wildcardPrunes=${t.wildcardPrunes}`,
  );

  if (load.malformed.length > 0) {
    lines.push(`malformed ledger lines (${load.malformed.length}) — NEVER silently dropped:`);
    for (const m of load.malformed) lines.push(`  line ${m.line}: ${m.error} | raw: ${m.raw}`);
    lines.push("  the fold above skipped these lines: every payout below them may be wrong.");
  }

  lines.push("  next: 'rk reward report --strict' to make a dirty ledger a non-zero exit.");
  return lines;
}

async function rewardReport(args: string[], out: Out): Promise<number> {
  const { rest, root } = extractRoot(args);
  const strict = rest.includes("--strict");
  const load = loadRewardLedger(root);
  const result = computePayouts(load.events);
  for (const line of formatRewardReport(load, result)) out.log(line);
  // Tier A review of f5b6b7c, blocker 1: the report is a PAYOUT surface — it must never show a
  // balance Gate 8 would refuse. The gate runs here unconditionally; --strict turns findings
  // into a nonzero exit.
  const gate = rewardGate.run(loadSnapshot(root), DEFAULT_GATE_CONFIG);
  if (gate.findings.length > 0) {
    out.log(`gate findings (${gate.findings.length}) — balances above are NOT bankable until these clear:`);
    for (const f of gate.findings) out.log(`  ${formatFinding(f)}`);
  }
  if (!strict) return 0;
  return result.diagnostics.length > 0 || load.malformed.length > 0 || gate.findings.length > 0 ? 1 : 0;
}

const REWARD_COMMANDS: Record<string, (args: string[], out: Out) => Promise<number>> = {
  report: rewardReport,
  sync: rewardSyncCommand,
};

export function rewardHelp(out: Out): number {
  out.log("rk reward — the append-only reward event ledger (.rk/reward-ledger.jsonl, schema v2; payout prereg v1)");
  out.log("  usage: rk reward report [--strict] [--root <dir>]");
  out.log("  Folds the ledger through the payout engine and prints balances, escrows, EVERY");
  out.log("  diagnostic, the totals, and every malformed ledger line. Shadow only: computes and");
  out.log("  prints, never allocates, never writes. --strict exits 1 iff any diagnostic or any");
  out.log("  malformed line exists (a driver's clean-ledger gate); otherwise the exit is always 0.");
  out.log("  usage: rk reward sync [--dry-run] [--round] [--root <dir>]");
  out.log("  Reconciles registry ground truth into the ledger: appends the MISSING close events");
  out.log("  (tier taken from src/reward/tier.ts's one mapping — a self-reported 'proved' with");
  out.log("  af: none banks nothing) and the missing prune events for refuted nodes. spentTokens");
  out.log("  comes from attribution rule v1 over .rk/driver-log.jsonl (hard-tier turns to their");
  out.log("  contract, L5 turns to their item, session-open split fair-share; 0 when no usage");
  out.log("  attributes, noted per event). Idempotent; --dry-run writes nothing; --round also");
  out.log("  appends the next allocation-round marker. Refuses and writes NOTHING on a");
  out.log("  structurally incomplete build, an unreadable ledger line, or an unreadable");
  out.log("  driver-log line (hidden spend fails closed).");
  out.log("  next: 'rk reward sync --dry-run' in a campaign repo, then without --dry-run.");
  return 0;
}

export async function rewardDispatch(args: string[], out: Out): Promise<number> {
  const [sub, ...rest] = args;
  if (!sub) return rewardHelp(out);
  const handler = REWARD_COMMANDS[sub];
  if (!handler) {
    out.log(`unknown reward subcommand '${sub}'.`);
    rewardHelp(out);
    return 2;
  }
  return handler(rest, out);
}
