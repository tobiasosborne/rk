// rk-0ehr / P1 at the GRAPH level (`schema_version: "2"`): the fifth conflict kind
// (`retraction-vs-status`), its recomputation invariant, the retraction taint source, and the
// canonical ordering of `edges.retraction`. End-to-end fixture:
// corpus/graph/conflict-retraction-vs-status/ + test/graph/corpus-conflict-retraction-vs-status.ts.

import { describe, expect, test } from "bun:test";
import type { Lemma } from "../../src/gates/linker-parse";
import { assembleGraphDocument, type RawStoreInput } from "../../src/graph/assemble";
import type { RetractionSourceRecord } from "../../src/graph/from-retraction";
import { canonicalizeGraphDocument, serializeGraphDocument } from "../../src/graph/serialize";
import { computeTaintTrace } from "../../src/graph/query-taint";
import { validateGraphDocument } from "../../src/graph/validate";

const HASH = "a".repeat(64);

function lemma(overrides: Partial<Lemma> = {}): Lemma {
  return {
    id: "lem-x", path: "argument/lemmas/lem-x.md", kind: "lemma", af: "none", contract: "X holds.",
    defs: [], deps: [], routes: [], balloons: { count: 0, classifications: [] }, ...overrides,
  };
}

function retraction(over: Partial<RetractionSourceRecord> = {}): RetractionSourceRecord {
  return {
    itemId: "lem-x", ordinal: 0, contentHash: HASH, hashDomain: "l5-shard-bytes",
    retractedBy: "audit:2026-07-28-independent-sweep", reason: "sweep found the proof defective",
    live: true, currentHashObserved: true, ...over,
  };
}

function build(input: Partial<RawStoreInput> = {}) {
  return assembleGraphDocument({
    lemmas: [lemma({ status: "proved-mod-audit" })], afRecords: [], frRecords: [], bdRecords: [],
    retractionRecords: [retraction()], ...input,
  });
}

describe("retraction-vs-status — the fifth conflict kind", () => {
  test("a LIVE retraction on a resolved node ALWAYS produces exactly one mandatory conflict", () => {
    const { doc } = build();
    expect(doc.conflicts).toEqual([{
      kind: "retraction-vs-status",
      edge: "retraction",
      nodeId: "lem-x",
      registryValue: "proved-mod-audit",
      otherValue: "retracted (l5-shard-bytes, ordinal 0)",
      message: "retraction-vs-status: registry='proved-mod-audit' vs other='retracted (l5-shard-bytes, ordinal 0)'",
    }]);
    expect(validateGraphDocument(doc)).toEqual([]);
  });

  test("it fires regardless of declared status — even on an already-demoted shard", () => {
    const { doc } = build({ lemmas: [lemma({ status: "stated" })] });
    expect(doc.conflicts).toHaveLength(1);
    expect(doc.conflicts[0]!.registryValue).toBe("stated");
    expect(validateGraphDocument(doc)).toEqual([]);
  });

  test("a shard with NO declared status still conflicts, reported as 'unset' rather than dropped", () => {
    const { doc } = build({ lemmas: [lemma({ status: undefined })] });
    expect(doc.conflicts[0]!.registryValue).toBe("unset");
  });

  test("a retraction released by an edit (not live) produces NO conflict — the edge stays visible", () => {
    const { doc } = build({ retractionRecords: [retraction({ live: false })] });
    expect(doc.conflicts).toEqual([]);
    expect(doc.edges.retraction).toHaveLength(1);
    expect(validateGraphDocument(doc)).toEqual([]);
  });

  test("a retraction naming no registry node produces no conflict, but IS in the unresolved bucket", () => {
    const { doc } = build({ retractionRecords: [retraction({ itemId: "lem-ghost" })] });
    expect(doc.conflicts).toEqual([]);
    expect(doc.unresolved).toEqual([{
      edge: "retraction", ref: "lem-ghost",
      reason: "retraction record (ordinal 0) names itemId 'lem-ghost', which is not a registry node",
    }]);
    expect(validateGraphDocument(doc)).toEqual([]);
  });

  test("two live retractions on ONE node coalesce into one node-level conflict (identity is per node)", () => {
    const { doc } = build({ retractionRecords: [retraction(), retraction({ ordinal: 1, reason: "second" })] });
    expect(doc.conflicts).toHaveLength(1);
    // The highest-ordinal live record is the one named — deterministic, never an arbitrary pick.
    expect(doc.conflicts[0]!.otherValue).toBe("retracted (l5-shard-bytes, ordinal 1)");
    expect(validateGraphDocument(doc)).toEqual([]);
  });

  test("both hash domains are conflict-bearing, and each names its own domain", () => {
    const { doc } = build({ retractionRecords: [retraction({ hashDomain: "af-canonical", currentHashObserved: false })] });
    expect(doc.conflicts[0]!.otherValue).toBe("retracted (af-canonical, ordinal 0)");
  });
});

describe("retraction-vs-status — never auto-resolved (the recomputation invariant)", () => {
  test("dropping the recorded conflict is an ERROR", () => {
    const { doc } = build();
    const issues = validateGraphDocument({ ...doc, conflicts: [] });
    expect(issues.some((i) => i.severity === "ERROR" && i.message.includes("missing conflict record: retraction-vs-status"))).toBe(true);
  });

  test("duplicating it is an ERROR", () => {
    const { doc } = build();
    const issues = validateGraphDocument({ ...doc, conflicts: [doc.conflicts[0]!, doc.conflicts[0]!] });
    expect(issues.some((i) => i.severity === "ERROR" && i.message.includes("duplicate conflict record"))).toBe(true);
  });

  test("editing its otherValue is an ERROR", () => {
    const { doc } = build();
    const tampered = [{ ...doc.conflicts[0]!, otherValue: "fine, actually" }];
    const issues = validateGraphDocument({ ...doc, conflicts: tampered });
    expect(issues.some((i) => i.severity === "ERROR" && i.message.includes("inconsistent with computed state"))).toBe(true);
  });

  test("recording one where no live retraction exists is an ERROR (unsupported)", () => {
    const { doc } = build({ retractionRecords: [] });
    const fabricated = [{
      kind: "retraction-vs-status" as const, edge: "retraction" as const, nodeId: "lem-x",
      registryValue: "proved-mod-audit", otherValue: "retracted (l5-shard-bytes, ordinal 0)", message: "m",
    }];
    const issues = validateGraphDocument({ ...doc, conflicts: fabricated });
    expect(issues.some((i) => i.severity === "ERROR" && i.message.includes("not supported by any computed conflict"))).toBe(true);
  });
});

describe("retraction edges — referential integrity and bucket accounting", () => {
  test("a resolved:true edge naming an unknown node is an ERROR", () => {
    const { doc } = build();
    const tampered = { ...doc, edges: { ...doc.edges, retraction: [{ ...doc.edges.retraction[0]!, nodeId: "nope" }] } };
    expect(validateGraphDocument(tampered).some((i) => i.message.includes("retraction edge references unknown node"))).toBe(true);
  });

  test("an unresolved edge with no bucket entry is an ERROR (never a silent drop)", () => {
    const { doc } = build({ retractionRecords: [retraction({ itemId: "lem-ghost" })] });
    expect(validateGraphDocument({ ...doc, unresolved: [] }).some((i) => i.message.includes("unresolved retraction edge"))).toBe(true);
  });

  test("a resolved:false edge whose id IS a node is an ERROR (it should have resolved)", () => {
    const { doc } = build();
    const tampered = {
      ...doc,
      edges: { ...doc.edges, retraction: [{ ...doc.edges.retraction[0]!, resolved: false }] },
      unresolved: [{ edge: "retraction" as const, ref: "lem-x", reason: "r" }],
    };
    expect(validateGraphDocument(tampered).some((i) => i.message.includes("marked unresolved"))).toBe(true);
  });
});

describe("retraction taint — propagation cascades over the requirement closure", () => {
  test("a retracted node is a taint SOURCE, and its reason names the retraction", () => {
    const { doc } = build();
    const entry = computeTaintTrace(doc).get("lem-x")!;
    expect(entry.taint).toBe("tainted");
    expect(entry.isSource).toBe(true);
    expect(entry.reason).toContain("retracted");
    expect(entry.reason).toContain("audit:2026-07-28-independent-sweep");
  });

  test("every dependent inherits the taint, transitively", () => {
    const { doc } = build({
      lemmas: [
        lemma({ id: "lem-x", path: "argument/lemmas/lem-x.md" }),
        lemma({ id: "lem-mid", path: "argument/lemmas/lem-mid.md", deps: ["lem-x"] }),
        lemma({ id: "lem-top", path: "argument/lemmas/lem-top.md", deps: ["lem-mid"] }),
      ],
    });
    const trace = computeTaintTrace(doc);
    expect(trace.get("lem-mid")!.taint).toBe("tainted");
    expect(trace.get("lem-mid")!.isSource).toBe(false);
    expect(trace.get("lem-top")!.taint).toBe("tainted");
  });

  test("an OR-route member's retraction taints the disjunction too (conservative over-inclusion)", () => {
    const { doc } = build({
      lemmas: [
        lemma({ id: "lem-x", path: "argument/lemmas/lem-x.md" }),
        lemma({ id: "lem-alt", path: "argument/lemmas/lem-alt.md" }),
        lemma({ id: "lem-r", path: "argument/lemmas/lem-r.md", routes: [["lem-x"], ["lem-alt"]] }),
      ],
    });
    expect(computeTaintTrace(doc).get("lem-r")!.taint).toBe("tainted");
  });

  test("a released (not live) retraction taints nothing", () => {
    const { doc } = build({ retractionRecords: [retraction({ live: false })] });
    expect(computeTaintTrace(doc).get("lem-x")!.taint).toBe("clean");
  });

  test("an unresolved retraction taints nothing (there is no node to taint)", () => {
    const { doc } = build({ retractionRecords: [retraction({ itemId: "lem-ghost" })] });
    expect(computeTaintTrace(doc).get("lem-x")!.taint).toBe("clean");
  });
});

describe("determinism — edges.retraction has a canonical order", () => {
  test("two documents differing only in retraction-record order serialize to identical bytes", () => {
    const a = build({ retractionRecords: [retraction(), retraction({ ordinal: 1 })] }).doc;
    const b = build({ retractionRecords: [retraction({ ordinal: 1 }), retraction()] }).doc;
    expect(serializeGraphDocument(a)).toBe(serializeGraphDocument(b));
  });

  test("validateGraphDocument names edges.retraction when it is out of canonical order", () => {
    const { doc } = build({ retractionRecords: [retraction(), retraction({ ordinal: 1 })] });
    const reversed = { ...doc, edges: { ...doc.edges, retraction: [...doc.edges.retraction].reverse() } };
    expect(validateGraphDocument(reversed).some((i) => i.message.includes("edges.retraction not in canonical order"))).toBe(true);
    expect(canonicalizeGraphDocument(reversed).edges.retraction[0]!.ordinal).toBe(0);
  });
});
