// EDGE — fs (`.rk/config.json`, `docs/worklog.md`), clock (dated worklog line), subprocess (`fr`).
// `rk phase exploration|consolidation` (M1.3, docs/gate-contracts.md "Phase matrix";
// ../research-workflows/PRD.md sec 2/C1: "Phase switch ... The transition consolidation-> is a
// logged, deliberate act."; IMPLEMENTATION_PLAN.md M1.3: "transition consolidation-ward is logged
// to worklog + fr"). No args -> prints the CURRENT resolved phase (same resolution
// `loadGateConfig` uses: an absent `phase` field = consolidation, the strictest default). An
// argument writes `phase` into `.rk/config.json`, preserving every OTHER key already there —
// deliberately never round-trips through `mergeGateConfig`/`DEFAULT_GATE_CONFIG`, which would
// bake every default value into a file that previously had none. The consolidation-ward
// transition (exploration -> consolidation) additionally (a) prepends one dated entry to
// `docs/worklog.md` IF that file exists (CLAUDE.md Rule 9: an authored, append-only doc is never
// silently rewritten by a tool without saying so), and (b) logs one `fr orient` event (rk-huq) —
// an off-arm, breaker-neutral note (`fr help orient`), the correct verb for a governance/process
// event that is not itself an arm-pull. Both (a) and (b) print a notice either way — never a
// silent skip — when the target (the file, or `fr`/`.frontier/`) is absent.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Out } from "./args";
import { extractRoot } from "./args";
import type { Phase } from "../gates/phase";
import { DEFAULT_PHASE } from "../gates/phase";

// rk-huq: same injectable which/spawn edge pattern as src/cli/init.ts's fr/bd bootstrap — tests
// must never require a real `fr` binary or touch a real subprocess.
export type Which = (bin: string) => string | null;
export type SpawnFn = (bin: string, args: string[], cwd: string) => Promise<{ exitCode: number; stderr: string }>;

const defaultWhich: Which = (bin) => Bun.which(bin);

async function defaultSpawn(bin: string, args: string[], cwd: string): Promise<{ exitCode: number; stderr: string }> {
  try {
    const proc = Bun.spawn([bin, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    return { exitCode, stderr };
  } catch (e) {
    return { exitCode: -1, stderr: e instanceof Error ? e.message : String(e) };
  }
}

const PHASES: readonly Phase[] = ["exploration", "consolidation"];

function configPath(root: string): string {
  return join(root, ".rk", "config.json");
}

/** Reads the RAW (unmerged) `.rk/config.json` object — `{}` when absent, unparseable, or not a
 * plain object. Deliberately not `loadGateConfig`'s merged-with-defaults result: writing that
 * back would bake every default GateConfig value into a file that previously had none (or had
 * only `phase`). */
function readRawConfig(root: string): Record<string, unknown> {
  const path = configPath(root);
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // corrupt file: same "degrade to defaults, never throw" contract as loadGateConfig.
  }
  return {};
}

function currentPhase(raw: Record<string, unknown>): Phase {
  return raw.phase === "exploration" || raw.phase === "consolidation" ? raw.phase : DEFAULT_PHASE;
}

function writeRawConfig(root: string, raw: Record<string, unknown>): void {
  mkdirSync(join(root, ".rk"), { recursive: true });
  writeFileSync(configPath(root), `${JSON.stringify(raw, null, 2)}\n`);
}

/** Inserts one dated worklog entry right after the `## Sessions` heading — the template's own
 * documented convention (`templates/docs/worklog.md.tmpl`: "newest first; append above the
 * previous entry"). Falls back to a trailing append (still logged, never silently dropped) when
 * the heading isn't found — an unusual/hand-edited worklog shape. */
export function insertWorklogEntry(content: string, entry: string): string {
  const marker = "## Sessions";
  const idx = content.indexOf(marker);
  if (idx === -1) return `${content.replace(/\n+$/, "")}\n\n${entry}`;
  const afterHeading = idx + marker.length;
  const nlIdx = content.indexOf("\n", afterHeading);
  const insertAt = nlIdx === -1 ? content.length : nlIdx + 1;
  return `${content.slice(0, insertAt)}\n${entry}${content.slice(insertAt)}`;
}

export interface PhaseCommandDeps {
  /** injectable for tests — ISO date `YYYY-MM-DD`, same convention as src/refs/add.ts's
   * `retrieved` default. */
  today?: () => string;
  /** injectable for tests (rk-huq) — never require a real `fr` binary on PATH. */
  which?: Which;
  spawn?: SpawnFn;
}

export async function phaseCommand(args: string[], out: Out, deps: PhaseCommandDeps = {}): Promise<number> {
  const { rest, root } = extractRoot(args);
  const today = deps.today ?? (() => new Date().toISOString().slice(0, 10));
  const which = deps.which ?? defaultWhich;
  const spawn = deps.spawn ?? defaultSpawn;
  const raw = readRawConfig(root);
  const before = currentPhase(raw);

  const requested = rest[0];
  if (requested === undefined) {
    out.log(`current phase: ${before}`);
    out.log(
      raw.phase === undefined
        ? `  (default -- no "phase" field in .rk/config.json; a fresh clone runs consolidation, the strictest state)`
        : `  (from .rk/config.json)`,
    );
    out.log("  next: 'rk phase exploration' or 'rk phase consolidation' to switch.");
    return 0;
  }

  if (requested !== "exploration" && requested !== "consolidation") {
    out.log(`rk phase: unknown phase '${requested}' -- must be one of: ${PHASES.join(", ")}.`);
    return 2;
  }

  raw.phase = requested;
  writeRawConfig(root, raw);
  out.log(`phase: ${before} -> ${requested} (written to .rk/config.json).`);

  if (before === "exploration" && requested === "consolidation") {
    // The consolidation-ward transition is a deliberate act (docs/gate-contracts.md "Phase
    // matrix"): logged to docs/worklog.md if it exists, a notice printed either way.
    const worklogPath = join(root, "docs", "worklog.md");
    if (existsSync(worklogPath)) {
      const content = readFileSync(worklogPath, "utf8");
      const entry =
        `### [${today()}] phase: exploration -> consolidation (\`rk phase\`)\n` +
        `- Consolidation-ward transition via \`rk phase consolidation\` -- the full gate severity ` +
        `matrix now binds; see docs/gate-contracts.md "Phase matrix".\n\n`;
      writeFileSync(worklogPath, insertWorklogEntry(content, entry));
      out.log("  logged the consolidation-ward transition to docs/worklog.md.");
    } else {
      out.log("  docs/worklog.md not found -- consolidation-ward transition NOT logged (nothing to append to).");
    }

    // rk-huq: also log the transition to fr, via `fr orient` (an off-arm, breaker-neutral note --
    // `fr help orient` -- the correct verb: this is a governance event, not an arm-pull). Graceful
    // skip, never a silent one, when `fr` is not on PATH or this repo has no `.frontier/` state
    // (e.g. `fr init` was never run here).
    if (!which("fr")) {
      out.log("  'fr' not found on PATH -- consolidation-ward transition NOT logged to fr.");
    } else if (!existsSync(join(root, ".frontier"))) {
      out.log(
        "  no .frontier/ state at this repo -- consolidation-ward transition NOT logged to fr " +
          "(run 'fr init \"<north-star>\"' to enable).",
      );
    } else {
      const r = await spawn("fr", ["orient", "phase: exploration -> consolidation (rk phase)"], root);
      if (r.exitCode === 0) {
        out.log("  logged the consolidation-ward transition to fr ('fr orient').");
      } else {
        out.log(`  'fr orient' FAILED (exit ${r.exitCode}: ${r.stderr.trim()}) -- consolidation-ward transition NOT logged to fr.`);
      }
    }
  }

  out.log("  next: 'rk check' to see the phase's severity matrix applied.");
  return 0;
}
