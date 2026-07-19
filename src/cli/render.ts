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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, sep } from "node:path";
import { MANIFEST_PATH, MANIFEST_SCHEMA_VERSION, RENDER_SITE_GENERATOR } from "../gates/freshness";
import { sourceStatusLines, structuralLossLines } from "../render/diagnostics-view";
import { renderSite } from "../render/site";
import { buildGraphDocument } from "../store/build-graph";
import { loadGateConfig } from "../store/config-load";
import type { Out } from "./args";
import { extractFlag, extractRoot } from "./args";

export interface RenderCommandDeps {
  afCommand?: readonly string[];
  frCommand?: readonly string[];
}

async function resolveNorthStar(root: string, explicit: string | undefined): Promise<string | undefined> {
  if (explicit) return explicit;
  const config = await loadGateConfig(root);
  return config.northStarId;
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

  const northStarId = await resolveNorthStar(root, northStarFlag);
  const site = renderSite(doc, { northStarId, title: titleFlag, sources: diagnostics.sources });

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
  out.log(`  adopted ${manifestEntryPath} in ${MANIFEST_PATH} (generator '${RENDER_SITE_GENERATOR}') for Gate 7.`);
  out.log(`  open ${join(outDir, "index.html")} in a browser (self-contained, no server needed).`);
  out.log("  next: 'rk render --north-star <id>' to include the what-blocks summary if unset.");
  return 0;
}
