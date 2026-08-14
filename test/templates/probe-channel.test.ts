// LIVE-FIRE tests for the stamped probe-execution channel (templates/runs/probe-channel.sh.tmpl,
// stamped by `rk init` as runs/probe-channel.sh). The artifact under test is a bash script, so
// asserting its TEXT proves almost nothing: every test here stamps the real template into a scratch
// repo and drives it with a real bash, real bundles, real concurrency.
//
// Codex review 2026-08-14 (docs/reviews/2026-08-14-refs-extraction-runs-infra-codex.md) found three
// defects, each reproduced below against the pre-repair script before the repair landed:
//   P1 (:38)    the bundle-exists test is a non-atomic existence check. Two concurrent launches of
//               the same NEW bundle both pass it, both write output.txt, and both append a ledger
//               row — so a shard's bundle citation stops identifying immutable output. The same
//               hole lets a bundle be REUSED after its output.txt is deleted while its old ledger
//               row survives (deterministic, see "already in the ledger" below).
//   P2-5 (:63)  the script digest is taken AFTER the run, so a self-modifying (or concurrently
//               edited) probe is ledgered with bytes that did not produce output.txt.
//   P2-6 (:66)  ledger fields are interpolated raw into JSON and into a single-quoted `flock -c`
//               command string, so a `"`, `'` or newline in a filename yields malformed JSONL or a
//               broken shell command.
//
// Rule 13: every spawned bash is wrapped in `timeout`, and every poll loop is bounded by an
// iteration count, not by a condition.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEMPLATES_ROOT = join(import.meta.dir, "..", "..", "templates");
const TEMPLATE = readFileSync(join(TEMPLATES_ROOT, "runs/probe-channel.sh.tmpl"), "utf8");

const HAVE_PYTHON3 = Bun.which("python3") !== null;

/** A scratch campaign repo with the template stamped exactly where `rk init` puts it. */
function stampRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "rk-probe-channel-"));
  mkdirSync(join(root, "runs"));
  writeFileSync(join(root, "runs", "probe-channel.sh"), TEMPLATE);
  return root;
}

/** A bundle directory holding one probe script. Returns the bundle path relative to the repo root
 * (which is what the channel takes as its first argument). */
function bundle(root: string, name: string, scriptName: string, body: string, mode?: number): string {
  const rel = `runs/${name}`;
  mkdirSync(join(root, rel), { recursive: true });
  writeFileSync(join(root, rel, scriptName), body);
  if (mode !== undefined) chmodSync(join(root, rel, scriptName), mode);
  return rel;
}

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

/** Drive the stamped channel. `timeout 60` is rule 13: this test file starts real subprocesses. */
function runChannel(root: string, args: string[], env: Record<string, string> = {}): Run {
  const p = Bun.spawnSync(["timeout", "60", "bash", join(root, "runs", "probe-channel.sh"), ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: p.exitCode ?? -1, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

function spawnChannel(root: string, args: string[], env: Record<string, string> = {}) {
  return Bun.spawn(["timeout", "60", "bash", join(root, "runs", "probe-channel.sh"), ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
}

const ledgerPath = (root: string) => join(root, "runs", "probe-ledger.jsonl");

/** Raw ledger lines (no JSON.parse — a corrupt ledger must still be readable by the test). */
function ledgerLines(root: string): string[] {
  const p = ledgerPath(root);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").filter((l) => l.length > 0);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Bounded poll: at most `tries` × 50 ms. Never loops on a condition alone (rule 13). */
async function waitFor(predicate: () => boolean, tries = 120): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return true;
    await Bun.sleep(50);
  }
  return false;
}

describe("templates / probe channel — live fire (rk-z93m, codex 2026-08-14)", () => {
  test("the template stamps verbatim: no slots to substitute", () => {
    expect(TEMPLATE).not.toContain("{{RK_SLOT_");
    expect(TEMPLATE.startsWith("#!/usr/bin/env bash")).toBe(true);
  });

  test("happy path: output kept, one hash-bound JSONL row binding the bundle to its content", () => {
    const root = stampRepo();
    try {
      const b = bundle(root, "2026-08-14-happy", "probe.sh", "echo 'residual 1.5e-9'\n");
      const r = runChannel(root, [b, "probe.sh", "30"]);
      expect(r.code).toBe(0);

      const out = join(root, b, "output.txt");
      expect(readFileSync(out, "utf8")).toBe("residual 1.5e-9\n");

      const lines = ledgerLines(root);
      expect(lines).toHaveLength(1);
      const entry = JSON.parse(lines[0]!);
      expect(entry.bundle).toBe(b);
      expect(entry.script).toBe("probe.sh");
      expect(entry.script_sha256).toBe(sha256(join(root, b, "probe.sh")));
      expect(entry.output_sha256).toBe(sha256(out));
      expect(entry.exit).toBe(0);
      expect(entry.cmd).toContain("bash probe.sh");
      expect(typeof entry.secs).toBe("number");
      expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the probe's own exit code propagates and is ledgered", () => {
    const root = stampRepo();
    try {
      const b = bundle(root, "2026-08-14-nonzero", "probe.sh", "echo boom; exit 7\n");
      const r = runChannel(root, [b, "probe.sh", "30"]);
      expect(r.code).toBe(7);
      expect(JSON.parse(ledgerLines(root)[0]!).exit).toBe(7);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("bounded: a probe past its timeout is killed, and the truncated run is ledgered as exit 124", () => {
    const root = stampRepo();
    try {
      const b = bundle(root, "2026-08-14-slowprobe", "probe.sh", "echo started; sleep 30\n");
      const r = runChannel(root, [b, "probe.sh", "1"]);
      expect(r.code).toBe(124);
      const entry = JSON.parse(ledgerLines(root)[0]!);
      expect(entry.exit).toBe(124);
      expect(entry.cmd).toContain("timeout 1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("immutability: refuses to overwrite an existing output.txt (I.3)", () => {
    const root = stampRepo();
    try {
      const b = bundle(root, "2026-08-14-immutable", "probe.sh", "echo second\n");
      writeFileSync(join(root, b, "output.txt"), "first run\n");
      const r = runChannel(root, [b, "probe.sh", "30"]);
      expect(r.code).toBe(3);
      expect(r.stderr).toContain("output.txt already exists");
      expect(readFileSync(join(root, b, "output.txt"), "utf8")).toBe("first run\n");
      expect(ledgerLines(root)).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ---- P1: the LEDGER is the reservation, not the filesystem ---------------------------------
  // RED against the pre-repair script: it consulted only `[ ! -e output.txt ]`, so deleting the
  // output freed the bundle name for a second, differently-hashed run while the first run's row
  // stayed in the append-only ledger. A shard citing that bundle then had two candidate rows.
  test("a bundle already in the ledger is refused — even after its output.txt is deleted", () => {
    const root = stampRepo();
    try {
      const b = bundle(root, "2026-08-14-reuse", "probe.sh", "echo first\n");
      expect(runChannel(root, [b, "probe.sh", "30"]).code).toBe(0);
      expect(ledgerLines(root)).toHaveLength(1);

      // The exact hole: remove the only filesystem evidence of the run and rewrite the probe.
      unlinkSync(join(root, b, "output.txt"));
      writeFileSync(join(root, b, "probe.sh"), "echo second\n");

      const r = runChannel(root, [b, "probe.sh", "30"]);
      expect(r.code).toBe(4);
      expect(r.stderr).toContain("already has a ledger entry");
      // Nothing was re-run and nothing was appended: the citation still resolves to one row.
      expect(existsSync(join(root, b, "output.txt"))).toBe(false);
      expect(ledgerLines(root)).toHaveLength(1);
      expect(JSON.parse(ledgerLines(root)[0]!).script_sha256).not.toBe(sha256(join(root, b, "probe.sh")));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a bundle whose row was written by a previous session is refused on a fresh invocation", () => {
    const root = stampRepo();
    try {
      const b = bundle(root, "2026-08-14-preledgered", "probe.sh", "echo hello\n");
      // A row that exists with no bundle artifacts at all (e.g. the bundle was cleaned).
      writeFileSync(
        ledgerPath(root),
        `{"ts":"2026-08-13T00:00:00Z","bundle":"${b}","script":"probe.sh","script_sha256":"0","output_sha256":"0","cmd":"x","exit":0,"secs":0}\n`,
      );
      const r = runChannel(root, [b, "probe.sh", "30"]);
      expect(r.code).toBe(4);
      expect(ledgerLines(root)).toHaveLength(1);
      expect(existsSync(join(root, b, "output.txt"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ---- P1: one lock, held across reservation + execution + hashing + append -------------------
  test("one flock spans the whole sequence: a concurrent launch loses the reservation", async () => {
    const root = stampRepo();
    let first: ReturnType<typeof spawnChannel> | undefined;
    try {
      const held = bundle(
        root,
        "2026-08-14-held",
        "probe.sh",
        // Announce that execution has begun, then stay inside the run for a while.
        "touch running.marker; echo held; sleep 5\n",
      );
      const other = bundle(root, "2026-08-14-other", "probe.sh", "echo other\n");

      first = spawnChannel(root, [held, "probe.sh", "20"]);
      const started = await waitFor(() => existsSync(join(root, held, "running.marker")));
      expect(started).toBe(true);

      // (a) The SAME bundle, launched while the first run is mid-flight: it must not slip past the
      //     reservation and write a competing output.txt / ledger row.
      const dup = runChannel(root, [held, "probe.sh", "20"], { RK_PROBE_LOCK_WAIT: "0" });
      expect(dup.code).toBe(5);
      expect(dup.stderr).toContain("another probe holds the channel");

      // (b) A DIFFERENT bundle is also blocked — proof the lock is held across EXECUTION, not
      //     merely around the ledger append (which is where the pre-repair script took it).
      const otherRun = runChannel(root, [other, "probe.sh", "20"], { RK_PROBE_LOCK_WAIT: "0" });
      expect(otherRun.code).toBe(5);
      expect(existsSync(join(root, other, "output.txt"))).toBe(false);

      expect(await first.exited).toBe(0);
      first = undefined;
      expect(ledgerLines(root)).toHaveLength(1);
      expect(JSON.parse(ledgerLines(root)[0]!).bundle).toBe(held);

      // Once the lock is free, the duplicate loses on the reservation instead of on the lock.
      const after = runChannel(root, [held, "probe.sh", "20"]);
      expect(after.code).toBe(4);
      expect(ledgerLines(root)).toHaveLength(1);

      // ...and the unrelated bundle now runs normally: the lock serializes, it does not poison.
      expect(runChannel(root, [other, "probe.sh", "20"]).code).toBe(0);
      expect(ledgerLines(root)).toHaveLength(2);
    } finally {
      first?.kill();
      rmSync(root, { recursive: true, force: true });
    }
  }, 40_000);

  test("a waiter with a budget queues behind the running probe instead of failing", async () => {
    const root = stampRepo();
    let first: ReturnType<typeof spawnChannel> | undefined;
    try {
      const a = bundle(root, "2026-08-14-queue-a", "probe.sh", "touch running.marker; sleep 2\n");
      const b = bundle(root, "2026-08-14-queue-b", "probe.sh", "echo b\n");
      first = spawnChannel(root, [a, "probe.sh", "20"]);
      expect(await waitFor(() => existsSync(join(root, a, "running.marker")))).toBe(true);
      const queued = runChannel(root, [b, "probe.sh", "20"], { RK_PROBE_LOCK_WAIT: "30" });
      expect(queued.code).toBe(0);
      expect(await first.exited).toBe(0);
      first = undefined;
      expect(ledgerLines(root)).toHaveLength(2);
    } finally {
      first?.kill();
      rmSync(root, { recursive: true, force: true });
    }
  }, 40_000);

  // ---- P2-5: the digest that is recorded is the digest of the bytes that ran ------------------
  test("a self-modifying probe is refused a ledger row and its bundle is marked poisoned", () => {
    const root = stampRepo();
    try {
      const b = bundle(
        root,
        "2026-08-14-selfmod",
        "probe.sh",
        "echo 'value 1.0'\nprintf '# appended by the probe itself\\n' >> probe.sh\n",
      );
      const before = sha256(join(root, b, "probe.sh"));
      const r = runChannel(root, [b, "probe.sh", "30"]);

      expect(r.code).toBe(6);
      expect(r.stderr).toContain("changed while it ran");
      expect(r.stderr).toContain("NOTHING was ledgered");
      expect(sha256(join(root, b, "probe.sh"))).not.toBe(before);
      // No row at all: an entry whose script_sha256 is neither the executed bytes nor the current
      // bytes is worse than no entry, because a shard could cite it.
      expect(ledgerLines(root)).toHaveLength(0);
      // The bundle is dead, loudly: the marker explains it and output.txt is kept as evidence,
      // which also means the immutability check refuses any re-run into this same bundle.
      const poisoned = readFileSync(join(root, b, "POISONED.txt"), "utf8");
      expect(poisoned).toContain(before);
      expect(poisoned).toContain(sha256(join(root, b, "probe.sh")));
      expect(existsSync(join(root, b, "output.txt"))).toBe(true);
      expect(runChannel(root, [b, "probe.sh", "30"]).code).toBe(3);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the recorded script_sha256 is taken before launch (a stable probe hashes identically)", () => {
    const root = stampRepo();
    try {
      const b = bundle(root, "2026-08-14-prehash", "probe.sh", "echo stable\n");
      const before = sha256(join(root, b, "probe.sh"));
      expect(runChannel(root, [b, "probe.sh", "30"]).code).toBe(0);
      expect(JSON.parse(ledgerLines(root)[0]!).script_sha256).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ---- P2-6: hostile names cannot reach the ledger or a shell command string ------------------
  // RED against the pre-repair script: a `"` produced a syntactically invalid JSONL line that was
  // nevertheless appended (the ledger is append-only — the corruption is permanent), and a `'`
  // broke the single-quoted `flock -c` string.
  const HOSTILE: Array<[string, string]> = [
    ["double quote", 'pr"obe.sh'],
    ["apostrophe", "pr'obe.sh"],
    ["backslash", "pr\\obe.sh"],
    ["space", "pr obe.sh"],
    ["newline", "pr\nobe.sh"],
    ["dollar-brace", "pr${IFS}obe.sh"],
  ];
  for (const [label, name] of HOSTILE) {
    test(`a script name containing a ${label} is rejected before anything is run or appended`, () => {
      const root = stampRepo();
      try {
        const b = bundle(root, "2026-08-14-hostile", name, "echo pwned\n");
        const r = runChannel(root, [b, name, "30"]);
        expect(r.code).toBe(2);
        expect(r.stderr).toContain("refusing");
        expect(ledgerLines(root)).toHaveLength(0);
        expect(existsSync(join(root, b, "output.txt"))).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }

  test("every ledger line remains parseable JSON after a hostile name is attempted", () => {
    const root = stampRepo();
    try {
      const good = bundle(root, "2026-08-14-good", "probe.sh", "echo ok\n");
      expect(runChannel(root, [good, "probe.sh", "30"]).code).toBe(0);
      const bad = bundle(root, "2026-08-14-bad", 'x".sh', "echo bad\n");
      expect(runChannel(root, [bad, 'x".sh', "30"]).code).toBe(2);
      const lines = ledgerLines(root);
      expect(lines).toHaveLength(1);
      for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a hostile BUNDLE name is rejected too, and so is a path escape", () => {
    const root = stampRepo();
    try {
      mkdirSync(join(root, "runs", 'b"ad'), { recursive: true });
      writeFileSync(join(root, "runs", 'b"ad', "probe.sh"), "echo x\n");
      const r = runChannel(root, ['runs/b"ad', "probe.sh", "30"]);
      expect(r.code).toBe(2);
      expect(ledgerLines(root)).toHaveLength(0);

      const escape = runChannel(root, ["runs/../runs/2026-08-14-x", "probe.sh", "30"]);
      expect(escape.code).toBe(2);
      expect(escape.stderr).toContain("refusing");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a non-numeric timeout is rejected rather than interpolated into the ledger", () => {
    const root = stampRepo();
    try {
      const b = bundle(root, "2026-08-14-badtmo", "probe.sh", "echo x\n");
      const r = runChannel(root, [b, "probe.sh", '30","exit":0,"x":"']);
      expect(r.code).toBe(2);
      expect(ledgerLines(root)).toHaveLength(0);
      expect(existsSync(join(root, b, "output.txt"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // codex review 2026-08-15 (P2): under `set -u`, referencing $1 with zero args given trips bash's
  // own unbound-variable handling and exits 1 — one status below the documented "2 = usage"
  // contract, and outside the "anything else is a ledgered probe result" range, so a caller could
  // mistake a usage error for a completed (if unusual) run. The count check must fire first, before
  // $1/$2 are ever touched, and must produce exit 2 like every other usage failure.
  test("a missing required argument exits 2 (usage), not 1, and ledgers nothing", () => {
    const root = stampRepo();
    try {
      const zero = runChannel(root, []);
      expect(zero.code).toBe(2);
      expect(zero.stderr).toContain("usage");

      const b = bundle(root, "2026-08-14-onearg", "probe.sh", "echo x\n");
      const one = runChannel(root, [b]);
      expect(one.code).toBe(2);
      expect(one.stderr).toContain("usage");

      const tooMany = runChannel(root, [b, "probe.sh", "30", "extra"]);
      expect(tooMany.code).toBe(2);

      expect(ledgerLines(root)).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ---- preserved guarantees ------------------------------------------------------------------
  test("missing bundle, missing script and an unknown interpreter all fail closed", () => {
    const root = stampRepo();
    try {
      expect(runChannel(root, ["runs/2026-08-14-nope", "probe.sh"]).code).toBe(2);
      const b = bundle(root, "2026-08-14-dispatch", "probe.sh", "echo x\n");
      expect(runChannel(root, [b, "absent.sh"]).code).toBe(2);
      writeFileSync(join(root, b, "probe.weird"), "not runnable\n");
      const r = runChannel(root, [b, "probe.weird"]);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("don't know how to run");
      expect(ledgerLines(root)).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an executable with no known extension is dispatched directly", () => {
    const root = stampRepo();
    try {
      const b = bundle(root, "2026-08-14-exec", "probe", "#!/usr/bin/env bash\necho direct\n", 0o755);
      expect(runChannel(root, [b, "probe", "30"]).code).toBe(0);
      expect(readFileSync(join(root, b, "output.txt"), "utf8")).toBe("direct\n");
      expect(JSON.parse(ledgerLines(root)[0]!).cmd).toContain("./probe");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the dispatcher still routes .py under python3", () => {
    // Static half (always checked): the dispatch arm exists in the stamped text.
    expect(TEMPLATE).toContain("*.py) RUNNER=(python3");
    if (!HAVE_PYTHON3) {
      // Never a silent skip (L2): state what was not exercised and why.
      console.warn("probe-channel: python3 absent — .py live-fire dispatch not exercised (static arm checked)");
      return;
    }
    const root = stampRepo();
    try {
      const b = bundle(root, "2026-08-14-py", "probe.py", "print('from python')\n");
      expect(runChannel(root, [b, "probe.py", "30"]).code).toBe(0);
      expect(readFileSync(join(root, b, "output.txt"), "utf8")).toBe("from python\n");
      expect(JSON.parse(ledgerLines(root)[0]!).cmd).toContain("python3 probe.py");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("determinism knobs are still pinned single-threaded in the executed environment", () => {
    const root = stampRepo();
    try {
      const b = bundle(root, "2026-08-14-env", "probe.sh", 'echo "$OMP_NUM_THREADS $PYTHONHASHSEED"\n');
      expect(runChannel(root, [b, "probe.sh", "30"]).code).toBe(0);
      expect(readFileSync(join(root, b, "output.txt"), "utf8")).toBe("1 0\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the ledger stays append-only: a second bundle adds a line and leaves the first untouched", () => {
    const root = stampRepo();
    try {
      const a = bundle(root, "2026-08-14-one", "probe.sh", "echo one\n");
      const b = bundle(root, "2026-08-14-two", "probe.sh", "echo two\n");
      expect(runChannel(root, [a, "probe.sh", "30"]).code).toBe(0);
      const firstLine = ledgerLines(root)[0]!;
      expect(runChannel(root, [b, "probe.sh", "30"]).code).toBe(0);
      const lines = ledgerLines(root);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe(firstLine);
      expect(JSON.parse(lines[1]!).bundle).toBe(b);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
