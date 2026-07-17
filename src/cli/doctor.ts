// EDGE — spawns subprocesses, touches PATH. `rk doctor` (D6, IMPLEMENTATION_PLAN.md §0): probes
// the installed af/fr/bd binaries and feeds their raw output into src/doctor.ts's pure
// classification. `which`/`runner` are injectable (src/refs/extract.ts's `Which` pattern) so
// tests never touch a real subprocess. Exit 0 iff every binary verdict is "ok"; `--override`
// downgrades a BLOCKED verdict to a loud, still-logged WARNING and exits 0 anyway (the per-binary
// mismatch lines are never hidden — only the exit code changes).

import compatManifestJson from "../../rk.compat.json";
import type { BinaryName, CompatManifest, ProbeOutcome } from "../doctor";
import { classifyAll, describeVerdict, parseVersion } from "../doctor";
import type { Out } from "./args";

export type Which = (bin: string) => string | null;
export type Runner = (bin: string, args: string[]) => Promise<{ stdout: string; exitCode: number }>;

const defaultWhich: Which = (bin) => Bun.which(bin);

async function defaultRunner(bin: string, args: string[]): Promise<{ stdout: string; exitCode: number }> {
  try {
    const proc = Bun.spawn([bin, ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return { stdout, exitCode };
  } catch {
    // Spawn itself failed (e.g. the binary vanished between `which` and `spawn`, or lacks the
    // exec bit) — treated the same as "this command variant didn't work", so probeBinary moves on
    // to the next command / falls through to "found but no working version command".
    return { stdout: "", exitCode: -1 };
  }
}

/** Per-binary probe command variants, in priority order. af tries `version` then falls back to
 * `--version`: the real installed af binary's `version` subcommand prints an ldflags-unstamped
 * "af version dev" (no parseable semver), while `--version` carries cobra's separately-baked-in
 * release string ("af version 0.1.3") — both are real af behaviors on this machine, not a
 * hypothetical. fr (F0's `fr version`) and bd (`bd version`) each have exactly one variant. */
const PROBE_COMMANDS: Record<BinaryName, string[][]> = {
  af: [["version"], ["--version"]],
  fr: [["version"]],
  bd: [["version"]],
};

/** Probes one binary: absent from PATH -> {found:false}; present but no command variant yields a
 * parseable version -> {found:true, raw:null} (the "no-version-support" case, e.g. the installed
 * fr predating F0); otherwise the first working variant's raw stdout is returned as-is (parsing
 * happens in the pure module, not here). */
export async function probeBinary(binary: BinaryName, which: Which, runner: Runner): Promise<ProbeOutcome> {
  if (which(binary) === null) return { found: false, raw: null };
  for (const args of PROBE_COMMANDS[binary]) {
    const { stdout, exitCode } = await runner(binary, args);
    if (exitCode === 0 && parseVersion(stdout) !== null) {
      return { found: true, raw: stdout };
    }
  }
  return { found: true, raw: null };
}

export interface DoctorCommandDeps {
  which?: Which;
  runner?: Runner;
  manifest?: CompatManifest;
}

export async function doctorCommand(args: string[], out: Out, deps: DoctorCommandDeps = {}): Promise<number> {
  const override = args.includes("--override");
  const which = deps.which ?? defaultWhich;
  const runner = deps.runner ?? defaultRunner;
  const manifest = deps.manifest ?? (compatManifestJson as CompatManifest);

  const outcomes: Record<BinaryName, ProbeOutcome> = {
    af: await probeBinary("af", which, runner),
    fr: await probeBinary("fr", which, runner),
    bd: await probeBinary("bd", which, runner),
  };
  const report = classifyAll(manifest, outcomes);

  for (const v of report.binaries) out.log(describeVerdict(v));
  out.log("");

  if (report.ok) {
    out.log("rk doctor: OK (af/fr/bd all compatible with rk.compat.json).");
    return 0;
  }
  if (override) {
    out.log("rk doctor: BLOCKED verdict downgraded to WARNING by --override — proceeding anyway.");
    out.log("  next: this override is logged, not silent; fix the mismatch(es) above when convenient.");
    return 0;
  }
  out.log("rk doctor: BLOCKED (>=1 binary not ok). Fix the binaries above, or pass --override to proceed with a warning.");
  return 1;
}
