// EDGE — rk's entrypoint. Self-teaching (PRD/af Law 9 style): every output — success, error,
// or bare help — states what to run next. Dispatch is a two-level registry (top-level verb ->
// subcommand) so future top-level commands and future `rk refs` subcommands slot in as one more
// registry entry, no dispatch-logic rework.
//
// M0.3 restructure (deliverable 6): the command implementations moved to src/cli/refs.ts and
// src/cli/check.ts; this file is now just the thin dispatch + top-level help. Behavior for
// existing commands is byte-identical — `run`/`Out`/`RunOptions` keep their original shapes so
// every pre-existing caller (including test/cli.test.ts's 100 tests) needs no changes.

import { refsDispatch, refsHelp } from "./cli/refs";
import { checkCommand } from "./cli/check";
import { doctorCommand } from "./cli/doctor";
import { phaseCommand } from "./cli/phase";
import { initCommand, initHelp } from "./cli/init";
import { upgradeCommand } from "./cli/upgrade";
import { graphCommand } from "./cli/graph";
import { renderCommand } from "./cli/render";
import { verifyCommand } from "./cli/verify";
import { frontierCommand } from "./cli/frontier";
import { rewardDispatch, rewardHelp } from "./cli/reward";
import type { Out } from "./cli/args";
import { defaultOut, hasHelpFlag } from "./cli/args";

export type { Out };

const COMMANDS: Record<string, (args: string[], out: Out) => Promise<number>> = {
  refs: refsDispatch,
  check: checkCommand,
  doctor: doctorCommand,
  phase: phaseCommand,
  init: initCommand,
  upgrade: upgradeCommand,
  graph: graphCommand,
  render: renderCommand,
  verify: verifyCommand,
  frontier: frontierCommand,
  reward: rewardDispatch,
};

// rk-1r6: `-h`/`--help` handling for every subcommand, kept independent of check.ts (out of
// scope for this WP) — `rk check --help` never calls `checkCommand` at all, so this text is
// hand-maintained rather than reused from a checkCommand internal (there is none to reuse).
function upgradeHelp(out: Out): number {
  out.log("rk upgrade — compare the stamped template_version against this binary's (M1.4 stub)");
  out.log("  usage: rk upgrade [--root <dir>]");
  out.log("  Prints a manual-diff plan on a mismatch. Nothing is ever written by this command.");
  out.log("  next: 'rk upgrade --root <dir>' against an existing rk-stamped repo.");
  return 0;
}

function checkHelp(out: Out): number {
  out.log("rk check — run all six M0 gates against a stamped repo (docs/gate-contracts.md)");
  out.log("  usage: rk check [--root <dir>]");
  out.log("         rk check --selftest [--root <dir>]  run rk's own red-fixture corpus (default <root>/corpus)");
  out.log("  Exit 0 iff every implemented gate reports zero ERRORs. Read-only: never writes.");
  out.log("  next: 'rk check' in a stamped repo to see its current gate verdicts.");
  return 0;
}

function doctorHelp(out: Out): number {
  out.log("rk doctor — verify af/fr/bd binaries against rk.compat.json (D6)");
  out.log("  usage: rk doctor [--override]");
  out.log("  --override downgrades a BLOCKED verdict to a logged WARNING and exits 0 anyway.");
  out.log("  next: 'rk doctor' to check your installed backend binaries.");
  return 0;
}

function phaseHelp(out: Out): number {
  out.log("rk phase — print or switch the gate-severity phase (M1.3, docs/gate-contracts.md)");
  out.log("  usage: rk phase [exploration|consolidation] [--root <dir>]");
  out.log("  No argument: prints the current resolved phase. An argument writes it to .rk/config.json.");
  out.log("  next: 'rk phase' with no argument to see the current phase.");
  return 0;
}

function graphHelp(out: Out): number {
  out.log("rk graph — terminal projection views over the M2.5 graph document (PRD C5)");
  out.log("  usage: rk graph --focus <id> [--root <dir>]");
  out.log("         rk graph --critical-path [--north-star <id>] [--root <dir>]");
  out.log("         rk graph --blocks [--north-star <id>] [--root <dir>]");
  out.log("         rk graph --taint [<id>] [--root <dir>]");
  out.log('  --north-star overrides .rk/config.json\'s "northStarId" when both are given.');
  out.log("  Read-only: builds a GraphDocument from the repo (registry+af+fr+bd) and never writes.");
  out.log("  next: 'rk graph --focus <id>' with a real registry id (see argument/**/*.md).");
  return 0;
}

function verifyHelp(out: Out): number {
  out.log("rk verify — hard-tier verification driver over an af workspace (M3.6, PRD C9)");
  out.log("  usage: rk verify --af <registry-id> [--dry-run | --live] [--max-turns <n>] [--max-nodes <n>] [--model <name>] [--root <dir>]");
  out.log("  --dry-run (the DEFAULT whenever --live is absent) plans the workspace (ready set, dispatch");
  out.log("  plan, balloon tripwire status) with NO worker dispatched and NOTHING written -- the");
  out.log("  cost-free path. --dry-run always wins if both flags are given.");
  out.log("  --live (M3.5-prep) drives the workspace to convergence with REAL backend calls (per");
  out.log("  .rk/config.json's 'workers.assignments.verifier.hard' entry, docs/worker-contract.md) and");
  out.log("  the prover-overreach/stuck/retry guardrails + balloon feedback loop (bd task /");
  out.log("  mandatory-review mark on a ballooned contract). A real spend is NEVER the default --");
  out.log("  --live must be passed explicitly. --max-turns (default 30) / --max-nodes (default 20) are");
  out.log("  hard safety-valve ceilings that abort cleanly with a named reason when hit; --model");
  out.log("  overrides the interim per-backend default model.");
  out.log("  next: 'rk verify --af <id> --dry-run' with a real registry id (see argument/**/*.md).");
  out.log("  usage: rk verify --report [--baseline <memo.json>] [--root <dir>] (M3.9, PRD C9)");
  out.log("  --report reads .rk/driver-log.jsonl and prints tokens/calls/cache-fraction/verdicts/");
  out.log("  balloons per node, claim, and campaign; honest 'never measured' if the log is absent or");
  out.log("  carries zero usage records. --baseline compares against M3.5's future baseline memo");
  out.log("  ({lemma, tokens, calls}[]) for SC4; omitted, it prints the honest caveat, never a");
  out.log("  fabricated ratio.");
  return 0;
}

function renderHelp(out: Out): number {
  out.log("rk render — generate the self-contained HTML campaign site (M2.4, PRD C6)");
  out.log("  usage: rk render [--out <dir>] [--north-star <id>] [--title <text>] [--root <dir>]");
  out.log("  --out defaults to build/site (relative to --root). Writes index.html: dashboard,");
  out.log("  AND/OR DAG, and a drill-down panel per node. No server, no CDN; open the file directly.");
  out.log("  next: 'rk render' in a stamped repo, then open build/site/index.html.");
  out.log("");
  out.log("rk render cards — regenerate the source cards from the extraction records (rk-nsex)");
  out.log("  usage: rk render cards [--root <dir>]");
  out.log("  Writes refs/cards/<source-id>/L1-<n>.md from refs/records/<source-id>/L1-<n>.json plus");
  out.log("  its review record, and adopts each card in .rk/generated.json (generator 'cards-v1') so");
  out.log("  Gate 7 byte-diffs it. A record with no usable review renders an empty NOT ADMISSIBLE");
  out.log("  card. The records are the truth; the cards are the view agents read.");
  return 0;
}

function frontierHelp(out: Out): number {
  out.log("rk frontier — the GOAL frontier: what open work the goal actually needs (S0, PRD A1)");
  out.log("  usage: rk frontier <goal-id> [--root <dir>]");
  out.log("  Prints every obligation reachable from <goal-id> with its actionable/dead-end flags,");
  out.log("  the attached/unattached/satisfied counts, and every unattached id (the prospecting");
  out.log("  pool — unattached open nodes are never obligations). Read-only: builds the same");
  out.log("  GraphDocument 'rk graph' does and never writes. Exit 1 if <goal-id> names no node.");
  out.log("  next: 'rk frontier <goal-id>' with a real registry id (see argument/**/*.md).");
  return 0;
}

const HELP: Record<string, (out: Out) => number> = {
  refs: refsHelp,
  check: checkHelp,
  doctor: doctorHelp,
  phase: phaseHelp,
  init: initHelp,
  upgrade: upgradeHelp,
  graph: graphHelp,
  render: renderHelp,
  verify: verifyHelp,
  frontier: frontierHelp,
  reward: rewardHelp,
};

function topHelp(out: Out): number {
  out.log("rk — research-automation tool");
  out.log('  rk init "<north-star contract>" [--root <dir>] [--force]  stamp a fresh scaffold (M1.2, PRD C1)');
  out.log("  rk upgrade [--root <dir>]  compare the stamped template_version, print manual-diff instructions (M1.4)");
  out.log("  rk refs status|add|quote   ground-truth reference library (PRD C7)");
  out.log("  rk check [--root <dir>]    run all six M0 gates (docs/gate-contracts.md)");
  out.log("  rk check --selftest [--root <dir>]  run rk's own red-fixture corpus (default <root>/corpus)");
  out.log("  rk phase [exploration|consolidation] [--root <dir>]  print/switch phase (M1.3, docs/gate-contracts.md)");
  out.log("  rk graph --focus <id>|--critical-path|--blocks|--taint [id]  terminal graph views (M2.5, PRD C5)");
  out.log("  rk render [--out <dir>] [--north-star <id>]  generate the self-contained HTML site (M2.4, PRD C6)");
  out.log("  rk render cards [--root <dir>]  regenerate refs/cards/** from the extraction records (rk-nsex)");
  out.log("  rk verify --af <id> [--dry-run]  hard-tier verification driver over an af workspace (M3.6, PRD C9)");
  out.log("  rk frontier <goal-id>      the GOAL frontier: obligations, dead-ends, prospecting pool (S0)");
  out.log("  rk reward report [--strict]  fold .rk/reward-ledger.jsonl into shadow payouts (S0, prereg v1)");
  out.log("  rk reward sync [--dry-run] [--round]  append the reward events the registry implies (S0)");
  out.log("  rk reward attest --claim <id> --author <seam> --role <r>  record an independent verification (Check 4b)");
  out.log("  rk doctor [--override]     verify af/fr/bd binaries against rk.compat.json (D6)");
  out.log("  every subcommand accepts -h/--help for its own usage (side-effect-free, exits 0).");
  out.log("  next: 'rk init \"<north-star>\"' to stamp a fresh repo, or 'rk refs status' in an existing one.");
  return 0;
}

export interface RunOptions {
  out?: Out;
}

/** Parses argv (excluding the `bun`/script prefix) and dispatches. Returns an exit code —
 * callers running as a real process pass it to `process.exit`; tests just assert on it.
 *
 * rk-1r6: `-h`/`--help` is handled BEFORE any subcommand handler runs, at both the bare-`rk`
 * level and per-subcommand — a self-teaching CLI (af Law 9) must let `--help` be discovered
 * without side effects anywhere a newcomer might type it. */
export async function run(argv: string[], opts: RunOptions = {}): Promise<number> {
  const out = opts.out ?? defaultOut;
  const [top, ...rest] = argv;
  if (!top || top === "-h" || top === "--help") return topHelp(out);
  const handler = COMMANDS[top];
  if (!handler) {
    out.log(`unknown command '${top}'.`);
    topHelp(out);
    return 2;
  }
  if (hasHelpFlag(rest)) return HELP[top]!(out);
  return handler(rest, out);
}

if (import.meta.main) {
  const code = await run(process.argv.slice(2));
  process.exit(code);
}
