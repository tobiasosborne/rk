// Tests for src/doctor.ts (PURE decision logic — every verdict class, with fake version
// strings) and src/cli/doctor.ts (EDGE — injected fake which/runner, no real subprocess in any
// non-skipped test). One live smoke test is env-gated (RK_DOCTOR_LIVE=1) and documents this
// machine's actual state rather than asserting a moving target.

import { describe, expect, test } from "bun:test";
import {
  classifyAll,
  classifyBinary,
  compareSemver,
  describeVerdict,
  gte,
  parseVersion,
} from "../src/doctor";
import type { CompatEntry, CompatManifest, ProbeOutcome } from "../src/doctor";
import { doctorCommand, probeBinary } from "../src/cli/doctor";
import type { Runner } from "../src/cli/doctor";

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

// ---------------------------------------------------------------------------------------------
// PURE: parseVersion
// ---------------------------------------------------------------------------------------------

describe("parseVersion", () => {
  test("af --version output ('af version 0.1.3') parses to '0.1.3'", () => {
    expect(parseVersion("af version 0.1.3")).toBe("0.1.3");
  });

  test("af version's ldflags-unstamped dev build ('af version dev') parses to null", () => {
    expect(parseVersion("af version dev")).toBeNull();
  });

  test(
    "regression: af version's multi-line dev output must NOT leak the trailing Go-version " +
      "line's semver triple ('go1.25.5') as if it were af's own version",
    () => {
      const raw = "af version dev\n  Commit:  unknown\n  Built:   unknown\n  Go:      go1.25.5";
      expect(parseVersion(raw)).toBeNull();
    },
  );

  test("fr F0's 'fr version' output ('fr 0.2.0') parses to '0.2.0'", () => {
    expect(parseVersion("fr 0.2.0")).toBe("0.2.0");
  });

  test("fr's pre-F0 stale-binary output ('unknown command ...') parses to null", () => {
    expect(parseVersion("unknown command 'version'. Run `fr help` for the CLI surface.")).toBeNull();
  });

  test("bd version output ('bd version 1.0.0 (<hash>...)') parses to '1.0.0'", () => {
    expect(parseVersion("bd version 1.0.0 (72170267: HEAD@72170267e00a)")).toBe("1.0.0");
  });

  test("empty string parses to null", () => {
    expect(parseVersion("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// PURE: compareSemver / gte — mutation-proving the comparator
// ---------------------------------------------------------------------------------------------

describe("compareSemver / gte", () => {
  test("equal versions compare 0", () => {
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });

  test("patch difference: lower patch is less", () => {
    expect(compareSemver("1.2.3", "1.2.4")).toBe(-1);
    expect(compareSemver("1.2.4", "1.2.3")).toBe(1);
  });

  test("minor difference outranks patch", () => {
    expect(compareSemver("1.3.0", "1.2.9")).toBe(1);
    expect(compareSemver("1.2.9", "1.3.0")).toBe(-1);
  });

  test("major difference outranks minor and patch", () => {
    expect(compareSemver("2.0.0", "1.9.9")).toBe(1);
    expect(compareSemver("1.9.9", "2.0.0")).toBe(-1);
  });

  test(
    "mutation-proving: numeric comparison, not lexicographic — '0.10.0' > '0.9.0' " +
      "(a string comparator would wrongly say '0.10.0' < '0.9.0' since '1' < '9')",
    () => {
      expect(compareSemver("0.10.0", "0.9.0")).toBe(1);
      expect(compareSemver("0.9.0", "0.10.0")).toBe(-1);
    },
  );

  test("gte is true for equal and greater, false for less", () => {
    expect(gte("0.2.0", "0.2.0")).toBe(true);
    expect(gte("0.2.1", "0.2.0")).toBe(true);
    expect(gte("0.1.9", "0.2.0")).toBe(false);
  });

  test("compareSemver throws on unparseable input (a malformed rk.compat.json entry, not probe data)", () => {
    expect(() => compareSemver("not-a-version", "1.0.0")).toThrow();
  });
});

// ---------------------------------------------------------------------------------------------
// PURE: classifyBinary — every verdict class
// ---------------------------------------------------------------------------------------------

describe("classifyBinary — verdict-class coverage", () => {
  const entry: CompatEntry = { min: "0.2.0", tested: ["0.2.0"] };

  test("ok: version >= min, major matches a tested entry", () => {
    const v = classifyBinary("fr", entry, { found: true, raw: "fr 0.2.0" });
    expect(v.verdict).toBe("ok");
    expect(v.version).toBe("0.2.0");
  });

  test("ok: patch above the tested exact version, same major — still ok, not untested-major", () => {
    const v = classifyBinary("fr", entry, { found: true, raw: "fr 0.2.9" });
    expect(v.verdict).toBe("ok");
  });

  test("below-min: parsed version below the pinned minimum", () => {
    const v = classifyBinary("fr", entry, { found: true, raw: "fr 0.1.9" });
    expect(v.verdict).toBe("below-min");
    expect(v.version).toBe("0.1.9");
  });

  test(
    "mutation-proving untested-major: a higher major (>= min numerically via major alone) " +
      "must be flagged untested-major, not silently accepted as ok",
    () => {
      const v = classifyBinary("fr", entry, { found: true, raw: "fr 1.0.0" });
      expect(v.verdict).toBe("untested-major");
      expect(v.version).toBe("1.0.0");
    },
  );

  test("missing: binary absent from PATH — verdict is missing regardless of any raw output", () => {
    const v = classifyBinary("af", entry, { found: false, raw: "af version 9.9.9" });
    expect(v.verdict).toBe("missing");
    expect(v.version).toBeNull();
  });

  test("no-version-support: found on PATH but probe never produced raw output", () => {
    const v = classifyBinary("fr", entry, { found: true, raw: null });
    expect(v.verdict).toBe("no-version-support");
    expect(v.version).toBeNull();
  });

  test("no-version-support: found on PATH, raw output present but unparseable (e.g. af's unstamped dev build)", () => {
    const v = classifyBinary("af", entry, { found: true, raw: "af version dev" });
    expect(v.verdict).toBe("no-version-support");
    expect(v.version).toBeNull();
  });

  test("below-min takes priority over untested-major when both major and version-vs-min disagree in a weird pin", () => {
    // A version whose major differs from tested[] AND is below min: below-min wins (min-check
    // runs before the major/tested check in classifyBinary).
    const strict: CompatEntry = { min: "5.0.0", tested: ["5.0.0"] };
    const v = classifyBinary("bd", strict, { found: true, raw: "bd version 1.0.0 (abc)" });
    expect(v.verdict).toBe("below-min");
  });
});

describe("classifyAll", () => {
  const manifest: CompatManifest = {
    af: { min: "0.1.3", tested: ["0.1.3"] },
    fr: { min: "0.2.0", tested: ["0.2.0"] },
    bd: { min: "1.0.0", tested: ["1.0.0"] },
  };

  test("ok overall iff all three binaries are ok", () => {
    const report = classifyAll(manifest, {
      af: { found: true, raw: "af version 0.1.3" },
      fr: { found: true, raw: "fr 0.2.0" },
      bd: { found: true, raw: "bd version 1.0.0 (abc)" },
    });
    expect(report.ok).toBe(true);
    expect(report.binaries.map((b) => b.verdict)).toEqual(["ok", "ok", "ok"]);
  });

  test("one mismatched binary (fake fr predating F0) blocks the overall report", () => {
    const report = classifyAll(manifest, {
      af: { found: true, raw: "af version 0.1.3" },
      fr: { found: true, raw: null },
      bd: { found: true, raw: "bd version 1.0.0 (abc)" },
    });
    expect(report.ok).toBe(false);
    const fr = report.binaries.find((b) => b.binary === "fr")!;
    expect(fr.verdict).toBe("no-version-support");
  });
});

describe("describeVerdict — self-teaching output", () => {
  const entry: CompatEntry = { min: "0.2.0", tested: ["0.2.0"] };

  test("no-version-support for fr names F0 and the rebuild path", () => {
    const v = classifyBinary("fr", entry, { found: true, raw: null });
    const line = describeVerdict(v);
    expect(line).toContain("fr");
    expect(line).toContain("knowledge-frontier");
  });

  test("missing names PATH", () => {
    const v = classifyBinary("af", entry, { found: false, raw: null });
    expect(describeVerdict(v)).toContain("PATH");
  });

  test("untested-major mentions --override", () => {
    const v = classifyBinary("bd", entry, { found: true, raw: "bd version 9.0.0 (abc)" });
    expect(describeVerdict(v)).toContain("--override");
  });

  test("ok is a plain confirmation line", () => {
    const v = classifyBinary("fr", entry, { found: true, raw: "fr 0.2.0" });
    expect(describeVerdict(v)).toBe("fr 0.2.0: ok (min 0.2.0).");
  });
});

// ---------------------------------------------------------------------------------------------
// EDGE: probeBinary / doctorCommand — injected fake which/runner, no real subprocess
// ---------------------------------------------------------------------------------------------

function fakeWhich(present: Set<string>): (bin: string) => string | null {
  return (bin) => (present.has(bin) ? `/fake/bin/${bin}` : null);
}

describe("probeBinary", () => {
  test("absent binary: found=false, no runner call needed", async () => {
    let calls = 0;
    const runner = async () => {
      calls++;
      return { stdout: "", exitCode: 0 };
    };
    const outcome = await probeBinary("bd", fakeWhich(new Set()), runner);
    expect(outcome).toEqual({ found: false, raw: null });
    expect(calls).toBe(0);
  });

  test("af's two-step probe: 'version' yields an unparseable dev build, falls back to '--version'", async () => {
    const calls: string[][] = [];
    const runner = async (_bin: string, args: string[]) => {
      calls.push(args);
      if (args[0] === "version") return { stdout: "af version dev\n  Go: go1.25.5", exitCode: 0 };
      return { stdout: "af version 0.1.3", exitCode: 0 };
    };
    const outcome = await probeBinary("af", fakeWhich(new Set(["af"])), runner);
    expect(outcome).toEqual({ found: true, raw: "af version 0.1.3" });
    expect(calls).toEqual([["version"], ["--version"]]);
  });

  test("found but every command variant fails (unknown-command exit code): raw stays null", async () => {
    const runner = async () => ({ stdout: "unknown command 'version'.", exitCode: 2 });
    const outcome = await probeBinary("fr", fakeWhich(new Set(["fr"])), runner);
    expect(outcome).toEqual({ found: true, raw: null });
  });
});

describe("doctorCommand — fake-runner acceptance (M0.4 plan bar)", () => {
  const manifest: CompatManifest = {
    af: { min: "0.1.3", tested: ["0.1.3"] },
    fr: { min: "0.2.0", tested: ["0.2.0"] },
    bd: { min: "1.0.0", tested: ["1.0.0"] },
  };

  function okRunner(): Runner {
    return async (bin) => {
      if (bin === "af") return { stdout: "af version 0.1.3", exitCode: 0 };
      if (bin === "fr") return { stdout: "fr 0.2.0", exitCode: 0 };
      return { stdout: "bd version 1.0.0 (abc)", exitCode: 0 };
    };
  }

  test("passes on a pinned set: exit 0, 'rk doctor: OK'", async () => {
    const { out, lines } = capture();
    const code = await doctorCommand([], out, {
      which: fakeWhich(new Set(["af", "fr", "bd"])),
      runner: okRunner(),
      manifest,
    });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("rk doctor: OK");
  });

  test("blocks on a deliberately mismatched binary (fr reports a pre-F0 unknown-command failure)", async () => {
    const { out, lines } = capture();
    const runner: Runner = async (bin) => {
      if (bin === "fr") return { stdout: "unknown command 'version'.", exitCode: 2 };
      if (bin === "af") return { stdout: "af version 0.1.3", exitCode: 0 };
      return { stdout: "bd version 1.0.0 (abc)", exitCode: 0 };
    };
    const code = await doctorCommand([], out, {
      which: fakeWhich(new Set(["af", "fr", "bd"])),
      runner,
      manifest,
    });
    const text = lines.join("\n");
    expect(code).toBe(1);
    expect(text).toContain("rk doctor: BLOCKED");
    expect(text).toContain("no version support");
  });

  test("a missing binary blocks and names it", async () => {
    const { out, lines } = capture();
    const code = await doctorCommand([], out, {
      which: fakeWhich(new Set(["fr", "bd"])), // af absent
      runner: okRunner(),
      manifest,
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("af: not found on PATH");
  });

  test("a below-min binary blocks", async () => {
    const { out, lines } = capture();
    const runner: Runner = async (bin) => {
      if (bin === "bd") return { stdout: "bd version 0.9.0 (abc)", exitCode: 0 };
      if (bin === "af") return { stdout: "af version 0.1.3", exitCode: 0 };
      return { stdout: "fr 0.2.0", exitCode: 0 };
    };
    const code = await doctorCommand([], out, {
      which: fakeWhich(new Set(["af", "fr", "bd"])),
      runner,
      manifest,
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("below minimum");
  });

  test("--override downgrades a BLOCKED verdict to a logged WARNING and exits 0, without hiding the mismatch line", async () => {
    const { out, lines } = capture();
    const runner: Runner = async (bin) => {
      if (bin === "fr") return { stdout: "unknown command 'version'.", exitCode: 2 };
      if (bin === "af") return { stdout: "af version 0.1.3", exitCode: 0 };
      return { stdout: "bd version 1.0.0 (abc)", exitCode: 0 };
    };
    const code = await doctorCommand(["--override"], out, {
      which: fakeWhich(new Set(["af", "fr", "bd"])),
      runner,
      manifest,
    });
    const text = lines.join("\n");
    expect(code).toBe(0);
    expect(text).toContain("no version support"); // the original mismatch is still shown
    expect(text).toContain("WARNING");
    expect(text).not.toContain("rk doctor: OK");
  });
});

// ---------------------------------------------------------------------------------------------
// Live smoke test — env-gated, skipped by default. Documents the real machine's actual state
// (not a fake) rather than asserting a moving target as always-green.
// ---------------------------------------------------------------------------------------------

test.skipIf(!process.env.RK_DOCTOR_LIVE)(
  "live: real af/fr/bd on this machine (RK_DOCTOR_LIVE=1 to run) — documents the known-stale fr",
  async () => {
    const { out, lines } = capture();
    const code = await doctorCommand([], out);
    // Do not assert a fixed exit code here: this test's purpose is to observe and print the real
    // machine state (including the documented stale-fr mismatch), not to gate CI on a moving
    // target that changes the moment someone rebuilds a binary.
    console.log(lines.join("\n"));
    expect(typeof code).toBe("number");
  },
);
