// Harness for corpus/graph/conflict-fr-superseded/repo/ (M2-boundary-review blocker 7). Drives
// the FULL pipeline end to end (src/store/build-graph.ts -> src/graph/assemble.ts ->
// src/graph/validate.ts), same shape as test/graph/corpus-conflict-banked-without-oracle.test.ts.
// `frCommand` points at a guaranteed-absent binary, exercising fr's direct `.frontier/log.jsonl`
// ledger fallback deterministically — this also proves the `supersedes` field survives the raw
// JSONL -> src/store/fr-load.ts -> src/graph/from-fr.ts -> src/graph/validate-conflicts.ts wiring
// end to end, not just the pure recomputation in isolation (see test/graph/validate.test.ts's
// "M2-boundary-review blocker 7" describe block for that unit-level coverage).

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildGraphDocument } from "../../src/store/build-graph";
import { validateGraphDocument } from "../../src/graph/validate";

const REPO = join(import.meta.dir, "..", "..", "corpus", "graph", "conflict-fr-superseded", "repo");
const ABSENT = ["definitely-not-a-real-binary-xyz"];

describe("corpus/graph/conflict-fr-superseded — a superseded cycle contributes no conflict; its unsuperseded successor still does", () => {
  test("cycle 1 (superseded by cycle 2) yields NO conflict; cycle 2 (unsuperseded) yields exactly one", () => {
    const { doc } = buildGraphDocument(REPO, { afCommand: ABSENT, frCommand: ABSENT });

    const frEdges = doc.edges.fr.filter((e) => e.resolvedNodeId === "lem-h" || e.artifact.includes("lem-h"));
    expect(frEdges).toHaveLength(2);
    const cycle1 = frEdges.find((e) => e.cycle === 1)!;
    const cycle2 = frEdges.find((e) => e.cycle === 2)!;
    expect(cycle1.supersedes).toBeUndefined();
    expect(cycle2.supersedes).toBe(1); // the wiring under test: raw JSONL -> FrEdge

    // Both cycles remain fully visible in edges.fr regardless of supersession — only the
    // CONFLICT computation excludes the superseded one.
    expect(doc.edges.fr).toHaveLength(2);

    expect(doc.conflicts).toEqual([
      {
        kind: "banked-without-oracle",
        edge: "fr",
        nodeId: "lem-h",
        registryValue: "banked",
        otherValue: "claimed",
        message: "banked-without-oracle: registry='banked' vs other='claimed'",
      },
    ]);

    expect(validateGraphDocument(doc)).toEqual([]);
  });

  test("never-auto-resolved: dropping the recorded conflict is an ERROR, not a silent pass", () => {
    const { doc } = buildGraphDocument(REPO, { afCommand: ABSENT, frCommand: ABSENT });
    const tampered = { ...doc, conflicts: [] };
    const issues = validateGraphDocument(tampered);
    expect(
      issues.some((i) => i.severity === "ERROR" && i.message.includes("missing conflict record: banked-without-oracle")),
    ).toBe(true);
  });
});
