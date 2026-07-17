// EDGE — spawns a subprocess, touches PATH. PDF -> markdown extraction via the optional
// `marker` binary (https://github.com/VikParuchuri/marker), per PRD C7 ("extract (PDF->text/
// markdown via marker where available)") and IMPLEMENTATION_PLAN.md M0.6 ("marker PDF->markdown
// integration optional-with-graceful-skip"). CLAUDE.md L2's "a skip is always visible with a
// count" applies here too: an absent binary must never fail silently — the caller (rk refs add)
// is responsible for surfacing the skip count, never dropping it.

export type Which = (bin: string) => string | null;

/** True iff the `marker` binary is on PATH. `which` is injectable for tests; defaults to
 * Bun.which, which returns null (not a path) when the binary is absent. */
export function markerAvailable(which: Which = (bin) => Bun.which(bin)): boolean {
  return which("marker") !== null;
}

export type ExtractResult =
  | { skipped: true; reason: string }
  | { skipped: false; outputPath: string };

/** Extracts `pdfPath` to markdown under `outDir` via `marker`, or reports a visible skip if the
 * binary is unavailable. Never throws for the "no marker" case — that is the expected, graceful
 * path this function exists to model; a spawn/exit failure of an actually-present binary DOES
 * propagate (a present-but-broken tool is a real error, not a skip). */
export async function extractWithMarker(
  pdfPath: string,
  outDir: string,
  which: Which = (bin) => Bun.which(bin),
): Promise<ExtractResult> {
  const bin = which("marker");
  if (bin === null) {
    return { skipped: true, reason: "marker not found" };
  }
  const proc = Bun.spawn([bin, pdfPath, "--output_dir", outDir], { stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`marker exited ${exitCode}: ${stderr}`);
  }
  return { skipped: false, outputPath: outDir };
}
