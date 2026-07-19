// Harness for corpus/graph/conflict-banked-without-oracle/repo/ (M2.3, IMPLEMENTATION_PLAN.md
// acceptance row: "fr banked-claim without oracle verdict"). Drives the FULL pipeline end to end
// (src/store/build-graph.ts -> src/graph/assemble.ts -> src/graph/validate.ts), same shape as
// test/graph/corpus-rename-hazard.test.ts. Both `afCommand`/`frCommand` point at guaranteed-absent
// binaries: this fixture's node carries `af: none` (no af edge involved at all), and `frCommand`
// being unavailable exercises fr's direct `.frontier/log.jsonl` ledger fallback
// (src/store/fr-load.ts's `runLedgerFallback`) deterministically.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildGraphDocument } from "../../src/store/build-graph";
import { validateGraphDocument } from "../../src/graph/validate";

const REPO = join(import.meta.dir, "..", "..", "corpus", "graph", "conflict-banked-without-oracle", "repo");
const ABSENT = ["definitely-not-a-real-binary-xyz"];

describe("corpus/graph/conflict-banked-without-oracle — end-to-end banked-without-oracle conflict (class d)", () => {
  test("fr outcome:banked with verdict:claimed (never banked) -> exactly one banked-without-oracle conflict", () => {
    const { doc, report } = buildGraphDocument(REPO, { afCommand: ABSENT, frCommand: ABSENT });

    expect(doc.edges.af).toHaveLength(0); // af: none — no af edge involved in this conflict at all

    const frEdges = doc.edges.fr.filter((e) => e.cycle === 1);
    expect(frEdges).toHaveLength(1);
    const edge = frEdges[0]!;
    expect(edge.resolutionMethod).toBe("path");
    if (edge.resolutionMethod === "unresolved") throw new Error("unreachable");
    expect(edge.resolvedNodeId).toBe("lem-d");
    expect(edge.outcome).toBe("banked");
    expect(edge.verdict).toBe("claimed"); // never "banked" — the oracle gate is unmet

    expect(doc.conflicts).toEqual([
      {
        kind: "banked-without-oracle",
        edge: "fr",
        nodeId: "lem-d",
        registryValue: "banked",
        otherValue: "claimed",
        message: "banked-without-oracle: registry='banked' vs other='claimed'",
      },
    ]);

    expect(validateGraphDocument(doc)).toEqual([]); // recorded == recomputed, exactly
    expect(report.frResolved).toBe(1);
    expect(report.frUnresolved).toBe(0);
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
