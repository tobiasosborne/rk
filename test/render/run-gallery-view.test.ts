// src/render/run-gallery-view.ts — the pure render half of the run-bundle gallery (PRD C6). Takes
// a pre-loaded `RunGalleryData` (src/render/runs-edge.ts's EDGE output) and renders HTML; no fs
// here (L3) — this file is tested against a HAND-BUILT `RunGalleryData`, never a real repo path
// (that is runs-edge.test.ts's job).

import { describe, expect, test } from "bun:test";
import type { RunGalleryData } from "../../src/render/runs-edge";
import { renderRunGallery } from "../../src/render/run-gallery-view";

describe("render/run-gallery-view", () => {
  test("renders a card per bundle, naming README presence + INDEX cross-reference", () => {
    const data: RunGalleryData = {
      bundles: [
        { name: "2026-07-10-a", path: "runs/2026-07-10-a", readmePresent: true, readmeExcerpt: "Hypothesis. x", referencedInIndex: true },
        { name: "2026-07-11-b", path: "runs/2026-07-11-b", readmePresent: false, referencedInIndex: false },
      ],
      findings: [],
      coverage: { checked: 2, total: 2 },
    };
    const html = renderRunGallery(data);
    expect(html).toContain("2026-07-10-a");
    expect(html).toContain("Hypothesis. x");
    expect(html).toContain("2026-07-11-b");
    expect(html).toContain("2/2 run bundle");
  });

  test("a bundle the runs gate flagged is never presented as an ordinary clean card — its finding is named right there", () => {
    const data: RunGalleryData = {
      bundles: [{ name: "2026-07-12-orphan", path: "runs/2026-07-12-orphan", readmePresent: true, readmeExcerpt: "x", referencedInIndex: false }],
      findings: [{ severity: "ERROR", path: "runs/2026-07-12-orphan", message: "not referenced in INDEX.md (add a reverse-lookup row)" }],
      coverage: { checked: 1, total: 1 },
    };
    const html = renderRunGallery(data);
    expect(html).toContain("not referenced in INDEX.md");
    expect(html).toContain("rk-defect");
  });

  test("day-1 vacuity: zero bundles renders an honest empty state, never a silent blank", () => {
    const data: RunGalleryData = { bundles: [], findings: [], coverage: { checked: 0, total: 0 } };
    const html = renderRunGallery(data);
    expect(html).toContain("no run bundles");
    expect(html).toContain("0/0 run bundle");
  });

  test("a missing README is stated plainly, never silently blank", () => {
    const data: RunGalleryData = {
      bundles: [{ name: "2026-07-13-c", path: "runs/2026-07-13-c", readmePresent: false, referencedInIndex: true }],
      findings: [],
      coverage: { checked: 1, total: 1 },
    };
    const html = renderRunGallery(data);
    expect(html).toContain("no README");
  });
});
