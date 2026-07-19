// 1:1 test for src/drive/driver-frontmatter.ts (M3.6). THE safety contract: stamping the balloon
// mark preserves every unrelated frontmatter field and the whole body BYTE-EXACTLY, and the result
// round-trips back through src/gates/snapshot.ts's parseFrontmatter to the same BalloonCounter.

import { describe, expect, test } from "bun:test";
import { applyBalloonMark } from "../../src/drive/driver-frontmatter";
import { parseFrontmatter } from "../../src/gates/snapshot";

const SHARD = `---
id: lem-x
kind: lemma
status: stated
contract: The map is almost idempotent.
deps: lem-a; lem-b
owner: tjo
---

# Lemma X

Body text that must survive byte-for-byte, including this \`code\` and $\\eta$.
`;

describe("applyBalloonMark — byte-exact preservation of unrelated content", () => {
  test("stamps balloons + classifications and preserves EVERY other line byte-exactly", () => {
    const r = applyBalloonMark(SHARD, { count: 1, classifications: ["genuine-gap"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Every original line still present, in order, unchanged.
    for (const line of ["id: lem-x", "kind: lemma", "status: stated", "contract: The map is almost idempotent.", "deps: lem-a; lem-b", "owner: tjo"]) {
      expect(r.content).toContain(`${line}\n`);
    }
    // The body after the closing --- is preserved verbatim.
    expect(r.content).toContain("# Lemma X\n\nBody text that must survive byte-for-byte, including this `code` and $\\eta$.\n");
    // The mark is present.
    expect(r.content).toContain("balloons: 1");
    expect(r.content).toContain("balloon_classifications:\n- genuine-gap");
  });

  test("the written mark round-trips back through parseFrontmatter to the same counter", () => {
    const r = applyBalloonMark(SHARD, { count: 2, classifications: ["missing-fact", "genuine-gap"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fm = parseFrontmatter(r.content);
    expect(fm.present && fm.terminated).toBe(true);
    expect(fm.fields.balloons).toBe("2");
    expect(fm.fields.balloon_classifications).toBe("missing-fact; genuine-gap");
    // unrelated fields untouched by the parser too
    expect(fm.fields.id).toBe("lem-x");
    expect(fm.fields.deps).toBe("lem-a; lem-b");
    expect(fm.malformedLines).toEqual([]);
  });

  test("re-marking REPLACES the prior balloon block, never stacks a second one", () => {
    const first = applyBalloonMark(SHARD, { count: 1, classifications: ["missing-fact"] });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyBalloonMark(first.content, { count: 2, classifications: ["missing-fact", "genuine-gap"] });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // exactly one balloons: line
    expect(second.content.match(/^balloons:/gm)?.length).toBe(1);
    expect(second.content.match(/^balloon_classifications:/gm)?.length).toBe(1);
    // no orphaned stale item: only the two current classifications
    expect(second.content.match(/^- missing-fact$/gm)?.length).toBe(1);
    const fm = parseFrontmatter(second.content);
    expect(fm.fields.balloons).toBe("2");
    expect(fm.fields.balloon_classifications).toBe("missing-fact; genuine-gap");
  });

  test("a zero-history mark writes only the counter (no empty list key)", () => {
    const r = applyBalloonMark(SHARD, { count: 0, classifications: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.content).toContain("balloons: 0");
    expect(r.content).not.toContain("balloon_classifications:");
  });

  test("refuses a file with no terminated frontmatter (never silently rewrites)", () => {
    expect(applyBalloonMark("no frontmatter here\njust text", { count: 1, classifications: ["genuine-gap"] }).ok).toBe(false);
    expect(applyBalloonMark("---\nid: x\nno closing delim", { count: 1, classifications: ["genuine-gap"] }).ok).toBe(false);
  });
});
