// 1:1 test file for src/gates/linker-lemma.ts (split from linker-parse.ts, rk-c83). `parseList`/
// `parseRoutes`/`allDepIds` previously had no dedicated unit test — their only coverage was
// indirect, through parseRegistry's own frontmatter-driven tests in test/gates/linker.test.ts
// (which never exercised the `routes:` OR-route grammar directly) and through corpus fixtures.
// These tests pin the grammar directly, per the module's own doc comments (ported from
// argument.py:68-90/98-103/120-121, aism-3ne).

import { describe, expect, test } from "bun:test";
import { allDepIds, parseList, parseRoutes, pyListRepr, type Lemma } from "../../src/gates/linker-lemma";

describe("parseList", () => {
  test("splits on ';' and trims each member", () => {
    expect(parseList("a; b ;c")).toEqual(["a", "b", "c"]);
  });
  test("absent/undefined defaults to []", () => {
    expect(parseList(undefined)).toEqual([]);
  });
  test("blank/whitespace-only members are dropped", () => {
    expect(parseList("a;;  ;b")).toEqual(["a", "b"]);
  });
});

describe("parseRoutes", () => {
  test("absent/blank defaults to [] (deps-only backward compat)", () => {
    expect(parseRoutes(undefined)).toEqual([]);
    expect(parseRoutes("")).toEqual([]);
    expect(parseRoutes("   ")).toEqual([]);
  });

  test("a single bracketed group is one route", () => {
    expect(parseRoutes("[a; b]")).toEqual([["a", "b"]]);
  });

  test("'|' separates multiple OR-routes, each its own conjunction group", () => {
    expect(parseRoutes("[a; b] | [c]")).toEqual([["a", "b"], ["c"]]);
  });

  test("whitespace around '|'/brackets/';' is ignored", () => {
    expect(parseRoutes(" [ a ; b ] | [c] ")).toEqual([["a", "b"], ["c"]]);
  });

  test("a group without brackets is still parsed as one route", () => {
    expect(parseRoutes("a; b")).toEqual([["a", "b"]]);
  });

  test("an empty group between '|'s is dropped, not an empty-array route", () => {
    expect(parseRoutes("[a] | [] | [b]")).toEqual([["a"], ["b"]]);
  });
});

describe("allDepIds", () => {
  function lemma(overrides: Partial<Lemma> = {}): Lemma {
    return {
      id: "lem-x", path: "argument/lem-x.md", kind: "lemma", af: "none", contract: "X.",
      defs: [], deps: [], routes: [], balloons: { count: 0, classifications: [] },
      ...overrides,
    };
  }

  test("deps-only shard: allDepIds is exactly deps", () => {
    expect(allDepIds(lemma({ deps: ["a", "b"] }))).toEqual(["a", "b"]);
  });

  test("routes-only shard: allDepIds is every route's members, flattened", () => {
    expect(allDepIds(lemma({ routes: [["a", "b"], ["c"]] }))).toEqual(["a", "b", "c"]);
  });

  test("deps + routes: union (deps first, then every route's members)", () => {
    expect(allDepIds(lemma({ deps: ["a"], routes: [["b", "c"]] }))).toEqual(["a", "b", "c"]);
  });
});

describe("pyListRepr", () => {
  test("renders a Python-repr-style quoted list", () => {
    expect(pyListRepr(["a", "b"])).toBe("['a', 'b']");
  });
  test("empty iterable renders as '[]'", () => {
    expect(pyListRepr([])).toBe("[]");
  });
});
