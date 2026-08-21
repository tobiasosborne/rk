// EDGE — fs (writes the generated site + upserts .rk/generated.json) + fs/subprocess via
// src/store/build-graph.ts's readers. `rk render [--out build/site]`: builds a GraphDocument from
// the repo (registry+af+fr+bd) and writes the self-contained static HTML site (PRD C6). The pure
// render core lives in src/render/*.ts; this file is the ONLY place that reads the repo and writes
// files — no render logic here. Mirrors src/cli/graph.ts's shape (extractRoot/extractFlag,
// injectable af/fr commands for tests, self-teaching output).
//
// M2 boundary review, landing-blocker #2 (consumer side): `src/store/build-graph.ts`'s
// `BuildGraphResult.diagnostics` (the join lane's producer-side landing, commit "blocker 2
// (producer side)") names structural parse/conversion LOSS (`structuralLoss`) and per-source
// (af/fr/bd) build status (`sources`). When `!diagnostics.isStructurallyComplete`, `rk render`
// REFUSES to write anything (exit nonzero, naming every structuralLoss entry) rather than writing
// a smaller-but-still-exit-0 site — a structurally lossy projection is not a complete report, no
// matter how small. A degraded/absent source (`sources`) does NOT block output (both are
// legitimate, presence-conditional states) but IS visibly distinguished from an authoritative read
// in both the terminal output and the rendered HTML (src/render/diagnostics-view.ts's banner +
// dashboard "evidence sources" section).
//
// M2 boundary review, landing-blocker #3 + ratified verdict (e): `--out` must be a REPO-RELATIVE
// MANAGED path (absolute paths and `..` escapes rejected) so every render output is declarable in
// `.rk/generated.json` for Gate 7 (src/gates/freshness.ts) to verify — an unmanaged/absolute
// export destination can never be freshness-checked, which is exactly the gap blocker #3 named.
// After writing the site, `rk render` upserts its OWN manifest entry
// `{"path": "<out>/index.html", "generator": "render-site-v1"}` (freshness.ts's
// `RENDER_SITE_GENERATOR`) — creating `.rk/generated.json` if absent, preserving every other entry
// `RENDER_SITE_GENERATOR`/`MANIFEST_PATH` are imported
// read-only from src/gates/freshness.ts (the freshness lane's contract); this file never edits
// that gate.
//
// M2.4 pass 2 (rk-c2q): also invokes src/render/runs-edge.ts's `loadRunGallery` and
// src/render/defs-edge.ts's `loadDefsData` -- small, presence-conditional fs edges that read
// data the GraphDocument itself does not carry (runs/**, definitions/*.md, CONVENTIONS.md) --
// and threads their output into `renderSite`'s options. Both degrade honestly (empty result,
// never a crash) when their inputs are absent.
//
// rk-50v RENDER-EDGE option (orchestrator-pinned; NO graph-schema change): also invokes
// src/render/fr-edge.ts's `loadFrResiduals` (a SECOND, independent `fr export` subprocess call,
// same `frCommand` as `buildGraphDocument`'s own fr read) for the dead-route graveyard's
// residual/death-certificate text. Degrades to `EMPTY_FR_RESIDUALS` (never a crash, never a new
// failure mode) when `fr` is unreachable or its export is unparseable -- the graveyard then
// renders exactly as it did before this option existed.
//
// B2 (docs/memos/2026-07-25-generality-audit.md): all of the above assembly now lives in the
// `renderSiteFromRepo` in the focused sibling render-site-from-repo.ts, which `src/cli/check.ts`'s
// Gate 7 edge regeneration calls too. That sibling is the ONLY place that calls `renderSite` for the
// site artifact -- generator and freshness verifier cannot drift apart on what a render is.
// See `renderSiteFromRepo`'s own doc comment for the defect and the seam rationale, and
// `checkDivergenceWarning`'s for the one residual (`--title`/`--north-star`) and how it is
// narrowed rather than left as a silent permanent STALE.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, sep } from "node:path";
import { MANIFEST_PATH, RENDER_SITE_GENERATOR } from "../gates/freshness";
// rk-5lzf: the `.rk/generated.json` upsert this file used to own privately now lives in
// src/cli/generated-manifest.ts, shared with `rk render macros` — one writer for Gate 7's declared
// input, so two producers cannot disagree about its shape.
import { adoptGeneratedEntry } from "./generated-manifest";
import { renderMacrosCommand } from "./render-macros";
import { sourceStatusLines, structuralLossLines } from "../render/diagnostics-view";
import type { RenderedSite } from "../render/site";
import { buildGraphDocument } from "../store/build-graph";
import { loadGateConfig } from "../store/config-load";
import type { Out } from "./args";
import { extractFlag, extractRoot } from "./args";
import { renderSiteFromRepo, type RepoSiteRender } from "./render-site-from-repo";

export { renderSiteFromRepo } from "./render-site-from-repo";

export interface RenderCommandDeps {
  afCommand?: readonly string[];
  frCommand?: readonly string[];
}

/** Repo-relative `index.html` bytes of a rendered site — the one file Gate 7's `render-site-v1`
 * entry declares and diffs. */
function indexBytes(site: RenderedSite): string | undefined {
  return site.files.find((f) => f.path === "index.html")?.contents;
}

/** B2, residual-divergence narrowing. `--title` and `--north-star` are CLI-only overrides;
 * `rk check` has no equivalent flags and regenerates from `.rk/config.json` alone, so a render
 * invoked with either CAN legitimately diff against the gate's regeneration. That residual is
 * irreducible without a manifest-schema change (recording the options used per entry — a Rule 10
 * compat event, out of this repair's scope), but it must never be a SILENT permanent STALE.
 *
 * It is narrowed two ways here. (1) It is DETECTED EXACTLY rather than assumed: the same repo
 * data is re-rendered under the options `rk check` will actually use and the two `index.html`
 * bodies are byte-compared, so `--north-star` repeating the configured value, or `--title`
 * repeating the default, warns about nothing. (2) It is reported AT THE MOMENT IT IS CREATED, by
 * the command that creates it, naming the offending flag and the remedy — instead of surfacing
 * later as an unexplained STALE from a different command. Returns the warning lines (empty when
 * the artifact is reproducible). */
function checkDivergenceWarning(
  rendered: RepoSiteRender,
  flags: { title?: string; northStar?: string },
  configNorthStarId: string | undefined,
  manifestEntryPath: string,
): string[] {
  if (flags.title === undefined && flags.northStar === undefined) return [];
  const asCheckWillSeeIt = rendered.renderWith({ northStarId: configNorthStarId, title: undefined });
  if (indexBytes(asCheckWillSeeIt) === indexBytes(rendered.site)) return [];
  const named: string[] = [];
  if (flags.title !== undefined) named.push("--title");
  if (flags.northStar !== undefined) named.push("--north-star");
  return [
    `rk render: WARNING — '${named.join("' and '")}' changed the output, and 'rk check' cannot reproduce ` +
      `${named.length === 1 ? "that override" : "those overrides"}.`,
    `  Gate 7 (freshness) regenerates this artifact from .rk/config.json only — it has no equivalent ` +
      `flag — so 'rk check' will report ${manifestEntryPath} STALE until the override is dropped or ` +
      `moved into config (docs/gate-contracts.md, Gate 7 "Known limitations").`,
    `  next: re-run 'rk render' with no ${named.join("/")} flag, or set the value in .rk/config.json ` +
      `(northStarId) so both commands read the same source.`,
  ];
}

/** Rejects an unmanaged `--out`: absolute (escapes --root entirely, can never be declared as a
 * repo-relative manifest path) or carrying a literal `..` path segment (escapes --root even when
 * relative). Self-teaching — names WHY, not just what. Returns `undefined` when `outDir` is fine. */
function validateOutDir(outDir: string): string | undefined {
  if (isAbsolute(outDir)) {
    return (
      `rk render: --out must be a repo-relative managed path (got '${outDir}', which is absolute) -- ` +
      "an absolute output can never be declared in .rk/generated.json, so Gate 7 (freshness) could " +
      "never verify it. Pass a path relative to --root instead, e.g. 'build/site' or 'public'."
    );
  }
  const segments = outDir.split(/[\\/]+/);
  if (segments.some((s) => s === "..")) {
    return (
      `rk render: --out must stay within --root (got '${outDir}', which escapes it via '..') -- ` +
      "every render output must be a repo-relative managed path so it can be declared in " +
      ".rk/generated.json for Gate 7 (freshness) to verify. Pass a path with no '..' segments."
    );
  }
  return undefined;
}

/** Repo-relative, forward-slash path — the shape every other `.rk/generated.json` entry and every
 * `Finding.path` in this codebase already uses (src/cli/check.ts's convention), regardless of the
 * host OS's own path separator. */
function toPosixPath(p: string): string {
  return p.split(sep).join("/");
}

export async function renderCommand(args: string[], out: Out, deps: RenderCommandDeps = {}): Promise<number> {
  // rk-5lzf: `rk render macros` regenerates the notation macro file. A subcommand rather than a
  // flag on the site render — the two write different artifacts under different generators, and a
  // flag would make "which artifact did this adopt?" a matter of argument order.
  if (args[0] === "macros") return renderMacrosCommand(args.slice(1), out);
  const { rest, root } = extractRoot(args);
  const { rest: r1, value: outFlag } = extractFlag(rest, "--out");
  const { rest: r2, value: northStarFlag } = extractFlag(r1, "--north-star");
  const { value: titleFlag } = extractFlag(r2, "--title");
  const outDir = outFlag ?? join("build", "site");

  const outDirError = validateOutDir(outDir);
  if (outDirError) {
    out.log(outDirError);
    return 2;
  }

  const { doc, diagnostics } = buildGraphDocument(root, { afCommand: deps.afCommand, frCommand: deps.frCommand });

  if (!diagnostics.isStructurallyComplete) {
    out.log(
      "rk render: refusing to write output -- the projection is structurally incomplete " +
        "(never a smaller-but-complete-looking site):",
    );
    for (const line of structuralLossLines(diagnostics.structuralLoss)) out.log(`  ${line}`);
    out.log("  next: fix the structural issue(s) above (or remove the offending input) and re-run 'rk render'.");
    return 1;
  }

  // Loaded unconditionally (the old `resolveNorthStar` short-circuited on an explicit flag) so the
  // B2 divergence check below can compare against exactly what `rk check` will regenerate with.
  // Fallback semantics are unchanged: an empty `--north-star ""` still defers to config.
  const configNorthStarId = (await loadGateConfig(root)).northStarId;
  const northStarId = northStarFlag ? northStarFlag : configNorthStarId;
  // B2: the ONE option-assembly path (see renderSiteFromRepo's doc comment) — `rk check`'s Gate 7
  // regeneration calls this exact function, so generator and verifier cannot drift.
  const rendered = renderSiteFromRepo(root, doc, diagnostics.sources, {
    northStarId,
    title: titleFlag,
    frCommand: deps.frCommand,
  });
  const { site, runGallery, defsData, frResiduals } = rendered;

  const outRoot = join(root, outDir);
  for (const file of site.files) {
    const dest = join(outRoot, file.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.contents);
  }

  const manifestEntryPath = toPosixPath(join(outDir, "index.html"));
  const manifestError = adoptGeneratedEntry(root, manifestEntryPath, RENDER_SITE_GENERATOR, "rk render");
  if (manifestError) {
    out.log(manifestError);
    return 1;
  }

  const conflicts = doc.conflicts.length;
  const unresolved = doc.unresolved.length;
  out.log(`rk render: wrote ${site.files.length} file(s) to ${outDir}/ (${doc.nodes.length} nodes).`);
  out.log(
    `  ${conflicts} conflict(s), ${unresolved} unresolved reference(s)` +
      `${northStarId ? `, north star ${northStarId}` : ", no north star configured"}.`,
  );
  // LB7: the render edge's OWN second `fr export` read is a source too — its fidelity joins the
  // af/fr/bd block rather than degrading into a silently-empty graveyard (diagnostics-view.ts).
  for (const line of sourceStatusLines(diagnostics.sources, frResiduals.fidelity)) out.log(`  ${line}`);
  out.log(`  ${runGallery.coverage.checked}/${runGallery.coverage.total} run bundle(s), ${defsData.defs.length} definition(s)` +
    `${defsData.conventions !== undefined ? ", CONVENTIONS.md present" : ", no CONVENTIONS.md"}.`);
  out.log(`  ${frResiduals.byCycle.size} dead-route residual note(s) available from fr export.`);
  out.log(`  adopted ${manifestEntryPath} in ${MANIFEST_PATH} (generator '${RENDER_SITE_GENERATOR}') for Gate 7.`);
  out.log(`  open ${join(outDir, "index.html")} in a browser (self-contained, no server needed).`);
  out.log("  next: 'rk render --north-star <id>' to include the what-blocks summary if unset.");
  // B2 residual: a CLI-only override that Gate 7 cannot reproduce is named HERE, exactly, by the
  // command that creates it -- never left to surface later as an unexplained permanent STALE.
  for (const line of checkDivergenceWarning(rendered, { title: titleFlag, northStar: northStarFlag }, configNorthStarId, manifestEntryPath)) {
    out.log(line);
  }
  return 0;
}
