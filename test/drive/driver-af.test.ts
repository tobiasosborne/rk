// 1:1 test for src/drive/driver-af.ts's PURE parsers (M3.6). The spawn edges (readAfWorkspace /
// applyVerdictFile) are exercised through the run-loop's injected fakes; here we pin the parse of
// af's own JSON shapes (../vibefeld/docs/export-graph-v1.md + internal/service/verdicts_apply.go).

import { describe, expect, test } from "bun:test";
import { parseAfExport, parseVerdictReport } from "../../src/drive/driver-af";

describe("parseAfExport — af export --graph json → node view (reads recorded axes, reads crux raw)", () => {
  const raw = JSON.stringify({
    schema_version: "1",
    workspace: { id: "/abs/proofs/lem-x" },
    nodes: [
      { id: "1", type: "claim", statement: "P", epistemic_state: "pending", workflow_state: "claimed", taint_state: "unresolved", content_hash: "h1", crux: true, author: "prover-a" },
      { id: "1.1", type: "claim", statement: "Q", epistemic_state: "validated", workflow_state: "available", taint_state: "clean", content_hash: "h2" },
    ],
    validation: { total_nodes: 2 },
  });
  test("parses nodes, crux (omitted=false), author, and node count", () => {
    const r = parseAfExport(raw, "proofs/lem-x");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.nodeCount).toBe(2);
    expect(r.value.rootStatement).toBe("P");
    const n1 = r.value.nodes.find((n) => n.id === "1")!;
    expect(n1.crux).toBe(true);
    expect(n1.author).toBe("prover-a");
    const n11 = r.value.nodes.find((n) => n.id === "1.1")!;
    expect(n11.crux).toBe(false); // omitted-if-false
    expect(n11.epistemicState).toBe("validated");
  });
  test("rejects a body with no nodes[] array", () => {
    expect(parseAfExport("{}", "w").ok).toBe(false);
    expect(parseAfExport("not json", "w").ok).toBe(false);
  });
});

describe("parseVerdictReport — af verdicts apply --format json → outcomes + exit", () => {
  test("carries per-item status verbatim and the exit code", () => {
    const raw = JSON.stringify({
      batch_id: "batch-abc",
      verified_by: "gpt|codex|m|s",
      items: [
        { node: "1.1", verdict: "accept", status: "applied" },
        { node: "1", verdict: "accept", status: "blocked-by:children-not-validated", detail: "1.1 pending" },
      ],
      applied: 1,
      blocked: 1,
      rejected: 0,
    });
    const r = parseVerdictReport(raw, 5);
    expect(r.exit).toBe(5);
    expect(r.applied).toBe(1);
    expect(r.items[0]!.status).toBe("applied");
    expect(r.items[1]!.status).toBe("blocked-by:children-not-validated");
    expect(r.items[1]!.detail).toBe("1.1 pending");
  });
  test("a non-JSON body still preserves the exit code (never lost)", () => {
    const r = parseVerdictReport("VERDICTS_FILE_INVALID", 3);
    expect(r.exit).toBe(3);
    expect(r.items).toEqual([]);
  });
});
