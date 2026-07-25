// Cross-repo seam fixture (M3.4, mirroring test/drive/vibefeld-seam-fixture.test.ts's discipline
// for severity/category): src/drive/batch-plan.ts's `VerdictFileSkeleton`/`VerdictFileSkeletonItem`
// field names are documented as byte-identical to ../vibefeld/docs/verdicts-apply.md's own JSON
// snippets (the "Top-level document" and "Items" sections). This test reads THAT DOCUMENT
// DIRECTLY (never a hand-copied field list rk maintains separately) and fails if the two ever
// drift apart. Read-only: never writes to ../vibefeld (CLAUDE.md rule 2).
//
// Locating ../vibefeld: same upward-search as vibefeld-seam-fixture.test.ts, since this test may
// run from the main rk checkout or from a nested git worktree.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { toBatchPlan, toVerdictFileSkeleton } from "../../src/drive/batch-plan";
import type { ComposedBatch } from "../../src/drive/batch-composer";

function findVibefeldRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 20; i++) {
    const candidate = join(dir, "vibefeld");
    if (existsSync(join(candidate, "docs", "verdicts-apply.md"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `could not locate ../vibefeld (searched ancestors of ${startDir} for a 'vibefeld/docs/verdicts-apply.md') — ` +
      "this is a hard failure per CLAUDE.md L2, not a silent skip.",
  );
}

/** Extracts the set of JSON object keys appearing in every ```json fenced code block immediately
 * following a line containing `headingMarker` (a literal substring of the section's own prose,
 * e.g. "Top-level document" or "```\n{\"node\""), up to the next `##`-level heading. Deliberately
 * a light-touch scan (this is prose with embedded examples, not machine-typed Go source like the
 * severity/category fixture reads) — good enough to catch a renamed or removed field, which is
 * exactly the drift class this fixture guards against. */
function extractJsonKeysNearHeading(source: string, headingMarker: string): Set<string> {
  const idx = source.indexOf(headingMarker);
  if (idx < 0) throw new Error(`heading marker '${headingMarker}' not found in verdicts-apply.md — has the doc been restructured?`);
  const nextHeadingIdx = source.indexOf("\n## ", idx + headingMarker.length);
  const section = source.slice(idx, nextHeadingIdx < 0 ? source.length : nextHeadingIdx);
  const keys = new Set<string>();
  const keyRe = /"(\w+)":/g;
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(section)) !== null) keys.add(m[1]!);
  return keys;
}

function sampleSkeleton() {
  const batch: ComposedBatch = { batchId: "batch-seamtest", tier: "hard", members: ["1.2", "1.3"], score: 0 };
  const plan = toBatchPlan(batch);
  const result = toVerdictFileSkeleton(plan);
  if (!result.ok) throw new Error("expected a hard-tier plan to produce a skeleton");
  return result.skeleton;
}

const vibefeldRoot = findVibefeldRoot(import.meta.dir);
const verdictsApplySource = readFileSync(join(vibefeldRoot, "docs", "verdicts-apply.md"), "utf8");

describe("cross-repo seam fixture: VerdictFileSkeleton field names byte-match ../vibefeld/docs/verdicts-apply.md", () => {
  test("top-level skeleton keys (schema_version, batch_id, verified_by, items) are all documented top-level fields", () => {
    const documentedTopLevelKeys = extractJsonKeysNearHeading(verdictsApplySource, "### Top-level document");
    expect(documentedTopLevelKeys.size).toBeGreaterThan(0); // sanity: the scan actually found something
    const skeleton = sampleSkeleton();
    for (const key of Object.keys(skeleton)) {
      expect(documentedTopLevelKeys.has(key)).toBe(true);
    }
  });

  test("item-level skeleton key ('node') is a documented item field", () => {
    const documentedItemKeys = extractJsonKeysNearHeading(verdictsApplySource, "### Items");
    expect(documentedItemKeys.size).toBeGreaterThan(0);
    const skeleton = sampleSkeleton();
    for (const item of skeleton.items) {
      for (const key of Object.keys(item)) {
        expect(documentedItemKeys.has(key)).toBe(true);
      }
    }
    // And the converse for the one field the skeleton actually populates at this stage.
    expect(documentedItemKeys.has("node")).toBe(true);
  });

  test("schema_version's literal value matches the document's own const requirement ('1')", () => {
    expect(verdictsApplySource).toMatch(/Must equal `"1"`/);
    expect(sampleSkeleton().schema_version).toBe("1");
  });
});
