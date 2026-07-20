// M3 blocker 7c (docs/reviews/2026-07-19-m3-milestone-review-codex.md finding 7): "the linker/
// board cannot surface the state" — this is the board half. renderIndex/renderDag (the argument/
// INDEX.md + DAG.md mirrors Check 11 byte-diffs, src/gates/linker-render.ts) must visibly flag a
// shard whose persisted balloon state has crossed the mandatory-review threshold
// (isMandatoryReview, linker-parse.ts). The flag is purely ADDITIVE and conditional: a shard with
// no balloon marks (count 0, every pre-M3.6 shard, every EXISTING golden corpus fixture —
// linker-17..20, linker-25) must render byte-IDENTICAL to before this wave, or Check 11 would
// false-positive STALE on every one of those fixtures.

import { describe, expect, test } from "bun:test";
import type { Lemma } from "../../src/gates/linker-parse";
import { renderDag, renderIndex } from "../../src/gates/linker-render";

function lemma(overrides: Partial<Lemma> = {}): Lemma {
  return {
    id: "lem-x",
    path: "argument/lemmas/lem-x.md",
    kind: "lemma",
    status: "stated",
    af: "none",
    contract: "X holds.",
    defs: [],
    deps: [],
    routes: [],
    balloons: { count: 0, classifications: [] },
    ...overrides,
  };
}

describe("renderIndex / renderDag mandatory-review board flag (M3 blocker 7c)", () => {
  test("a never-ballooned shard renders with NO flag (backward-compat with every pre-M3.6/golden " +
    "corpus render)", () => {
    const l = lemma();
    expect(renderIndex([l])).not.toContain("MANDATORY-REVIEW");
    expect(renderDag([l])).not.toContain("MANDATORY-REVIEW");
  });

  test("renderIndex flags a mandatory-review shard's row visibly", () => {
    const l = lemma({ balloons: { count: 2, classifications: ["missing-fact", "dag-dep"] } });
    const out = renderIndex([l]);
    expect(out).toContain("MANDATORY-REVIEW");
    // The flag lives on the SAME row as the flagged shard's id, not merely somewhere in the doc.
    const row = out.split("\n").find((line) => line.includes("`lem-x`"));
    expect(row).toContain("MANDATORY-REVIEW");
  });

  test("renderDag flags a mandatory-review shard's own node label visibly", () => {
    const l = lemma({ balloons: { count: 1, classifications: ["genuine-gap"] } });
    const out = renderDag([l]);
    expect(out).toContain("MANDATORY-REVIEW");
    const nodeLine = out.split("\n").find((line) => line.trimStart().startsWith("lem-x["));
    expect(nodeLine).toContain("MANDATORY-REVIEW");
  });

  test("renderDag's unconditional classDef block is unchanged by the flag — no new classDef line, " +
    "since one would change EVERY render's byte output (flagged or not)", () => {
    const flagged = renderDag([lemma({ balloons: { count: 2, classifications: ["genuine-gap"] } })]);
    const unflagged = renderDag([lemma()]);
    const classdefLines = (s: string) => s.split("\n").filter((line) => line.trimStart().startsWith("classDef "));
    expect(classdefLines(flagged)).toEqual(classdefLines(unflagged));
  });

  test("only the flagged shard's row/node carries the mark when mixed with a clean shard", () => {
    const clean = lemma({ id: "lem-clean", path: "argument/lem-clean.md" });
    const flagged = lemma({ id: "lem-hot", path: "argument/lem-hot.md", balloons: { count: 2, classifications: ["missing-fact", "missing-fact"] } });
    const indexOut = renderIndex([clean, flagged]);
    const cleanRow = indexOut.split("\n").find((line) => line.includes("`lem-clean`"));
    const hotRow = indexOut.split("\n").find((line) => line.includes("`lem-hot`"));
    expect(cleanRow).not.toContain("MANDATORY-REVIEW");
    expect(hotRow).toContain("MANDATORY-REVIEW");
  });
});
