// 1:1 test file for src/graph/types.ts (CLAUDE.md rule 4: "One module, one job, one test
// file"). types.ts is type-only plus a handful of exported constants/enums — this file pins
// those runtime values against the PRD/gate-contracts.md ground truth they mirror, so a future
// edit to the shared constant sets (e.g. adding a rigour-ladder status) cannot silently drift
// from src/gates/linker-parse.ts's own `KINDS`/`MATH_STATUS`/`AF_STATES` sets without a test
// noticing on BOTH sides.

import { describe, expect, test } from "bun:test";
import {
  AF_FLAGS,
  BALLOON_CLASSIFICATIONS,
  GRAPH_SCHEMA_VERSION,
  REGISTRY_KINDS,
  RIGOUR_STATUSES,
} from "../../src/graph/types";

describe("src/graph/types.ts — shared constants", () => {
  test("GRAPH_SCHEMA_VERSION is the string \"2\", matching schemas/graph.v1.json's schema_version const", () => {
    // Bumped by rk-0ehr / P1: the closed conflictKind enum gained `retraction-vs-status` and
    // `edges` gained a fifth array — a compat event under CLAUDE.md rule 10, not a silent widening.
    expect(GRAPH_SCHEMA_VERSION).toBe("2");
  });

  test("REGISTRY_KINDS matches linker-parse.ts's KINDS set exactly", () => {
    expect([...REGISTRY_KINDS].sort()).toEqual(
      ["corollary", "lemma", "obstruction", "open-problem", "proposition", "theorem"].sort(),
    );
  });

  test("RIGOUR_STATUSES matches linker-parse.ts's MATH_STATUS set exactly (the rigour ladder minus Lean, D5)", () => {
    expect([...RIGOUR_STATUSES].sort()).toEqual(
      [
        "proved", "cited", "consensus", "open", "obstruction", "disproved", "stated",
        "proved-mod-audit", "conjecture", "heuristic", "numerical",
      ].sort(),
    );
  });

  test("AF_FLAGS matches linker-parse.ts's AF_STATES set exactly", () => {
    expect([...AF_FLAGS].sort()).toEqual(["none", "seeded", "validated"].sort());
  });

  test("BALLOON_CLASSIFICATIONS matches PRD C9's balloon-event classification triad", () => {
    expect([...BALLOON_CLASSIFICATIONS].sort()).toEqual(["dag-dep", "genuine-gap", "missing-fact"].sort());
  });
});
