// src/render/provenance-view.ts — per-claim provenance chains (this WP's brief: claim ->
// provenance field -> report anchor -> af evidence -> refs). Reuses computeFocusView
// (src/graph/query-focus.ts, already landed) for the report-anchor/af-evidence steps so this view
// can never disagree with `rk graph --focus`'s own per-node picture. `defsById` (optional —
// src/render/defs-edge.ts's EDGE output, keyed by id) resolves the final "refs" step; an id with
// no matching record renders an explicit "absent link" note, never a silent skip.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphDocument } from "../../src/graph/types";
import type { DefRecord } from "../../src/render/defs-edge";
import { loadDefsData } from "../../src/render/defs-edge";
import { renderProvenanceChains } from "../../src/render/provenance-view";

const FIXTURE = join(import.meta.dir, "..", "..", "corpus", "render", "rigour-ladder", "graph.json");
const doc = JSON.parse(readFileSync(FIXTURE, "utf8")) as GraphDocument;
const DEFS_REPO = join(import.meta.dir, "..", "..", "corpus", "render", "defs-index", "repo");

function defsById(): ReadonlyMap<string, DefRecord> {
  const data = loadDefsData(DEFS_REPO);
  return new Map(data.defs.map((d) => [d.id, d]));
}

describe("render/provenance-view", () => {
  test("every node gets its own chain block, naming the claim verbatim", () => {
    const html = renderProvenanceChains(doc);
    for (const nd of doc.nodes) {
      expect(html).toContain(nd.contract);
    }
  });

  test("the raw provenance field is honestly reported as NOT carried into the graph projection", () => {
    const html = renderProvenanceChains(doc);
    expect(html.toLowerCase()).toContain("not carried");
  });

  test("report anchor step: a resolved anchor (n-proved) and an unresolved one (n-stated) both render, distinctly", () => {
    const html = renderProvenanceChains(doc);
    expect(html).toContain("lem:proved-anchor");
    expect(html).toContain("lem:missing-anchor");
  });

  test("a node with no report anchor at all says so plainly (n-cited)", () => {
    const html = renderProvenanceChains(doc);
    const idx = html.indexOf('id="chain-n-cited"');
    const next = html.indexOf('id="chain-', idx + 1);
    const block = html.slice(idx, next === -1 ? undefined : next);
    expect(block).toContain("no report anchor recorded");
  });

  test("af evidence step reflects workspaceResolved/contractMatch/epistemic/taint (n-conflict)", () => {
    const html = renderProvenanceChains(doc);
    const idx = html.indexOf('id="chain-n-conflict"');
    const next = html.indexOf('id="chain-', idx + 1);
    const block = html.slice(idx, next === -1 ? undefined : next);
    expect(block).toContain("contractMatch");
    expect(block).toContain("false");
    expect(block).toContain("validated");
  });

  test("refs step resolves a def id that exists in defsById (n-cited -> def-foo)", () => {
    const html = renderProvenanceChains(doc, { defsById: defsById() });
    const idx = html.indexOf('id="chain-n-cited"');
    const next = html.indexOf('id="chain-', idx + 1);
    const block = html.slice(idx, next === -1 ? undefined : next);
    expect(block).toContain("def-foo");
    expect(block).toContain("Foo");
  });

  test("RED CASE: refs step names an ABSENT link plainly, never a silent skip (n-stated -> def-missing)", () => {
    const html = renderProvenanceChains(doc, { defsById: defsById() });
    const idx = html.indexOf('id="chain-n-stated"');
    const next = html.indexOf('id="chain-', idx + 1);
    const block = html.slice(idx, next === -1 ? undefined : next);
    expect(block).toContain("def-missing");
    expect(block.toLowerCase()).toContain("no matching definitions");
  });

  test("without defsById at all, refs step still names the cited ids, honestly noting definitions data wasn't loaded", () => {
    const html = renderProvenanceChains(doc);
    const idx = html.indexOf('id="chain-n-cited"');
    const next = html.indexOf('id="chain-', idx + 1);
    const block = html.slice(idx, next === -1 ? undefined : next);
    expect(block).toContain("def-foo");
    expect(block.toLowerCase()).toContain("not loaded");
  });

  test("a node citing no definitions says so, not silently empty (n-conjecture)", () => {
    const html = renderProvenanceChains(doc);
    const idx = html.indexOf('id="chain-n-conjecture"');
    const next = html.indexOf('id="chain-', idx + 1);
    const block = html.slice(idx, next === -1 ? undefined : next);
    expect(block).toContain("no definitions cited");
  });
});
