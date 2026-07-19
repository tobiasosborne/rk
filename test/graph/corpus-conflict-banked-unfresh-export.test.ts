// Harness for corpus/graph/conflict-banked-unfresh-export/repo/ (M2-boundary-review blocker 6,
// primary-export half). Drives the FULL pipeline end to end (src/store/build-graph.ts ->
// src/graph/assemble.ts -> src/graph/validate.ts). `frCommand` points at the fixture's own
// deterministic `fake-fr` stub (the PRIMARY `fr export` path, not the ledger fallback — see the
// sibling conflict-banked-unfresh-ledger fixture for that half): the stub reports one cycle with
// `evidence.verdict:"banked"` but names NO matching claim in its own `verdicts` array, so
// `verdictFresh` stays `undefined` (no oracle freshness record exists at all). Pre-repair,
// `undefined !== false` read as oracle-backed and the mandatory conflict silently vanished.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildGraphDocument } from "../../src/store/build-graph";
import { validateGraphDocument } from "../../src/graph/validate";

const FIXTURE = join(import.meta.dir, "..", "..", "corpus", "graph", "conflict-banked-unfresh-export");
const REPO = join(FIXTURE, "repo");
const FR_COMMAND = [join(FIXTURE, "fake-fr")];
const AF_ABSENT = ["definitely-not-a-real-binary-xyz"];

describe("corpus/graph/conflict-banked-unfresh-export — verdictFresh:undefined via the primary export path is NOT oracle-backed", () => {
  test("fr outcome:banked, evidence.verdict:banked, no matching verdicts[] entry (verdictFresh undefined) -> still a banked-without-oracle conflict", () => {
    const { doc, report } = buildGraphDocument(REPO, { afCommand: AF_ABSENT, frCommand: FR_COMMAND });

    const frEdges = doc.edges.fr.filter((e) => e.cycle === 1);
    expect(frEdges).toHaveLength(1);
    const edge = frEdges[0]!;
    expect(edge.resolutionMethod).toBe("path");
    if (edge.resolutionMethod === "unresolved") throw new Error("unreachable");
    expect(edge.resolvedNodeId).toBe("lem-g");
    expect(edge.outcome).toBe("banked");
    expect(edge.verdict).toBe("banked");
    expect(edge.verdictFresh).toBeUndefined(); // no verdicts[] entry names this artifact at all

    expect(doc.conflicts).toEqual([
      {
        kind: "banked-without-oracle",
        edge: "fr",
        nodeId: "lem-g",
        registryValue: "banked",
        otherValue: "banked",
        message: "banked-without-oracle: registry='banked' vs other='banked'",
      },
    ]);

    expect(validateGraphDocument(doc)).toEqual([]);
    expect(report.frResolved).toBe(1);
    expect(report.frUnresolved).toBe(0);
  });

  test("never-auto-resolved: dropping the recorded conflict is an ERROR, not a silent pass", () => {
    const { doc } = buildGraphDocument(REPO, { afCommand: AF_ABSENT, frCommand: FR_COMMAND });
    const tampered = { ...doc, conflicts: [] };
    const issues = validateGraphDocument(tampered);
    expect(
      issues.some((i) => i.severity === "ERROR" && i.message.includes("missing conflict record: banked-without-oracle")),
    ).toBe(true);
  });
});
