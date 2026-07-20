// EDGE — fs + subprocess helpers split out of src/cli/verify-live.ts (shard-cap cut, rk-gn4). The
// three side-effecting seams the live driver's `DriverDeps` needs that are not themselves part of
// the af/backend wiring: reading definition shards for the shared context, appending the driver log,
// and filing a bd task. Kept here so verify-live.ts stays under the ~280-line shard cap and reads as
// wiring, not fs plumbing.

import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { loadSnapshot } from "../store/snapshot-load";
import { listDir, parseFrontmatter } from "../gates/snapshot";
import { driverLogPath } from "./verify-report";
import type { DefinitionText } from "../drive/driver-prompts";

/** Reads every `definitions/*.md` shard whose frontmatter `id:` is in `ids`, returning raw file
 * text keyed by id -- reuses the SAME snapshot/frontmatter primitives src/store/registry-load.ts
 * already relies on (never a second, forked frontmatter parser). */
export function readDefinitionTexts(root: string, ids: readonly string[]): DefinitionText[] {
  const wanted = new Set(ids);
  if (wanted.size === 0) return [];
  const snapshot = loadSnapshot(root);
  const out: DefinitionText[] = [];
  for (const name of listDir(snapshot, "definitions")) {
    if (name === "README.md" || name === "INDEX.md") continue;
    const content = snapshot.get(`definitions/${name}`);
    if (content === undefined) continue;
    const fm = parseFrontmatter(content);
    if (fm.present && fm.terminated && fm.fields.id && wanted.has(fm.fields.id)) out.push({ id: fm.fields.id, text: content });
  }
  return out;
}

export function appendDriverLog(root: string, line: string): void {
  mkdirSync(join(root, ".rk"), { recursive: true });
  appendFileSync(driverLogPath(root), `${line}\n`);
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
