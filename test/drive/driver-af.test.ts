// 1:1 test for src/drive/driver-af.ts's PURE parsers (M3.6). The spawn edges (readAfWorkspace /
// applyVerdictFile) are exercised through the run-loop's injected fakes; here we pin the parse of
// af's own JSON shapes (../vibefeld/docs/export-graph-v1.md + internal/service/verdicts_apply.go).

import { describe, expect, test } from "bun:test";
import { parseAfExport, parseVerdictReport, preflightAfExport, buildRecordProofChildren } from "../../src/drive/driver-af";

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
    // rk-jit repair (STOP-4, blocker 1): af's `type` field is threaded so isProoflessNode can pin the
    // fresh-root shape (id "1", type "claim") without discarding legitimate terminal-assumption leaves.
    expect(n1.type).toBe("claim");
    expect(n11.type).toBe("claim");
  });
  test("rejects a body with no nodes[] array", () => {
    expect(parseAfExport("{}", "w").ok).toBe(false);
    expect(parseAfExport("not json", "w").ok).toBe(false);
  });

  // rk B2/B3: recorded dependencies[] and the closure flag are read off the export.
  test("reads dependencies[] (rk B2) and closed (rk B3)", () => {
    const raw2 = JSON.stringify({
      schema_version: "1",
      features: ["readiness-flags", "closure-flag", "node-dependencies"],
      nodes: [
        { id: "1", type: "claim", statement: "P", epistemic_state: "validated", workflow_state: "available", taint_state: "clean", content_hash: "h1", closed: true },
        { id: "1.2", type: "claim", statement: "Uses A", epistemic_state: "pending", workflow_state: "available", taint_state: "clean", content_hash: "h2", dependencies: ["1.1"] },
      ],
      validation: { total_nodes: 2 },
    });
    const r = parseAfExport(raw2, "w");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.nodes.find((n) => n.id === "1")!.closed).toBe(true);
    expect(r.value.nodes.find((n) => n.id === "1.2")!.deps).toEqual(["1.1"]);
    // Omitted closed reads false; omitted dependencies reads undefined.
    expect(r.value.nodes.find((n) => n.id === "1.2")!.closed).toBe(false);
    expect(r.value.nodes.find((n) => n.id === "1")!.deps).toBeUndefined();
  });
});

// rk B2/FU3: the `af record-proof --children` JSON mapping carries per-child depends (no longer
// dropped) and maps justification → af's `inference` key.
describe("buildRecordProofChildren — ProofContent → af record-proof --children JSON (rk B2)", () => {
  test("carries statement, maps justification→inference, and keeps per-child depends", () => {
    const children = buildRecordProofChildren({
      children: [
        { statement: "Lemma A" },
        { statement: "Uses A", justification: "modus_ponens", depends: ["#0"] },
        { statement: "Uses existing", depends: ["1.1"] },
      ],
    });
    expect(children).toEqual([
      { statement: "Lemma A" },
      { statement: "Uses A", inference: "modus_ponens", depends: ["#0"] },
      { statement: "Uses existing", depends: ["1.1"] },
    ]);
  });
  test("omits an empty depends and an absent justification", () => {
    expect(buildRecordProofChildren({ children: [{ statement: "S", depends: [] }] })).toEqual([{ statement: "S" }]);
  });
  // GAP 6 seam: a FREE-TEXT justification (a real math step outside af's known logic-rule set) is
  // passed straight through as af's `inference` VERBATIM — no enum bridge, no coercion. af now
  // accepts any non-blank free-text inference (../vibefeld schema.ValidateJustification), so this is
  // the shape that records the prover's true derivation label (the live GAP-6 label was exactly
  // "multiplication_by_positive"). rk deliberately does NOT map it to a logic rule (that would be a
  // provenance lie).
  test("passes a free-text (non-enum) justification through as `inference`, verbatim", () => {
    const children = buildRecordProofChildren({
      children: [
        { statement: "multiply the weighted inequality by w_i > 0", justification: "multiplication_by_positive" },
        { statement: "monotone step", justification: "monotonicity", depends: ["#0"] },
      ],
    });
    expect(children).toEqual([
      { statement: "multiply the weighted inequality by w_i > 0", inference: "multiplication_by_positive" },
      { statement: "monotone step", inference: "monotonicity", depends: ["#0"] },
    ]);
  });
});

// rk FU5: a live run must fail loudly at preflight against an af too old to emit the
// readiness/closure/dependencies capabilities — an older af omits features[], and its absent
// omitempty flags would otherwise read as "nothing ready / not closed" → a false root-unvalidated.
describe("preflightAfExport — schema_version + capability check (rk FU5)", () => {
  const withFeatures = (features?: unknown) =>
    JSON.stringify({ schema_version: "1", ...(features === undefined ? {} : { features }), nodes: [], validation: {} });

  test("accepts schema_version '1' with all required capabilities", () => {
    expect(preflightAfExport(withFeatures(["readiness-flags", "closure-flag", "node-dependencies"])).ok).toBe(true);
  });
  test("rejects an af whose export omits features[] entirely (too old)", () => {
    const r = preflightAfExport(withFeatures(undefined));
    expect(r.ok).toBe(false);
  });
  test("rejects when a required capability is missing", () => {
    const r = preflightAfExport(withFeatures(["readiness-flags"])); // no closure-flag / node-dependencies
    expect(r.ok).toBe(false);
  });
  test("rejects a wrong schema_version", () => {
    const r = preflightAfExport(JSON.stringify({ schema_version: "2", features: ["readiness-flags", "closure-flag", "node-dependencies"], nodes: [] }));
    expect(r.ok).toBe(false);
  });
  test("rejects unparseable JSON", () => {
    expect(preflightAfExport("not json").ok).toBe(false);
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
