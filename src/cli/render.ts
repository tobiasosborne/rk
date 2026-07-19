// EDGE — fs (writes the generated site) + fs/subprocess via src/store/build-graph.ts's readers.
// `rk render [--out build/site]`: builds a GraphDocument from the repo (registry+af+fr+bd) and
// writes the self-contained static HTML site (PRD C6). The pure render core lives in
// src/render/*.ts; this file is the ONLY place that reads the repo and writes files — no render
// logic here. Mirrors src/cli/graph.ts's shape (extractRoot/extractFlag, injectable af/fr commands
// for tests, self-teaching output).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
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

export async function renderCommand(args: string[], out: Out, deps: RenderCommandDeps = {}): Promise<number> {
  const { rest, root } = extractRoot(args);
  const { rest: r1, value: outFlag } = extractFlag(rest, "--out");
  const { rest: r2, value: northStarFlag } = extractFlag(r1, "--north-star");
  const { value: titleFlag } = extractFlag(r2, "--title");
  const outDir = outFlag ?? join("build", "site");

  const { doc } = buildGraphDocument(root, { afCommand: deps.afCommand, frCommand: deps.frCommand });
  const northStarId = await resolveNorthStar(root, northStarFlag);
  const site = renderSite(doc, { northStarId, title: titleFlag });

  // An absolute --out writes there directly (e.g. a central report dir, or a scratch dir when the
  // source repo is read-only); a relative --out is under --root, the common case.
  const outRoot = isAbsolute(outDir) ? outDir : join(root, outDir);
  for (const file of site.files) {
    const dest = join(outRoot, file.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.contents);
  }

  const conflicts = doc.conflicts.length;
  const unresolved = doc.unresolved.length;
  out.log(`rk render: wrote ${site.files.length} file(s) to ${outDir}/ (${doc.nodes.length} nodes).`);
  out.log(
    `  ${conflicts} conflict(s), ${unresolved} unresolved reference(s)` +
      `${northStarId ? `, north star ${northStarId}` : ", no north star configured"}.`,
  );
  out.log(`  open ${join(outDir, "index.html")} in a browser (self-contained, no server needed).`);
  out.log("  next: 'rk render --north-star <id>' to include the what-blocks summary if unset.");
  return 0;
}
