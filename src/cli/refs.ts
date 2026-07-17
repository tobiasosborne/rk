// EDGE — `rk refs` subcommand group. Moved unchanged out of the original monolithic src/cli.ts
// (M0.3 restructure, deliverable 6) — behavior is byte-identical; only the module boundary and
// import paths changed (one directory level up to reach src/refs/*, src/types).

import { addSource } from "../refs/add";
import { computeStatus } from "../refs/status";
import { locateQuoteInRepo } from "../refs/quote-locate";
import { sourceId } from "../types";
import type { Out } from "./args";
import { extractFlag, extractRoot } from "./args";

type SubHandler = (args: string[], out: Out) => Promise<number>;

const STATUS_MARK: Record<string, string> = {
  present: "ok  ",
  cache: "cache",
  fetchable: "fetch",
  missing: "MISS",
};

async function refsStatus(args: string[], out: Out): Promise<number> {
  const { root } = extractRoot(args);
  const rows = await computeStatus(root);
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
        `EXTPROP_REFS_CACHE=<dir> here.`,
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

async function refsQuote(args: string[], out: Out): Promise<number> {
  const { rest, root } = extractRoot(args);
  const [id, ...patternParts] = rest;
  const pattern = patternParts.join(" ");
  if (!id || !pattern) {
    out.log("usage: rk refs quote <source-id> <pattern> [--root <path>]");
    return 2;
  }
  try {
    const result = await locateQuoteInRepo(root, sourceId(id), pattern);
    if (result === null) {
      out.log(`rk refs quote: pattern not found in '${id}'s local payload.`);
      out.log(`  next: check the pattern is an exact substring (byte-for-byte), or 'rk refs status' to confirm the payload is present.`);
      return 1;
    }
    out.log(`${result.path}:${result.line}`);
    out.log(`"${result.quote}"`);
    return 0;
  } catch (err) {
    out.log(`rk refs quote: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

const REFS_COMMANDS: Record<string, SubHandler> = {
  status: refsStatus,
  add: refsAdd,
  quote: refsQuote,
};

function refsHelp(out: Out): number {
  out.log("rk refs — ground-truth reference library (PRD C7)");
  out.log("  rk refs status              present/fetchable/cache/missing per source");
  out.log("  rk refs add <locator>       fetch/hash/install + update the manifest");
  out.log("  rk refs quote <id> <pat>    byte-verbatim quote with a path:line anchor");
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
