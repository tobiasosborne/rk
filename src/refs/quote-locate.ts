// EDGE — fs. Resolves a `rk refs quote <source-id> <pattern>` request against the repo's
// sources.lock.json and dispatches to the pure locator (src/refs/quote.ts). No network: quote
// location only ever reads an already-acquired local payload — `rk refs status`/`add` are what
// put bytes there.

import { join } from "node:path";
import { locateQuote } from "./quote";
import { parseLockFile } from "./lock";
import { assertSafeRelPath } from "./path-safety";
import type { QuoteResult, SourceId } from "../types";

/** Locates `pattern` in the local payload(s) recorded for `sourceId` in
 * `<repoRoot>/refs/manifest/sources.lock.json`. Returns null if the source-id is known and its
 * payload is present but the pattern is not found in it. Throws (not a silent null) when the
 * source-id is unknown to the manifest, or when it is known but no payload file for it exists
 * on disk yet — both are actionable-by-the-user states, not "no match" states. */
export async function locateQuoteInRepo(
  repoRoot: string,
  sourceId: SourceId,
  pattern: string,
): Promise<QuoteResult | null> {
  const lockPath = join(repoRoot, "refs", "manifest", "sources.lock.json");
  const lock = parseLockFile(await Bun.file(lockPath).text());
  const entries = lock.files.filter((f) => f.source_id === sourceId);
  if (entries.length === 0) {
    throw new Error(
      `rk refs quote: unknown source-id '${sourceId}' — not found in refs/manifest/sources.lock.json. ` +
        `Run 'rk refs add <locator>' to register it, or 'rk refs status' to list known source-ids.`,
    );
  }
  let anyPresent = false;
  for (const entry of entries) {
    // rk-correct divergence from fetch-refs.py (see src/refs/path-safety.ts header).
    assertSafeRelPath(entry.path);
    const relPath = `refs/${entry.path}`;
    const absPath = join(repoRoot, relPath);
    const file = Bun.file(absPath);
    if (!(await file.exists())) continue;
    anyPresent = true;
    const content = await file.text();
    const located = locateQuote(content, pattern);
    if (located !== null) {
      return { sourceId, path: relPath, line: located.line, quote: located.quote };
    }
  }
  if (!anyPresent) {
    throw new Error(
      `rk refs quote: source-id '${sourceId}' is known but its payload is absent locally ` +
        `(${entries.map((e) => `refs/${e.path}`).join(", ")}). Run 'rk refs status' then ` +
        `'rk refs add' or set EXTPROP_REFS_CACHE to restore it before quoting.`,
    );
  }
  return null;
}
