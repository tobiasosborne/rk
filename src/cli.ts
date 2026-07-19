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

const HELP: Record<string, (out: Out) => number> = {
  refs: refsHelp,
  check: checkHelp,
  doctor: doctorHelp,
  phase: phaseHelp,
  init: initHelp,
  upgrade: upgradeHelp,
  graph: graphHelp,
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
