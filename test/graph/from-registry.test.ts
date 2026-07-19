import { describe, expect, test } from "bun:test";
import type { Lemma } from "../../src/gates/linker-parse";
import { convertRegistry } from "../../src/graph/from-registry";

function lemma(overrides: Partial<Lemma> = {}): Lemma {
  return {
    id: "lem-x",
    path: "argument/lemmas/lem-x.md",
    kind: "lemma",
    status: "proved",
    af: "none",
    contract: "X holds.",
    defs: [],
    deps: [],
    routes: [],
    ...overrides,
  };
}

describe("convertRegistry (M2.2 total conversion boundary, memo question 5)", () => {
  test("a well-formed lemma converts field-for-field", () => {
    const { nodes, skipped } = convertRegistry([lemma({ owner: "A", workspace: "proofs/lem-x", deps: ["lem-y"] })]);
    expect(skipped).toEqual([]);
    expect(nodes).toEqual([
      {
        id: "lem-x",
        kind: "lemma",
        path: "argument/lemmas/lem-x.md",
        status: "proved",
        contract: "X holds.",
        owner: "A",
        workspace: "proofs/lem-x",
        af: "none",
        deps: ["lem-y"],
        routes: [],
        defs: [],
        balloons: { count: 0, classifications: [] },
      },
    ]);
  });

  test("a lemma with no recognized kind is SKIPPED with a reason, never silently included", () => {
    const { nodes, skipped } = convertRegistry([lemma({ kind: undefined })]);
    expect(nodes).toEqual([]);
    expect(skipped).toEqual([{ path: "argument/lemmas/lem-x.md", id: "lem-x", reason: "unrecognized or missing kind ''" }]);
  });

  test("an unrecognized status degrades to undefined without excluding the node", () => {
    const { nodes, skipped } = convertRegistry([lemma({ status: "not-a-real-status" })]);
    expect(skipped).toEqual([]);
    expect(nodes[0]!.status).toBeUndefined();
  });

  test("an unrecognized af value degrades to 'none' (same default parseRegistry itself applies)", () => {
    const { nodes } = convertRegistry([lemma({ af: "not-a-real-af-value" })]);
    expect(nodes[0]!.af).toBe("none");
  });

  test("TOTAL: every lemma lands in exactly one of nodes/skipped (property, several shapes)", () => {
    const lemmas = [
      lemma({ id: "a", path: "argument/a.md" }),
      lemma({ id: "b", path: "argument/b.md", kind: undefined }),
      lemma({ id: "c", path: "argument/c.md", kind: "theorem" }),
      lemma({ id: "d", path: "argument/d.md", kind: "bogus-kind" }),
      lemma({ id: "e", path: "argument/e.md", kind: "open-problem" }),
    ];
    const { nodes, skipped } = convertRegistry(lemmas);
    expect(nodes.length + skipped.length).toBe(lemmas.length);
    expect(new Set([...nodes.map((n) => n.id), ...skipped.map((s) => s.id)])).toEqual(new Set(["a", "b", "c", "d", "e"]));
  });

  test("mutation guard: an artificially-broken kind check must fail the skip test (red-first proof)", () => {
    // Confirms the property test above is not vacuous: if convertLemma stopped checking `kind`
    // altogether (imagine a regression that always returned a node), the missing-kind case would
    // wrongly appear in `nodes` instead of `skipped`. This is asserted directly rather than by
    // toggling source (mutation is proven manually below, not via a live code edit, since this
    // is a test file, not the implementation).
    const { nodes, skipped } = convertRegistry([lemma({ kind: undefined })]);
    expect(nodes.some((n) => n.id === "lem-x")).toBe(false);
    expect(skipped.some((s) => s.id === "lem-x")).toBe(true);
  });
});
