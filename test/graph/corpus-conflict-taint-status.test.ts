// Harness for corpus/graph/conflict-taint-status/repo/ (M2.3, IMPLEMENTATION_PLAN.md acceptance
// row: "taint vs status inconsistency (proved + tainted)"). Drives the FULL pipeline end to end
// (src/store/build-graph.ts -> src/graph/assemble.ts -> src/graph/validate.ts), same shape as
// test/graph/corpus-rename-hazard.test.ts. `afCommand` points at this fixture's own deterministic
// `fake-af` stub, pinning contractMatch/epistemic_state at their non-conflicting values so this
// fixture isolates taint-status-mismatch alone.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildGraphDocument } from "../../src/store/build-graph";
import { validateGraphDocument } from "../../src/graph/validate";

const FIXTURE = join(import.meta.dir, "..", "..", "corpus", "graph", "conflict-taint-status");
const REPO = join(FIXTURE, "repo");
const AF_COMMAND = [join(FIXTURE, "fake-af")];
const FR_ABSENT = ["definitely-not-a-real-binary-xyz"];

describe("corpus/graph/conflict-taint-status — end-to-end taint-status-mismatch conflict (class c)", () => {
  test("registry proved vs af taint_state:tainted -> exactly one taint-status-mismatch conflict", () => {
    const { doc, report } = buildGraphDocument(REPO, { afCommand: AF_COMMAND, frCommand: FR_ABSENT });

    const afEdges = doc.edges.af.filter((e) => e.nodeId === "lem-c");
    expect(afEdges).toHaveLength(1);
    const edge = afEdges[0]!;
    expect(edge.workspaceResolved).toBe(true);
    if (!edge.workspaceResolved) throw new Error("unreachable");
    expect(edge.contractMatch).toBe(true); // held constant — proves isolation from contract-mismatch
    expect(edge.epistemicState).toBe("validated"); // held constant — proves isolation from status-mismatch
    expect(edge.taintState).toBe("tainted"); // the actual inconsistency

    expect(doc.conflicts).toEqual([
      {
        kind: "taint-status-mismatch",
        edge: "af",
        nodeId: "lem-c",
        registryValue: "proved",
        otherValue: "tainted",
        message: "taint-status-mismatch: registry='proved' vs other='tainted'",
      },
    ]);

    expect(validateGraphDocument(doc)).toEqual([]); // recorded == recomputed, exactly
    expect(report.afResolved).toBe(1);
    expect(report.afUnresolved).toBe(0);
  });

  test("never-auto-resolved: dropping the recorded conflict is an ERROR, not a silent pass", () => {
    const { doc } = buildGraphDocument(REPO, { afCommand: AF_COMMAND, frCommand: FR_ABSENT });
    const tampered = { ...doc, conflicts: [] };
    const issues = validateGraphDocument(tampered);
    expect(
      issues.some((i) => i.severity === "ERROR" && i.message.includes("missing conflict record: taint-status-mismatch")),
    ).toBe(true);
  });
});
