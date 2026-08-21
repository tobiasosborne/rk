// EDGE — `rk refs` subcommand group. Moved unchanged out of the original monolithic src/cli.ts
// (M0.3 restructure, deliverable 6) — behavior is byte-identical; only the module boundary and
// import paths changed (one directory level up to reach src/refs/*, src/types).

import { addSource } from "../refs/add";
import { adoptSource } from "../refs/adopt";
import {
  computeStatusReport,
  resolveRenamedEnv,
  RK_REFS_CACHE_ENV,
  RK_REFS_CACHE_ENV_DEPRECATED,
  RK_REFS_CACHE_URL_ENV,
  RK_REFS_CACHE_URL_ENV_DEPRECATED,
} from "../refs/status";
import { locateQuoteInRepo } from "../refs/quote-locate";
import { sourceId } from "../types";
import type { Out } from "./args";
import { extractFlag, extractRoot } from "./args";
import { refsSnowball } from "./refs-snowball";

/** rk-54a: warns ONCE, clearly, when a cache env var is being honored only via its deprecated
 * old name — the one path where that name is actually steering behavior (see
 * `resolveRenamedEnv`'s doc comment for why the "both set" case stays silent). */
function warnIfDeprecatedEnv(out: Out, newName: string, oldName: string): void {
  const resolved = resolveRenamedEnv(newName, oldName);
  if (resolved.source === "old") {
    out.log(`  DEPRECATED: '${oldName}' is set but rk now reads '${newName}'. Using '${oldName}' for this run — rename it in your shell profile.`);
  }
}

type SubHandler = (args: string[], out: Out) => Promise<number>;

const STATUS_MARK: Record<string, string> = {
  present: "ok  ",
  cache: "cache",
  fetchable: "fetch",
  missing: "MISS",
};

async function refsStatus(args: string[], out: Out): Promise<number> {
  const { root } = extractRoot(args);
  warnIfDeprecatedEnv(out, RK_REFS_CACHE_ENV, RK_REFS_CACHE_ENV_DEPRECATED);
  warnIfDeprecatedEnv(out, RK_REFS_CACHE_URL_ENV, RK_REFS_CACHE_URL_ENV_DEPRECATED);
  let report;
  try {
    report = await computeStatusReport(root);
  } catch (err) {
    // A lock file that EXISTS but cannot be read/parsed is never "nothing adopted" (rk-p1p4a).
    out.log(`rk refs status: ${err instanceof Error ? err.message : String(err)}`);
    out.log("  the lock file exists but could not be read — this is a corrupt manifest, not an empty one.");
    return 1;
  }
  if (!report.adopted) {
    out.log(`rk refs status: not adopted — no ${report.lockPath} in this repo, so no source is registered.`);
    out.log("  next: 'rk refs add <locator> --id <source-id>' to fetch one, or, for a payload already");
    out.log("  on disk under refs/, 'rk refs adopt <path> --source <locator>' (offline, no network).");
    return 0;
  }
  const rows = report.rows;
  for (const r of rows) {
    out.log(`  [${STATUS_MARK[r.status]}] ${r.path} (${r.sourceId})`);
  }
  const counts: Record<string, number> = { present: 0, cache: 0, fetchable: 0, missing: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  out.log(
    `\nrk refs status: ${rows.length} file${rows.length === 1 ? "" : "s"} — ` +
      Object.entries(counts)
        .map(([k, v]) => `${k}=${v}`)
        .join(", "),
  );
  if ((counts.missing ?? 0) > 0) {
    out.log(
      `  ${counts.missing} missing with no reproducible route. Seed a content-addressed cache ` +
        `on a machine that has them: 'rk refs add <locator> --id <source-id>' there, then set ` +
        `RK_REFS_CACHE=<dir> here.`,
    );
  }
  if ((counts.fetchable ?? 0) > 0) {
    out.log(`  ${counts.fetchable} fetchable but not yet local. Run 'rk refs add <locator>' to acquire them.`);
  }
  return 0;
}

async function refsAdd(args: string[], out: Out): Promise<number> {
  const { rest: r1, root } = extractRoot(args);
  const { rest: r2, value: id } = extractFlag(r1, "--id");
  const { rest: r3, value: citation } = extractFlag(r2, "--citation");
  const { rest: locatorArgs, value: role } = extractFlag(r3, "--role");
  const locator = locatorArgs[0];
  if (!locator || !id) {
    out.log("usage: rk refs add <locator> --id <source-id> [--citation <text>] [--role <text>]");
    out.log("  locator: a local file path, 'arxiv:<id>', 'doi:<doi>', or a URL");
    return 2;
  }
  try {
    const result = await addSource(root, locator, {
      id,
      ...(citation !== undefined ? { citation } : {}),
      ...(role !== undefined ? { role } : {}),
    });
    out.log(`added '${result.sourceId}': ${result.path} (sha256 ${result.sha256})`);
    out.log(`  updated refs/manifest/{checksums.sha256,sources.lock.json,SOURCES.md}.`);
    out.log(`  next: 'rk refs quote ${result.sourceId} <pattern>' to pull a byte-verbatim quote.`);
    return 0;
  } catch (err) {
    out.log(`rk refs add: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

/** rk-pk8o: register an already-downloaded payload, offline. Deliberately NOT folded into
 * `refs add`: `add` acquires bytes and decides a fetch route, `adopt` claims neither — keeping them
 * separate verbs is what keeps "rk fetched this" and "an operator handed rk these bytes"
 * distinguishable in the manifest. */
async function refsAdopt(args: string[], out: Out): Promise<number> {
  const { rest: r1, root } = extractRoot(args);
  const { rest: r2, value: source } = extractFlag(r1, "--source");
  const { rest: r3, value: expectSha256 } = extractFlag(r2, "--sha256");
  const { rest: r4, value: id } = extractFlag(r3, "--id");
  const { rest: r5, value: citation } = extractFlag(r4, "--citation");
  const { rest: pathArgs, value: role } = extractFlag(r5, "--role");
  const path = pathArgs[0];
  if (!path || !source) {
    out.log("usage: rk refs adopt <path-under-refs/> --source <url-or-locator> [--sha256 <hex>]");
    out.log("               [--id <source-id>] [--citation <text>] [--role <text>] [--root <path>]");
    out.log("  registers an ALREADY-downloaded payload (e.g. one a firewalled librarian fetched) in");
    out.log("  refs/manifest/. No network. The sha256 is computed from the bytes on disk; --sha256");
    out.log("  verifies it against a hash you already hold, and a mismatch writes nothing.");
    return 2;
  }
  try {
    const result = await adoptSource(root, path, {
      source,
      ...(expectSha256 !== undefined ? { expectSha256 } : {}),
      ...(id !== undefined ? { id } : {}),
      ...(citation !== undefined ? { citation } : {}),
      ...(role !== undefined ? { role } : {}),
    });
    if (result.alreadyAdopted) {
      out.log(`already adopted '${result.sourceId}': ${result.path} (sha256 ${result.sha256}) — nothing changed.`);
      return 0;
    }
    out.log(`adopted '${result.sourceId}': ${result.path} (sha256 ${result.sha256})`);
    out.log("  updated refs/manifest/{checksums.sha256,sources.lock.json,SOURCES.md}.");
    out.log("  fetch route recorded: none (rk did not fetch these bytes) — cache-only, per the locator in SOURCES.md.");
    out.log(`  next: 'rk refs quote ${result.sourceId} <pattern>' to pull a byte-verbatim quote.`);
    return 0;
  } catch (err) {
    out.log(`rk refs adopt: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

async function refsQuote(args: string[], out: Out): Promise<number> {
  const { rest, root } = extractRoot(args);
  const [id, ...patternParts] = rest;
  const pattern = patternParts.join(" ");
  if (!id || !pattern) {
    out.log("usage: rk refs quote <source-id> <pattern> [--root <path>]");
    return 2;
  }
  try {
    const lookup = await locateQuoteInRepo(root, sourceId(id), pattern);
    if (!lookup.found) {
      out.log(`rk refs quote: pattern not found in '${id}'s local payload.`);
      out.log(`  next: check the pattern is an exact substring (byte-for-byte), or 'rk refs status' to confirm the payload is present.`);
      // 2026-08-14 Tier A review, finding P2-4. The FIRST quote request against a PDF produces the
      // extraction sidecar and the lock record whether or not the pattern turns up, and the old
      // bare `null` return threw that fact away — "pattern not found" was the operator's entire
      // report of a run that had just written two files. The searched layer is disclosed either
      // way, because it also says WHICH bytes the negative answer is about.
      for (const ex of lookup.extractions) {
        out.log(`  (PDF payload: searched the extraction layer ${ex.path}, not the compressed payload bytes)`);
        if (ex.regenerated) {
          out.log(`  wrote ${ex.path} and recorded its sha256 (chained to the payload hash) in refs/manifest/sources.lock.json.`);
        }
      }
      return 1;
    }
    const result = lookup.result;
    out.log(`${result.path}:${result.line}`);
    out.log(`"${result.quote}"`);
    // rk-we5i: a PDF payload is quoted through its extraction layer, and this command may have
    // just WRITTEN that layer plus a lock record. Disclose both — a derived-file write that an
    // operator only discovers via `git status` is exactly the kind of silent state change
    // CLAUDE.md rule 9 (generated vs authored, never mixed) exists to prevent.
    if (result.extraction) {
      const verb = result.extraction.regenerated ? "extracted to" : "read from";
      out.log(`  (PDF payload: line ${result.line} indexes the extraction layer, ${verb} ${result.extraction.path})`);
      if (result.extraction.regenerated) {
        out.log(`  wrote ${result.extraction.path} and recorded its sha256 (chained to the payload hash) in refs/manifest/sources.lock.json.`);
      }
    }
    return 0;
  } catch (err) {
    out.log(`rk refs quote: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

// rk-hzla: `refsSnowball` (`rk refs snowball`) now lives in src/cli/refs-snowball.ts (CLAUDE.md
// Rule 4's 280-line shard cap — see that file's header), re-exported here so the public import
// path `../src/cli/refs` is unchanged, the same way check.ts re-exports from check-regen.ts.
export { refsSnowball } from "./refs-snowball";
import { refsTriage } from "./refs-triage";

const REFS_COMMANDS: Record<string, SubHandler> = {
  status: refsStatus,
  add: refsAdd,
  adopt: refsAdopt,
  quote: refsQuote,
  snowball: refsSnowball,
  triage: refsTriage,
};

export function refsHelp(out: Out): number {
  out.log("rk refs — ground-truth reference library (PRD C7)");
  out.log("  rk refs status              present/fetchable/cache/missing per source");
  out.log("  rk refs add <locator>       fetch/hash/install + update the manifest");
  out.log("  rk refs adopt <path>        register an already-downloaded refs/ payload (offline)");
  out.log("  rk refs quote <id> <pat>    byte-verbatim quote with a path:line anchor");
  out.log("  rk refs snowball --seeds <file> [--depth N] [--min-year YYYY] [--out <path>]");
  out.log("                              forward+backward citation closure (Semantic Scholar) over");
  out.log("                              a seed list; writes refs/snowball/closure.json and merges a");
  out.log("                              triage.md skeleton (existing triage/reason rows survive a");
  out.log("                              rerun). Caches every raw response under");
  out.log("                              refs/snowball/cache/ so reruns are offline. Optional");
  out.log("                              S2_API_KEY env var lifts the rate limit above the ~100");
  out.log("                              req/5min unauthenticated default (sent as x-api-key).");
  out.log("  rk refs triage --auto [--keywords <file>] [--in-links N] [--out-links N]");
  out.log("                              mechanical pre-triage of refs/triage.md by seed-link count +");
  out.log("                              title keywords; only untouched rows are banded, only the");
  out.log("                              'out' band writes the triage column (reason starts 'auto:').");
  out.log("  next: run 'rk refs status' first on a fresh checkout.");
  return 0;
}

export async function refsDispatch(args: string[], out: Out): Promise<number> {
  const [sub, ...rest] = args;
  if (!sub) return refsHelp(out);
  const handler = REFS_COMMANDS[sub];
  if (!handler) {
    out.log(`unknown refs subcommand '${sub}'.`);
    refsHelp(out);
    return 2;
  }
  return handler(rest, out);
}
