// EDGE — fs, subprocesses (git/fr/bd), process.cwd() default (via extractRoot). `rk init
// "<north-star contract>"` (M1.2, PRD C1): stamps the full scaffold from templates/manifest.json
// (src/scaffold/templates-embed.ts — compiled-in, no runtime dependency on templates/ existing on
// disk), writes .rk/config.json + .rk/oracles.json + .rk/template-version, installs Claude Code
// session hooks + a git pre-commit hook, probes for af, and best-effort bootstraps fr/bd if present
// on PATH.
// Every pure decision (slot values, the stamp plan, conflict detection) is computed by
// src/scaffold/*.ts BEFORE any fs write — this file's job is sequencing the writes and reporting,
// never deciding what a slot should contain.

import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import type { Out } from "./args";
import { extractRoot, extractFlag } from "./args";
import { deriveShardPrefix } from "../scaffold/shard-prefix";
import { planStamp } from "../scaffold/plan";
import { detectConflicts } from "../scaffold/conflicts";
import { buildRkConfig, buildOraclesStub } from "../scaffold/config-stub";
import { buildClaudeSettings, buildPreCommitHookScript } from "../scaffold/hooks";
import { TEMPLATE_MANIFEST, TEMPLATE_TEXT } from "../scaffold/templates-embed";
import { NORTH_STAR_SHARD_ID } from "../scaffold/north-star";

const UNSET_MARKER = "UNSET — fill in before first session";

const USAGE_LINES = [
  'usage: rk init "<north-star contract>" [--root <dir>] [--force] [--shard-prefix X]',
  "         [--audit-cadence N] [--brittleness-soft-cap N] [--budget TEXT] [--model-policy TEXT] [--goal TEXT]",
];

/** rk-1r6: shared by both `rk init --help` and the missing-argument error path below, so the two
 * can never silently drift apart about what the usage line says. */
export function initHelp(out: Out): number {
  out.log('rk init "<north-star contract>" — stamp a fresh rk scaffold (M1.2, PRD C1)');
  for (const l of USAGE_LINES) out.log(`  ${l}`);
  out.log('  <north-star contract> must not start with "-" — that is almost certainly a mistyped flag.');
  out.log("  Side-effect-free: this help text never touches the filesystem.");
  out.log('  next: rk init "My conjecture" to stamp a fresh repo in the current directory.');
  return 0;
}

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

export interface InitCommandDeps {
  which?: Which;
  spawn?: SpawnFn;
  /** rk-e8v: the path this invocation of `rk` resolved as (`process.execPath` for a compiled
   * binary) — printed in the success output so a newcomer whose stamped `.git/hooks/pre-commit`
   * runs bare `rk check` knows what to put on PATH. Injectable so tests never depend on the real
   * process's own path. */
  resolveBinaryPath?: () => string;
}

/** Validates a `--flag`-supplied positive integer; returns `undefined` (use the default) when the
 * flag was not passed, or `{ error }` when it was passed but is not a positive integer. */
function parsePositiveInt(raw: string | undefined, flagName: string): { value?: number; error?: string } {
  if (raw === undefined) return {};
  if (!/^[1-9][0-9]*$/.test(raw)) return { error: `${flagName} must be a positive integer, got '${raw}'` };
  return { value: Number(raw) };
}

export async function initCommand(argv: string[], out: Out, deps: InitCommandDeps = {}): Promise<number> {
  const which = deps.which ?? defaultWhich;
  const spawn = deps.spawn ?? defaultSpawn;
  const resolveBinaryPath = deps.resolveBinaryPath ?? (() => process.execPath);

  const { rest: r0, root } = extractRoot(argv);
  const force = r0.includes("--force");
  const r1 = r0.filter((a) => a !== "--force");
  const { rest: r2, value: shardPrefixFlag } = extractFlag(r1, "--shard-prefix");
  const { rest: r3, value: auditCadenceFlag } = extractFlag(r2, "--audit-cadence");
  const { rest: r4, value: brittlenessFlag } = extractFlag(r3, "--brittleness-soft-cap");
  const { rest: r5, value: budgetFlag } = extractFlag(r4, "--budget");
  const { rest: r6, value: modelPolicyFlag } = extractFlag(r5, "--model-policy");
  const { rest: r7, value: goalFlag } = extractFlag(r6, "--goal");

  const northStar = r7[0];
  if (!northStar) {
    out.log("rk init: missing required <north-star contract> argument.");
    for (const l of USAGE_LINES) out.log(`  ${l}`);
    return 2;
  }
  if (northStar.startsWith("-")) {
    // rk-1r6: a positional argument that starts with "-" is almost certainly a mistyped flag
    // (e.g. `rk init --help` before -h/--help was handled above ever reaching here, or any other
    // typo'd flag) — never let it become the north-star contract stamped into every template.
    out.log(`rk init: refusing north-star contract '${northStar}' — it starts with '-', which is almost certainly a mistyped flag.`);
    for (const l of USAGE_LINES) out.log(`  ${l}`);
    out.log("  next: if you really mean a north-star starting with '-', there is currently no escape hatch — rephrase it.");
    return 2;
  }
  if (/[\r\n]/.test(northStar)) {
    // The contract is now stamped as the `contract:` line of a real registry shard (finding M3), and
    // a Gate 2 contract is one line by construction — PRD C2 calls it "the one-line statement" and
    // makes it the universal join key, byte-matched against the af root conjecture. A newline would
    // silently truncate it there while the prose documents kept the full text, manufacturing exactly
    // the contract drift the join key exists to detect. Refuse rather than rewrite the user's
    // string: a silently-normalized contract would no longer byte-match anything they typed.
    out.log("rk init: refusing a multi-line north-star contract — it must be one line (it becomes the `contract:` join key of a registry shard, byte-matched against the af root conjecture).");
    for (const l of USAGE_LINES) out.log(`  ${l}`);
    out.log("  next: state the target result in a single line; the long form belongs in PRD.md / the shard body.");
    return 2;
  }

  const auditCadence = parsePositiveInt(auditCadenceFlag, "--audit-cadence");
  const brittleness = parsePositiveInt(brittlenessFlag, "--brittleness-soft-cap");
  if (auditCadence.error) {
    out.log(`rk init: ${auditCadence.error}`);
    return 2;
  }
  if (brittleness.error) {
    out.log(`rk init: ${brittleness.error}`);
    return 2;
  }

  const projectName = basename(resolve(root));
  const shardPrefix = shardPrefixFlag ?? deriveShardPrefix(projectName);
  const goal = goalFlag ?? northStar;

  const slotValues: Record<string, string> = {
    RK_SLOT_PROJECT_NAME: projectName,
    RK_SLOT_GOAL: goal,
    RK_SLOT_NORTH_STAR: northStar,
    RK_SLOT_COMPUTE_BUDGET: budgetFlag ?? UNSET_MARKER,
    RK_SLOT_MODEL_POLICY: modelPolicyFlag ?? UNSET_MARKER,
    // Stamped explicitly, never omitted — a fresh campaign starts exploratory (PRD sec. 2), and
    // an explicit field means the strict-default rule (src/gates/phase.ts's DEFAULT_PHASE =
    // consolidation) never silently bites a freshly-stamped repo. Flagged for the M1 boundary
    // review per this WP's brief.
    RK_SLOT_PHASE: "exploration",
    RK_SLOT_AUDIT_CADENCE: String(auditCadence.value ?? 10),
    RK_SLOT_BRITTLENESS_SOFT_CAP: String(brittleness.value ?? 26),
    RK_SLOT_SHARD_PREFIX: shardPrefix,
    // Not user-supplied and not derived from the project: one constant, shared with
    // `.rk/config.json`'s `northStarId` below (src/scaffold/north-star.ts explains why a constant
    // rather than a flag).
    RK_SLOT_NORTH_STAR_ID: NORTH_STAR_SHARD_ID,
  };

  const plan = planStamp(TEMPLATE_MANIFEST, TEMPLATE_TEXT, slotValues);
  if (plan.unfilled.length > 0) {
    // Defense-in-depth (should be unreachable: every manifest slot is always given a value
    // above, including the explicit UNSET marker) — never write a scaffold with a raw
    // `{{RK_SLOT_...}}` placeholder still in it.
    for (const u of plan.unfilled) out.log(`rk init: ERROR ${u.path} has unfilled slot(s): ${u.slots.join(", ")}`);
    out.log("rk init: refusing to write an incompletely-stamped scaffold.");
    return 1;
  }

  if (!existsSync(root)) mkdirSync(root, { recursive: true });

  // rk-ax5: `.claude/settings.json` and `.git/hooks/pre-commit` are NOT TEMPLATE_MANIFEST entries
  // (they're built by src/scaffold/hooks.ts and written unconditionally below) but `rk init`
  // overwrites them exactly like every manifest-stamped path — fold them into the same
  // conflict-detection set so neither is ever clobbered without --force.
  const NON_MANIFEST_STAMPED_PATHS = [{ path: ".claude/settings.json" }, { path: ".git/hooks/pre-commit" }];
  const existingManifestPaths = new Set<string>();
  for (const entry of [...TEMPLATE_MANIFEST.stamped, ...NON_MANIFEST_STAMPED_PATHS]) {
    const bare = entry.path.endsWith("/") ? entry.path.slice(0, -1) : entry.path;
    if (existsSync(join(root, bare))) existingManifestPaths.add(bare);
  }
  const conflicts = detectConflicts([...TEMPLATE_MANIFEST.stamped, ...NON_MANIFEST_STAMPED_PATHS], existingManifestPaths);
  if (conflicts.length > 0 && !force) {
    out.log(`rk init: refusing to stamp — ${conflicts.length} path(s) already exist at ${root}:`);
    for (const c of conflicts) out.log(`  ${c}`);
    out.log("  next: remove the conflicting path(s), or pass --force to overwrite.");
    return 1;
  }
  if (conflicts.length > 0 && force) {
    out.log(`rk init: --force set, overwriting ${conflicts.length} existing path(s): ${conflicts.join(", ")}`);
  }

  for (const dir of plan.dirs) mkdirSync(join(root, dir), { recursive: true });
  for (const file of plan.files) {
    mkdirSync(dirname(join(root, file.path)), { recursive: true });
    writeFileSync(join(root, file.path), file.content);
  }

  mkdirSync(join(root, ".rk"), { recursive: true });
  const rkConfig = buildRkConfig({ phase: "exploration", shardsPrefix: shardPrefix, brittlenessSoftCap: brittleness.value ?? 26 });
  writeFileSync(join(root, ".rk", "config.json"), `${JSON.stringify(rkConfig, null, 2)}\n`);
  writeFileSync(join(root, ".rk", "oracles.json"), `${JSON.stringify(buildOraclesStub(), null, 2)}\n`);
  writeFileSync(join(root, ".rk", "template-version"), `${TEMPLATE_MANIFEST.template_version}\n`);

  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".claude", "settings.json"), `${JSON.stringify(buildClaudeSettings(), null, 2)}\n`);

  if (!existsSync(join(root, ".git"))) {
    const gitResult = await spawn("git", ["init"], root);
    if (gitResult.exitCode !== 0) out.log(`rk init: WARNING 'git init' failed (${gitResult.stderr.trim()}); no git repo, no pre-commit hook installed.`);
  }
  let hooksInstalled = 0;
  if (existsSync(join(root, ".git"))) {
    mkdirSync(join(root, ".git", "hooks"), { recursive: true });
    const hookPath = join(root, ".git", "hooks", "pre-commit");
    writeFileSync(hookPath, buildPreCommitHookScript());
    chmodSync(hookPath, 0o755);
    hooksInstalled = 5; // SessionStart, UserPromptSubmit, Stop, PreCompact, git pre-commit
  } else {
    hooksInstalled = 4; // the four Claude Code hooks still installed; git pre-commit skipped
  }

  // Generality audit 2026-07-25, finding M1: af is the validity kernel the whole hard tier and the
  // rigour ladder's `proved` rung rest on, and it was the one required binary `rk init` never
  // looked for — its absence surfaced only much later, inside `rk verify`, after a campaign had
  // already been built on the assumption. Unlike fr/bd there is nothing to bootstrap (af workspaces
  // are seeded per-proof, not per-repo), so this is a presence probe and nothing more: af is never
  // invoked here.
  let afStatus = "skipped (af not on PATH)";
  if (which("af")) {
    afStatus = "ok";
  } else {
    out.log(
      "rk init: WARNING 'af' not found on PATH — the validity kernel is missing. Without it " +
        "`rk verify` cannot run and no claim can reach the rigour ladder's `proved` rung (only " +
        "`stated`/`conjecture`/`numerical` and the cited/consensus oracles remain reachable). " +
        "Install af, then `rk doctor` to confirm the version this rk expects.",
    );
  }

  let frStatus = "skipped (fr not on PATH)";
  if (which("fr")) {
    const r = await spawn("fr", ["init", northStar], root);
    frStatus = r.exitCode === 0 ? "ok" : `FAILED (exit ${r.exitCode}: ${r.stderr.trim()})`;
  } else {
    out.log("rk init: WARNING 'fr' not found on PATH — skipped 'fr init'. Install fr, then run `fr init \"<north-star>\"` in this repo to complete setup.");
  }

  let bdStatus = "skipped (bd not on PATH)";
  if (which("bd")) {
    const r = await spawn("bd", ["init", "--non-interactive", "--skip-agents", "--skip-hooks"], root);
    bdStatus = r.exitCode === 0 ? "ok" : `FAILED (exit ${r.exitCode}: ${r.stderr.trim()})`;
  } else {
    out.log("rk init: WARNING 'bd' not found on PATH — skipped 'bd init'. Install bd, then run `bd init` in this repo to complete setup.");
  }

  const fileCount = plan.files.length + 4; // + .rk/config.json, .rk/oracles.json, .rk/template-version, .claude/settings.json
  out.log(`rk init: stamped ${fileCount} files, ${plan.dirs.length} directories, ${hooksInstalled} hooks; af: ${afStatus}; fr: ${frStatus}; bd: ${bdStatus}`);
  out.log(
    `  north star: '${northStar}' is bound to registry shard ${NORTH_STAR_SHARD_ID} ` +
      `(argument/${NORTH_STAR_SHARD_ID}.md, status: conjecture) and to .rk/config.json's northStarId, so ` +
      "the critical-path provenance check has a resolvable root from the first `rk check`. Edit the shard; " +
      "rename it only with .rk/config.json in the same commit.",
  );
  if (hooksInstalled === 5) {
    // rk-e8v: the installed .git/hooks/pre-commit hook execs bare `rk check` — if `rk` is not on
    // PATH every commit fails. Name the requirement AND the resolved path this invocation used,
    // so a newcomer running the binary by full path knows exactly what to add to PATH.
    out.log(
      `  PATH: this invocation resolved to '${resolveBinaryPath()}'. The pre-commit hook runs bare ` +
        "'rk check' — put this binary's directory on PATH (or symlink it as 'rk' somewhere on PATH), " +
        "or every commit will fail at the hook.",
    );
  }
  out.log("  next: 'rk check --root " + root + "' to verify the fresh scaffold, then start an orchestrator session.");
  return 0;
}
