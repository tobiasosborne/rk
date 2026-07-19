// Test-only fixture builders for src/graph/*.test.ts — not part of src/ (no PURITY marker
// needed; scripts/selftest.ts's purity grep only scans src/, per its own SKIP_DIRS/scan roots).
// Kept as one shared module so the serializer's round-trip/determinism tests and the validator's
// rename-hazard test build the SAME semantic documents from the SAME construction code, never
// two hand-maintained JSON blobs that could quietly drift apart.

import type { GraphDocument } from "../../src/graph/types";

/** A small but representative GraphDocument: three registry nodes (one of them the rename-hazard
 * shard, `lem-halo-collapse`, whose `workspace:` field deliberately does NOT match its own id —
 * see IMPLEMENTATION_PLAN.md M2.1's required fixture, "id ≠ workspace dir, e.g.
 * lem-halo-collapse"), one edge of each of the four kinds, one unresolved bucket entry, one
 * conflict. Arrays and object-literal property order are deliberately NOT in canonical order —
 * every array below is either reverse-alphabetical or otherwise shuffled, and sibling fields are
 * written out of the schema's own declared property order — so a test that only ever built
 * already-sorted input could never distinguish "canonicalizes correctly" from "canonicalization
 * is a no-op that happens to match this one input's order" (the determinism property test in
 * test/graph/serialize.test.ts additionally re-shuffles this same document several more ways at
 * runtime). */
export function buildSampleDocument(): GraphDocument {
  return {
    edges: {
      report: [{ resolved: false, anchor: "thm:main", nodeId: "lem-base" }],
      fr: [
        { resolutionMethod: "unresolved", cycle: 12, artifact: "notes/scratch-42.md" },
        { cycle: 3, artifact: "argument/lemmas/lem-base.md", resolutionMethod: "path", resolvedNodeId: "lem-base" },
      ],
      bd: [{ resolved: true, nodeId: "lem-base", issueId: "rk-abc", status: "open" }],
      af: [
        {
          resolved: true,
          workspace: "proofs/halo-collapse-v2",
          nodeId: "lem-halo-collapse",
          afNodeId: "1",
          contractMatch: true,
          epistemicState: "validated",
          taintState: "clean",
          nodeCount: 14,
          afSchemaVersion: "1",
        },
      ],
    },
    conflicts: [
      {
        message: "registry status 'proved' but af epistemic_state 'pending'",
        kind: "status-mismatch",
        edge: "af",
        nodeId: "lem-base",
        registryValue: "proved",
        otherValue: "pending",
      },
    ],
    unresolved: [{ reason: "no fr cycle names a resolvable artifact for this path", edge: "fr", ref: "notes/scratch-42.md", sourceCycle: 12 }],
    schema_version: "1",
    nodes: [
      {
        id: "lem-halo-collapse",
        workspace: "proofs/halo-collapse-v2",
        kind: "lemma",
        af: "validated",
        contract: "Every halo collapses within finite time under the flow.",
        path: "argument/lemmas/lem-halo-collapse.md",
        deps: ["lem-base"],
        routes: [],
        defs: ["def-halo"],
        balloons: { classifications: [], count: 0 },
      },
      {
        routes: [["lem-open-a", "lem-open-b"], ["lem-alt"]],
        id: "lem-base",
        kind: "lemma",
        contract: "The base case holds.",
        af: "none",
        path: "argument/lemmas/lem-base.md",
        deps: [],
        defs: [],
        balloons: { count: 0, classifications: [] },
        status: "cited",
      },
      {
        id: "lem-alt",
        kind: "lemma",
        contract: "An alternative route member.",
        af: "none",
        path: "argument/lemmas/lem-alt.md",
        deps: [],
        routes: [],
        defs: [],
        balloons: { count: 0, classifications: [] },
      },
      // Referenced by lem-base's `routes` disjunction above — every dep/route member must
      // resolve to a real node in the SAME document (src/graph/validate.ts's referential-
      // integrity check), so both route-1 members are modeled as their own (open) shards.
      {
        id: "lem-open-a",
        kind: "open-problem",
        contract: "The first member of the unresolved route.",
        af: "none",
        path: "argument/lemmas/lem-open-a.md",
        deps: [],
        routes: [],
        defs: [],
        balloons: { count: 0, classifications: [] },
        status: "open",
      },
      {
        id: "lem-open-b",
        kind: "open-problem",
        contract: "The second member of the unresolved route.",
        af: "none",
        path: "argument/lemmas/lem-open-b.md",
        deps: [],
        routes: [],
        defs: [],
        balloons: { count: 0, classifications: [] },
        status: "open",
      },
    ],
  };
}

/** Isolated rename-hazard scenario (a single node + a single af edge), used by
 * test/graph/validate.test.ts. `brokenEdge: true` simulates the exact bug the rename hazard
 * guards against: an af edge whose `workspace` was (wrongly) derived from the node's `id`
 * instead of copied from the node's own `workspace:` field. */
export function buildRenameHazardDocument(brokenEdge: boolean): GraphDocument {
  const trueWorkspace = "proofs/halo-collapse-v2";
  return {
    schema_version: "1",
    nodes: [
      {
        id: "lem-halo-collapse",
        workspace: trueWorkspace,
        kind: "lemma",
        af: "validated",
        contract: "Every halo collapses within finite time under the flow.",
        path: "argument/lemmas/lem-halo-collapse.md",
        deps: [],
        routes: [],
        defs: [],
        balloons: { count: 0, classifications: [] },
      },
    ],
    edges: {
      af: [
        {
          nodeId: "lem-halo-collapse",
          // The bug: keying off the registry id instead of the shard's declared workspace.
          workspace: brokenEdge ? "lem-halo-collapse" : trueWorkspace,
          resolved: true,
        },
      ],
      bd: [],
      fr: [],
      report: [],
    },
    unresolved: [],
    conflicts: [],
  };
}
