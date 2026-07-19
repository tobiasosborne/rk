// Test-only fixture builders for src/graph/*.test.ts — not part of src/ (no PURITY marker
// needed; scripts/selftest.ts's purity grep only scans src/, per its own SKIP_DIRS/scan roots).
// Kept as one shared module so the serializer's round-trip/determinism tests and the validator's
// tests build the SAME semantic documents from the SAME construction code, never two
// hand-maintained JSON blobs that could quietly drift apart.
//
// Tier A review repair wave (2026-07-19): most fixtures below are now constructible as
// well-typed `GraphDocument` literals — the discriminated unions in src/graph/types.ts make an
// evidence-incomplete `AfEdge`/`FrEdge` a COMPILE error, not just a runtime one. The ONE
// exception, `buildAfRootMismatchDocument`, needs an `as unknown as GraphDocument` cast: its
// whole point is to construct a value the type system would otherwise forbid
// (`afRootNodeId` typed as the literal `"1"`), to prove src/graph/validate.ts's RUNTIME backstop
// catches what a document assembled from untyped JSON (bypassing TS entirely) could still get
// wrong. Every cast site says so inline.

import type { ConflictRecord, GraphDocument } from "../../src/graph/types";

/** A small but representative GraphDocument: five registry nodes (one of them the rename-hazard
 * shard, `lem-halo-collapse`, whose `workspace:` field deliberately does NOT match its own id —
 * see IMPLEMENTATION_PLAN.md M2.1's required fixture, "id ≠ workspace dir, e.g.
 * lem-halo-collapse", and now ALSO `status: "proved"` with a fully consistent af edge, so the
 * fixture stays clean under the Tier A review's conflict-recomputation check), one edge of each
 * of the four kinds, one unresolved bucket entry, zero conflicts (nothing here is actually
 * inconsistent). Arrays and object-literal property order are deliberately NOT in canonical
 * order — every array below is either reverse-alphabetical or otherwise shuffled, and sibling
 * fields are written out of the schema's own declared property order — so a test that only ever
 * built already-sorted input could never distinguish "canonicalizes correctly" from
 * "canonicalization is a no-op that happens to match this one input's order" (the determinism
 * property test in test/graph/serialize.test.ts additionally re-shuffles this same document
 * several more ways at runtime). */
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
          workspaceResolved: true,
          workspace: "proofs/halo-collapse-v2",
          nodeId: "lem-halo-collapse",
          afRootNodeId: "1",
          contractMatch: true,
          epistemicState: "validated",
          taintState: "clean",
          nodeCount: 14,
          afSchemaVersion: "1",
        },
      ],
    },
    conflicts: [],
    unresolved: [{ reason: "no fr cycle names a resolvable artifact for this path", edge: "fr", ref: "notes/scratch-42.md", sourceCycle: 12 }],
    schema_version: "1",
    nodes: [
      {
        id: "lem-halo-collapse",
        workspace: "proofs/halo-collapse-v2",
        kind: "lemma",
        af: "validated",
        status: "proved",
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
 * instead of copied from the node's own `workspace:` field. Both branches carry a fully
 * consistent RESOLVED af edge otherwise, so the ONLY thing under test is the workspace
 * cross-check itself. */
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
          workspaceResolved: true,
          afSchemaVersion: "1",
          afRootNodeId: "1",
          contractMatch: true,
          epistemicState: "validated",
          taintState: "clean",
          nodeCount: 3,
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

/** Tier A review blocker 1's own scenario, verbatim: "A node with status:'proved',
 * af:'validated', and a workspace but no edges.af validates with zero issues." `withEdge: false`
 * reproduces exactly that (an af-evidence-less proved node); `withEdge: true` is the green
 * counterpart, with a fully consistent resolved af edge, proving the fix does not false-positive
 * on a genuinely well-evidenced node. */
export function buildAfEvidenceDocument(withEdge: boolean): GraphDocument {
  const node = {
    id: "lem-unbacked",
    workspace: "proofs/lem-unbacked",
    kind: "lemma" as const,
    af: "validated" as const,
    status: "proved" as const,
    contract: "Every unbacked claim is still a claim.",
    path: "argument/lemmas/lem-unbacked.md",
    deps: [],
    routes: [],
    defs: [],
    balloons: { count: 0, classifications: [] },
  };
  return {
    schema_version: "1",
    nodes: [node],
    edges: {
      af: withEdge
        ? [
            {
              nodeId: node.id,
              workspace: node.workspace,
              workspaceResolved: true,
              afSchemaVersion: "1",
              afRootNodeId: "1",
              contractMatch: true,
              epistemicState: "validated",
              taintState: "clean",
              nodeCount: 8,
            },
          ]
        : [],
      bd: [],
      fr: [],
      report: [],
    },
    unresolved: [],
    conflicts: [],
  };
}

/** Tier A review blocker 2's own scenario: "Contract matching is explicitly allowed against a
 * non-root af node." `rootNodeId` is passed straight through to `afRootNodeId` via an `as unknown
 * as GraphDocument` cast — `ResolvedAfEdge.afRootNodeId` is typed as the string LITERAL `"1"`
 * (src/graph/types.ts's `AF_ROOT_NODE_ID`), so a well-typed producer literally cannot express a
 * non-root match; this cast constructs the value anyway to prove src/graph/validate.ts's runtime
 * check independently catches it (a document assembled from untyped JSON is not automatically
 * well-typed just because the interface says so). Call with `"1"` for the golden case, `"1.2"`
 * (an internal lemma id) for the red case. */
export function buildAfRootMismatchDocument(rootNodeId: string): GraphDocument {
  const raw = {
    schema_version: "1",
    nodes: [
      {
        id: "lem-inner-match",
        workspace: "proofs/lem-inner-match",
        kind: "lemma",
        af: "validated",
        contract: "The whole workspace's top claim.",
        path: "argument/lemmas/lem-inner-match.md",
        deps: [],
        routes: [],
        defs: [],
        balloons: { count: 0, classifications: [] },
      },
    ],
    edges: {
      af: [
        {
          nodeId: "lem-inner-match",
          workspace: "proofs/lem-inner-match",
          workspaceResolved: true,
          afSchemaVersion: "1",
          afRootNodeId: rootNodeId,
          contractMatch: true,
          epistemicState: "validated",
          taintState: "clean",
          nodeCount: 6,
        },
      ],
      bd: [],
      fr: [],
      report: [],
    },
    unresolved: [],
    conflicts: [],
  };
  return raw as unknown as GraphDocument;
}

/** Tier A review blocker 3's own scenario, verbatim: "A proved node paired with pending, tainted,
 * and contractMatch:false, but conflicts:[], validates cleanly." `conflicts` is caller-supplied
 * so the same node/edge shape drives every conflict-recomputation test (missing / duplicate /
 * inconsistent / unsupported / fully-correct). No cast needed — `epistemicState:"pending"` and
 * `taintState:"tainted"` are both individually VALID closed-enum values; the point is that they
 * are inconsistent with `status:"proved"`, which only the recomputation check (not the type
 * system) can catch. */
export function buildProvedConflictDocument(conflicts: ConflictRecord[]): GraphDocument {
  return {
    schema_version: "1",
    nodes: [
      {
        id: "lem-troubled",
        workspace: "proofs/lem-troubled",
        kind: "lemma",
        af: "validated",
        status: "proved",
        contract: "Every troubled case resolves cleanly.",
        path: "argument/lemmas/lem-troubled.md",
        deps: [],
        routes: [],
        defs: [],
        balloons: { count: 0, classifications: [] },
      },
    ],
    edges: {
      af: [
        {
          nodeId: "lem-troubled",
          workspace: "proofs/lem-troubled",
          workspaceResolved: true,
          afSchemaVersion: "1",
          afRootNodeId: "1",
          contractMatch: false,
          epistemicState: "pending",
          taintState: "tainted",
          nodeCount: 5,
        },
      ],
      bd: [],
      fr: [],
      report: [],
    },
    unresolved: [],
    conflicts,
  };
}

/** The three conflict records `buildProvedConflictDocument`'s node/edge shape computes: exactly
 * what src/graph/validate-conflicts.ts's recomputation derives from `contractMatch:false`,
 * `epistemicState:"pending"`, `taintState:"tainted"` on a `status:"proved"` node. */
export function provedConflictRecords(): ConflictRecord[] {
  return [
    { kind: "contract-mismatch", edge: "af", nodeId: "lem-troubled", registryValue: "proved", otherValue: "contractMatch:false" },
    { kind: "status-mismatch", edge: "af", nodeId: "lem-troubled", registryValue: "proved", otherValue: "pending" },
    { kind: "taint-status-mismatch", edge: "af", nodeId: "lem-troubled", registryValue: "proved", otherValue: "tainted" },
  ];
}

/** fr's `banked-without-oracle` conflict class (blocker 3's second half: "ensure the fr shape
 * retains enough banked/oracle-verdict freshness data"). `verdict`/`verdictFresh` drive whether
 * the recomputation expects a conflict; `conflicts` is caller-supplied, same pattern as
 * `buildProvedConflictDocument`. */
export function buildBankedDocument(
  verdict: string | undefined,
  verdictFresh: boolean | undefined,
  conflicts: ConflictRecord[],
): GraphDocument {
  return {
    schema_version: "1",
    nodes: [
      {
        id: "lem-banked-target",
        kind: "lemma",
        af: "none",
        contract: "A claim fr believes it banked.",
        path: "argument/lemmas/lem-banked-target.md",
        deps: [],
        routes: [],
        defs: [],
        balloons: { count: 0, classifications: [] },
      },
    ],
    edges: {
      af: [],
      bd: [],
      fr: [
        {
          cycle: 40,
          artifact: "argument/lemmas/lem-banked-target.md",
          resolutionMethod: "path",
          resolvedNodeId: "lem-banked-target",
          outcome: "banked",
          verdict,
          verdictFresh,
        },
      ],
      report: [],
    },
    unresolved: [],
    conflicts,
  };
}

/** Tier A review blocker 4's "collapse case": two DISTINCT unresolved fr cycles (5 and 9) naming
 * the IDENTICAL artifact text. `bucketEntries: "one"` reproduces the bug (only cycle 5 gets a
 * bucket entry, so cycle 9's failed lookup is silently dropped); `"two"` is the fixed/green
 * form — one entry per cycle, never collapsed by shared artifact text. */
export function buildFrCollapseDocument(bucketEntries: "one" | "two"): GraphDocument {
  const artifact = "notes/shared-scratch.md";
  const unresolved =
    bucketEntries === "one"
      ? [{ edge: "fr" as const, ref: artifact, reason: "no candidate node", sourceCycle: 5 }]
      : [
          { edge: "fr" as const, ref: artifact, reason: "no candidate node", sourceCycle: 5 },
          { edge: "fr" as const, ref: artifact, reason: "no candidate node", sourceCycle: 9 },
        ];
  return {
    schema_version: "1",
    nodes: [],
    edges: {
      af: [],
      bd: [],
      fr: [
        { cycle: 5, artifact, resolutionMethod: "unresolved" },
        { cycle: 9, artifact, resolutionMethod: "unresolved" },
      ],
      report: [],
    },
    unresolved,
    conflicts: [],
  };
}

/** M2-boundary-review blocker 7's scenario: two SIBLING banked-without-oracle-eligible fr cycles
 * on two DIFFERENT nodes — cycle 1 resolves to `lem-old`, cycle 2 resolves to `lem-new` and
 * (when `superseded` is true) carries `supersedes: 1`. Two distinct nodes, not one, so the
 * exclusion under test (a superseded cycle must stop contributing a conflict at all) is provable
 * independently of blocker 8's same-node coalescing question: `superseded: true` must yield
 * exactly ONE conflict (`lem-new` only — `lem-old`'s superseded cycle produces none); `superseded:
 * false` must yield TWO (both cycles are live siblings, neither superseding the other). */
export function buildSupersededFrDocument(superseded: boolean): GraphDocument {
  const mkNode = (id: string) => ({
    id,
    kind: "lemma" as const,
    af: "none" as const,
    contract: `${id}'s claim.`,
    path: `argument/lemmas/${id}.md`,
    deps: [],
    routes: [],
    defs: [],
    balloons: { count: 0, classifications: [] },
  });
  return {
    schema_version: "1",
    nodes: [mkNode("lem-new"), mkNode("lem-old")],
    edges: {
      af: [],
      bd: [],
      fr: [
        {
          cycle: 1,
          artifact: "argument/lemmas/lem-old.md",
          resolutionMethod: "path",
          resolvedNodeId: "lem-old",
          outcome: "banked",
          verdict: "claimed",
        },
        {
          cycle: 2,
          artifact: "argument/lemmas/lem-new.md",
          resolutionMethod: "path",
          resolvedNodeId: "lem-new",
          outcome: "banked",
          verdict: "claimed",
          supersedes: superseded ? 1 : undefined,
        },
      ],
      report: [],
    },
    unresolved: [],
    conflicts: [],
  };
}

/** M2-boundary-review blocker 8's scenario: TWO distinct unsuperseded banked-without-oracle-
 * eligible fr cycles resolving to the SAME node (`lem-dup`), with possibly-different `verdict`
 * text on each (e.g. one "claimed", another "audited") — proving the coalesced entry's
 * `otherValue` is a deterministic, sorted, comma-joined union rather than an arbitrary single
 * cycle's value standing in for the whole node. */
export function buildDualBankedSameNodeDocument(verdictA: string | undefined, verdictB: string | undefined): GraphDocument {
  return {
    schema_version: "1",
    nodes: [
      {
        id: "lem-dup",
        kind: "lemma",
        af: "none",
        contract: "A claim banked twice over.",
        path: "argument/lemmas/lem-dup.md",
        deps: [],
        routes: [],
        defs: [],
        balloons: { count: 0, classifications: [] },
      },
    ],
    edges: {
      af: [],
      bd: [],
      fr: [
        { cycle: 1, artifact: "argument/lemmas/lem-dup.md", resolutionMethod: "path", resolvedNodeId: "lem-dup", outcome: "banked", verdict: verdictA },
        { cycle: 2, artifact: "argument/lemmas/lem-dup.md", resolutionMethod: "path", resolvedNodeId: "lem-dup", outcome: "banked", verdict: verdictB },
      ],
      report: [],
    },
    unresolved: [],
    conflicts: [],
  };
}

/** Tier A review blocker 4's "lem-ghost case": a RESOLVED fr edge naming a `resolvedNodeId` that
 * is not actually a node in this document. */
export function buildFrGhostDocument(): GraphDocument {
  return {
    schema_version: "1",
    nodes: [],
    edges: {
      af: [],
      bd: [],
      fr: [{ cycle: 7, artifact: "argument/lemmas/lem-ghost.md", resolutionMethod: "path", resolvedNodeId: "lem-ghost" }],
      report: [],
    },
    unresolved: [],
    conflicts: [],
  };
}
