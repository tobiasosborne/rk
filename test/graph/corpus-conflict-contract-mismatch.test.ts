// Harness for corpus/graph/conflict-contract-mismatch/repo/ (M2.3, IMPLEMENTATION_PLAN.md
// acceptance row: "contract byte-mismatch (registry contract != af root statement) ... resolved
// workspace, contractMatch:false, mandatory conflict record"). Drives the FULL pipeline end to end
// (src/store/build-graph.ts -> src/graph/assemble.ts -> src/graph/validate.ts), same shape as
// test/graph/corpus-rename-hazard.test.ts. `afCommand` points at this fixture's own deterministic
// `fake-af` stub, pinning epistemic_state/taint_state at their non-conflicting values so this
// fixture isolates contract-mismatch alone.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildGraphDocument } from "../../src/store/build-graph";
import { validateGraphDocument } from "../../src/graph/validate";

const FIXTURE = join(import.meta.dir, "..", "..", "corpus", "graph", "conflict-contract-mismatch");
const REPO = join(FIXTURE, "repo");
const AF_COMMAND = [join(FIXTURE, "fake-af")];
const FR_ABSENT = ["definitely-not-a-real-binary-xyz"];

describe("corpus/graph/conflict-contract-mismatch — end-to-end contract-mismatch conflict (class b)", () => {
  test("resolved workspace, contractMatch:false -> exactly one MANDATORY contract-mismatch conflict", () => {
    const { doc, report } = buildGraphDocument(REPO, { afCommand: AF_COMMAND, frCommand: FR_ABSENT });

    const afEdges = doc.edges.af.filter((e) => e.nodeId === "lem-b");
    expect(afEdges).toHaveLength(1);
    const edge = afEdges[0]!;
    expect(edge.workspaceResolved).toBe(true);
    if (!edge.workspaceResolved) throw new Error("unreachable");
    expect(edge.contractMatch).toBe(false); // the actual mismatch
    expect(edge.epistemicState).toBe("validated"); // held constant — proves isolation from status-mismatch
    expect(edge.taintState).toBe("clean"); // held constant — proves isolation from taint-status-mismatch

    // Never silently unresolved-bucketed: a contract mismatch on a RESOLVED workspace is a
    // conflict, not an unresolved reference (Tier A review blocker 3).
    expect(doc.unresolved.some((u) => u.nodeId === "lem-b")).toBe(false);

    expect(doc.conflicts).toEqual([
      {
        kind: "contract-mismatch",
        edge: "af",
        nodeId: "lem-b",
        registryValue: "proved",
        otherValue: "contractMatch:false",
        message: "contract-mismatch: registry='proved' vs other='contractMatch:false'",
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
      issues.some((i) => i.severity === "ERROR" && i.message.includes("missing conflict record: contract-mismatch")),
    ).toBe(true);
  });
});
