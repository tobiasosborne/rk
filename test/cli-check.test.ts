import { afterAll, describe, expect, mock, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { checkCommand } from "../src/cli/check";
import { GATES } from "../src/gates/index";
import { renderDag, renderIndex } from "../src/gates/linker-render";

const RK_REPO_ROOT = join(import.meta.dir, "..");

// Gates are ported from the M0.3 skeleton state (docs/cli/check.ts header, "M0.3 skeleton
// state: every gate is currently a stub") to real implementations one at a time; at the time of
// writing only `provenance` remains notImplemented. This file must keep passing regardless of
// which gate(s) currently carry `notImplemented: true` — it derives the gate set from the
// GATES registry (src/gates/index.ts) rather than hardcoding any gate's stub/real status, per
// this WP's brief.

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

/** Every finding line must match the shared `SEVERITY path:line message` format
 * (docs/gate-contracts.md, Shared conventions, "Finding format"). */
const FINDING_RE = /^(ERROR|WARN) \S+:\d+ .+$/;

/** Every gate's coverage line must match `checked <gate>: <N>/<M> <unit> (<E> errors, <W>
 * warnings)` (docs/gate-contracts.md, Shared conventions, "Coverage line") — even when N===M===0
 * (CLAUDE.md L2: "a skip is always visible with a count"). */
function coverageRegex(name: string): RegExp {
  return new RegExp(`^checked ${name}: \\d+/\\d+ .+ \\(\\d+ errors, \\d+ warnings\\)$`, "m");
}

function errorCountFor(text: string, name: string): number {
  const m = new RegExp(`^checked ${name}: \\d+/\\d+ .+ \\((\\d+) errors, \\d+ warnings\\)$`, "m").exec(text);
  if (!m) throw new Error(`no coverage line found for gate '${name}' in:\n${text}`);
  return Number(m[1]);
}

/** Builds a fresh, content-empty repo tree that satisfies every gate's own "day-1 vacuity" /
 * generated-freshness requirement simultaneously — the scaffold-file existence gate 6 (shards)
 * unconditionally demands (report/main.tex, report/README.md, report/SHARD_CATALOG.md, plus the
 * report/sections/ DIRECTORY itself — Gate 6 Check 1, check-report-shards.sh:23; empty here since
 * there are no shards yet — rk-399) and the byte-exact generated-freshness gate 2 (linker) demands
 * (argument/INDEX.md, argument/DAG.md must byte-equal a fresh render of the empty lemma set —
 * Gate 2 Check 11, "an absent committed file also counts as stale"). This is deliberately NOT the
 * same as a literally bare directory: see the "bare tree" test below for why those two are
 * different contract states. */
function writeGoldenScaffold(root: string): void {
  mkdirSync(join(root, "report"), { recursive: true });
  mkdirSync(join(root, "report", "sections"), { recursive: true }); // exists but empty (no shards yet)
  mkdirSync(join(root, "argument"), { recursive: true });
  writeFileSync(join(root, "report", "main.tex"), "\\documentclass{article}\n\\begin{document}\n\\end{document}\n");
  writeFileSync(join(root, "report", "README.md"), "# report/ map\n\nNo shards yet -- empty scaffold.\n");
  writeFileSync(join(root, "report", "SHARD_CATALOG.md"), "# SHARD_CATALOG\n\nNo shards yet.\n");
  writeFileSync(join(root, "argument", "INDEX.md"), renderIndex([]));
  writeFileSync(join(root, "argument", "DAG.md"), renderDag([]));
}

describe("rk check", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  test("a fresh, content-empty scaffold: every registered gate contributes one line (coverage or NOT IMPLEMENTED), and rk check exits 0 (Shared conventions: 0 ERRORs -> exit 0; L2 no silent skips)", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-check-golden-"));
    dirs.push(root);
    writeGoldenScaffold(root);

    const { out, lines } = capture();
    const code = await run(["check", "--root", root], { out });
    const text = lines.join("\n");

    // Composition (docs/gate-contracts.md Shared conventions): all six registered gates run
    // unconditionally and each contributes exactly one visible line — a loud NOT IMPLEMENTED
    // marker for a stub, or a coverage line with explicit N/M counts and an explicit error/warning
    // breakdown for an implemented gate. Derived from the registry, never a hardcoded gate list,
    // so this assertion survives any gate (e.g. provenance) flipping from stub to real.
    for (const gate of GATES) {
      const isStub = text.includes(`gate ${gate.name}: NOT IMPLEMENTED`);
      if (isStub) continue;
      expect(text).toMatch(coverageRegex(gate.name));
      // A gate that is actually implemented must report 0 ERRORs on this day-1 scaffold — every
      // one of the six gates' contracts documents day-1/empty-set vacuity as a legitimate green
      // state (defs: 0 shards; refs: 0 externals; linker: 0 lemma shards, generated files match a
      // fresh render of the empty set; runs: 0 bundles, "Day-1 vacuity"; provenance: 0 registry
      // results/claim rows/tab:status rows; shards: empty-scaffold exemption).
      expect(errorCountFor(text, gate.name)).toBe(0);
    }

    expect(code).toBe(0);
    expect(text).toContain("rk check: OK");
  });

  test("a literally bare tree (no scaffold files at all) is NOT a legitimate day-1-vacuity state: gate 6's unconditional master/README/catalog existence check and gate 2's generated-freshness check both fire real ERRORs, so rk check exits 1", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-check-bare-"));
    dirs.push(root);
    // Deliberately nothing written under root at all.

    const { out, lines } = capture();
    const code = await run(["check", "--root", root], { out });
    const text = lines.join("\n");

    // Gate 6 (shards) Check 1: report/main.tex, report/README.md, report/SHARD_CATALOG.md are
    // required unconditionally, independent of the empty-scaffold exemption (which only applies
    // once those files exist and name zero shards).
    expect(text).toContain("ERROR report/main.tex:1 missing master report/main.tex");
    expect(text).toContain("ERROR report/README.md:1 missing report map report/README.md");
    expect(text).toContain("ERROR report/SHARD_CATALOG.md:1 missing shard catalog report/SHARD_CATALOG.md");
    // Gate 2 (linker) Check 11: an absent committed generated file counts as stale (compares
    // against "").
    expect(text).toContain("argument/INDEX.md is STALE");
    expect(text).toContain("argument/DAG.md is STALE");

    // Shared conventions "Exit codes": 0 ERRORs -> 0, >=1 ERROR -> 1. This tree has several.
    expect(code).toBe(1);
    expect(text).toContain("rk check: FAILED (>=1 ERROR above).");
  });

  test("no short-circuit: a single forced ERROR in one gate (defs) still lets every other registered gate run and report its own line, and every printed finding matches the shared finding-format contract (docs/gate-contracts.md Shared conventions: 'Composition' + 'Finding format')", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-check-nosplit-"));
    dirs.push(root);
    writeGoldenScaffold(root);
    mkdirSync(join(root, "definitions"), { recursive: true });
    // Missing 'term'/'kind'/'status' -> three defs ERRORs (Gate 1 Check 3), nothing else touched.
    writeFileSync(join(root, "definitions", "bad.md"), "---\nid: bad\n---\n");

    const { out, lines } = capture();
    const code = await run(["check", "--root", root], { out });
    const text = lines.join("\n");

    expect(code).toBe(1);
    expect(text).toContain("rk check: FAILED (>=1 ERROR above).");

    // The forcing ERROR itself, in the shared finding format (path:line defaults to 1 — no
    // frontmatter field resolves to a specific source line, docs/gate-contracts.md Shared
    // conventions "Finding format").
    expect(text).toContain("ERROR definitions/bad.md:1 missing required field 'term'");
    expect(text).toContain("ERROR definitions/bad.md:1 missing required field 'kind'");
    expect(text).toContain("ERROR definitions/bad.md:1 missing required field 'status'");
    expect(errorCountFor(text, "defs")).toBe(3);

    // Deviation from check-all.sh's fail()-and-exit-at-first-failure: every OTHER registered gate
    // still contributed its own line (coverage or NOT IMPLEMENTED), and every gate besides the
    // deliberately-broken 'defs' reports 0 ERRORs of its own.
    for (const gate of GATES) {
      const isStub = text.includes(`gate ${gate.name}: NOT IMPLEMENTED`);
      if (isStub) continue;
      expect(text).toMatch(coverageRegex(gate.name));
      if (gate.name !== "defs") expect(errorCountFor(text, gate.name)).toBe(0);
    }

    // Every printed ERROR/WARN line — across all gates — obeys the one shared finding format.
    const findingLines = text.split("\n").filter((l) => l.startsWith("ERROR ") || l.startsWith("WARN "));
    expect(findingLines.length).toBeGreaterThan(0);
    for (const line of findingLines) expect(line).toMatch(FINDING_RE);
  });

  // round-3 landing-blocker 3: `loadSnapshot` runs BEFORE the per-gate exception boundary
  // (src/cli/check.ts), so an uncaught throw there used to kill the whole composed check and drop
  // all six coverage lines, violating unconditional composition (gate-contracts.md). Snapshot
  // loading must now fail LOUDLY and COMPOSED — a single <snapshot-load> ERROR, a crash-marked
  // coverage line for every registered gate, exit 1 — never an uncaught process exit. The lstat
  // symlink policy makes the loader effectively total, so this boundary is fault-injected via the
  // injected loader seam (checkCommand's 3rd param), the deterministic analogue of the mock.module
  // seam the per-gate-crash test below uses.
  test("snapshot-load failure is a loud COMPOSED failure (one <snapshot-load> ERROR, every gate's coverage line marked, exit 1), never an uncaught process exit (blocker 3, gate-contracts.md Composition)", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-check-snaploadfail-"));
    dirs.push(root);

    const { out, lines } = capture();
    const code = await checkCommand(["--root", root], out, () => {
      throw new Error("boom: simulated snapshot-load failure (fault injection, not a real loader bug)");
    });
    const text = lines.join("\n");

    // One loud ERROR under the <snapshot-load> sentinel path (never a real repo-relative path,
    // same convention as the <gate:NAME> crash sentinel), carrying the underlying cause.
    expect(text).toContain("ERROR <snapshot-load>:1");
    expect(text).toContain("boom: simulated snapshot-load failure");

    // Composition preserved: every registered gate still gets a coverage line, and each reads
    // unambiguously as a load failure (never a silent pass-shaped 0/0 day-1-vacuity line).
    for (const gate of GATES) {
      expect(text).toMatch(
        new RegExp(`^checked ${gate.name}: 0/0 SNAPSHOT LOAD FAILED .* \\(\\d+ errors, \\d+ warnings\\)$`, "m"),
      );
    }
    // Every printed finding line still obeys the shared finding format (the sentinel ERROR too).
    for (const line of text.split("\n").filter((l) => l.startsWith("ERROR ") || l.startsWith("WARN "))) {
      expect(line).toMatch(FINDING_RE);
    }

    expect(code).toBe(1);
    expect(text).toContain("rk check: FAILED (snapshot load error");
  });

  test("top-level help now mentions 'rk check' as a next step", async () => {
    const { out, lines } = capture();
    const code = await run([], { out });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("rk check");
  });

  // M1.3 (`rk phase exploration|consolidation`, docs/gate-contracts.md "Phase matrix"): end-to-end
  // proof that `rk check` applies the fixed phase matrix through the real CLI composition path
  // (src/cli/check.ts calling src/gates/phase.ts's applyPhase), not just the pure unit tests in
  // test/gates/phase.test.ts / phase-classification.test.ts. Must also run BEFORE the
  // `mock.module` test below, same reason as `--selftest` just below it.
  describe("rk check — M1.3 phase matrix", () => {
    test("default (no .rk/config.json): consolidation, full set blocks — byte-identical to pre-M1.3 behavior", async () => {
      const root = mkdtempSync(join(tmpdir(), "rk-check-phase-default-"));
      dirs.push(root);
      writeGoldenScaffold(root);
      mkdirSync(join(root, "definitions"), { recursive: true });
      // Non-structural (schema completeness) ERROR — would demote in exploration, must NOT here.
      writeFileSync(join(root, "definitions", "bad.md"), "---\nid: bad\n---\n");

      const { out, lines } = capture();
      const code = await run(["check", "--root", root], { out });
      const text = lines.join("\n");

      expect(text).toContain("ERROR definitions/bad.md:1 missing required field 'term'");
      expect(code).toBe(1);
      expect(text).toContain("rk check: FAILED (>=1 ERROR above).");
    });

    test("exploration: a non-structural ERROR (missing required field) demotes to WARN and rk check exits 0", async () => {
      const root = mkdtempSync(join(tmpdir(), "rk-check-phase-explore-"));
      dirs.push(root);
      writeGoldenScaffold(root);
      mkdirSync(join(root, ".rk"), { recursive: true });
      writeFileSync(join(root, ".rk", "config.json"), JSON.stringify({ phase: "exploration" }));
      mkdirSync(join(root, "definitions"), { recursive: true });
      writeFileSync(join(root, "definitions", "bad.md"), "---\nid: bad\n---\n");

      const { out, lines } = capture();
      const code = await run(["check", "--root", root], { out });
      const text = lines.join("\n");

      // Demoted: printed as WARN, carrying the advisory-phase suffix, message content preserved.
      expect(text).toContain("WARN definitions/bad.md:1 missing required field 'term' [advisory in exploration phase");
      expect(text).not.toContain("ERROR definitions/bad.md:1 missing required field 'term'");
      // L2: still counted, never a silent skip — the defs coverage line's warning count reflects it.
      expect(text).toMatch(/checked defs: \d+\/\d+ .*\(0 errors, \d+ warnings\)/);
      expect(code).toBe(0);
      expect(text).toContain("rk check: OK");
    });

    test("exploration: a STRUCTURAL ERROR (DRIFT, duplicate alias) still blocks — only non-structural findings are advisory", async () => {
      const root = mkdtempSync(join(tmpdir(), "rk-check-phase-explore-structural-"));
      dirs.push(root);
      writeGoldenScaffold(root);
      mkdirSync(join(root, ".rk"), { recursive: true });
      writeFileSync(join(root, ".rk", "config.json"), JSON.stringify({ phase: "exploration" }));
      mkdirSync(join(root, "definitions"), { recursive: true });
      writeFileSync(
        join(root, "definitions", "a.md"),
        "---\nid: a\nterm: Same\nkind: original\nstatus: locked\nconsensus: x\n---\n",
      );
      writeFileSync(
        join(root, "definitions", "b.md"),
        "---\nid: b\nterm: Same\nkind: original\nstatus: locked\nconsensus: x\n---\n",
      );

      const { out, lines } = capture();
      const code = await run(["check", "--root", root], { out });
      const text = lines.join("\n");

      expect(text).toContain("ERROR definitions/b.md:1 DRIFT: name 'Same' claimed by both");
      expect(text).not.toContain("WARN definitions/b.md:1 DRIFT");
      expect(code).toBe(1);
      expect(text).toContain("rk check: FAILED (>=1 ERROR above).");
    });
  });

  // rk-bdd (2026-07-18 M0.3 re-review finding 7): IMPLEMENTATION_PLAN.md:76 (M0.2 acceptance)
  // names `rk check --selftest` as the interface that runs the red corpus — these three tests
  // must run BEFORE the `mock.module` test below (its own comment explains why it must run LAST:
  // it patches "../src/gates/index" file-wide with no restore, and `--selftest`'s corpus runner
  // reads that same GATES registry via src/corpus/run.ts).
  describe("rk check --selftest (rk-bdd finding 7)", () => {
    test("runs the real corpus against the rk repo's own corpus/ tree and exits 0", async () => {
      const { out, lines } = capture();
      const code = await run(["check", "--selftest", "--root", RK_REPO_ROOT], { out });
      const text = lines.join("\n");

      // Same runner, same report shape as `bun run selftest` (src/corpus/report.ts).
      expect(text).toMatch(/^checked corpus\/defs: \d+\/\d+ fixtures passed$/m);
      expect(text).toMatch(/^checked corpus-run: \d+\/\d+ fixtures passed$/m);
      expect(text).toContain("rk check --selftest: OK");
      expect(code).toBe(0);
    });

    test("a --root with no corpus/ directory is a loud ERROR, never a silent pass (L2)", async () => {
      const root = mkdtempSync(join(tmpdir(), "rk-check-selftest-nocorpus-"));
      dirs.push(root);
      // Deliberately no corpus/ directory under root at all.

      const { out, lines } = capture();
      const code = await run(["check", "--selftest", "--root", root], { out });
      const text = lines.join("\n");

      expect(text).toContain("ERROR no corpus directory found");
      expect(text).toContain(join(root, "corpus"));
      // Never the silent-pass shape a missing/empty corpus could otherwise print.
      expect(text).not.toContain("rk check --selftest: OK");
      expect(code).toBe(1);
    });

    test("a fixture failure in the corpus fails --selftest's exit code and names the fixture", async () => {
      const root = mkdtempSync(join(tmpdir(), "rk-check-selftest-badcorpus-"));
      dirs.push(root);
      // Copies the REAL corpus/ tree (all six gate directories, the full 87-fixture ledger
      // total) rather than a synthetic one-fixture tree: the round-3 review follow-up 2 guard
      // below (missing/empty gate directory, ledger-count mismatch) would otherwise reject a
      // partial corpus before a single fixture ever ran, which is exactly the failure mode this
      // test predates and must not accidentally trip.
      const corpusRoot = join(root, "corpus");
      cpSync(join(RK_REPO_ROOT, "corpus"), corpusRoot, { recursive: true });
      // Deliberately corrupt one real fixture's expected.json so it disagrees with what the real
      // defs gate actually produces on its own repo/ — flipping verdict/exit_code guarantees a
      // verdict mismatch regardless of that fixture's specific findings.
      const mutatedExpectedPath = join(corpusRoot, "defs", "defs-01", "expected.json");
      const original = JSON.parse(readFileSync(mutatedExpectedPath, "utf8"));
      writeFileSync(
        mutatedExpectedPath,
        JSON.stringify({ ...original, verdict: "pass", exit_code: 0 }),
      );

      const { out, lines } = capture();
      const code = await run(["check", "--selftest", "--root", root], { out });
      const text = lines.join("\n");

      expect(text).toContain("ERROR corpus/defs/defs-01:");
      expect(text).toContain("verdict mismatch");
      expect(text).toContain("rk check --selftest: FAILED");
      expect(code).toBe(1);
    });

    // M0.3 round-3 review follow-up 2 (check.ts:89): an existing-but-empty/incomplete corpus/
    // used to pass silently (a missing gate directory becomes an empty fixture list, reported as
    // a pass-shaped "0/0 fixtures passed"). These two tests pin the loud-failure fix.
    test("an existing corpus/ missing one of the six gate directories entirely is a loud ERROR, never a silent 0/0 pass", async () => {
      const root = mkdtempSync(join(tmpdir(), "rk-check-selftest-missinggatedir-"));
      dirs.push(root);
      // Only 'defs' exists; 'linker', 'refs', 'provenance', 'runs', 'shards' are entirely absent.
      const fixtureDir = join(root, "corpus", "defs", "defs-01");
      mkdirSync(join(fixtureDir, "repo"), { recursive: true });
      writeFileSync(
        join(fixtureDir, "expected.json"),
        JSON.stringify({ gate: "defs", verdict: "pass", findings: [], exit_code: 0 }),
      );

      const { out, lines } = capture();
      const code = await run(["check", "--selftest", "--root", root], { out });
      const text = lines.join("\n");

      expect(text).toContain("ERROR corpus/ exists");
      expect(text).toContain("absent or empty");
      for (const g of ["linker", "refs", "provenance", "runs", "shards"]) {
        expect(text).toContain(`corpus/${g}`);
      }
      expect(text).not.toContain("rk check --selftest: OK");
      expect(code).toBe(1);
    });

    test("an existing corpus/ where every gate directory exists but one is empty is a loud ERROR, never a silent 0/0 pass for that gate", async () => {
      const root = mkdtempSync(join(tmpdir(), "rk-check-selftest-emptygatedir-"));
      dirs.push(root);
      for (const g of ["defs", "linker", "refs", "provenance", "runs", "shards"]) {
        mkdirSync(join(root, "corpus", g), { recursive: true });
      }
      // Every directory exists, but 'runs' has zero fixture subdirectories inside it.
      const fixtureDir = join(root, "corpus", "defs", "defs-01");
      mkdirSync(join(fixtureDir, "repo"), { recursive: true });
      writeFileSync(
        join(fixtureDir, "expected.json"),
        JSON.stringify({ gate: "defs", verdict: "pass", findings: [], exit_code: 0 }),
      );

      const { out, lines } = capture();
      const code = await run(["check", "--selftest", "--root", root], { out });
      const text = lines.join("\n");

      expect(text).toContain("ERROR corpus/ exists");
      expect(text).toContain("corpus/runs");
      expect(text).not.toContain("rk check --selftest: OK");
      expect(code).toBe(1);
    });
  });

  // rk-6r3 / M0.3 review finding 7, second half: cli/check.ts:25 had no per-gate exception
  // boundary, so one gate's unexpected throw (e.g. the refs.ts:138 null-external bug this same
  // finding fixes on the gate side, corpus/refs/refs-08) killed every later gate's coverage line
  // too, violating "unconditional composition" (gate-contracts.md:85). This test injects a fake
  // gate that always throws — via Bun's `mock.module`, which retroactively overrides the already
  // statically-imported "../src/gates/index" binding `checkCommand` reads (verified: Bun resolves
  // the specifier to an absolute module and patches live bindings for modules that imported it
  // before this call too, not just future imports) — since GATES is a fixed top-level array with
  // no other production seam for fault injection. `mock.module` has file-wide effect and does not
  // auto-restore, so this test deliberately runs LAST in this file/describe block, after every
  // other test that reads the real `GATES` array.
  test("per-gate exception boundary: an unexpected throw in one gate becomes a loud synthetic ERROR (never a silent pass), its coverage line reads as a crash, and every other gate still runs (defense-in-depth, gate-contracts.md:85)", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-check-boundary-"));
    dirs.push(root);
    writeGoldenScaffold(root);

    const realOtherGates = GATES.filter((g) => g.name !== "defs");
    mock.module("../src/gates/index", () => ({
      GATES: [
        {
          name: "defs",
          run: () => {
            throw new Error("boom: simulated gate crash (fault injection, not a real defs bug)");
          },
        },
        ...realOtherGates,
      ],
    }));

    const { out, lines } = capture();
    const code = await run(["check", "--root", root], { out });
    const text = lines.join("\n");

    // The crash becomes a loud synthetic ERROR finding for the crashed gate, never an uncaught
    // exception that kills the process. rk-bdd finding 9: the synthetic finding's path is the
    // `<gate:NAME>` sentinel, never a bare gate name — framework.ts's Finding.path contract is a
    // real repo-relative path, and a bare name like `defs` could both misread as a truncated real
    // path and coincidentally collide with an actual file named `defs` in the checked repo.
    expect(text).toContain("ERROR <gate:defs>:1 gate 'defs' CRASHED");
    expect(text).toContain("boom: simulated gate crash");

    // The crashed gate's own coverage line reads unambiguously as a crash, never a silent
    // pass-shaped "0/0 ... (0 errors, 0 warnings)" (a bare 0/0 elsewhere in this contract IS a
    // legitimate day-1-vacuity pass, so the crash must not merely resemble one).
    expect(text).toContain("checked defs: 0/0 GATE CRASHED");
    expect(text).not.toMatch(/checked defs: 0\/0 .*\(0 errors, 0 warnings\)/);
    expect(text).toMatch(/checked defs: 0\/0 GATE CRASHED.*\(1 errors, 0 warnings\)/);

    // No short-circuit: every other registered (non-stub) gate still ran and printed its own
    // coverage line, exactly as the composition contract requires.
    for (const gate of realOtherGates) {
      const isStub = text.includes(`gate ${gate.name}: NOT IMPLEMENTED`);
      if (isStub) continue;
      expect(text).toMatch(coverageRegex(gate.name));
    }

    // A crashed gate's synthetic ERROR still fails the composed exit code, same as any real one.
    expect(code).toBe(1);
    expect(text).toContain("rk check: FAILED (>=1 ERROR above).");
  });
});
