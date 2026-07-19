// Harness for corpus/graph/conflict-status-mismatch/repo/ (M2.3, IMPLEMENTATION_PLAN.md acceptance
// row: "registry-status vs af-epistemic-state disagreement ... each conflict class has a corpus
// fixture"). Drives the FULL pipeline end to end (src/store/build-graph.ts's `buildGraphDocument`
// -> src/graph/assemble.ts -> src/graph/validate.ts), same shape as
// test/graph/corpus-rename-hazard.test.ts. `afCommand` points at this fixture's own deterministic
// `fake-af` stub (never a real af binary) so the exact epistemic/taint/contract triple is pinned
// and this fixture isolates status-mismatch alone — see the fixture's own lem-a.md and fake-af for
// the full rationale.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildGraphDocument } from "../../src/store/build-graph";
import { validateGraphDocument } from "../../src/graph/validate";

const FIXTURE = join(import.meta.dir, "..", "..", "corpus", "graph", "conflict-status-mismatch");
const REPO = join(FIXTURE, "repo");
const AF_COMMAND = [join(FIXTURE, "fake-af")];
const FR_ABSENT = ["definitely-not-a-real-binary-xyz"];

describe("corpus/graph/conflict-status-mismatch — end-to-end status-mismatch conflict (class a)", () => {
  test("registry proved/validated vs af epistemic_state:pending -> exactly one status-mismatch conflict", () => {
    const { doc, report } = buildGraphDocument(REPO, { afCommand: AF_COMMAND, frCommand: FR_ABSENT });

    const afEdges = doc.edges.af.filter((e) => e.nodeId === "lem-a");
    expect(afEdges).toHaveLength(1);
    const edge = afEdges[0]!;
    expect(edge.workspaceResolved).toBe(true);
    if (!edge.workspaceResolved) throw new Error("unreachable");
    expect(edge.contractMatch).toBe(true); // held constant — proves isolation from contract-mismatch
    expect(edge.taintState).toBe("clean"); // held constant — proves isolation from taint-status-mismatch
    expect(edge.epistemicState).toBe("pending"); // the actual disagreement

    expect(doc.conflicts).toEqual([
      {
        kind: "status-mismatch",
        edge: "af",
        nodeId: "lem-a",
        registryValue: "proved",
        otherValue: "pending",
        message: "status-mismatch: registry='proved' vs other='pending'",
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
    expect(issues.some((i) => i.severity === "ERROR" && i.message.includes("missing conflict record: status-mismatch"))).toBe(
      true,
    );
  });
});
