// 1:1 test file for src/graph/validate.ts. Ground truth: PRD C5 (per-edge join-key table, the
// unresolved-reference bucket, "never silently dropped"), IMPLEMENTATION_PLAN.md M2.1's required
// rename-hazard fixture, and the Tier A review's four landing-blocker repairs (2026-07-19,
// docs/memos/2026-07-19-graph-schema-v1.md's "review outcomes" section). Each blocker section
// below names the review's own red-fixture scenario verbatim in its describe/test title.

import { describe, expect, test } from "bun:test";
import type { ConflictRecord, GraphDocument } from "../../src/graph/types";
import { canonicalizeGraphDocument } from "../../src/graph/serialize";
import { validateGraphDocument } from "../../src/graph/validate";
import { computeExpectedConflicts } from "../../src/graph/validate-conflicts";
import {
  buildAfEvidenceDocument,
  buildAfRootMismatchDocument,
  buildBankedDocument,
  buildFrCollapseDocument,
  buildFrGhostDocument,
  buildProvedConflictDocument,
  buildDualBankedSameNodeDocument,
  buildRenameHazardDocument,
  buildSampleDocument,
  buildSupersededFrDocument,
  provedConflictRecords,
} from "./fixtures";

function emptyDoc(): GraphDocument {
  return {
    schema_version: "1",
    nodes: [],
    edges: { af: [], bd: [], fr: [], report: [], retraction: [] },
    unresolved: [],
    conflicts: [],
  };
}

function errors(doc: GraphDocument) {
  return validateGraphDocument(doc).filter((i) => i.severity === "ERROR");
}

describe("validateGraphDocument — the rename-hazard fixture (IMPLEMENTATION_PLAN.md M2.1)", () => {
  test("golden case: af edge workspace copied correctly from the node's own workspace: field (id != workspace dir) -> no issue", () => {
    const issues = validateGraphDocument(buildRenameHazardDocument(false));
    expect(issues).toEqual([]);
  });

  test("red case: af edge workspace wrongly derived from the registry id instead of the node's workspace: field -> ERROR naming both values", () => {
    const issues = validateGraphDocument(buildRenameHazardDocument(true));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("ERROR");
    expect(issues[0]!.nodeId).toBe("lem-halo-collapse");
    expect(issues[0]!.message).toContain("never inferred from id");
    expect(issues[0]!.message).toContain("proofs/halo-collapse-v2");
  });

  test("mutation guard: without the workspace cross-check, the red case would slip through silently", () => {
    const doc = buildRenameHazardDocument(true);
    const withoutCrossCheck = doc.edges.af.every((e) => e.workspace.length > 0); // the OTHER af checks still pass
    expect(withoutCrossCheck).toBe(true); // proves ONLY the cross-check (not emptiness/unknown-node) catches this
  });
});

describe("validateGraphDocument — Tier A review blocker 1: af-evidence requirement", () => {
  test('red — the review\'s exact scenario: "status:\'proved\', af:\'validated\', and a workspace but no edges.af"', () => {
    const issues = errors(buildAfEvidenceDocument(false));
    // Two independent checks both fire on this input (a deliberate synergy, not a conflict
    // between them): checkAfEdges catches the missing af-evidence edge directly; checkConflicts
    // ALSO recomputes a status-mismatch (registry says proved, af flag has no backing edge at
    // all) since the node's own `af` flag is "validated" with nothing to substantiate it.
    expect(issues.some((i) => i.nodeId === "lem-unbacked" && i.message.includes("has no edges.af entry"))).toBe(true);
    expect(issues.some((i) => i.message.includes("missing conflict record: status-mismatch"))).toBe(true);
  });

  test("green: the same node WITH a complete, consistent af edge has no af-evidence error", () => {
    expect(errors(buildAfEvidenceDocument(true))).toEqual([]);
  });

  test("red: a node with af:\"none\" carrying an af edge anyway is flagged (nothing to join against)", () => {
    const doc = emptyDoc();
    doc.nodes = [
      {
        id: "lem-none",
        workspace: "proofs/lem-none",
        kind: "lemma",
        af: "none",
        contract: "c",
        path: "argument/lemmas/lem-none.md",
        deps: [],
        routes: [],
        defs: [],
        balloons: { count: 0, classifications: [] },
      },
    ];
    doc.edges.af = [{ nodeId: "lem-none", workspace: "proofs/lem-none", workspaceResolved: false }];
    doc.unresolved = [{ edge: "af", nodeId: "lem-none", ref: "proofs/lem-none", reason: "should not exist at all" }];
    const issues = errors(doc);
    expect(issues.some((i) => i.message.includes('af:"none"'))).toBe(true);
  });

  test("red: two af edges for the same node (exactly one is required)", () => {
    const doc = buildAfEvidenceDocument(true);
    doc.edges.af = [doc.edges.af[0]!, { ...doc.edges.af[0]! }];
    const issues = errors(doc);
    expect(issues.some((i) => i.message.includes("duplicate af edge"))).toBe(true);
  });
});

describe("validateGraphDocument — Tier A review blocker 2: contract match targets the af root only", () => {
  test("green: afRootNodeId is the literal \"1\" (the true root)", () => {
    expect(errors(buildAfRootMismatchDocument("1"))).toEqual([]);
  });

  test('red — "internal-lemma match must ERROR": afRootNodeId names a non-root node', () => {
    const issues = errors(buildAfRootMismatchDocument("1.2"));
    expect(issues.some((i) => i.message.includes("not the af export's root"))).toBe(true);
    expect(issues.some((i) => i.message.includes("'1.2'"))).toBe(true);
  });
});

describe("validateGraphDocument — Tier A review blocker 3: conflict recomputation", () => {
  test('red — the review\'s exact scenario: "proved + pending + tainted + contractMatch:false + conflicts:[] must fail"', () => {
    const issues = errors(buildProvedConflictDocument([]));
    const kinds = issues.map((i) => i.message);
    expect(kinds.some((m) => m.includes("missing conflict record: contract-mismatch"))).toBe(true);
    expect(kinds.some((m) => m.includes("missing conflict record: status-mismatch"))).toBe(true);
    expect(kinds.some((m) => m.includes("missing conflict record: taint-status-mismatch"))).toBe(true);
  });

  test("green: the exact three computed conflict records recorded -> clean", () => {
    expect(errors(buildProvedConflictDocument(provedConflictRecords()))).toEqual([]);
  });

  test("red: a duplicated conflict record is flagged", () => {
    const recs = provedConflictRecords();
    const issues = errors(buildProvedConflictDocument([...recs, recs[0]!]));
    expect(issues.some((i) => i.message.includes("duplicate conflict record"))).toBe(true);
  });

  test("red: a recorded conflict whose otherValue disagrees with the computed value is flagged", () => {
    const recs = provedConflictRecords();
    recs[1] = { ...recs[1]!, otherValue: "admitted" }; // computed value is "pending", not "admitted"
    const issues = errors(buildProvedConflictDocument(recs));
    expect(issues.some((i) => i.message.includes("inconsistent with computed state"))).toBe(true);
  });

  test("red: a recorded conflict with no supporting computed condition is flagged", () => {
    const doc = canonicalizeGraphDocument(buildSampleDocument()); // clean: nothing here should conflict
    doc.conflicts = [
      { kind: "status-mismatch", edge: "af", nodeId: "lem-halo-collapse", registryValue: "proved", otherValue: "pending", message: "bogus" },
    ];
    const issues = errors(doc);
    expect(issues.some((i) => i.message.includes("is not supported by any computed conflict"))).toBe(true);
  });

  test('red: fr "banked-without-oracle" — banked outcome with no fresh oracle verdict, conflicts:[]', () => {
    const issues = errors(buildBankedDocument(undefined, undefined, []));
    expect(issues.some((i) => i.message.includes("missing conflict record: banked-without-oracle"))).toBe(true);
  });

  test("green: banked outcome backed by a fresh banked verdict + the matching conflict record absent (none needed)", () => {
    expect(errors(buildBankedDocument("banked", true, []))).toEqual([]);
  });

  test("red: banked outcome with a STALE banked verdict is still a conflict", () => {
    const issues = errors(buildBankedDocument("banked", false, []));
    expect(issues.some((i) => i.message.includes("missing conflict record: banked-without-oracle"))).toBe(true);
  });

  test('M2-boundary-review blocker 6 (red): verdict:"banked" with verdictFresh UNDEFINED (never recomputed — e.g. the ledger-fallback path) is NOT oracle-backed; undefined must not be treated as fresh', () => {
    const issues = errors(buildBankedDocument("banked", undefined, []));
    expect(issues.some((i) => i.message.includes("missing conflict record: banked-without-oracle"))).toBe(true);
  });
});

describe("validateGraphDocument — M2-boundary-review blocker 7: superseded fr evidence is excluded from conflicts", () => {
  test("red: an UNsuperseded sibling still yields its own conflict, a SUPERSEDED sibling must not (two distinct nodes)", () => {
    const conflicts = computeExpectedConflicts(buildSupersededFrDocument(true));
    expect(conflicts).toEqual([
      { kind: "banked-without-oracle", edge: "fr", nodeId: "lem-new", registryValue: "banked", otherValue: "claimed" },
    ]);
    // the superseded cycle (1, resolving to lem-old) must contribute NOTHING — not even a
    // suppressed-but-present entry.
    expect(conflicts.some((c) => c.nodeId === "lem-old")).toBe(false);
  });

  test("green counterpart: two UNRELATED (non-superseding) siblings both still conflict independently", () => {
    const conflicts = computeExpectedConflicts(buildSupersededFrDocument(false));
    expect(conflicts).toHaveLength(2);
    expect(conflicts.some((c) => c.nodeId === "lem-old")).toBe(true);
    expect(conflicts.some((c) => c.nodeId === "lem-new")).toBe(true);
  });

  test("end-to-end via validateGraphDocument: the superseded sibling's conflict record must be ABSENT, not just unrecorded", () => {
    const doc = buildSupersededFrDocument(true);
    doc.conflicts = [
      { kind: "banked-without-oracle", edge: "fr", nodeId: "lem-new", registryValue: "banked", otherValue: "claimed", message: "m" },
    ];
    expect(errors(doc)).toEqual([]); // exactly one recorded, exactly one computed — clean

    // recording a conflict for the SUPERSEDED cycle's node is itself now unsupported (the
    // condition it claims no longer holds once superseded exclusion is applied).
    doc.conflicts.push({ kind: "banked-without-oracle", edge: "fr", nodeId: "lem-old", registryValue: "banked", otherValue: "claimed", message: "m" });
    const issues = errors(doc);
    expect(issues.some((i) => i.message.includes("is not supported by any computed conflict"))).toBe(true);
  });
});

describe("validateGraphDocument — M2-boundary-review blocker 8: same-node banked-without-oracle coalesces to one conflict", () => {
  test("red: two unsuperseded banked cycles on the SAME node -> exactly ONE computed conflict, not two sharing an identity", () => {
    const conflicts = computeExpectedConflicts(buildDualBankedSameNodeDocument("claimed", "claimed"));
    expect(conflicts).toEqual([
      { kind: "banked-without-oracle", edge: "fr", nodeId: "lem-dup", registryValue: "banked", otherValue: "claimed" },
    ]);
  });

  test("distinct verdict text across the two cycles is reported as a deterministic sorted union, not one arbitrary cycle's value", () => {
    const conflicts = computeExpectedConflicts(buildDualBankedSameNodeDocument("claimed", "audited"));
    expect(conflicts).toEqual([
      { kind: "banked-without-oracle", edge: "fr", nodeId: "lem-dup", registryValue: "banked", otherValue: "audited,claimed" },
    ]);
  });

  test("end-to-end: the freshly-coalesced conflict validates clean; recording it TWICE is still flagged (coalescing is not itself a license for duplicate records)", () => {
    const doc = buildDualBankedSameNodeDocument("claimed", "claimed");
    doc.conflicts = [
      { kind: "banked-without-oracle", edge: "fr", nodeId: "lem-dup", registryValue: "banked", otherValue: "claimed", message: "m" },
    ];
    expect(errors(doc)).toEqual([]);
    doc.conflicts.push({ ...doc.conflicts[0]! });
    expect(errors(doc).some((i) => i.message.includes("duplicate conflict record"))).toBe(true);
  });
});

describe("validateGraphDocument — Tier A review blocker 4: fr unresolved exact accounting", () => {
  test("red — the collapse case: two distinct unresolved cycles naming the same artifact, only one bucket entry", () => {
    const issues = errors(buildFrCollapseDocument("one"));
    expect(issues.some((i) => i.message.includes("cycle 9") && i.message.includes("no entry in the unresolved bucket"))).toBe(
      true,
    );
  });

  test("green: two distinct unresolved cycles, two distinct bucket entries -> no collapse", () => {
    expect(errors(buildFrCollapseDocument("two"))).toEqual([]);
  });

  test("mutation guard: (edge, ref) alone (no sourceCycle) WOULD have satisfied both cycles from one entry", () => {
    const doc = buildFrCollapseDocument("one");
    const legacyKeyedBucket = new Set(doc.unresolved.map((u) => `${u.edge} ${u.ref}`));
    const bothCyclesSameArtifact = doc.edges.fr.every(
      (e) => e.resolutionMethod === "unresolved" && legacyKeyedBucket.has(`fr ${e.artifact}`),
    );
    expect(bothCyclesSameArtifact).toBe(true); // proves the OLD (edge, ref) key would have hidden the bug
  });

  test('red — the lem-ghost case: a resolved fr edge naming a resolvedNodeId that is not a node in this document', () => {
    const issues = errors(buildFrGhostDocument());
    expect(issues.some((i) => i.message.includes("resolvedNodeId 'lem-ghost' is not a node in this document"))).toBe(true);
  });

  test("red: resolvedNodeId present on an unresolved fr edge is forbidden (runtime backstop; the TS union already forbids this at compile time)", () => {
    const doc = emptyDoc();
    const badEdge = { cycle: 1, artifact: "x.md", resolutionMethod: "unresolved", resolvedNodeId: "lem-x" };
    doc.edges.fr = [badEdge as unknown as GraphDocument["edges"]["fr"][number]];
    doc.unresolved = [{ edge: "fr", ref: "x.md", reason: "no candidate", sourceCycle: 1 }];
    const issues = errors(doc);
    expect(issues.some((i) => i.message.includes("must not carry resolvedNodeId"))).toBe(true);
  });
});

describe("validateGraphDocument — structural invariants", () => {
  test("empty document (fresh rk init, zero nodes/edges) is valid — not itself a defect", () => {
    expect(validateGraphDocument(emptyDoc())).toEqual([]);
  });

  test("the fully-built sample fixture, canonicalized, has no ERROR-severity issues (only the expected report WARN)", () => {
    const issues = validateGraphDocument(canonicalizeGraphDocument(buildSampleDocument()));
    expect(issues.filter((i) => i.severity === "ERROR")).toEqual([]);
    expect(issues).toHaveLength(1); // the one expected report-edge WARN
    expect(issues[0]!.severity).toBe("WARN");
  });

  test("duplicate node ids are flagged", () => {
    const doc = emptyDoc();
    const node = buildRenameHazardDocument(false).nodes[0]!;
    doc.nodes = [node, { ...node }];
    const issues = validateGraphDocument(doc);
    expect(issues.some((i) => i.message.includes("duplicate node id"))).toBe(true);
  });

  test("a dep referencing a node absent from this document is flagged", () => {
    const doc = emptyDoc();
    doc.nodes = [
      {
        id: "lem-a",
        kind: "lemma",
        af: "none",
        contract: "c",
        path: "argument/lemmas/lem-a.md",
        deps: ["lem-nonexistent"],
        routes: [],
        defs: [],
        balloons: { count: 0, classifications: [] },
      },
    ];
    const issues = validateGraphDocument(doc);
    expect(issues.some((i) => i.message.includes("dep 'lem-nonexistent' is not a node"))).toBe(true);
  });

  test("an af edge marked unresolved with no companion unresolved-bucket entry is flagged (PRD C5: never silently dropped)", () => {
    const doc = emptyDoc();
    doc.nodes = [
      {
        id: "lem-a",
        workspace: "proofs/lem-a",
        kind: "lemma",
        af: "seeded",
        contract: "c",
        path: "argument/lemmas/lem-a.md",
        deps: [],
        routes: [],
        defs: [],
        balloons: { count: 0, classifications: [] },
      },
    ];
    doc.edges.af = [{ nodeId: "lem-a", workspace: "proofs/lem-a", workspaceResolved: false }];
    const missingBucket = validateGraphDocument(doc);
    expect(missingBucket.some((i) => i.message.includes("has no entry in the unresolved bucket"))).toBe(true);

    doc.unresolved = [{ edge: "af", nodeId: "lem-a", ref: "proofs/lem-a", reason: "no af export found for this workspace" }];
    const withBucket = validateGraphDocument(doc);
    expect(withBucket.some((i) => i.message.includes("has no entry in the unresolved bucket"))).toBe(false);
  });

  test("a conflict referencing an unknown node id is flagged", () => {
    const doc = emptyDoc();
    doc.conflicts = [{ kind: "status-mismatch", edge: "af", nodeId: "lem-ghost", message: "m" } satisfies ConflictRecord];
    const issues = validateGraphDocument(doc);
    expect(issues.some((i) => i.message.includes("conflict (status-mismatch) references unknown node"))).toBe(true);
  });

  test("nodes out of canonical sorted order are flagged", () => {
    const doc = emptyDoc();
    const mk = (id: string) => ({
      id,
      kind: "lemma" as const,
      af: "none" as const,
      contract: "c",
      path: `argument/lemmas/${id}.md`,
      deps: [],
      routes: [],
      defs: [],
      balloons: { count: 0, classifications: [] },
    });
    doc.nodes = [mk("lem-z"), mk("lem-a")];
    const issues = validateGraphDocument(doc);
    expect(issues.some((i) => i.message.includes("nodes not in canonical order"))).toBe(true);
  });

  test("edges out of canonical order are ALSO flagged (Tier A review follow-up 2: not nodes alone)", () => {
    const doc = emptyDoc();
    doc.nodes = [
      { id: "lem-a", kind: "lemma", af: "none", contract: "c", path: "argument/lemmas/lem-a.md", deps: [], routes: [], defs: [], balloons: { count: 0, classifications: [] } },
      { id: "lem-b", kind: "lemma", af: "none", contract: "c", path: "argument/lemmas/lem-b.md", deps: [], routes: [], defs: [], balloons: { count: 0, classifications: [] } },
    ];
    doc.edges.bd = [
      { nodeId: "lem-b", resolved: true },
      { nodeId: "lem-a", resolved: true },
    ];
    const issues = validateGraphDocument(doc);
    expect(issues.some((i) => i.message.includes("edges.bd not in canonical order"))).toBe(true);
  });
});
