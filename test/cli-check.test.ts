import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { GATES } from "../src/gates/index";
import { renderDag, renderIndex } from "../src/gates/linker-render";

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
 * unconditionally demands (report/main.tex, report/README.md, report/SHARD_CATALOG.md — Gate 6
 * Check 1) and the byte-exact generated-freshness gate 2 (linker) unconditionally demands
 * (argument/INDEX.md, argument/DAG.md must byte-equal a fresh render of the empty lemma set —
 * Gate 2 Check 11, "an absent committed file also counts as stale"). This is deliberately NOT the
 * same as a literally bare directory: see the "bare tree" test below for why those two are
 * different contract states. */
function writeGoldenScaffold(root: string): void {
  mkdirSync(join(root, "report"), { recursive: true });
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

  test("top-level help now mentions 'rk check' as a next step", async () => {
    const { out, lines } = capture();
    const code = await run([], { out });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("rk check");
  });
});
