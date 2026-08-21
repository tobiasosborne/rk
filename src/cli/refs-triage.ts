// EDGE — `rk refs triage --auto` (campaign-E phase 0a, 2026-08-21). The thin fs shell around the
// pure src/refs/triage-auto.ts: read refs/triage.md, band every untouched row, write the ledger
// back, print one coverage line with the per-band counts. Split from src/cli/refs.ts for the
// 280-line shard cap, like refs-snowball.ts. Authored rows (any triage or reason already set,
// and every seed row) are never modified — see the pure module's header for the contract.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { countTableLines, formatTriageDocument, parseTriageTable } from "../refs/snowball-triage";
import { autoTriage, parseKeywordsFile, type AutoTriageOptions } from "../refs/triage-auto";
import type { Out } from "./args";
import { extractFlag, extractRoot } from "./args";

const DEFAULT_LEDGER = "refs/triage.md";

function usage(out: Out): number {
  out.log("usage: rk refs triage --auto [--redo-auto] [--keywords <file>] [--in-links N] [--out-links N] [--triage <path>] [--root <path>]");
  out.log("  Mechanical pre-triage of the snowball ledger: rows with EMPTY triage and reason are banded by");
  out.log("  seed-link count (the `via` column) and title keyword hits. candidate (>= --in-links, default 3,");
  out.log("  or >= 2 with a keyword) and review rows get an `auto:` reason and an EMPTY triage for the");
  out.log("  operator; out rows (<= --out-links, default 1, no keyword) get triage `out` + `auto:` reason.");
  out.log("  Seed rows and anything already triaged or reasoned are never touched; reruns are idempotent.");
  out.log("  --redo-auto re-bands rows this command banded before (reason 'auto:'), e.g. after tuning keywords;");
  out.log("  a row whose triage a human changed since is still left alone.");
  return 2;
}

function parseCount(raw: string | undefined, flag: string, out: Out): number | undefined | null {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    out.log(`rk refs triage: ${flag} must be a non-negative integer, got '${raw}'`);
    return null;
  }
  return n;
}

export async function refsTriage(args: string[], out: Out): Promise<number> {
  const { rest: r1, root } = extractRoot(args);
  const auto = r1.includes("--auto");
  const redoAuto = r1.includes("--redo-auto");
  const r2 = r1.filter((a) => a !== "--auto" && a !== "--redo-auto");
  const { rest: r3, value: keywordsPath } = extractFlag(r2, "--keywords");
  const { rest: r4, value: inLinksRaw } = extractFlag(r3, "--in-links");
  const { rest: r5, value: outLinksRaw } = extractFlag(r4, "--out-links");
  const { value: ledgerFlag } = extractFlag(r5, "--triage");
  if (!auto) return usage(out);

  const inLinks = parseCount(inLinksRaw, "--in-links", out);
  if (inLinks === null) return 2;
  const outLinks = parseCount(outLinksRaw, "--out-links", out);
  if (outLinks === null) return 2;

  const ledgerRel = ledgerFlag ?? DEFAULT_LEDGER;
  const ledgerPath = isAbsolute(ledgerRel) ? ledgerRel : join(root, ledgerRel);
  if (!existsSync(ledgerPath)) {
    out.log(`rk refs triage: no triage ledger at ${ledgerRel} — run 'rk refs snowball' first.`);
    return 2;
  }

  const opts: AutoTriageOptions = { redoAuto };
  if (inLinks !== undefined) opts.inLinks = inLinks;
  if (outLinks !== undefined) opts.outLinks = outLinks;
  if (keywordsPath !== undefined) {
    const kwPath = isAbsolute(keywordsPath) ? keywordsPath : join(root, keywordsPath);
    if (!existsSync(kwPath)) {
      out.log(`rk refs triage: keywords file not found: ${keywordsPath}`);
      return 2;
    }
    opts.keywords = parseKeywordsFile(readFileSync(kwPath, "utf8"));
  }

  const text = readFileSync(ledgerPath, "utf8");
  const rows = parseTriageTable(text);
  const present = countTableLines(text);
  if (rows.length !== present) {
    out.log(
      `rk refs triage: ${ledgerRel} has ${present} table rows but only ${rows.length} parse — a malformed row ` +
        "stops the parser; REFUSING to rewrite the ledger (that would delete every row after it). Fix the row first.",
    );
    return 1;
  }
  if (rows.length === 0) {
    out.log(`rk refs triage: ${ledgerRel} has no triage table (0 rows) — nothing to band.`);
    return 2;
  }
  const { rows: banded, counts } = autoTriage(rows, opts);
  writeFileSync(ledgerPath, formatTriageDocument(banded));
  out.log(
    `auto-triage: ${rows.length} rows; candidate ${counts.candidate}, review ${counts.review}, out ${counts.out}, ` +
      `untouched ${counts.untouched} (keywords: ${opts.keywords?.length ?? 0}; in-links >= ${opts.inLinks ?? 3}, out-links <= ${opts.outLinks ?? 1})`,
  );
  out.log(`  wrote ${ledgerRel}. next: review the 'candidate' and 'review' rows (triage column is still empty there).`);
  return 0;
}
