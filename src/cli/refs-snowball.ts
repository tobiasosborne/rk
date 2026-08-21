// EDGE — `rk refs snowball` (bead rk-hzla, NOTES-2026-08-20-qpcp-campaign-plan.md section 3).
// Split out of src/cli/refs.ts (CLAUDE.md Rule 4's 280-line shard cap — refs.ts was already at
// 227 lines before this handler; adding it in place would have pushed it to 332), the same way
// src/cli/check-regen.ts was split out of check.ts. Forward+backward citation-closure builder for
// a corpus seed list: fetches (or replays a cache of) Semantic Scholar data via
// src/refs/snowball-fetch.ts, computes the deterministic closure via the pure
// src/refs/snowball-closure.ts, and merges it into a triage-ledger skeleton
// (src/refs/snowball-triage.ts) without ever discarding an operator's prior triage/reason.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { parseSeedsFile, snowballClosure } from "../refs/snowball-closure";
import { buildSnowballOracle } from "../refs/snowball-fetch";
import { countTableLines, formatTriageDocument, mergeTriageRows, parseTriageTable } from "../refs/snowball-triage";
import type { Out } from "./args";
import { extractFlag, extractRoot } from "./args";

/** `buildOracle` defaults to the real Semantic Scholar edge (`buildSnowballOracle`); tests inject
 * a fake so nothing here ever touches the network — the async network phase and the pure
 * BFS/merge phases are cleanly separated, so this handler's own logic (arg parsing, file IO, the
 * count line, exit codes) is fully testable without a live API. */
export async function refsSnowball(args: string[], out: Out, buildOracle = buildSnowballOracle): Promise<number> {
  const { rest: r1, root } = extractRoot(args);
  const { rest: r2, value: seedsPath } = extractFlag(r1, "--seeds");
  const { rest: r3, value: depthStr } = extractFlag(r2, "--depth");
  const { rest: r4, value: minYearStr } = extractFlag(r3, "--min-year");
  const { value: outFlag } = extractFlag(r4, "--out");

  if (!seedsPath) {
    out.log("usage: rk refs snowball --seeds <file> [--depth N] [--min-year YYYY] [--out <path>] [--root <path>]");
    out.log("  seeds file: one arXiv id per line; '#' starts a comment (whole-line or trailing).");
    out.log("  writes refs/snowball/closure.json and merges a triage-ledger skeleton at --out");
    out.log("  (default refs/triage.md) — existing triage/reason values are never overwritten.");
    return 2;
  }

  let depth = 2;
  if (depthStr !== undefined) {
    const n = Number(depthStr);
    if (!Number.isInteger(n) || n < 0) {
      out.log(`rk refs snowball: --depth must be a non-negative integer, got '${depthStr}'`);
      return 2;
    }
    depth = n;
  }

  let minYear: number | undefined;
  if (minYearStr !== undefined) {
    const n = Number(minYearStr);
    if (!Number.isInteger(n)) {
      out.log(`rk refs snowball: --min-year must be an integer, got '${minYearStr}'`);
      return 2;
    }
    minYear = n;
  }

  let seedsText: string;
  try {
    seedsText = readFileSync(seedsPath, "utf8");
  } catch (err) {
    out.log(`rk refs snowball: cannot read seeds file '${seedsPath}': ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
  const seeds = parseSeedsFile(seedsText);
  if (seeds.length === 0) {
    out.log(`rk refs snowball: seeds file '${seedsPath}' has no arXiv ids (only comments/blank lines?)`);
    return 2;
  }

  const cacheDir = join(root, "refs", "snowball", "cache");
  const { oracle, partial, errors } = await buildOracle(seeds, depth, {
    cacheDir,
    apiKey: process.env.S2_API_KEY,
  });
  const entries = snowballClosure(seeds, depth, oracle, minYear !== undefined ? { minYear } : {});

  const closurePath = join(root, "refs", "snowball", "closure.json");
  mkdirSync(dirname(closurePath), { recursive: true });
  writeFileSync(
    closurePath,
    JSON.stringify({ seeds, depth, minYear: minYear ?? null, partial, papers: entries }, null, 2) + "\n",
  );

  const triagePath = outFlag ? (isAbsolute(outFlag) ? outFlag : join(root, outFlag)) : join(root, "refs", "triage.md");
  const existingText = existsSync(triagePath) ? readFileSync(triagePath, "utf8") : "";
  const existingRows = parseTriageTable(existingText);
  const presentRows = countTableLines(existingText);
  if (existingRows.length !== presentRows) {
    // A partially parsed ledger must never be merged over: every unparsed row would be treated
    // as brand-new and its authored triage/reason silently dropped (2026-08-21 incident).
    out.log(
      `rk refs snowball: ${relative(root, triagePath)} has ${presentRows} table rows but only ${existingRows.length} parse — ` +
        "REFUSING to merge over a partially parsed ledger. Fix the malformed row first.",
    );
    return 1;
  }
  const { rows, newCount } = mergeTriageRows(entries, existingRows);
  mkdirSync(dirname(triagePath), { recursive: true });
  writeFileSync(triagePath, formatTriageDocument(rows));

  const byDepth = new Map<number, number>();
  for (const e of entries) byDepth.set(e.depth, (byDepth.get(e.depth) ?? 0) + 1);
  const byDepthStr = [...byDepth.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([d, c]) => `${d}=${c}`)
    .join(", ");

  out.log(
    `closure depth ${depth} over ${seeds.length} seeds: ${entries.length} papers (${newCount} new), by depth: ${byDepthStr}` +
      (partial ? " — PARTIAL (network failure after retries; see errors below)" : ""),
  );
  out.log(`  wrote ${relative(root, closurePath)} and ${relative(root, triagePath)}.`);
  if (partial) {
    for (const e of errors) out.log(`  error: ${e}`);
  }
  return partial ? 1 : 0;
}
