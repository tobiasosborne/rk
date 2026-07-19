// EDGE — subprocess. The one injectable spawn primitive src/drive/backend-{claude,codex}.ts both
// build on, so the timeout/kill/stdin-closing logic exists exactly once (CLAUDE.md's "one module,
// one job" — the two backend adapters differ in ARGS and OUTPUT PARSING, not in how a child
// process is launched and bounded). Same injectable which/spawn edge pattern as src/cli/init.ts's
// fr/bd bootstrap and src/cli/phase.ts's `fr orient` call (rk-huq precedent) — tests never require
// a real binary or touch a real subprocess; every backend adapter test supplies its own `SpawnFn`.

export interface SpawnOptions {
  cwd: string;
  /** Milliseconds before the child is killed and `timedOut: true` is reported — this is the ONE
   * place a timeout becomes real (docs/worker-contract.md exit-code 10); callers never race their
   * own separate timer against this one. */
  timeoutMs: number;
  /** Stdin content. `undefined` closes stdin immediately (equivalent to `</dev/null`) — REQUIRED
   * for `codex exec`, which otherwise blocks reading interactive stdin even when a prompt was
   * already given as an argument (see this WP's live-fire memo, "real-world adapter surprises"). */
  input?: string;
}

export interface SpawnOutcome {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type SpawnFn = (bin: string, args: string[], options: SpawnOptions) => Promise<SpawnOutcome>;

export const defaultSpawn: SpawnFn = async (bin, args, options) => {
  const proc = Bun.spawn([bin, ...args], {
    cwd: options.cwd,
    stdin: options.input === undefined ? "ignore" : Buffer.from(options.input, "utf8"),
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, options.timeoutMs);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode, stdout, stderr, timedOut };
  } finally {
    clearTimeout(timer);
  }
};
