// Contract: CLAUDE.md rule 13 ("every spawned process is bounded") applied to the PDF extractors,
// via src/refs/bounded-spawn.ts and src/refs/extract.ts. 2026-08-14 Tier A review finding P1-3:
// both extractor branches awaited `proc.exited` with no deadline, and marker's stdout pipe was
// never drained, so `rk refs quote` could hang forever on a malformed PDF OR on a perfectly good
// one that simply printed more than a pipe buffer of progress output.
//
// The load-bearing assertions are the two hang shapes, each driven by a stub binary:
//   - sleep-forever  => the deadline fires, the whole process GROUP dies (a grandchild that would
//     have written a marker file never gets to), and the caller sees a loud actionable error —
//     never a skip, never "pattern not found";
//   - fat-stdout     => a child that writes megabytes to stdout completes instead of deadlocking.
// Every stub is short-lived and every wait in this file is bounded; nothing here can outlive the
// test run.

import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SPAWN_TIMEOUT_MS, runBounded, SpawnTimeoutError } from "../../src/refs/bounded-spawn";
import { extractPdfText } from "../../src/refs/extract";

const roots: string[] = [];
function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

function stub(dir: string, name: string, script: string): string {
  const bin = join(dir, name);
  writeFileSync(bin, script);
  chmodSync(bin, 0o755);
  return bin;
}

/** A binary that never exits on its own. */
const SLEEP_FOREVER = "#!/bin/sh\nsleep 3600\n";
/** ~2 MiB of stdout — far past Linux's 64 KiB pipe buffer, so an undrained reader deadlocks. */
const FAT_STDOUT = "#!/bin/sh\nhead -c 2097152 /dev/zero | tr '\\0' 'x'\n";

const bounded = (ms: number) => ({ timeoutMs: ms });

describe("runBounded — the deadline", () => {
  test("a sleep-forever child is killed at the deadline and reported, never silently awaited", async () => {
    const dir = scratch("rk-bounded-sleep-");
    const bin = stub(dir, "hang", SLEEP_FOREVER);
    const started = Date.now();
    await expect(runBounded([bin], bounded(300))).rejects.toThrow(SpawnTimeoutError);
    // Bounded by the deadline, not by the child: a 3600s sleep must not cost 3600s.
    expect(Date.now() - started).toBeLessThan(5000);
  }, 15000);

  test("the error names the deadline and the remedy — it is never a skip and never 'not found'", async () => {
    const dir = scratch("rk-bounded-msg-");
    const bin = stub(dir, "hang", SLEEP_FOREVER);
    let caught: unknown;
    try {
      await runBounded([bin], bounded(200));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SpawnTimeoutError);
    const err = caught as SpawnTimeoutError;
    expect(err.message).toContain("200ms deadline");
    expect(err.message).toContain("toolchain failure, not a missing quote");
    expect(err.timeoutMs).toBe(200);
  }, 15000);

  test("the whole process GROUP dies, not just the direct child (marker forks workers)", async () => {
    const dir = scratch("rk-bounded-group-");
    const marker = join(dir, "grandchild-ran");
    // The stub forks a grandchild that would create `marker` one second from now, then hangs. If
    // only the direct child were signalled, the grandchild would survive and write the file.
    const bin = stub(dir, "forker", `#!/bin/sh\nsh -c 'sleep 1; echo alive > "$1"' _ '${marker}' &\nsleep 3600\n`);
    await expect(runBounded([bin], bounded(200))).rejects.toThrow(SpawnTimeoutError);
    await Bun.sleep(2000);
    expect(existsSync(marker)).toBe(false);
  }, 20000);

  test("a non-positive or non-finite deadline is rejected outright — never an unbounded run", async () => {
    await expect(runBounded(["/bin/true"], bounded(0))).rejects.toThrow(/finite positive number/);
    await expect(runBounded(["/bin/true"], bounded(-1))).rejects.toThrow(/finite positive number/);
    await expect(runBounded(["/bin/true"], bounded(Number.NaN))).rejects.toThrow(/finite positive number/);
  });

  test("the shipped default is 120s — sized for a real extraction, not for this test file", () => {
    expect(DEFAULT_SPAWN_TIMEOUT_MS).toBe(120_000);
  });
});

describe("runBounded — draining", () => {
  test("a child that writes ~2 MiB to stdout completes instead of deadlocking on a full pipe", async () => {
    const dir = scratch("rk-bounded-fat-");
    const bin = stub(dir, "chatty", FAT_STDOUT);
    const r = await runBounded([bin], bounded(20_000));
    expect(r.exitCode).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(1_000_000);
  }, 30000);

  test("stdout and stderr are both captured and kept separate", async () => {
    const dir = scratch("rk-bounded-streams-");
    const bin = stub(dir, "both", "#!/bin/sh\necho out\necho err >&2\nexit 7\n");
    const r = await runBounded([bin], bounded(10_000));
    expect(r.exitCode).toBe(7);
    expect(r.stdout.trim()).toBe("out");
    expect(r.stderr.trim()).toBe("err");
  }, 15000);

  test("works without setsid on PATH (macOS/minimal images) — the fallback still bounds the run", async () => {
    const dir = scratch("rk-bounded-nosetsid-");
    // `exec` so the stub is a single process: without setsid the fallback can only reach the
    // direct child, which is exactly what this test pins. (A forking stub here would leave a real
    // stray process behind — rule 13 applies to test stubs too.)
    const bin = stub(dir, "hang", "#!/bin/sh\nexec sleep 3600\n");
    const started = Date.now();
    await expect(runBounded([bin], { timeoutMs: 300, which: () => null })).rejects.toThrow(SpawnTimeoutError);
    expect(Date.now() - started).toBeLessThan(5000);
  }, 15000);

  test("a surviving grandchild holding the pipe open cannot re-hang the caller", async () => {
    // The subtle half of the fallback path: killing only the direct child leaves a grandchild
    // owning the inherited stdout write end, so waiting for EOF on the drain would hang forever
    // even though the deadline fired. The timeout path must therefore never await the drains.
    const dir = scratch("rk-bounded-orphan-");
    const bin = stub(dir, "hang", "#!/bin/sh\nsleep 30 &\nsleep 30\n");
    const started = Date.now();
    await expect(runBounded([bin], { timeoutMs: 300, which: () => null })).rejects.toThrow(SpawnTimeoutError);
    expect(Date.now() - started).toBeLessThan(5000);
  }, 15000);
});

describe("extractPdfText — bounded, drained, and loud", () => {
  test("a hanging MARKER is a hard error at the injected deadline, not a skip", async () => {
    const dir = scratch("rk-extract-marker-hang-");
    const bin = stub(dir, "marker", SLEEP_FOREVER);
    await expect(
      extractPdfText(join(dir, "paper.pdf"), (n) => (n === "marker" ? bin : null), 300),
    ).rejects.toThrow(/deadline/);
  }, 15000);

  test("a hanging PDFTOTEXT is a hard error at the injected deadline, not a skip", async () => {
    const dir = scratch("rk-extract-pdftotext-hang-");
    const bin = stub(dir, "pdftotext", SLEEP_FOREVER);
    await expect(
      extractPdfText(join(dir, "paper.pdf"), (n) => (n === "pdftotext" ? bin : null), 300),
    ).rejects.toThrow(/deadline/);
  }, 15000);

  test("a chatty marker that fills its stdout pipe still yields its markdown (no deadlock)", async () => {
    const dir = scratch("rk-extract-marker-fat-");
    const bin = stub(
      dir,
      "marker",
      "#!/bin/sh\nout=\"\"\nwhile [ $# -gt 0 ]; do if [ \"$1\" = \"--output_dir\" ]; then out=\"$2\"; fi; shift; done\n" +
        "head -c 524288 /dev/zero | tr '\\0' 'p'\n" +
        "mkdir -p \"$out/paper\"\nprintf '# Paper\\n\\nthe gap is uniformly bounded below\\n' > \"$out/paper/paper.md\"\n",
    );
    const r = await extractPdfText(join(dir, "paper.pdf"), (n) => (n === "marker" ? bin : null), 30_000);
    expect(r.skipped).toBe(false);
    expect(r.skipped === false && r.text).toContain("the gap is uniformly bounded below");
  }, 30000);

  test("a hanging extractor never degrades into the graceful no-extractor SKIP (L2)", async () => {
    const dir = scratch("rk-extract-hang-not-skip-");
    const bin = stub(dir, "pdftotext", SLEEP_FOREVER);
    const r = await extractPdfText(join(dir, "paper.pdf"), (n) => (n === "pdftotext" ? bin : null), 250).catch(
      (e: Error) => e,
    );
    expect(r).toBeInstanceOf(Error);
    expect((r as Error).message).not.toContain("no PDF text extractor found");
  }, 15000);
});
