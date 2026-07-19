// Harness for corpus/graph/conflict-banked-unfresh-ledger/repo/ (M2-boundary-review blocker 6,
// degraded-fallback half). Drives the FULL pipeline end to end (src/store/build-graph.ts ->
// src/graph/assemble.ts -> src/graph/validate.ts), same shape as
// test/graph/corpus-conflict-banked-without-oracle.test.ts. `frCommand` points at a
// guaranteed-absent binary so this exercises fr's direct `.frontier/log.jsonl` ledger fallback
// (src/store/fr-load.ts's `runLedgerFallback`), which never recomputes verdict freshness —
// `verdictFresh` stays `undefined` unconditionally. The one log record has
// `evidence.verdict:"banked"`: pre-repair, `undefined !== false` read as oracle-backed and the
// mandatory conflict silently vanished.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildGraphDocument } from "../../src/store/build-graph";
import { validateGraphDocument } from "../../src/graph/validate";

const REPO = join(import.meta.dir, "..", "..", "corpus", "graph", "conflict-banked-unfresh-ledger", "repo");
const ABSENT = ["definitely-not-a-real-binary-xyz"];

describe("corpus/graph/conflict-banked-unfresh-ledger — verdictFresh:undefined via the ledger fallback is NOT oracle-backed", () => {
  test("fr outcome:banked, evidence.verdict:banked, ledger-fallback (verdictFresh stays undefined) -> still a banked-without-oracle conflict", () => {
    const { doc, report } = buildGraphDocument(REPO, { afCommand: ABSENT, frCommand: ABSENT });

    const frEdges = doc.edges.fr.filter((e) => e.cycle === 1);
    expect(frEdges).toHaveLength(1);
    const edge = frEdges[0]!;
    expect(edge.resolutionMethod).toBe("path");
    if (edge.resolutionMethod === "unresolved") throw new Error("unreachable");
    expect(edge.resolvedNodeId).toBe("lem-f");
    expect(edge.outcome).toBe("banked");
    expect(edge.verdict).toBe("banked"); // the claim itself says "banked"...
    expect(edge.verdictFresh).toBeUndefined(); // ...but freshness was never recomputed on this path

    expect(doc.conflicts).toEqual([
      {
        kind: "banked-without-oracle",
        edge: "fr",
        nodeId: "lem-f",
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
    const { doc } = buildGraphDocument(REPO, { afCommand: ABSENT, frCommand: ABSENT });
    const tampered = { ...doc, conflicts: [] };
    const issues = validateGraphDocument(tampered);
    expect(
      issues.some((i) => i.severity === "ERROR" && i.message.includes("missing conflict record: banked-without-oracle")),
    ).toBe(true);
  });
});
