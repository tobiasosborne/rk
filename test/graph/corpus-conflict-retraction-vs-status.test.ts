// Harness for corpus/graph/conflict-retraction-vs-status/repo/ (rk-0ehr / P1, graph
// `schema_version: "2"`): the FIFTH conflict class, end to end through the real pipeline
// (src/store/build-graph.ts -> src/store/retraction-load.ts -> src/graph/assemble.ts ->
// src/graph/validate.ts), same shape as test/graph/corpus-conflict-status-mismatch.test.ts.
//
// This fixture is the AISM 2026-07-28 incident at the GRAPH layer (its sibling
// corpus/linker/linker-44 is the same incident at the GATE layer): a `proved-mod-audit` shard whose
// bytes have NOT changed, with a retraction record pinned to exactly those current bytes. No af
// workspace exists in the fixture, so the retraction path is exercised in isolation — any other
// conflict kind appearing here would be a real defect, not fixture noise.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildGraphDocument } from "../../src/store/build-graph";
import { computeTaintTrace } from "../../src/graph/query-taint";
import { effectivePresentation } from "../../src/render/styling";
import { validateGraphDocument } from "../../src/graph/validate";

const FIXTURE = join(import.meta.dir, "..", "..", "corpus", "graph", "conflict-retraction-vs-status");
const REPO = join(FIXTURE, "repo");
const ABSENT = ["definitely-not-a-real-binary-xyz"];
const RETRACTED = "lem-stage1-approximate-group-laws";

function build() {
  return buildGraphDocument(REPO, { afCommand: ABSENT, frCommand: ABSENT });
}

describe("corpus/graph/conflict-retraction-vs-status — end-to-end retraction conflict (class e)", () => {
  test("a live retraction on an UNCHANGED shard produces exactly one retraction-vs-status conflict", () => {
    const { doc, report } = build();

    const edges = doc.edges.retraction;
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      nodeId: RETRACTED,
      ordinal: 0,
      contentHash: "3485c1304b11b33ee2ebebb7301ac838a41367eb72bf5ddcc96fc86d12c85f1b",
      hashDomain: "l5-shard-bytes",
      retractedBy: "audit:2026-07-28-independent-sweep",
      reason: "independent sweep found the stage-1 approximation step unjustified",
      resolved: true,
      // The hash comparison was REALLY performed against the file on disk — not a fail-closed
      // default. That is the whole point: the bytes are unchanged, and it is still retracted.
      live: true,
      currentHashObserved: true,
    });

    expect(doc.conflicts).toEqual([{
      kind: "retraction-vs-status",
      edge: "retraction",
      nodeId: RETRACTED,
      registryValue: "proved-mod-audit",
      otherValue: "retracted (l5-shard-bytes, ordinal 0)",
      message: "retraction-vs-status: registry='proved-mod-audit' vs other='retracted (l5-shard-bytes, ordinal 0)'",
    }]);

    expect(validateGraphDocument(doc)).toEqual([]); // recorded == recomputed, exactly
    expect(report.retractionRecordsIn).toBe(1);
    expect(report.retractionResolved).toBe(1);
    expect(report.retractionUnresolved).toBe(0);
    expect(report.retractionsLive).toBe(1);
  });

  test("the build reports the retraction ledger as READ, and stays structurally complete", () => {
    const { diagnostics } = build();
    expect(diagnostics.sources.retraction).toBe("read");
    expect(diagnostics.structuralLoss.retractionStoreProblems).toEqual([]);
    expect(diagnostics.isStructurallyComplete).toBe(true);
  });

  test("never auto-resolved: dropping the recorded conflict is an ERROR, not a silent pass", () => {
    const { doc } = build();
    const issues = validateGraphDocument({ ...doc, conflicts: [] });
    expect(issues.some((i) => i.severity === "ERROR" && i.message.includes("missing conflict record: retraction-vs-status"))).toBe(true);
  });

  test("propagation cascades: the dependent inherits the taint without a retraction of its own", () => {
    const { doc } = build();
    const trace = computeTaintTrace(doc);

    const retracted = trace.get(RETRACTED)!;
    expect(retracted.taint).toBe("tainted");
    expect(retracted.isSource).toBe(true);
    expect(retracted.reason).toContain("retracted by audit:2026-07-28-independent-sweep");

    const downstream = trace.get("lem-downstream")!;
    expect(downstream.taint).toBe("tainted");
    expect(downstream.isSource).toBe(false);
    expect(downstream.reason).toContain(RETRACTED);
    // ...and it carries no conflict of its own — nothing retracted IT.
    expect(doc.conflicts.filter((c) => c.nodeId === "lem-downstream")).toEqual([]);
  });

  test("RENDER VETO: the retracted node can never present as rigorous on any surface", () => {
    const { doc } = build();
    const trace = computeTaintTrace(doc);
    const node = doc.nodes.find((n) => n.id === RETRACTED)!;

    // This is the exact call every render surface makes (src/render/{dag,dashboard,node-view,
    // provenance-view}.ts, 5 call sites): declared status + "does a conflict name me" + taint.
    const view = effectivePresentation(
      node.status,
      doc.conflicts.some((c) => c.nodeId === RETRACTED),
      trace.get(RETRACTED)!.taint,
    );
    expect(view.isDefect).toBe(true);
    expect(view.rigorous).toBe(false);
    // The declared claim stays VISIBLE — truthfulness means showing the claim AND the withdrawal.
    expect(view.declaredStatus).toBe("proved-mod-audit");
    expect(view.label).toBe("declared proved-mod-audit; evidence conflicted, tainted");
  });
});
