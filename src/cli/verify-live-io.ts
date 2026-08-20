// EDGE — fs + subprocess helpers split out of src/cli/verify-live.ts (shard-cap cut, rk-gn4). The
// three side-effecting seams the live driver's `DriverDeps` needs that are not themselves part of
// the af/backend wiring: reading definition shards for the shared context, appending the driver log,
// and filing a bd task. Kept here so verify-live.ts stays under the ~280-line shard cap and reads as
// wiring, not fs plumbing.

import { mkdirSync, appendFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadSnapshot } from "../store/snapshot-load";
import { readDefinitionShards } from "../gates/definitions-scan";
import { driverLogPath } from "./verify-report";
import type { DefinitionText } from "../drive/driver-prompts";

/** Reads every `definitions/**\/*.md` shard whose frontmatter `id:` is in `ids`, returning raw file
 * text keyed by id -- through the ONE canonical reader (src/gates/definitions-scan.ts), the same
 * one Gate 1 and Gate 2's `defs:` resolution use.
 *
 * rk-5lzf B6 (Tier A review 2026-08-20, finding 6): this reader was SHALLOW while the gates
 * recursed, so a definition Gate 2 happily resolved -- `definitions/notation/sym-eps.md`, say --
 * was silently absent from the context the prover actually sees. The verifier then reasoned about
 * a term whose definition it had never been shown, and nothing in the run said so. Two readers with
 * different reach over one directory is a false-green generator; there is now one reader. */
export function readDefinitionTexts(root: string, ids: readonly string[]): DefinitionText[] {
  const wanted = new Set(ids);
  if (wanted.size === 0) return [];
  const snapshot = loadSnapshot(root);
  const out: DefinitionText[] = [];
  for (const shard of readDefinitionShards(snapshot)) {
    if (shard.id !== undefined && wanted.has(shard.id)) out.push({ id: shard.id, text: shard.content });
  }
  return out;
}

export function appendDriverLog(root: string, line: string): void {
  mkdirSync(join(root, ".rk"), { recursive: true });
  appendFileSync(driverLogPath(root), `${line}\n`);
}

/** rk-d1n (M3.5 live debug): persist the FULL, un-truncated raw model output of a parse/extraction
 * failure to `.rk/parse-failures/<node>-<n>.txt` (append-index: `<n>` is the next free integer for
 * this node, so repeated failures on the same node never clobber). Returns the WORKSPACE-RELATIVE
 * path recorded in the `parse-failed` evidence record. The driver-log snippet is capped at 2000
 * chars; this file holds the exact bytes so an unterminated verbose `reason` (the attempt-11 incident)
 * is fully inspectable. Best-effort edge IO: a write failure returns undefined rather than aborting
 * the run (the bounded snippet + classification already landed in the log). */
export function writeParseFailure(root: string, node: string, rawText: string): string | undefined {
  try {
    const dir = join(root, ".rk", "parse-failures");
    mkdirSync(dir, { recursive: true });
    const safeNode = node.replace(/[^A-Za-z0-9._-]/g, "_");
    let n = 1;
    let rel = join(".rk", "parse-failures", `${safeNode}-${n}.txt`);
    while (existsSync(join(root, rel))) {
      n++;
      rel = join(".rk", "parse-failures", `${safeNode}-${n}.txt`);
    }
    writeFileSync(join(root, rel), rawText);
    return rel;
  } catch {
    return undefined;
  }
}

/** `bd create <title> -d <description>` -- best-effort, exactly the `which`/spawn discipline
 * src/cli/init.ts's own bd bootstrap uses. Returns false (never throws) when bd is absent or the
 * spawn fails -- src/drive/driver-run.ts already logs a loud, non-fatal skip for that case. */
export function createBdTaskEdge(task: { title: string; description: string }): boolean {
  if (!Bun.which("bd")) return false;
  try {
    const proc = Bun.spawnSync(["bd", "create", task.title, "-d", task.description]);
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}
