// src/render/defs-view.ts — the pure render half of the definitions index + conventions ledger
// (PRD C6: "definitions index; conventions ledger view"). Takes a hand-built `DefsData`
// (src/render/defs-edge.ts's EDGE shape) — no fs here (L3).

import { describe, expect, test } from "bun:test";
import type { DefsData } from "../../src/render/defs-edge";
import { renderDefsIndex } from "../../src/render/defs-view";

describe("render/defs-view", () => {
  test("groups definitions by kind, then status, and lists every alias", () => {
    const data: DefsData = {
      defs: [
        { id: "def-foo", path: "definitions/def-foo.md", term: "Foo", kind: "cited", status: "locked", aliases: ["Foobar", "F"], source: "src-a", sha256: "abc123" },
        { id: "def-bar", path: "definitions/def-bar.md", term: "Bar", kind: "consensus", status: "draft", aliases: [] },
      ],
    };
    const html = renderDefsIndex(data);
    expect(html).toContain("cited");
    expect(html).toContain("consensus");
    expect(html).toContain("Foo");
    expect(html).toContain("Foobar");
    expect(html).toContain("F<"); // alias rendered, not swallowed into the term
    expect(html).toContain("Bar");
    expect(html).toContain("src-a");
  });

  test("day-1 vacuity: no definitions at all renders an honest empty state", () => {
    const html = renderDefsIndex({ defs: [] });
    expect(html).toContain("no definitions");
  });

  test("CONVENTIONS.md present renders as a VERBATIM authored-content block, never parsed", () => {
    const html = renderDefsIndex({ defs: [], conventions: "# CONVENTIONS — x\n\n## Ledger\n[2026-01-01] a convention — reason" });
    expect(html).toContain("[2026-01-01] a convention");
    expect(html).toContain("authored");
  });

  test("CONVENTIONS.md absent: an honest not-expressible note, definitions index still renders", () => {
    const html = renderDefsIndex({
      defs: [{ id: "def-foo", path: "definitions/def-foo.md", kind: "cited", status: "locked", aliases: [] }],
    });
    expect(html).toContain("no CONVENTIONS.md");
    expect(html).toContain("def-foo");
  });

  test("a term/alias containing markup-significant characters is escaped, never raw", () => {
    const html = renderDefsIndex({
      defs: [{ id: "def-x", path: "definitions/def-x.md", term: "<script>x</script>", kind: "cited", status: "locked", aliases: ["A&B"] }],
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A&amp;B");
  });

  test("a def with no declared term/kind/status still renders, honestly labeled, never dropped", () => {
    const html = renderDefsIndex({ defs: [{ id: "def-bare", path: "definitions/def-bare.md", aliases: [] }] });
    expect(html).toContain("def-bare");
    expect(html.toLowerCase()).toContain("unset");
  });

  // rk-38f (2): campaign-specific node-id prefixes (dtr, icap, hx, conj-rh, ...) are undefined
  // anywhere on the page — a false-cognate trap was observed live (conj-rh misread as Riemann
  // Hypothesis). rk cannot know campaign vocabulary, but a def's own `id` IS the literal
  // node-id/term prefix a campaign uses elsewhere (dashboard links, DAG labels) — this data
  // already exists (defs-edge.ts), it was just never framed as the glossary a reader needs. Frame
  // it explicitly, using only fields already rendered — no new data source.
  test("when definitions exist, frames the index explicitly as the campaign's node-id glossary", () => {
    const html = renderDefsIndex({
      defs: [{ id: "conj-rh", path: "definitions/conj-rh.md", term: "Riemann Hypothesis", kind: "cited", status: "locked", aliases: [] }],
    });
    expect(html.toLowerCase()).toContain("false-cognate");
    expect(html.toLowerCase()).toContain("node-id");
  });

  test("day-1 vacuity: no definitions means no glossary framing note either (nothing to gloss)", () => {
    const html = renderDefsIndex({ defs: [] });
    expect(html.toLowerCase()).not.toContain("false-cognate");
  });
});
