// Integration tests for `rk init` (src/cli/init.ts, M1.2). Stamps into a real OS temp dir (edge
// test — not purity-scanned) and inspects the actual files written. git/fr/bd are mocked via
// injectable `which`/`spawn` so these tests never touch a real subprocess or the network; the
// live-fire transcript (session report) separately exercises the real binaries.

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initCommand, initHelp } from "../src/cli/init";
import { checkCommand } from "../src/cli/check";
import { parseFrontmatter } from "../src/gates/snapshot";
import { TEMPLATE_MANIFEST } from "../src/scaffold/templates-embed";
import { buildPreCommitHookScript } from "../src/scaffold/hooks";

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "rk-init-cli-"));
}

function noSpawnDeps() {
  const calls: { bin: string; args: string[]; cwd: string }[] = [];
  return {
    calls,
    which: (_bin: string) => null, // fr/bd absent by default
    spawn: async (bin: string, args: string[], cwd: string) => {
      calls.push({ bin, args, cwd });
      return { exitCode: 0, stderr: "" };
    },
  };
}

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("rk init: basic stamp", () => {
  test("stamps every manifest file and directory, all slots filled", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out, lines } = capture();
    const deps = noSpawnDeps();
    const code = await initCommand(["My Conjecture", "--root", root], out, deps);
    expect(code).toBe(0);

    for (const entry of TEMPLATE_MANIFEST.stamped) {
      const bare = entry.path.endsWith("/") ? entry.path.slice(0, -1) : entry.path;
      expect(existsSync(join(root, bare))).toBe(true);
    }

    const claude = readFileSync(join(root, "CLAUDE.md"), "utf8");
    expect(claude).not.toContain("{{RK_SLOT_");
    expect(claude).toContain("My Conjecture");
    expect(claude).toContain("exploration"); // PHASE stamped explicitly

    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    expect(agents).toBe(claude); // byte-identical constitution

    expect(lines.some((l) => l.startsWith("rk init: stamped"))).toBe(true);
  });

  test("PROJECT_NAME derives from the target directory basename", async () => {
    const parent = tmpRoot();
    dirs.push(parent);
    const root = join(parent, "my-conjecture");
    mkdirSync(root, { recursive: true });
    const { out } = capture();
    await initCommand(["North star statement", "--root", root], out, noSpawnDeps());
    const claude = readFileSync(join(root, "CLAUDE.md"), "utf8");
    expect(claude).toContain("my-conjecture");
  });

  test("SHARD_PREFIX derives deterministically from the project name (my-conjecture -> MC)", async () => {
    const parent = tmpRoot();
    dirs.push(parent);
    const root = join(parent, "my-conjecture");
    mkdirSync(root, { recursive: true });
    await initCommand(["North star", "--root", root], capture().out, noSpawnDeps());
    const config = JSON.parse(readFileSync(join(root, ".rk", "config.json"), "utf8"));
    expect(config.shardsPrefix).toBe("MC");
  });

  test("--shard-prefix overrides the derived prefix", async () => {
    const root = tmpRoot();
    dirs.push(root);
    await initCommand(["North star", "--root", root, "--shard-prefix", "XYZ"], capture().out, noSpawnDeps());
    const config = JSON.parse(readFileSync(join(root, ".rk", "config.json"), "utf8"));
    expect(config.shardsPrefix).toBe("XYZ");
  });
});

describe("rk init: required argument", () => {
  test("missing north-star contract: exit 2, nothing written", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out, lines } = capture();
    const code = await initCommand(["--root", root], out, noSpawnDeps());
    expect(code).toBe(2);
    expect(lines[0]).toContain("missing required");
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
  });
});

// rk-1r6: `rk init --help` (or `-h`) must never stamp a scaffold, and must never let the flag
// itself become the north-star contract. The `run()` dispatcher (src/cli.ts) intercepts --help
// before ever calling initCommand; these tests exercise initHelp/initCommand directly (the unit
// under this WP's scope) to prove BOTH layers refuse to write.
describe("rk init: -h/--help handling (rk-1r6)", () => {
  test("initHelp prints usage and exits 0, never touches the filesystem", () => {
    const { out, lines } = capture();
    const code = initHelp(out);
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("rk init");
    expect(lines.join("\n").toLowerCase()).toContain("usage");
  });

  test("a north-star contract starting with '-' is refused (never stamped as the literal flag)", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out, lines } = capture();
    const code = await initCommand(["--help", "--root", root], out, noSpawnDeps());
    expect(code).toBe(2);
    expect(lines[0]).toContain("refusing north-star contract");
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
  });

  test("any flag-shaped positional (not just --help) is refused the same way", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out, lines } = capture();
    const code = await initCommand(["--typo-flag", "--root", root], out, noSpawnDeps());
    expect(code).toBe(2);
    expect(lines[0]).toContain("refusing north-star contract");
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
  });
});

describe("rk init: PATH guidance for the pre-commit hook (rk-e8v)", () => {
  test("success output names the PATH requirement and the resolved binary path", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".git"), { recursive: true }); // hook only installed when .git exists
    const { out, lines } = capture();
    const deps = { ...noSpawnDeps(), resolveBinaryPath: () => "/opt/rk/bin/rk" };
    const code = await initCommand(["North star", "--root", root], out, deps);
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("PATH");
    expect(text).toContain("/opt/rk/bin/rk");
  });

  test("no PATH line when no git repo (no hook installed)", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out, lines } = capture();
    const code = await initCommand(["North star", "--root", root], out, noSpawnDeps());
    expect(code).toBe(0);
    expect(lines.some((l) => l.includes("PATH:"))).toBe(false);
  });
});

describe("pre-commit hook: rk-not-on-PATH fallback (rk-e8v)", () => {
  test("the hook script checks for rk on PATH and prints an actionable error before exec", () => {
    const script = buildPreCommitHookScript();
    expect(script).toContain("command -v rk");
    expect(script).toContain("not found on PATH");
    expect(script).toContain("exec rk check");
  });
});

describe("rk init: numeric flag validation", () => {
  test("--audit-cadence must be a positive integer", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out, lines } = capture();
    const code = await initCommand(["North star", "--root", root, "--audit-cadence", "abc"], out, noSpawnDeps());
    expect(code).toBe(2);
    expect(lines[0]).toContain("--audit-cadence");
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
  });

  test("--brittleness-soft-cap must be a positive integer", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out, lines } = capture();
    const code = await initCommand(["North star", "--root", root, "--brittleness-soft-cap", "-5"], out, noSpawnDeps());
    expect(code).toBe(2);
    expect(lines[0]).toContain("--brittleness-soft-cap");
  });

  test("valid overrides are honored in .rk/config.json and the constitution", async () => {
    const root = tmpRoot();
    dirs.push(root);
    await initCommand(["North star", "--root", root, "--audit-cadence", "5", "--brittleness-soft-cap", "40"], capture().out, noSpawnDeps());
    const config = JSON.parse(readFileSync(join(root, ".rk", "config.json"), "utf8"));
    expect(config.linkerBrittlenessSoftCap).toBe(40);
    const claude = readFileSync(join(root, "CLAUDE.md"), "utf8");
    expect(claude).toContain("40 nodes");
  });
});

describe("rk init: COMPUTE_BUDGET / MODEL_POLICY unset marker", () => {
  test("neither --budget nor --model-policy given: UNSET marker visible in the constitution", async () => {
    const root = tmpRoot();
    dirs.push(root);
    await initCommand(["North star", "--root", root], capture().out, noSpawnDeps());
    const claude = readFileSync(join(root, "CLAUDE.md"), "utf8");
    expect(claude).toContain("UNSET — fill in before first session");
  });

  test("--budget and --model-policy fill their slots when given", async () => {
    const root = tmpRoot();
    dirs.push(root);
    await initCommand(["North star", "--root", root, "--budget", "$500", "--model-policy", "sonnet everywhere"], capture().out, noSpawnDeps());
    const claude = readFileSync(join(root, "CLAUDE.md"), "utf8");
    expect(claude).toContain("$500");
    expect(claude).toContain("sonnet everywhere");
    expect(claude).not.toContain("UNSET — fill in before first session");
  });
});

describe("rk init: conflict detection (mutation-proof target b)", () => {
  test("a pre-existing .rk/ directory refuses to stamp, exit nonzero, nothing overwritten", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "config.json"), '{"sentinel": true}\n');
    const { out, lines } = capture();
    const code = await initCommand(["North star", "--root", root], out, noSpawnDeps());
    expect(code).not.toBe(0);
    expect(lines.some((l) => l.includes("refusing to stamp"))).toBe(true);
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
    const config = JSON.parse(readFileSync(join(root, ".rk", "config.json"), "utf8"));
    expect(config.sentinel).toBe(true); // untouched
  });

  test("a pre-existing CLAUDE.md refuses to stamp without --force", async () => {
    const root = tmpRoot();
    dirs.push(root);
    writeFileSync(join(root, "CLAUDE.md"), "hand-written content\n");
    const { out } = capture();
    const code = await initCommand(["North star", "--root", root], out, noSpawnDeps());
    expect(code).not.toBe(0);
    expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toBe("hand-written content\n");
  });

  test("--force overwrites an existing conflicting path", async () => {
    const root = tmpRoot();
    dirs.push(root);
    writeFileSync(join(root, "CLAUDE.md"), "hand-written content\n");
    const { out } = capture();
    const code = await initCommand(["North star", "--root", root, "--force"], out, noSpawnDeps());
    expect(code).toBe(0);
    const claude = readFileSync(join(root, "CLAUDE.md"), "utf8");
    expect(claude).not.toBe("hand-written content\n");
    expect(claude).toContain("North star");
  });

  test("an unrelated pre-existing file (not in the manifest) never blocks stamping", async () => {
    const root = tmpRoot();
    dirs.push(root);
    writeFileSync(join(root, "README.md"), "unrelated\n");
    const { out } = capture();
    const code = await initCommand(["North star", "--root", root], out, noSpawnDeps());
    expect(code).toBe(0);
  });
});

describe("rk init: conflict detection extends to non-manifest stamped paths (rk-ax5)", () => {
  test("a pre-existing .claude/settings.json refuses to stamp without --force, left untouched", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "settings.json"), '{"sentinel": true}\n');
    const { out, lines } = capture();
    const code = await initCommand(["North star", "--root", root], out, noSpawnDeps());
    expect(code).not.toBe(0);
    expect(lines.some((l) => l.includes("refusing to stamp"))).toBe(true);
    expect(lines.some((l) => l.includes(".claude/settings.json"))).toBe(true);
    const settings = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
    expect(settings.sentinel).toBe(true);
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
  });

  test("--force overwrites a pre-existing .claude/settings.json", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "settings.json"), '{"sentinel": true}\n');
    const { out } = capture();
    const code = await initCommand(["North star", "--root", root, "--force"], out, noSpawnDeps());
    expect(code).toBe(0);
    const settings = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
    expect(settings.sentinel).toBeUndefined();
    expect(settings.hooks).toBeDefined();
  });

  test("a pre-existing .git/hooks/pre-commit refuses to stamp without --force, left untouched", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".git", "hooks"), { recursive: true });
    writeFileSync(join(root, ".git", "hooks", "pre-commit"), "#!/bin/sh\necho hand-written\n");
    const { out, lines } = capture();
    const code = await initCommand(["North star", "--root", root], out, noSpawnDeps());
    expect(code).not.toBe(0);
    expect(lines.some((l) => l.includes("refusing to stamp"))).toBe(true);
    expect(lines.some((l) => l.includes(".git/hooks/pre-commit"))).toBe(true);
    expect(readFileSync(join(root, ".git", "hooks", "pre-commit"), "utf8")).toContain("hand-written");
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
  });

  test("--force overwrites a pre-existing .git/hooks/pre-commit", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".git", "hooks"), { recursive: true });
    writeFileSync(join(root, ".git", "hooks", "pre-commit"), "#!/bin/sh\necho hand-written\n");
    const { out } = capture();
    const code = await initCommand(["North star", "--root", root, "--force"], out, noSpawnDeps());
    expect(code).toBe(0);
    const hook = readFileSync(join(root, ".git", "hooks", "pre-commit"), "utf8");
    expect(hook).not.toContain("hand-written");
    expect(hook).toContain("rk check");
  });
});

describe("rk init: git init", () => {
  test("git init is invoked when .git is absent", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const deps = noSpawnDeps();
    await initCommand(["North star", "--root", root], capture().out, deps);
    expect(deps.calls.some((c) => c.bin === "git" && c.args.join(" ") === "init")).toBe(true);
  });

  test("git init is NOT invoked when .git already exists", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".git"), { recursive: true });
    const deps = noSpawnDeps();
    await initCommand(["North star", "--root", root], capture().out, deps);
    expect(deps.calls.some((c) => c.bin === "git")).toBe(false);
  });

  test("a pre-commit hook is installed, executable, running rk check", async () => {
    const root = tmpRoot();
    dirs.push(root);
    mkdirSync(join(root, ".git"), { recursive: true });
    await initCommand(["North star", "--root", root], capture().out, noSpawnDeps());
    const hookPath = join(root, ".git", "hooks", "pre-commit");
    expect(existsSync(hookPath)).toBe(true);
    expect(readFileSync(hookPath, "utf8")).toContain("rk check");
    const mode = statSync(hookPath).mode & 0o111;
    expect(mode).not.toBe(0); // at least one executable bit set
  });
});

describe("rk init: fr/bd best-effort bootstrap", () => {
  test("fr and bd absent from PATH: warnings printed, exit code still 0", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out, lines } = capture();
    const code = await initCommand(["North star", "--root", root], out, noSpawnDeps());
    expect(code).toBe(0);
    expect(lines.some((l) => l.includes("'fr' not found on PATH"))).toBe(true);
    expect(lines.some((l) => l.includes("'bd' not found on PATH"))).toBe(true);
    expect(lines.some((l) => l.includes("fr: skipped"))).toBe(true);
    expect(lines.some((l) => l.includes("bd: skipped"))).toBe(true);
  });

  test("fr and bd present on PATH: both invoked with the expected arguments", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const deps = noSpawnDeps();
    deps.which = (bin: string) => (bin === "fr" || bin === "bd" ? `/usr/bin/${bin}` : null);
    const { out, lines } = capture();
    const code = await initCommand(["The north star", "--root", root], out, deps);
    expect(code).toBe(0);
    const frCall = deps.calls.find((c) => c.bin === "fr");
    expect(frCall?.args).toEqual(["init", "The north star"]);
    const bdCall = deps.calls.find((c) => c.bin === "bd");
    expect(bdCall?.args).toEqual(["init", "--non-interactive", "--skip-agents", "--skip-hooks"]);
    expect(lines.some((l) => l.includes("fr: ok"))).toBe(true);
    expect(lines.some((l) => l.includes("bd: ok"))).toBe(true);
  });
});

describe("rk init: .rk/ stub files", () => {
  test(".rk/oracles.json is an empty-but-documented stub", async () => {
    const root = tmpRoot();
    dirs.push(root);
    await initCommand(["North star", "--root", root], capture().out, noSpawnDeps());
    const oracles = JSON.parse(readFileSync(join(root, ".rk", "oracles.json"), "utf8"));
    expect(oracles.oracles).toEqual([]);
    expect(typeof oracles.$schema_note).toBe("string");
  });

  test(".rk/template-version carries the manifest's template_version", async () => {
    const root = tmpRoot();
    dirs.push(root);
    await initCommand(["North star", "--root", root], capture().out, noSpawnDeps());
    const version = readFileSync(join(root, ".rk", "template-version"), "utf8").trim();
    expect(version).toBe(TEMPLATE_MANIFEST.template_version);
  });

  test(".claude/settings.json carries the five documented hooks", async () => {
    const root = tmpRoot();
    dirs.push(root);
    await initCommand(["North star", "--root", root], capture().out, noSpawnDeps());
    const settings = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
    expect(settings.hooks.SessionStart[0].hooks.map((h: { command: string }) => h.command)).toEqual(["bd prime", "fr board"]);
    expect(settings.hooks.UserPromptSubmit[0].hooks.map((h: { command: string }) => h.command)).toEqual(["fr turn-begin", "fr board"]);
    expect(settings.hooks.Stop[0].hooks.map((h: { command: string }) => h.command)).toEqual(["fr check"]);
    expect(settings.hooks.PreCompact[0].hooks.map((h: { command: string }) => h.command)).toEqual(["bd prime"]);
  });
});

// Generality audit 2026-07-25, finding M1: `rk init` probed `fr` and `bd` and warned loudly when
// either was missing, but never probed `af` — the validity kernel the whole hard tier and the
// rigour ladder's `proved` rung depend on. Its absence surfaced only much later, inside
// `rk verify`, after the user had already built a campaign on top of it.
describe("rk init: af probe (finding M1)", () => {
  test("af absent from PATH: a loud warning naming what depends on it, exit code still 0", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out, lines } = capture();
    const code = await initCommand(["North star", "--root", root], out, noSpawnDeps());
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("'af' not found on PATH");
    // The warning must say WHAT breaks, or it is noise a user rationally ignores.
    expect(text).toContain("rk verify");
    expect(text.toLowerCase()).toContain("proved");
    expect(lines.some((l) => l.includes("af: skipped"))).toBe(true);
  });

  test("af present on PATH: reported ok, and NEVER invoked (rk init runs no af subcommand)", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const deps = noSpawnDeps();
    deps.which = (bin: string) => (bin === "af" ? "/usr/bin/af" : null);
    const { out, lines } = capture();
    const code = await initCommand(["North star", "--root", root], out, deps);
    expect(code).toBe(0);
    expect(lines.some((l) => l.includes("af: ok"))).toBe(true);
    expect(lines.some((l) => l.includes("'af' not found on PATH"))).toBe(false);
    expect(deps.calls.some((c) => c.bin === "af")).toBe(false);
  });
});

// Finding M3: PRD C2's critical-path provenance check — "every node on the path to the north-star
// contract must carry cross-vendor, non-batch validation provenance, checked continuously on every
// link run" — is the tool's central continuous validity guarantee, and it is presence-conditional
// on `.rk/config.json`'s `northStarId`. Stamped without one, it has an EMPTY path to check in
// every repo rk creates: it reports satisfied while covering nothing.
describe("rk init: the north star is bound, not just narrated (finding M3)", () => {
  const NORTH_STAR = "Every widget with property P is close to a gadget";

  async function stamp(): Promise<string> {
    const root = tmpRoot();
    dirs.push(root);
    await initCommand([NORTH_STAR, "--root", root], capture().out, noSpawnDeps());
    return root;
  }

  test("a north-star registry shard is seeded and .rk/config.json's northStarId resolves to it", async () => {
    const root = await stamp();
    const config = JSON.parse(readFileSync(join(root, ".rk", "config.json"), "utf8"));
    expect(typeof config.northStarId).toBe("string");
    const shardPath = join(root, "argument", `${config.northStarId}.md`);
    expect(existsSync(shardPath)).toBe(true);
    // The binding is only real if the shard's own id agrees — Gate 2 keys everything off `id`.
    const fm = parseFrontmatter(readFileSync(shardPath, "utf8"));
    expect(fm.present).toBe(true);
    expect(fm.fields.id).toBe(config.northStarId);
  });

  test("the seeded shard's contract is the argument byte-for-byte (the anti-drift join key)", async () => {
    const root = await stamp();
    const config = JSON.parse(readFileSync(join(root, ".rk", "config.json"), "utf8"));
    const fm = parseFrontmatter(readFileSync(join(root, "argument", `${config.northStarId}.md`), "utf8"));
    expect(fm.fields.contract).toBe(NORTH_STAR);
    // The same string the constitution stamps, so the two can never disagree at stamp time.
    expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toContain(NORTH_STAR);
  });

  test("the critical-path provenance check reports a non-empty path on the freshly stamped repo", async () => {
    const root = await stamp();
    const { out, lines } = capture();
    await checkCommand(["--root", root], out);
    const linkerLine = lines.find((l) => l.startsWith("checked linker:"));
    expect(linkerLine).toBeDefined();
    // The vacuous state the finding is about. If this string ever comes back on a fresh scaffold,
    // the guarantee covers nothing again.
    expect(linkerLine).not.toContain("no north star configured");
    expect(linkerLine).toMatch(/critical-path provenance: \d+ checked \/ [1-9]\d* on path/);
  });

  test("a freshly stamped scaffold is still green in BOTH phases with the seeded shard", async () => {
    for (const phase of ["exploration", "consolidation"] as const) {
      const root = await stamp();
      const cfgPath = join(root, ".rk", "config.json");
      const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
      cfg.phase = phase;
      writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);
      const { out, lines } = capture();
      const code = await checkCommand(["--root", root], out);
      expect({ phase, code, errors: lines.filter((l) => l.startsWith("ERROR")) }).toEqual({ phase, code: 0, errors: [] });
    }
  });

  test("a multi-line north-star contract is refused — it cannot be a one-line shard contract", async () => {
    const root = tmpRoot();
    dirs.push(root);
    const { out, lines } = capture();
    const code = await initCommand(["line one\nline two", "--root", root], out, noSpawnDeps());
    expect(code).toBe(2);
    expect(lines[0]).toContain("one line");
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
  });
});
