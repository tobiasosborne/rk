// EDGE — rk's entrypoint. Self-teaching (PRD/af Law 9 style): every output — success, error,
// or bare help — states what to run next. Dispatch is a two-level registry (top-level verb ->
// subcommand) so future top-level commands and future `rk refs` subcommands slot in as one more
// registry entry, no dispatch-logic rework.
//
// M0.3 restructure (deliverable 6): the command implementations moved to src/cli/refs.ts and
// src/cli/check.ts; this file is now just the thin dispatch + top-level help. Behavior for
// existing commands is byte-identical — `run`/`Out`/`RunOptions` keep their original shapes so
// every pre-existing caller (including test/cli.test.ts's 100 tests) needs no changes.

import { refsDispatch } from "./cli/refs";
import { checkCommand } from "./cli/check";
import { doctorCommand } from "./cli/doctor";
import { phaseCommand } from "./cli/phase";
import { initCommand } from "./cli/init";
import type { Out } from "./cli/args";
import { defaultOut } from "./cli/args";

export type { Out };

const COMMANDS: Record<string, (args: string[], out: Out) => Promise<number>> = {
  refs: refsDispatch,
  check: checkCommand,
  doctor: doctorCommand,
  phase: phaseCommand,
  init: initCommand,
};

function topHelp(out: Out): number {
  out.log("rk — research-automation tool");
  out.log('  rk init "<north-star contract>" [--root <dir>] [--force]  stamp a fresh scaffold (M1.2, PRD C1)');
  out.log("  rk refs status|add|quote   ground-truth reference library (PRD C7)");
  out.log("  rk check [--root <dir>]    run all six M0 gates (docs/gate-contracts.md)");
  out.log("  rk check --selftest [--root <dir>]  run rk's own red-fixture corpus (default <root>/corpus)");
  out.log("  rk phase [exploration|consolidation] [--root <dir>]  print/switch phase (M1.3, docs/gate-contracts.md)");
  out.log("  rk doctor [--override]     verify af/fr/bd binaries against rk.compat.json (D6)");
  out.log("  next: 'rk init \"<north-star>\"' to stamp a fresh repo, or 'rk refs status' in an existing one.");
  return 0;
}

export interface RunOptions {
  out?: Out;
}

/** Parses argv (excluding the `bun`/script prefix) and dispatches. Returns an exit code —
 * callers running as a real process pass it to `process.exit`; tests just assert on it. */
export async function run(argv: string[], opts: RunOptions = {}): Promise<number> {
  const out = opts.out ?? defaultOut;
  const [top, ...rest] = argv;
  if (!top) return topHelp(out);
  const handler = COMMANDS[top];
  if (!handler) {
    out.log(`unknown command '${top}'.`);
    topHelp(out);
    return 2;
  }
  return handler(rest, out);
}

if (import.meta.main) {
  const code = await run(process.argv.slice(2));
  process.exit(code);
}
