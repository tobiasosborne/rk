// EDGE — spawns subprocesses, reads /proc, uses timers. Rule 13 ("every spawned process is
// bounded") applied to the PDF extractors: `marker` and `pdftotext` are third-party binaries run
// against attacker-shaped input (an arbitrary downloaded PDF), and before this module
// `src/refs/extract.ts` awaited `proc.exited` with no deadline while leaving marker's stdout pipe
// undrained. Two hangs followed from that, both reported by the 2026-08-14 Tier A review (finding
// P1-3):
//
//  1. PIPE DEADLOCK. A piped stdout that nobody reads fills its kernel buffer (64 KiB on Linux);
//     the child then blocks forever in write(2) and never exits, so `await proc.exited` never
//     resolves. marker prints per-page progress, so this is reachable on an ordinary large PDF —
//     no malice required. The fix is structural, not a timeout: BOTH pipes are drained
//     concurrently with the wait, so the child can always make progress.
//  2. NO DEADLINE. A malformed PDF that sends an extractor into a loop hangs `rk refs quote`
//     forever with no output and no way to tell a slow extraction from a dead one.
//
// KILLING THE GROUP, not just the child. marker is a Python program that forks worker processes;
// signalling only the direct child leaves the workers running (that is the shape of the 2026-07-25
// 61 GB incident). Bun.spawn puts the child in rk's OWN process group, where `kill(-pgid)` would
// kill rk too, so the child is launched through `setsid` when it is on PATH: that execs in place,
// keeps the pid, and makes the child a session/group leader whose whole group is killable as
// `-pid`. The leadership is then VERIFIED against /proc before any negative-pid signal is sent —
// a wrong guess there would kill rk's own group. When setsid is absent or /proc is unreadable
// (macOS), the fallback is a direct child kill: strictly better than the unbounded wait it
// replaces, never a silent no-op.
//
// This is not "a detached process" in rule 13's sense: the run is always awaited in the
// foreground and always killed on expiry. The new session exists so the kill can reach the
// workers, not so the process can outlive rk.

import { readFileSync } from "node:fs";

/** Wall-clock ceiling for one extractor invocation. Sized for the real workload rather than for a
 * test: marker on a 40-page paper takes tens of seconds on CPU, so anything much tighter would
 * turn a slow extraction into a spurious hard error. Overridable per call (tests inject
 * milliseconds); there is deliberately no config/env surface for it. */
export const DEFAULT_SPAWN_TIMEOUT_MS = 120_000;

/** `Bun.which`-shaped lookup, injected so the setsid-present and setsid-absent paths are both
 * unit-testable on a box that has it. */
export type WhichBin = (bin: string) => string | null;

export interface BoundedRunOptions {
  timeoutMs?: number;
  which?: WhichBin;
}

export interface BoundedRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Thrown when the deadline fired. Distinct from a non-zero exit so callers can say WHICH failure
 * happened; never conflated with "the extractor produced no text" and never swallowed into a skip
 * (L2: an unreadable payload must never look like a payload that lacks the pattern). */
export class SpawnTimeoutError extends Error {
  constructor(
    readonly argv: readonly string[],
    readonly timeoutMs: number,
    readonly killed: "process-group" | "process" | "none",
    readonly stderrTail: string,
  ) {
    super(
      `'${argv.join(" ")}' exceeded its ${timeoutMs}ms deadline and was killed (${killed}). ` +
        `A PDF extractor that does not finish is a toolchain failure, not a missing quote: re-run ` +
        `with a healthy payload, or install the other extractor ('pdftotext' from poppler-utils / ` +
        `'marker')` +
        (stderrTail === "" ? "" : `. Last stderr: ${stderrTail}`),
    );
    this.name = "SpawnTimeoutError";
  }
}

/** Runs `argv` to completion with both pipes drained and a hard deadline.
 *
 * Resolves with the exit code and the FULL captured stdout/stderr; throws `SpawnTimeoutError` when
 * the deadline fires. A non-zero exit is NOT an error here — that judgement belongs to the caller,
 * which knows what the binary's exit codes mean. */
export async function runBounded(argv: readonly string[], options: BoundedRunOptions = {}): Promise<BoundedRunResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SPAWN_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`runBounded: timeoutMs must be a finite positive number of milliseconds, got ${String(timeoutMs)}`);
  }
  if (argv.length === 0) throw new Error("runBounded: argv must name a binary");

  const which = options.which ?? ((bin) => Bun.which(bin));
  const setsid = which("setsid");
  const proc = Bun.spawn(setsid === null ? [...argv] : [setsid, ...argv], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });

  let killed: "process-group" | "process" | "none" = "none";
  // No SIGTERM grace period: the output of a timed-out extraction is discarded either way, and a
  // grace window is one more interval in which rk is hung — exactly what rule 13 forbids.
  const timer = setTimeout(() => {
    killed = killHard(proc.pid);
  }, timeoutMs);

  // The deadlock fix. Both drains are STARTED before anything is awaited, so a chatty child can
  // always empty its pipe and reach its own exit; awaiting `proc.exited` against an unread pipe
  // (the pre-repair shape) blocks forever the moment the child writes past one buffer. The
  // `.catch` keeps a torn-down stream from surfacing as an unhandled rejection on the kill path.
  const stdoutDrain = new Response(proc.stdout).text().catch(() => "");
  const stderrDrain = new Response(proc.stderr).text().catch(() => "");

  try {
    const exitCode = await proc.exited;
    if (killed !== "none") {
      // Deliberately NOT awaiting the drains here. A kill that could only reach the direct child
      // (no setsid, or /proc unreadable) can leave a grandchild holding the inherited pipe write
      // end open forever — waiting on EOF would re-introduce the very hang this module removes.
      // The stderr tail is best-effort, on a short bound of its own.
      const stderrTail = await Promise.race([stderrDrain, Bun.sleep(250).then(() => "")]);
      releaseQuietly(proc.stdout);
      releaseQuietly(proc.stderr);
      throw new SpawnTimeoutError(argv, timeoutMs, killed, tail(stderrTail));
    }
    const [stdout, stderr] = await Promise.all([stdoutDrain, stderrDrain]);
    return { exitCode, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}

/** Best-effort release of a pipe whose reader is still attached (the drain is normally already
 * locked to it, so this usually rejects or throws — either is fine and neither may be allowed to
 * displace the SpawnTimeoutError we are on our way to throwing). */
function releaseQuietly(stream: unknown): void {
  try {
    const cancel = (stream as { cancel?: () => Promise<void> } | undefined)?.cancel;
    if (typeof cancel === "function") void cancel.call(stream).catch(() => {});
  } catch {
    // nothing to do: the fd goes with the process
  }
}

/** SIGKILLs `pid`'s whole process group when — and only when — `pid` is verifiably that group's
 * leader; otherwise SIGKILLs `pid` alone. The verification is not paranoia: `kill(-pgid)` against
 * a group rk itself belongs to would kill rk. */
function killHard(pid: number): "process-group" | "process" | "none" {
  if (isGroupLeader(pid)) {
    try {
      process.kill(-pid, "SIGKILL");
      return "process-group";
    } catch {
      // fall through to the single-process kill
    }
  }
  try {
    process.kill(pid, "SIGKILL");
    return "process";
  } catch {
    return "none"; // already reaped between the timer firing and this signal
  }
}

/** True iff /proc says `pid`'s process-group id equals `pid`. Field 5 (`pgrp`) of
 * /proc/<pid>/stat, parsed from AFTER the last `)` because field 2 (`comm`) is an unescaped
 * command name that may itself contain spaces and parentheses. Any read/parse failure is a
 * conservative `false` — the caller then kills the single process rather than guessing at a
 * group. */
function isGroupLeader(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const close = stat.lastIndexOf(")");
    if (close < 0) return false;
    // after "<pid> (<comm>) " the fields are: state ppid pgrp ...
    const fields = stat.slice(close + 2).split(" ");
    const pgrp = Number(fields[2]);
    return Number.isInteger(pgrp) && pgrp === pid;
  } catch {
    return false;
  }
}

/** Last 400 characters of a stderr capture, for an error message that stays readable when a
 * hung extractor has emitted megabytes of progress output. */
function tail(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= 400 ? trimmed : `...${trimmed.slice(-400)}`;
}
