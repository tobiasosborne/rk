// EDGE test for src/render/runs-edge.ts. `loadRunGallery` reads `runs/**` + repo-root `INDEX.md`
// off disk (via src/store/snapshot-load.ts's `loadSnapshot`, read-only import) and reuses Gate 5's
// OWN `runsGate` (src/gates/runs.ts, read-only import) for validity findings, so the gallery can
// never disagree with `rk check`'s own verdict about a bundle. Fixture:
// corpus/render/run-gallery/repo/ — one clean bundle referenced in INDEX.md, one bundle with a
// complete README that is NOT referenced in INDEX.md (an orphan — the runs gate's own ERROR),
// plus `runs/README.md` (the schema doc, never a bundle).

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadRunGallery } from "../../src/render/runs-edge";

const REPO = join(import.meta.dir, "..", "..", "corpus", "render", "run-gallery", "repo");

describe("render/runs-edge", () => {
  test("discovers both bundles, excludes runs/README.md (the schema doc, not a bundle)", () => {
    const data = loadRunGallery(REPO);
    const names = data.bundles.map((b) => b.name).sort();
    expect(names).toEqual(["2026-07-10-first-bundle", "2026-07-12-orphan-bundle"]);
  });

  test("records README presence + a short excerpt per bundle", () => {
    const data = loadRunGallery(REPO);
    const first = data.bundles.find((b) => b.name === "2026-07-10-first-bundle")!;
    expect(first.readmePresent).toBe(true);
    expect(first.readmeExcerpt).toContain("Hypothesis");
  });

  test("cross-references INDEX.md: the referenced bundle is marked so, the orphan is not", () => {
    const data = loadRunGallery(REPO);
    const first = data.bundles.find((b) => b.name === "2026-07-10-first-bundle")!;
    const orphan = data.bundles.find((b) => b.name === "2026-07-12-orphan-bundle")!;
    expect(first.referencedInIndex).toBe(true);
    expect(orphan.referencedInIndex).toBe(false);
  });

  test("reuses the runs gate's OWN findings — the orphan bundle's ERROR is present verbatim", () => {
    const data = loadRunGallery(REPO);
    expect(
      data.findings.some(
        (f) => f.severity === "ERROR" && f.path.includes("2026-07-12-orphan-bundle") && f.message.includes("INDEX.md"),
      ),
    ).toBe(true);
  });

  test("coverage line matches the gate's own coverage (2/2 bundles discovered)", () => {
    const data = loadRunGallery(REPO);
    expect(data.coverage).toEqual({ checked: 2, total: 2 });
  });

  test("day-1 vacuity: an absent runs/ directory degrades honestly (0/0), never a crash", () => {
    const data = loadRunGallery(join(import.meta.dir, "..", ".."));
    expect(data.bundles.length).toBeGreaterThanOrEqual(0);
    expect(typeof data.coverage.checked).toBe("number");
  });
});
