import { describe, expect, test } from "bun:test";
import { detectConflicts } from "../../src/scaffold/conflicts";

const MANIFEST_PATHS = [
  { path: "CLAUDE.md" },
  { path: "AGENTS.md" },
  { path: "PRD.md" },
  { path: ".rk/" },
  { path: "definitions/" },
];

describe("detectConflicts (pure)", () => {
  test("empty target dir: no conflicts", () => {
    expect(detectConflicts(MANIFEST_PATHS, new Set())).toEqual([]);
  });

  test("a pre-existing stamped file is reported", () => {
    expect(detectConflicts(MANIFEST_PATHS, new Set(["CLAUDE.md"]))).toEqual(["CLAUDE.md"]);
  });

  test("a pre-existing .rk/ directory is reported even though it's just another stamped entry", () => {
    expect(detectConflicts(MANIFEST_PATHS, new Set([".rk"]))).toEqual([".rk/"]);
  });

  test("a pre-existing directory entry matches without the manifest's trailing slash", () => {
    expect(detectConflicts(MANIFEST_PATHS, new Set(["definitions"]))).toEqual(["definitions/"]);
  });

  test("multiple conflicts, sorted", () => {
    expect(detectConflicts(MANIFEST_PATHS, new Set(["PRD.md", "AGENTS.md"]))).toEqual(["AGENTS.md", "PRD.md"]);
  });

  test("existing entries that are NOT in the manifest never count as conflicts", () => {
    expect(detectConflicts(MANIFEST_PATHS, new Set([".git", "README.md"]))).toEqual([]);
  });
});
