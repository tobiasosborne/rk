// EDGE — process.cwd() default. Shared argv-parsing helpers + the `Out` sink every CLI command
// writes through. Split out of the original monolithic src/cli.ts (M0.3 restructure) so both
// src/cli/refs.ts and src/cli/check.ts can depend on it without a circular import back through
// src/cli.ts itself.

export interface Out {
  log: (s: string) => void;
}

export const defaultOut: Out = { log: (s) => console.log(s) };

/** Pulls `--root <path>` out of argv, returning [remaining args, root]. Every subcommand accepts
 * it (defaults to cwd) so tests never depend on process.cwd(). */
export function extractRoot(args: string[]): { rest: string[]; root: string } {
  const rest: string[] = [];
  let root = process.cwd();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && i + 1 < args.length) {
      root = args[++i]!;
    } else {
      rest.push(args[i]!);
    }
  }
  return { rest, root };
}

export function extractFlag(args: string[], flag: string): { rest: string[]; value: string | undefined } {
  const rest: string[] = [];
  let value: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) {
      value = args[++i]!;
    } else {
      rest.push(args[i]!);
    }
  }
  return { rest, value };
}
