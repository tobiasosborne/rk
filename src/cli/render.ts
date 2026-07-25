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
// untouched. `RENDER_SITE_GENERATOR`/`MANIFEST_PATH`/`MANIFEST_SCHEMA_VERSION` are imported
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
// EXPORTED `renderSiteFromRepo` below, which `src/cli/check.ts`'s Gate 7 edge regeneration calls
// too. This module is therefore the ONLY place in the codebase that calls `renderSite` for the
// site artifact -- generator and freshness verifier cannot drift apart on what a render is.
// See `renderSiteFromRepo`'s own doc comment for the defect and the seam rationale, and
// `checkDivergenceWarning`'s for the one residual (`--title`/`--north-star`) and how it is
// narrowed rather than left as a silent permanent STALE.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, sep } from "node:path";
import { MANIFEST_PATH, MANIFEST_SCHEMA_VERSION, RENDER_SITE_GENERATOR } from "../gates/freshness";
import { loadDefsData } from "../render/defs-edge";
import { sourceStatusLines, structuralLossLines } from "../render/diagnostics-view";
import { loadFrResiduals } from "../render/fr-edge";
import { loadRunGallery } from "../render/runs-edge";
import type { DefsData } from "../render/defs-edge";
import type { FrResidualData } from "../render/fr-edge";
import type { RunGalleryData } from "../render/runs-edge";
import type { SourceStatuses } from "../render/diagnostics-view";
import { renderSite, type RenderedSite } from "../render/site";
import { buildGraphDocument } from "../store/build-graph";
import { loadGateConfig } from "../store/config-load";
import type { Out } from "./args";
import { extractFlag, extractRoot } from "./args";

export interface RenderCommandDeps {
  afCommand?: readonly string[];
  frCommand?: readonly string[];
}

/** The three presence-conditional repo reads `renderSite`'s data options need but the
 * `GraphDocument` does not carry: `runs/**`, `definitions/*.md` + `CONVENTIONS.md`, and a second
 * `fr export`. Bundled so `renderSiteFromRepo` can hand them back to `rk render`'s own summary
 * output without either caller reassembling them. */
export interface RepoSiteRender {
  site: RenderedSite;
  runGallery: RunGalleryData;
  defsData: DefsData;
  frResiduals: FrResidualData;
  /** Re-renders the SAME already-loaded repo data under different DISPLAY options
   * (`northStarId`/`title`), with no second fs/subprocess read. Exists so `rk render` can compute,
   * exactly and cheaply, what `rk check` will regenerate — see `warnIfCheckWillDiffer`. */
  renderWith(opts: { northStarId?: string; title?: string }): RenderedSite;
}

/** THE option-assembly seam (B2, docs/memos/2026-07-25-generality-audit.md).
 *
 * Before this existed, `rk render` called `renderSite` with SIX options while Gate 7's edge
 * regeneration (`src/cli/check.ts`'s `prepareRenderSiteExternalRegen`) called it with ONE
 * (`northStarId`). Four repo-derived options — `sources`, `runGallery`, `defsData`,
 * `frResiduals` — were dropped on the check side, so the "expected" bytes could never equal the
 * real artifact on ANY repo: `build/site/index.html` reported STALE on a pristine scaffold and
 * re-rendering never cleared it. WARN in exploration, ERROR in consolidation, and the stamped
 * pre-commit hook runs `rk check` — so commits blocked. A gate that always cries STALE trains
 * users to ignore the one signal PRD SC2's "no drift by construction" rests on: an L6 truthful-
 * freshness defect, not a cosmetic one.
 *
 * THE SEAM CHOSEN, AND WHY HERE. `src/gates/freshness.ts` is PURE (L3) and cannot acquire any of
 * these inputs — three of the four are fs/subprocess reads. The gate therefore keeps its existing
 * `externalRegen` contract (edge-supplied bytes in, byte-diff out) unchanged; the repair is one
 * level down, at the EDGE that supplies those bytes. Rather than teach `rk check` to reproduce
 * `rk render`'s assembly (two call sites that must be kept in step by hand — exactly the drift
 * that produced this defect), the assembly itself is extracted here, into the generator's own
 * module, and BOTH callers go through it. After this change `renderSite` is called for the site
 * artifact from exactly ONE place in the codebase, so generator and verifier cannot silently
 * disagree about what a render is: adding a seventh option is automatically seen by Gate 7.
 *
 * PURITY: this function is an EDGE (fs + subprocess), living in an edge module, called only from
 * edge modules (`src/cli/render.ts`, `src/cli/check.ts`). `src/gates/**` is untouched by it. */
export function renderSiteFromRepo(
  root: string,
  doc: Parameters<typeof renderSite>[0],
  sources: SourceStatuses | undefined,
  opts: { northStarId?: string; title?: string; frCommand?: readonly string[] },
): RepoSiteRender {
  // M2.4 pass 2 (rk-c2q): the run gallery + definitions/conventions views read presence-
  // conditional data OUTSIDE the GraphDocument (runs/**, definitions/*.md, CONVENTIONS.md) via
  // their own small edges (src/render/runs-edge.ts, src/render/defs-edge.ts) -- day-1 vacuity
  // (no runs/, no definitions/) degrades to an empty-but-honest result, never a crash, same
  // stance every other reader in this codebase takes.
  const runGallery = loadRunGallery(root);
  const defsData = loadDefsData(root);
  // rk-50v RENDER-EDGE option: a second, independent `fr export` read for the graveyard's
  // residual/death-certificate text (src/render/fr-edge.ts) -- degrades to an empty result
  // (no new failure mode) when `fr` is unreachable, same `frCommand` as the graph's own fr read.
  const frResiduals = loadFrResiduals(root, opts.frCommand ?? ["fr"]);
  const renderWith = (display: { northStarId?: string; title?: string }): RenderedSite =>
    renderSite(doc, {
      northStarId: display.northStarId,
      title: display.title,
      sources,
      runGallery,
      defsData,
      frResiduals,
    });
  const site = renderWith({ northStarId: opts.northStarId, title: opts.title });
  return { site, runGallery, defsData, frResiduals, renderWith };
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

interface GeneratedManifest {
  schema_version: string;
  entries: { path: string; generator: string }[];
}

type ManifestLoad = { manifest: GeneratedManifest; manifestPath: string } | { error: string };

/** Loads `.rk/generated.json` for an in-place upsert. Absent -> a fresh empty manifest (the
 * legitimate presence-conditional case, same stance freshness.ts takes). Present-but-unparseable
 * or the wrong top-level shape -> a loud error and NO write (this command never silently clobbers
 * a manifest it cannot understand — CLAUDE.md L2); the caller surfaces the message and exits
 * nonzero. Present-and-well-shaped -> every existing entry is carried forward untouched; only this
 * command's OWN entry (matched by `path`) is inserted or replaced. */
function loadManifestForUpsert(root: string): ManifestLoad {
  const manifestPath = join(root, MANIFEST_PATH);
  if (!existsSync(manifestPath)) {
    return { manifest: { schema_version: MANIFEST_SCHEMA_VERSION, entries: [] }, manifestPath };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      error: `rk render: ${MANIFEST_PATH} exists but is not valid JSON (${msg}) -- fix or remove it before 'rk render' can adopt its output there.`,
    };
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    !Array.isArray((parsed as Record<string, unknown>).entries)
  ) {
    return {
      error:
        `rk render: ${MANIFEST_PATH} exists but is not the expected shape ` +
        `({"schema_version": ..., "entries": [...]}) -- fix or remove it before 'rk render' can adopt its output there.`,
    };
  }
  const obj = parsed as { schema_version?: unknown; entries: unknown[] };
  const entries = obj.entries.filter(
    (e): e is { path: string; generator: string } =>
      typeof e === "object" && e !== null && typeof (e as Record<string, unknown>).path === "string" &&
      typeof (e as Record<string, unknown>).generator === "string",
  );
  return {
    manifest: {
      schema_version: typeof obj.schema_version === "string" ? obj.schema_version : MANIFEST_SCHEMA_VERSION,
      entries,
    },
    manifestPath,
  };
}

/** Upserts `rk render`'s own entry into `.rk/generated.json` — creating the file if absent,
 * replacing an existing entry for the same `path` in place, appending otherwise. Returns an error
 * message (and writes nothing) when the existing manifest could not be understood. */
function adoptGeneratedEntry(root: string, entryPath: string): string | undefined {
  const loaded = loadManifestForUpsert(root);
  if ("error" in loaded) return loaded.error;
  const { manifest, manifestPath } = loaded;
  const newEntry = { path: entryPath, generator: RENDER_SITE_GENERATOR };
  const idx = manifest.entries.findIndex((e) => e.path === entryPath);
  if (idx >= 0) manifest.entries[idx] = newEntry;
  else manifest.entries.push(newEntry);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return undefined;
}

export async function renderCommand(args: string[], out: Out, deps: RenderCommandDeps = {}): Promise<number> {
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
  const manifestError = adoptGeneratedEntry(root, manifestEntryPath);
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
  for (const line of sourceStatusLines(diagnostics.sources)) out.log(`  ${line}`);
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
