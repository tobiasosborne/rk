// Tests for `rk render` (src/cli/render.ts, M2.4): builds a small real repo tree, renders the
// self-contained site to a temp --out dir, and asserts the edge wrote index.html with the expected
// content. Same harness shape as test/cli-graph.test.ts — a real registry reader,
// afCommand/frCommand pointed at a guaranteed-absent binary so the test needs no af/fr install. The
// render CORE is exhaustively tested in test/render/; this file only proves the fs/CLI edge.

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { renderCommand } from "../src/cli/render";

const ABSENT = ["definitely-not-a-real-binary-xyz"];
const FAKE_FR = [Bun.which("bun")!, join(import.meta.dir, "render", "fixtures", "fake-fr.ts")];

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

function writeShard(root: string, id: string, extra: Record<string, string> = {}): void {
  mkdirSync(join(root, "argument"), { recursive: true });
  const fm = { id, kind: "lemma", contract: `${id} holds.`, status: "open", af: "none", ...extra };
  const body = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n");
  writeFileSync(join(root, "argument", `${id}.md`), `---\n${body}\n---\n\n${id}'s narrative.\n`);
}

describe("rk render — CLI edge", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  function repo(): string {
    const root = mkdtempSync(join(tmpdir(), "rk-render-cli-"));
    dirs.push(root);
    writeShard(root, "lem-base", { status: "cited" });
    writeShard(root, "thm-main", { status: "open", deps: "lem-base" });
    return root;
  }

  test("writes a self-contained index.html to the default out dir, exit 0", async () => {
    const root = repo();
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    const index = join(root, "build", "site", "index.html");
    expect(existsSync(index)).toBe(true);
    const html = readFileSync(index, "utf8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("rk-dashboard");
    expect(html).toContain('id="node-lem-base"');
    expect(html).toContain('id="node-thm-main"');
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
    expect(lines.join("\n")).toContain("2 nodes");
  });

  test("--out redirects the output directory", async () => {
    const root = repo();
    const { out } = capture();
    await renderCommand(["--root", root, "--out", "public"], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(existsSync(join(root, "public", "index.html"))).toBe(true);
  });

  // M2 boundary review, ratified verdict (e): --out must be a repo-relative MANAGED path.
  test("BLOCKER: an absolute --out is rejected (never written), self-teaching, exit nonzero", async () => {
    const root = repo();
    const { out, lines } = capture();
    const absOut = join(tmpdir(), "rk-render-absolute-escape");
    const code = await renderCommand(["--root", root, "--out", absOut], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).not.toBe(0);
    expect(lines.join("\n")).toContain("repo-relative");
    expect(existsSync(absOut)).toBe(false);
  });

  test("BLOCKER: a '..'-escaping --out is rejected, never written, exit nonzero", async () => {
    const root = repo();
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root, "--out", "../escape"], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).not.toBe(0);
    expect(lines.join("\n")).toContain("..");
    expect(existsSync(join(root, "..", "escape"))).toBe(false);
  });

  test("adopts its output in .rk/generated.json (creates the manifest, generator render-site-v1)", async () => {
    const root = repo();
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    const manifestPath = join(root, ".rk", "generated.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.schema_version).toBe("1");
    expect(manifest.entries).toEqual([{ path: "build/site/index.html", generator: "render-site-v1" }]);
    expect(lines.join("\n")).toContain("adopted build/site/index.html");
  });

  test("re-running adopts the entry in place, preserving every other manifest entry byte-exactly", async () => {
    const root = repo();
    mkdirSync(join(root, ".rk"), { recursive: true });
    const preexisting = { schema_version: "1", entries: [{ path: "argument/INDEX.md", generator: "linker-index" }] };
    writeFileSync(join(root, ".rk", "generated.json"), JSON.stringify(preexisting));
    const { out } = capture();
    await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT }); // twice: idempotent upsert
    const manifest = JSON.parse(readFileSync(join(root, ".rk", "generated.json"), "utf8"));
    expect(manifest.entries).toContainEqual({ path: "argument/INDEX.md", generator: "linker-index" });
    expect(manifest.entries).toContainEqual({ path: "build/site/index.html", generator: "render-site-v1" });
    expect(manifest.entries.length).toBe(2); // no duplicate on the second run
  });

  test("a pre-existing manifest that is not valid JSON is never silently clobbered", async () => {
    const root = repo();
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "generated.json"), "{ not json");
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).not.toBe(0);
    expect(lines.join("\n")).toContain("not valid JSON");
    expect(readFileSync(join(root, ".rk", "generated.json"), "utf8")).toBe("{ not json");
  });

  // M2 boundary review, landing-blocker #2 (consumer side): a structurally incomplete projection
  // must never render as a complete report.
  test("BLOCKER: a registrySkip (unrecognized kind) makes rk render REFUSE, never a smaller site", async () => {
    const root = repo();
    writeShard(root, "lem-bad", { kind: "not-a-real-kind" });
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).not.toBe(0);
    expect(lines.join("\n")).toContain("structurally incomplete");
    expect(lines.join("\n")).toContain("argument/lem-bad.md");
    expect(lines.join("\n")).toContain("unrecognized or missing kind");
    expect(existsSync(join(root, "build", "site", "index.html"))).toBe(false);
    expect(existsSync(join(root, ".rk", "generated.json"))).toBe(false); // no manifest write either
  });

  test("BLOCKER: a malformed fr log line makes rk render REFUSE, naming the line", async () => {
    const root = repo();
    mkdirSync(join(root, ".frontier"), { recursive: true });
    writeFileSync(join(root, ".frontier", "log.jsonl"), 'not valid json\n{"cycle":1,"outcome":"orient"}\n');
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).not.toBe(0);
    expect(lines.join("\n")).toContain("structurally incomplete");
    expect(lines.join("\n")).toContain("line 1");
    expect(existsSync(join(root, "build", "site", "index.html"))).toBe(false);
  });

  // LB4 (2026-08-03 M3-close review): the refusal preamble promises "naming every entry", but
  // src/render/diagnostics-view.ts mirrored only TWO of the producer's structural-loss arrays — so
  // a build refused for a corrupt retraction ledger printed the preamble and then enumerated
  // NOTHING. RED before the third/fourth classes were added to `structuralLossLines`.
  test("BLOCKER (LB4): a corrupt .rk/retractions.jsonl makes rk render REFUSE and NAMES the problem", async () => {
    const root = repo();
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "retractions.jsonl"), "{truncated\n");
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).not.toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("structurally incomplete");
    expect(text).toContain("retraction store:");
    expect(text).toContain("line 1");
    expect(existsSync(join(root, "build", "site", "index.html"))).toBe(false);
  });

  test("BLOCKER (LB4): a truncated .beads/issues.jsonl line makes rk render REFUSE and NAMES the line", async () => {
    const root = repo();
    mkdirSync(join(root, ".beads"), { recursive: true });
    writeFileSync(
      join(root, ".beads", "issues.jsonl"),
      `${JSON.stringify({ id: "rk-ok", issue_type: "task", status: "open" })}\n{"id":"rk-trunc\n`,
    );
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).not.toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("structurally incomplete");
    expect(text).toContain("bd issues: line 2 malformed");
    expect(existsSync(join(root, "build", "site", "index.html"))).toBe(false);
  });

  test("a fallback fr source (malformed-free, but no fr binary) is visibly distinguished, never silently 'absent'", async () => {
    const root = repo();
    mkdirSync(join(root, ".frontier"), { recursive: true });
    writeFileSync(join(root, ".frontier", "log.jsonl"), '{"cycle":1,"outcome":"orient"}\n');
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0); // no malformed lines here -- structurally complete, just degraded
    expect(lines.join("\n")).toContain("fr: log fallback (reduced fidelity)");
    const html = readFileSync(join(root, "build", "site", "index.html"), "utf8");
    expect(html).toContain("log fallback (reduced fidelity)");
    expect(html).toContain('class="rk-banner'); // a genuine fallback DOES warrant the loud banner
  });

  test("nothing adopted (no af/fr/bd): sources named plainly on both surfaces, no alarm banner", async () => {
    const root = repo();
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("af: absent");
    expect(lines.join("\n")).toContain("fr: absent");
    expect(lines.join("\n")).toContain("bd: absent");
    const html = readFileSync(join(root, "build", "site", "index.html"), "utf8");
    expect(html).toContain("evidence sources");
    expect(html).not.toContain('class="rk-banner');
  });

  test("--north-star threads into the what-blocks summary", async () => {
    const root = repo();
    const { out } = capture();
    await renderCommand(["--root", root, "--north-star", "thm-main"], out, { afCommand: ABSENT, frCommand: ABSENT });
    const html = readFileSync(join(root, "build", "site", "index.html"), "utf8");
    expect(html).toContain("what blocks the north star (thm-main)");
  });

  // M2.4 pass 2 (rk-c2q): the run gallery + definitions/conventions edges thread through.
  test("no runs/ or definitions/ at all: both routes degrade honestly, exit still 0", async () => {
    const root = repo();
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("0/0 run bundle(s), 0 definition(s), no CONVENTIONS.md");
    const html = readFileSync(join(root, "build", "site", "index.html"), "utf8");
    // the edge DID run (data supplied, just empty) -- an honest empty state, not the "omitted" note.
    expect(html).toContain("no run bundles found under runs/");
    expect(html).toContain("no definitions found under definitions/");
  });

  test("a run bundle + a definition + CONVENTIONS.md on disk reach the rendered site", async () => {
    const root = repo();
    mkdirSync(join(root, "runs", "2026-07-10-x"), { recursive: true });
    writeFileSync(
      join(root, "runs", "2026-07-10-x", "README.md"),
      "**Hypothesis.** x\n**Command.** `y`\n**Finding.** z\n**Invariant.** known-value check.\n**Next.** w\n",
    );
    writeFileSync(join(root, "INDEX.md"), "2026-07-10-x referenced here.\n");
    mkdirSync(join(root, "definitions"), { recursive: true });
    writeFileSync(
      join(root, "definitions", "def-x.md"),
      "---\nid: def-x\nterm: X\nkind: consensus\nstatus: draft\nconsensus: agreed\n---\n\nX.\n",
    );
    writeFileSync(join(root, "CONVENTIONS.md"), "# CONVENTIONS\n\n## Ledger\n[2026-07-10] a convention.\n");
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("1/1 run bundle(s), 1 definition(s), CONVENTIONS.md present");
    const html = readFileSync(join(root, "build", "site", "index.html"), "utf8");
    expect(html).toContain("2026-07-10-x");
    expect(html).toContain("def-x");
    expect(html).toContain("[2026-07-10] a convention.");
  });

  // rk-50v RENDER-EDGE option: fr export's own residual/death-certificate text, threaded through
  // src/render/fr-edge.ts -- NO graph-schema change (orchestrator-pinned decision).
  test("rk-50v: no fr export reachable -- 0 residual notes, graveyard degrades to disclaim-only (no new failure mode)", async () => {
    const root = repo();
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("0 dead-route residual note(s)");
  });

  test("rk-50v: fr export reachable with derived.deadRoutes -- residual text reaches the rendered graveyard", async () => {
    const root = repo();
    writeFileSync(
      join(root, "fake-fr-response.json"),
      JSON.stringify({
        schema_version: "1",
        log: [{ cycle: 1, outcome: "died", evidence: { artifact: "argument/lem-base.md" } }],
        verdicts: [],
        derived: {
          deadRoutes: [
            {
              arm: "a1",
              residual: "the induction step fails at n=5",
              reason: "counterexample found",
              killedAtCycle: 1,
              killedByWave: "w2",
              outcome: "died",
            },
          ],
        },
      }),
    );
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: FAKE_FR });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("1 dead-route residual note(s)");
    expect(lines.join("\n")).toContain("fr residuals: read"); // LB7: fidelity named on every path
    const html = readFileSync(join(root, "build", "site", "index.html"), "utf8");
    expect(html).toContain("the induction step fails at n=5");
  });

  // LB7 (2026-08-03 M3-close review): `loadFrResiduals`'s degradation used to be invisible on every
  // surface. It is now named alongside af/fr/bd in `rk render`'s own source-status block, using the
  // SAME words `rk check` prints for the cause-3 finding, so the two commands never describe one
  // state differently. `sources.fr` decides only the WORDING, never the fact.
  test("LB7: fr engaged but the residual read degrades -- rk render NAMES the reduced fidelity", async () => {
    const root = repo();
    mkdirSync(join(root, ".frontier"), { recursive: true });
    writeFileSync(join(root, ".frontier", "log.jsonl"), "");
    writeFileSync(
      join(root, "fake-fr-response.json"),
      JSON.stringify({
        schema_version: "1",
        log: [],
        verdicts: [],
        derived: { deadRoutes: [{ residual: 42, killedAtCycle: 1 }] },
      }),
    );
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: FAKE_FR });
    expect(code).toBe(0); // a degraded DISPLAY read never blocks the render — no new failure mode
    const text = lines.join("\n");
    expect(text).toContain("fr residuals: reduced fidelity");
    expect(text).toContain("1 dead-route row(s)");
  });

  test("LB7: fr not engaged at all -- named as 'not read', never as degradation", async () => {
    const root = repo();
    const { out, lines } = capture();
    const code = await renderCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("fr residuals: not read (fr not engaged");
    expect(text).not.toContain("fr residuals: reduced fidelity");
  });

  test("registered on the top-level dispatcher; --help is side-effect-free", async () => {
    const { out, lines } = capture();
    const code = await run(["render", "--help"], { out });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("rk render");
    expect(lines.join("\n")).toContain("--out");
  });
});
