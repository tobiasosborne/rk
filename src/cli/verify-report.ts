// EDGE — fs. `rk verify --report [--baseline <memo.json>]` (M3.9)'s printing logic, split out of
// src/cli/verify.ts (M3.5-prep) so BOTH the dry-run/live dispatcher (verify.ts) and the live-run
// wiring (verify-live.ts) can print the SAME accounting report without a circular import between
// the two (verify-live.ts needs this; verify.ts still owns argument parsing and dispatch). Reads
// `.rk/driver-log.jsonl` (src/drive/report.ts's pure parser/aggregator does the math; this edge
// only opens the file) and prints tokens/calls/cache-fraction/verdicts/balloons per node, claim,
// and campaign. A missing log is an honest "never measured" state, never a zeroed report that
// looks like a real measurement.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildReport, compareToBaseline, parseBaselineMemo, parseDriverLog, type CampaignReport } from "../drive/report";
import type { Out } from "./args";

/** The fixed, campaign-repo-relative location of the driver's append-only event log (same
 * fixed-path convention as src/drive/l5-store-io.ts's `l5StorePath`). */
export function driverLogPath(root: string): string {
  return join(root, ".rk", "driver-log.jsonl");
}

function reportLines(r: CampaignReport): string[] {
  const lines: string[] = [];
  if (!r.measured) {
    lines.push(`rk verify --report: driver log parsed but carries ZERO usage records — no token/call cost has ever been measured for campaign '${r.campaignId}'.`);
    lines.push("  next: run a live 'rk verify --af <id>' (or an L5 dispatch) to record usage, then re-run --report.");
    return lines;
  }
  lines.push(`rk verify --report: campaign '${r.campaignId}'`);
  lines.push(`  totals: input=${r.totals.input} output=${r.totals.output} cache_read=${r.totals.cache_read} cache_creation=${r.totals.cache_creation} turns=${r.totals.turns}`);
  lines.push(`  cache fraction: ${r.cacheFraction.toFixed(4)}`);
  lines.push(`  verdicts (campaign-wide -- node ids repeat across claims, so this kind is never split per claim): total=${r.verdicts.total} applied=${r.verdicts.applied} blocked=${r.verdicts.blocked} rejected=${r.verdicts.rejected} other=${r.verdicts.other}`);
  lines.push(`  balloons: total=${r.balloons.total} unclassified=${r.balloons.unclassified} by-classification=${JSON.stringify(r.balloons.byClassification)}`);
  for (const c of r.claimRows) {
    lines.push(`  claim ${c.claimId} (contract ${c.contractIds.join(",") || "?"}): turns=${c.totals.turns} attributed-tokens=${c.attributedTokens} cache-fraction=${c.cacheFraction.toFixed(4)} balloons=${c.balloons.total}`);
    for (const n of r.nodeRows.filter((row) => row.claimId === c.claimId)) {
      lines.push(`    node ${n.nodeId}: turns=${n.totals.turns} attributed-tokens=${n.attributedTokens} cache-fraction=${n.cacheFraction.toFixed(4)}`);
    }
  }
  return lines;
}

/** Prints the full M3.9 report (plus, when `baselinePath` is given, the SC4 baseline comparison).
 * Used both by `rk verify --report` (verify.ts) and automatically at the end of a live run
 * (verify-live.ts) — the SAME text either way, since both read the SAME persisted log. */
export function reportCommand(root: string, out: Out, baselinePath: string | undefined): number {
  const path = driverLogPath(root);
  if (!existsSync(path)) {
    out.log(`rk verify --report: no driver log at .rk/driver-log.jsonl -- nothing has ever been measured for this campaign.`);
    out.log("  next: run a live 'rk verify --af <id>' (or an L5 dispatch) to record usage, then re-run --report.");
    return 1;
  }
  const { records, issues } = parseDriverLog(readFileSync(path, "utf8"));
  for (const issue of issues) out.log(`  [driver-log:${issue.line}] ${issue.message}`);
  const report = buildReport(records, root);
  for (const line of reportLines(report)) out.log(line);
  if (issues.length > 0) out.log(`  ${issues.length} driver-log line(s) could not be parsed (see above) -- never silently dropped.`);

  if (!baselinePath) {
    out.log("  SC4 baseline: no baseline recorded -- SC4 not yet measurable (pass --baseline <memo.json> once M3.5's memo exists).");
    return 0;
  }
  if (!existsSync(baselinePath)) {
    out.log(`  SC4 baseline: --baseline '${baselinePath}' does not exist -- SC4 not yet measurable.`);
    return 1;
  }
  const parsed = parseBaselineMemo(readFileSync(baselinePath, "utf8"));
  if (!parsed.ok) {
    out.log(`  SC4 baseline: '${baselinePath}' could not be read as a baseline memo: ${parsed.reason}`);
    return 1;
  }
  const cmp = compareToBaseline(report, parsed.baseline);
  out.log(`  SC4 baseline comparison -- ${cmp.caveat}`);
  for (const row of cmp.rows) {
    const ratioText = row.ratio === undefined ? "no current data measured for this lemma" : `${row.ratio.toFixed(2)}x`;
    out.log(`    ${row.lemma}: baseline=${row.baselineTokens}tok/${row.baselineCalls}call current=${row.currentTokens}tok/${row.currentCalls}call ratio=${ratioText}`);
  }
  return 0;
}
